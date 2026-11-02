import { DurableObject } from 'cloudflare:workers';

// The directory: accounts, sign-in sessions, teams, members and which docs
// belong where. One instance for the whole app (a SQLite-backed Durable
// Object), reached through RPC from the worker.
//
// Access rules:
// - A team doc (not a round doc) is open to every member of its team.
// - A round doc is open to its owner, the partners added to it, and the
//   team's coaches.
// - A doc with no team is open to its owner only.

export type Role = 'coach' | 'student';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  role: Role;
}

export interface DocRecord {
  id: string;
  teamId: string | null;
  ownerId: string;
  title: string;
  kind: 'prep' | 'reference';
  round: boolean;
  order: number | null;
  partners: string[];
  checkToken: string | null;
  createdAt: number;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 60;

function randomToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

type Row = Record<string, SqlStorageValue>;

export class Directory extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL,
          email TEXT NOT NULL, name TEXT NOT NULL, picture TEXT, created_at INTEGER NOT NULL,
          UNIQUE (provider, subject));
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
          student_code TEXT NOT NULL UNIQUE, coach_code TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS members (
          team_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL,
          PRIMARY KEY (team_id, user_id));
        CREATE TABLE IF NOT EXISTS docs (
          id TEXT PRIMARY KEY, team_id TEXT, owner_id TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL,
          round INTEGER NOT NULL DEFAULT 0, ord REAL, check_token TEXT UNIQUE, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS doc_partners (
          doc_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (doc_id, user_id));
      `);
    });
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  private one(query: string, ...args: SqlStorageValue[]): Row | undefined {
    return this.sql.exec(query, ...args).toArray()[0] as Row | undefined;
  }

  private all(query: string, ...args: SqlStorageValue[]): Row[] {
    return this.sql.exec(query, ...args).toArray() as Row[];
  }

  private user(row: Row): User {
    return { id: String(row.id), email: String(row.email), name: String(row.name), picture: (row.picture as string | null) ?? null };
  }

  // ---------- Accounts and sessions ----------

  /** Find or create the account for a verified sign-in, and start a session. Returns the session token. */
  async signIn(input: { provider: string; subject: string; email: string; name: string; picture?: string | null }): Promise<string> {
    let row = this.one('SELECT * FROM users WHERE provider = ? AND subject = ?', input.provider, input.subject);
    if (!row) {
      const id = crypto.randomUUID();
      this.sql.exec(
        'INSERT INTO users (id, provider, subject, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, input.provider, input.subject, input.email, input.name || input.email, input.picture ?? null, Date.now(),
      );
      row = this.one('SELECT * FROM users WHERE id = ?', id)!;
    } else {
      this.sql.exec('UPDATE users SET email = ?, picture = ? WHERE id = ?', input.email, input.picture ?? null, String(row.id));
    }
    const token = randomToken();
    const now = Date.now();
    this.sql.exec('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', await sha256(token), String(row.id), now, now + SESSION_DAYS * DAY);
    return token;
  }

  async userForSession(token: string | null): Promise<User | null> {
    if (!token) return null;
    const row = this.one(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
      await sha256(token), Date.now(),
    );
    return row ? this.user(row) : null;
  }

  async signOut(token: string): Promise<void> {
    this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
  }

  async renameUser(userId: string, name: string): Promise<void> {
    const clean = name.trim().slice(0, 80);
    if (clean) this.sql.exec('UPDATE users SET name = ? WHERE id = ?', clean, userId);
  }

  // ---------- Teams ----------

  teamsFor(userId: string): TeamSummary[] {
    return this.all('SELECT t.id, t.name, m.role FROM members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ? ORDER BY t.created_at', userId).map(
      (r) => ({ id: String(r.id), name: String(r.name), role: r.role as Role }),
    );
  }

  private role(teamId: string, userId: string): Role | null {
    const r = this.one('SELECT role FROM members WHERE team_id = ? AND user_id = ?', teamId, userId);
    return r ? (r.role as Role) : null;
  }

  createTeam(userId: string, name: string): TeamSummary {
    const id = crypto.randomUUID();
    const clean = name.trim().slice(0, 80) || 'My team';
    this.sql.exec(
      'INSERT INTO teams (id, name, created_by, created_at, student_code, coach_code) VALUES (?, ?, ?, ?, ?, ?)',
      id, clean, userId, Date.now(), randomToken(9), randomToken(9),
    );
    this.sql.exec('INSERT INTO members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)', id, userId, 'coach', Date.now());
    return { id, name: clean, role: 'coach' };
  }

  /** Team details for a member: members list; invite codes for coaches only. */
  team(teamId: string, userId: string) {
    const role = this.role(teamId, userId);
    if (!role) return null;
    const t = this.one('SELECT * FROM teams WHERE id = ?', teamId)!;
    const members: Member[] = this.all(
      'SELECT u.id, u.name, u.email, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.role, u.name',
      teamId,
    ).map((r) => ({ userId: String(r.id), name: String(r.name), email: String(r.email), role: r.role as Role }));
    return {
      id: teamId,
      name: String(t.name),
      role,
      members,
      invites: role === 'coach' ? { student: String(t.student_code), coach: String(t.coach_code) } : null,
    };
  }

  /** Join with an invite code. Returns the team, or null for a bad code. */
  joinTeam(userId: string, code: string): TeamSummary | null {
    const t = this.one('SELECT * FROM teams WHERE student_code = ? OR coach_code = ?', code, code);
    if (!t) return null;
    const role: Role = t.coach_code === code ? 'coach' : 'student';
    const teamId = String(t.id);
    const existing = this.role(teamId, userId);
    if (!existing) this.sql.exec('INSERT INTO members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)', teamId, userId, role, Date.now());
    else if (existing === 'student' && role === 'coach') this.sql.exec('UPDATE members SET role = ? WHERE team_id = ? AND user_id = ?', 'coach', teamId, userId);
    return { id: teamId, name: String(t.name), role: existing === 'coach' ? 'coach' : role };
  }

  /** Coaches can replace an invite link; the old one stops working. */
  resetInvite(teamId: string, userId: string, which: 'student' | 'coach'): string | null {
    if (this.role(teamId, userId) !== 'coach') return null;
    const code = randomToken(9);
    this.sql.exec(`UPDATE teams SET ${which === 'coach' ? 'coach_code' : 'student_code'} = ? WHERE id = ?`, code, teamId);
    return code;
  }

  /**
   * Delete an account: sessions, memberships, partner spots and the user's own
   * docs outside any team. Docs made inside a team stay with the team.
   * Refused while the user is the only coach of a team that has other members.
   * Returns the ids of deleted docs so their contents can be wiped too.
   */
  deleteAccount(userId: string): { ok: true; deletedDocs: string[] } | { ok: false; reason: string } {
    for (const t of this.teamsFor(userId)) {
      if (t.role !== 'coach') continue;
      const coaches = Number(this.one("SELECT COUNT(*) AS n FROM members WHERE team_id = ? AND role = 'coach'", t.id)?.n ?? 0);
      const members = Number(this.one('SELECT COUNT(*) AS n FROM members WHERE team_id = ?', t.id)?.n ?? 0);
      if (coaches <= 1 && members > 1) return { ok: false, reason: `You're the only coach of ${t.name}. Make someone else a coach first (Team → Members).` };
    }
    const personal = this.all('SELECT id FROM docs WHERE team_id IS NULL AND owner_id = ?', userId).map((r) => String(r.id));
    for (const id of personal) {
      this.sql.exec('DELETE FROM docs WHERE id = ?', id);
      this.sql.exec('DELETE FROM doc_partners WHERE doc_id = ?', id);
    }
    // Teams where they were the only member go too.
    for (const t of this.teamsFor(userId)) {
      const members = Number(this.one('SELECT COUNT(*) AS n FROM members WHERE team_id = ?', t.id)?.n ?? 0);
      if (members <= 1) {
        for (const r of this.all('SELECT id FROM docs WHERE team_id = ?', t.id)) {
          personal.push(String(r.id));
          this.sql.exec('DELETE FROM doc_partners WHERE doc_id = ?', String(r.id));
        }
        this.sql.exec('DELETE FROM docs WHERE team_id = ?', t.id);
        this.sql.exec('DELETE FROM teams WHERE id = ?', t.id);
      }
    }
    this.sql.exec('DELETE FROM doc_partners WHERE user_id = ?', userId);
    this.sql.exec('DELETE FROM members WHERE user_id = ?', userId);
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', userId);
    this.sql.exec('DELETE FROM users WHERE id = ?', userId);
    return { ok: true, deletedDocs: personal };
  }

  /** Coaches can change roles and remove members (but not remove the last coach). */
  updateMember(teamId: string, byUserId: string, memberId: string, change: { role?: Role; remove?: boolean }): boolean {
    if (this.role(teamId, byUserId) !== 'coach') return false;
    const coaches = Number(this.one("SELECT COUNT(*) AS n FROM members WHERE team_id = ? AND role = 'coach'", teamId)?.n ?? 0);
    const target = this.role(teamId, memberId);
    if (!target) return false;
    const losesCoach = target === 'coach' && (change.remove || change.role === 'student');
    if (losesCoach && coaches <= 1) return false;
    if (change.remove) this.sql.exec('DELETE FROM members WHERE team_id = ? AND user_id = ?', teamId, memberId);
    else if (change.role) this.sql.exec('UPDATE members SET role = ? WHERE team_id = ? AND user_id = ?', change.role, teamId, memberId);
    return true;
  }

  renameTeam(teamId: string, userId: string, name: string): boolean {
    if (this.role(teamId, userId) !== 'coach' || !name.trim()) return false;
    this.sql.exec('UPDATE teams SET name = ? WHERE id = ?', name.trim().slice(0, 80), teamId);
    return true;
  }

  // ---------- Docs ----------

  private doc(row: Row): DocRecord {
    const id = String(row.id);
    return {
      id,
      teamId: (row.team_id as string | null) ?? null,
      ownerId: String(row.owner_id),
      title: String(row.title),
      kind: row.kind === 'reference' ? 'reference' : 'prep',
      round: Number(row.round) === 1,
      order: row.ord === null || row.ord === undefined ? null : Number(row.ord),
      partners: this.all('SELECT user_id FROM doc_partners WHERE doc_id = ?', id).map((r) => String(r.user_id)),
      checkToken: (row.check_token as string | null) ?? null,
      createdAt: Number(row.created_at),
    };
  }

  private canAccess(d: DocRecord, userId: string): boolean {
    if (d.ownerId === userId) return true;
    if (!d.teamId) return false;
    const role = this.role(d.teamId, userId);
    if (!role) return false;
    if (!d.round) return true;
    return role === 'coach' || d.partners.includes(userId);
  }

  /** Can this user open (and edit) this doc? Unknown docs: no. */
  access(docId: string, userId: string): { ok: boolean; doc: DocRecord | null } {
    const row = this.one('SELECT * FROM docs WHERE id = ?', docId);
    if (!row) return { ok: false, doc: null };
    const d = this.doc(row);
    return { ok: this.canAccess(d, userId), doc: d };
  }

  /** Docs a user can see: in a team, or their own docs outside any team (teamId null). */
  docsFor(userId: string, teamId: string | null): DocRecord[] {
    const rows = teamId
      ? this.role(teamId, userId)
        ? this.all('SELECT * FROM docs WHERE team_id = ?', teamId)
        : []
      : this.all('SELECT * FROM docs WHERE team_id IS NULL AND owner_id = ?', userId);
    return rows.map((r) => this.doc(r)).filter((d) => this.canAccess(d, userId));
  }

  /**
   * Register a doc (new, or one uploaded from a device). The id is chosen by
   * the client, so refuse ids that already belong to someone else.
   */
  createDoc(userId: string, input: { id: string; teamId: string | null; title: string; kind: string; round?: boolean; order?: number | null }): DocRecord | null {
    const existing = this.one('SELECT * FROM docs WHERE id = ?', input.id);
    if (existing) {
      const d = this.doc(existing);
      return this.canAccess(d, userId) ? d : null;
    }
    if (input.teamId && !this.role(input.teamId, userId)) return null;
    this.sql.exec(
      'INSERT INTO docs (id, team_id, owner_id, title, kind, round, ord, check_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      input.id, input.teamId, userId, input.title.slice(0, 200) || 'Untitled', input.kind === 'reference' ? 'reference' : 'prep',
      input.round ? 1 : 0, input.order ?? null, input.round ? randomToken(12) : null, Date.now(),
    );
    return this.doc(this.one('SELECT * FROM docs WHERE id = ?', input.id)!);
  }

  updateDoc(
    userId: string,
    docId: string,
    patch: { title?: string; kind?: string; round?: boolean; order?: number | null; partners?: string[]; teamId?: string | null },
  ): DocRecord | null {
    const { ok, doc } = this.access(docId, userId);
    if (!ok || !doc) return null;
    if (patch.title !== undefined && patch.title.trim()) this.sql.exec('UPDATE docs SET title = ? WHERE id = ?', patch.title.trim().slice(0, 200), docId);
    if (patch.kind !== undefined) this.sql.exec('UPDATE docs SET kind = ? WHERE id = ?', patch.kind === 'reference' ? 'reference' : 'prep', docId);
    if (patch.order !== undefined) this.sql.exec('UPDATE docs SET ord = ? WHERE id = ?', patch.order, docId);
    if (patch.round !== undefined) {
      this.sql.exec('UPDATE docs SET round = ? WHERE id = ?', patch.round ? 1 : 0, docId);
      if (patch.round && !doc.checkToken) this.sql.exec('UPDATE docs SET check_token = ? WHERE id = ?', randomToken(12), docId);
    }
    // Moving a doc into a team: only its owner, only into a team they're on.
    if (patch.teamId !== undefined && doc.ownerId === userId && patch.teamId !== doc.teamId) {
      if (patch.teamId === null || this.role(patch.teamId, userId)) this.sql.exec('UPDATE docs SET team_id = ? WHERE id = ?', patch.teamId, docId);
    }
    if (patch.partners !== undefined) {
      this.sql.exec('DELETE FROM doc_partners WHERE doc_id = ?', docId);
      const teamId = this.doc(this.one('SELECT * FROM docs WHERE id = ?', docId)!).teamId;
      for (const p of patch.partners.slice(0, 6)) {
        if (teamId && this.role(teamId, p)) this.sql.exec('INSERT OR IGNORE INTO doc_partners (doc_id, user_id) VALUES (?, ?)', docId, p);
      }
    }
    return this.doc(this.one('SELECT * FROM docs WHERE id = ?', docId)!);
  }

  /** Only the owner (or a team coach) can delete a doc from the server list. */
  deleteDoc(userId: string, docId: string): boolean {
    const row = this.one('SELECT * FROM docs WHERE id = ?', docId);
    if (!row) return true;
    const d = this.doc(row);
    const coach = d.teamId ? this.role(d.teamId, userId) === 'coach' : false;
    if (d.ownerId !== userId && !coach) return false;
    this.sql.exec('DELETE FROM docs WHERE id = ?', docId);
    this.sql.exec('DELETE FROM doc_partners WHERE doc_id = ?', docId);
    return true;
  }

  /** Coach view: every round doc on a team (coaches only; null otherwise). */
  roundDocsForCoach(teamId: string, userId: string): (DocRecord & { ownerName: string; partnerNames: string[] })[] | null {
    if (this.role(teamId, userId) !== 'coach') return null;
    return this.all('SELECT * FROM docs WHERE team_id = ? AND round = 1', teamId).map((r) => {
      const d = this.doc(r);
      const names = this.names([d.ownerId, ...d.partners]);
      return { ...d, ownerName: names[d.ownerId] ?? '', partnerNames: d.partners.map((p) => names[p] ?? '').filter(Boolean) };
    });
  }

  /** The public check page looks a round doc up by its check token. */
  docByCheckToken(token: string): { doc: DocRecord; team: string | null; owner: string } | null {
    const row = this.one('SELECT * FROM docs WHERE check_token = ? AND round = 1', token);
    if (!row) return null;
    const d = this.doc(row);
    const team = d.teamId ? String(this.one('SELECT name FROM teams WHERE id = ?', d.teamId)?.name ?? '') : null;
    const owner = String(this.one('SELECT name FROM users WHERE id = ?', d.ownerId)?.name ?? '');
    return { doc: d, team, owner };
  }

  /** Names for user ids (for the check page and partner lists). */
  names(ids: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const id of ids) {
      const r = this.one('SELECT name FROM users WHERE id = ?', id);
      if (r) out[id] = String(r.name);
    }
    return out;
  }
}
