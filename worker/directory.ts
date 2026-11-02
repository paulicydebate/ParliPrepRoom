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
  tournamentId: string | null;
  tournamentName: string | null;
  roundLabel: string | null;
  /** In Recently deleted (or hidden from its owner): when, and by whom. */
  deletedAt: number | null;
  deletedBy: string | null;
  /** Kept with the doc, so it survives that person deleting their account. */
  deletedByName: string | null;
}

/** One line of a team's deletion log. */
export interface DeletionEntry {
  docId: string;
  title: string;
  round: boolean;
  action: 'deleted' | 'restored' | 'purged' | 'moved-out';
  userId: string;
  userName: string;
  at: number;
}

export interface Tournament {
  id: string;
  name: string;
  /** Short code teams type in when they start a round. */
  code: string;
  /** Secret for the director's link (only returned to its creator). */
  directorSecret?: string;
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
        CREATE TABLE IF NOT EXISTS tournaments (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, director_secret TEXT NOT NULL UNIQUE,
          created_by TEXT NOT NULL, created_at INTEGER NOT NULL);
      `);
      // Columns added after the first deploy.
      const cols = this.ctx.storage.sql.exec('PRAGMA table_info(docs)').toArray().map((r) => String(r.name));
      if (!cols.includes('tournament_id')) this.ctx.storage.sql.exec('ALTER TABLE docs ADD COLUMN tournament_id TEXT');
      if (!cols.includes('round_label')) this.ctx.storage.sql.exec('ALTER TABLE docs ADD COLUMN round_label TEXT');
      if (!cols.includes('deleted_at')) this.ctx.storage.sql.exec('ALTER TABLE docs ADD COLUMN deleted_at INTEGER');
      if (!cols.includes('deleted_by')) this.ctx.storage.sql.exec('ALTER TABLE docs ADD COLUMN deleted_by TEXT');
      if (!cols.includes('deleted_by_name')) this.ctx.storage.sql.exec('ALTER TABLE docs ADD COLUMN deleted_by_name TEXT');
      // Every deletion, restore and permanent delete of a team doc. Kept even
      // after the doc is gone, so coaches can see that it happened.
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS deletions (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, team_id TEXT, doc_id TEXT NOT NULL, title TEXT NOT NULL,
          round INTEGER NOT NULL, action TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL, at INTEGER NOT NULL);
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
    // Round docs tagged with a tournament are kept (hidden) for the tab room.
    const userName = String(this.one('SELECT name FROM users WHERE id = ?', userId)?.name ?? '');
    const keepForTabRoom = (where: string, arg: string) =>
      this.sql.exec(
        `UPDATE docs SET deleted_at = COALESCE(deleted_at, ?), deleted_by = COALESCE(deleted_by, ?), deleted_by_name = COALESCE(deleted_by_name, ?) WHERE ${where} AND tournament_id IS NOT NULL`,
        Date.now(), userId, `${userName} (account deleted)`, arg,
      );
    keepForTabRoom('team_id IS NULL AND owner_id = ?', userId);
    const personal = this.all('SELECT id FROM docs WHERE team_id IS NULL AND owner_id = ? AND tournament_id IS NULL', userId).map((r) => String(r.id));
    for (const id of personal) this.purge(id);
    // Teams where they were the only member go too.
    for (const t of this.teamsFor(userId)) {
      const members = Number(this.one('SELECT COUNT(*) AS n FROM members WHERE team_id = ?', t.id)?.n ?? 0);
      if (members <= 1) {
        keepForTabRoom('team_id = ?', t.id);
        for (const r of this.all('SELECT id FROM docs WHERE team_id = ? AND tournament_id IS NULL', t.id)) {
          personal.push(String(r.id));
          this.purge(String(r.id));
        }
        this.sql.exec('DELETE FROM deletions WHERE team_id = ?', t.id);
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
      tournamentId: (row.tournament_id as string | null) ?? null,
      tournamentName: row.tournament_id ? String(this.one('SELECT name FROM tournaments WHERE id = ?', String(row.tournament_id))?.name ?? '') || null : null,
      roundLabel: (row.round_label as string | null) ?? null,
      deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : Number(row.deleted_at),
      deletedBy: (row.deleted_by as string | null) ?? null,
      deletedByName: (row.deleted_by_name as string | null) ?? null,
    };
  }

  private canAccess(d: DocRecord, userId: string): boolean {
    // A deleted doc: only the team's coaches can still open it.
    if (d.deletedAt !== null) return !!d.teamId && this.role(d.teamId, userId) === 'coach';
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
    return rows.map((r) => this.doc(r)).filter((d) => d.deletedAt === null && this.canAccess(d, userId));
  }

  /**
   * Register a doc (new, or one uploaded from a device). The id is chosen by
   * the client, so refuse ids that already belong to someone else.
   */
  createDoc(
    userId: string,
    input: { id: string; teamId: string | null; title: string; kind: string; round?: boolean; order?: number | null; partners?: string[]; tournamentCode?: string | null; roundLabel?: string | null },
  ): DocRecord | null {
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
    const t = input.tournamentCode ? this.tournamentByCode(input.tournamentCode) : null;
    if (t || input.roundLabel) {
      this.sql.exec('UPDATE docs SET tournament_id = ?, round_label = ? WHERE id = ?', t?.id ?? null, input.roundLabel?.trim().slice(0, 60) || null, input.id);
    }
    if (input.partners?.length) this.updateDoc(userId, input.id, { partners: input.partners });
    return this.doc(this.one('SELECT * FROM docs WHERE id = ?', input.id)!);
  }

  updateDoc(
    userId: string,
    docId: string,
    patch: { title?: string; kind?: string; round?: boolean; order?: number | null; partners?: string[]; teamId?: string | null; tournamentCode?: string | null; roundLabel?: string | null },
  ): DocRecord | null {
    const { ok, doc } = this.access(docId, userId);
    if (!ok || !doc) return null;
    if (patch.title !== undefined && patch.title.trim()) this.sql.exec('UPDATE docs SET title = ? WHERE id = ?', patch.title.trim().slice(0, 200), docId);
    if (patch.kind !== undefined) this.sql.exec('UPDATE docs SET kind = ? WHERE id = ?', patch.kind === 'reference' ? 'reference' : 'prep', docId);
    if (patch.order !== undefined) this.sql.exec('UPDATE docs SET ord = ? WHERE id = ?', patch.order, docId);
    // A tournament tag can be added but not removed or changed, so a round
    // doc can't be taken out of the tab room's view.
    if (patch.tournamentCode !== undefined && !doc.tournamentId) {
      const t = patch.tournamentCode ? this.tournamentByCode(patch.tournamentCode) : null;
      this.sql.exec('UPDATE docs SET tournament_id = ? WHERE id = ?', t?.id ?? null, docId);
    }
    if (patch.roundLabel !== undefined) this.sql.exec('UPDATE docs SET round_label = ? WHERE id = ?', patch.roundLabel?.trim().slice(0, 60) || null, docId);
    if (patch.round !== undefined) {
      this.sql.exec('UPDATE docs SET round = ? WHERE id = ?', patch.round ? 1 : 0, docId);
      if (patch.round && !doc.checkToken) this.sql.exec('UPDATE docs SET check_token = ? WHERE id = ?', randomToken(12), docId);
    }
    // Moving a doc into a team: only its owner, only into a team they're on.
    // Moving out of a team: never for round docs (the coach would lose them);
    // other docs can go, and the move is in the team's deletion log.
    if (patch.teamId !== undefined && doc.ownerId === userId && patch.teamId !== doc.teamId && !(doc.teamId && doc.round)) {
      if (patch.teamId === null || this.role(patch.teamId, userId)) {
        if (doc.teamId) this.logDeletion(doc, 'moved-out', userId);
        this.sql.exec('UPDATE docs SET team_id = ? WHERE id = ?', patch.teamId, docId);
      }
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

  private logDeletion(d: DocRecord, action: DeletionEntry['action'], userId: string) {
    const name = String(this.one('SELECT name FROM users WHERE id = ?', userId)?.name ?? '');
    this.sql.exec(
      'INSERT INTO deletions (team_id, doc_id, title, round, action, user_id, user_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      d.teamId, d.id, d.title, d.round ? 1 : 0, action, userId, name, Date.now(),
    );
  }

  private purge(docId: string) {
    this.sql.exec('DELETE FROM docs WHERE id = ?', docId);
    this.sql.exec('DELETE FROM doc_partners WHERE doc_id = ?', docId);
  }

  private hide(d: DocRecord, userId: string) {
    const name = String(this.one('SELECT name FROM users WHERE id = ?', userId)?.name ?? '');
    this.sql.exec('UPDATE docs SET deleted_at = ?, deleted_by = ?, deleted_by_name = ? WHERE id = ?', Date.now(), userId, name, d.id);
  }

  /**
   * Delete a doc.
   * - Team docs (owner or coach): go to Recently deleted, where coaches can
   *   still open them, restore them or delete them for good. Logged.
   * - A team doc already in Recently deleted, by a coach: deleted for good
   *   (not tournament round docs: the tab room keeps those). Logged.
   * - My own docs outside a team: deleted for good, except tournament round
   *   docs, which are only hidden from me (the tab room still sees them).
   * `purged` tells the caller to wipe the doc's contents too.
   */
  deleteDoc(userId: string, docId: string): { ok: true; purged: boolean } | { ok: false; reason: string } {
    const row = this.one('SELECT * FROM docs WHERE id = ?', docId);
    if (!row) return { ok: true, purged: false };
    const d = this.doc(row);
    const coach = d.teamId ? this.role(d.teamId, userId) === 'coach' : false;
    if (d.deletedAt !== null) {
      if (!coach) return { ok: false, reason: 'Only a coach can delete this for good' };
      if (d.tournamentId) return { ok: false, reason: 'Round docs from a tournament stay for the tab room' };
      this.logDeletion(d, 'purged', userId);
      this.purge(docId);
      return { ok: true, purged: true };
    }
    if (d.ownerId !== userId && !coach) return { ok: false, reason: 'Only the owner or a coach can delete this doc' };
    if (d.teamId || d.tournamentId) {
      if (d.teamId) this.logDeletion(d, 'deleted', userId);
      this.hide(d, userId);
      return { ok: true, purged: false };
    }
    this.purge(docId);
    return { ok: true, purged: true };
  }

  /** Coaches: bring a doc back from Recently deleted. */
  restoreDoc(userId: string, docId: string): boolean {
    const row = this.one('SELECT * FROM docs WHERE id = ?', docId);
    if (!row) return false;
    const d = this.doc(row);
    if (d.deletedAt === null || !d.teamId || this.role(d.teamId, userId) !== 'coach') return false;
    this.sql.exec('UPDATE docs SET deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL WHERE id = ?', docId);
    this.logDeletion(d, 'restored', userId);
    return true;
  }

  /** Coaches: Recently deleted and the deletion log (newest first). */
  trash(teamId: string, userId: string): { docs: (DocRecord & { ownerName: string })[]; log: DeletionEntry[] } | null {
    if (this.role(teamId, userId) !== 'coach') return null;
    const docs = this.all('SELECT * FROM docs WHERE team_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC', teamId).map((r) => {
      const d = this.doc(r);
      return { ...d, ownerName: this.names([d.ownerId])[d.ownerId] ?? '' };
    });
    const log = this.all('SELECT * FROM deletions WHERE team_id = ? ORDER BY seq DESC LIMIT 300', teamId).map((r) => ({
      docId: String(r.doc_id),
      title: String(r.title),
      round: Number(r.round) === 1,
      action: String(r.action) as DeletionEntry['action'],
      userId: String(r.user_id),
      userName: String(r.user_name),
      at: Number(r.at),
    }));
    return { docs, log };
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

  // ---------- Tournaments (Tabroom) ----------

  /** Anyone signed in can set up a tournament; they get its code and the director's link. */
  createTournament(userId: string, name: string): Tournament {
    const id = crypto.randomUUID();
    const clean = name.trim().slice(0, 100) || 'Tournament';
    // Short, readable code (no 0/O/1/I).
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      const b = new Uint8Array(6);
      crypto.getRandomValues(b);
      code = Array.from(b, (x) => alphabet[x % alphabet.length]).join('');
    } while (this.one('SELECT id FROM tournaments WHERE code = ?', code));
    const secret = randomToken(18);
    this.sql.exec('INSERT INTO tournaments (id, name, code, director_secret, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, clean, code, secret, userId, Date.now());
    return { id, name: clean, code, directorSecret: secret, createdAt: Date.now() };
  }

  myTournaments(userId: string): Tournament[] {
    return this.all('SELECT * FROM tournaments WHERE created_by = ? ORDER BY created_at DESC', userId).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      code: String(r.code),
      directorSecret: String(r.director_secret),
      createdAt: Number(r.created_at),
    }));
  }

  tournamentByCode(code: string): Tournament | null {
    const r = this.one('SELECT * FROM tournaments WHERE code = ?', code.trim().toUpperCase());
    return r ? { id: String(r.id), name: String(r.name), code: String(r.code), createdAt: Number(r.created_at) } : null;
  }

  /** Director's view: every round doc tagged with the tournament, from every team. */
  tournamentRounds(secret: string): { tournament: Tournament; docs: (DocRecord & { teamName: string; ownerName: string; partnerNames: string[] })[] } | null {
    const t = this.one('SELECT * FROM tournaments WHERE director_secret = ?', secret);
    if (!t) return null;
    const docs = this.all('SELECT * FROM docs WHERE tournament_id = ? AND round = 1', String(t.id)).map((r) => {
      const d = this.doc(r);
      const names = this.names([d.ownerId, ...d.partners]);
      const teamName = d.teamId ? String(this.one('SELECT name FROM teams WHERE id = ?', d.teamId)?.name ?? '') : '';
      return { ...d, teamName, ownerName: names[d.ownerId] ?? '', partnerNames: d.partners.map((p) => names[p] ?? '').filter(Boolean) };
    });
    return { tournament: { id: String(t.id), name: String(t.name), code: String(t.code), createdAt: Number(t.created_at) }, docs };
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
