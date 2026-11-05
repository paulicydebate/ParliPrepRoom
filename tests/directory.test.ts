// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { newContext } from './stubs/cloudflare-workers';
import { Directory } from '../worker/directory';

// The server's access rules, run against the real Directory code on an
// in-memory SQLite database. People: Coach, Owner, Pat (partner), Quinn (other student).

let dir: Directory;
let ids: Record<'coach' | 'owner' | 'pat' | 'quinn', string>;
let team: string;

async function person(name: string) {
  const token = await dir.signIn({ provider: 'test', subject: name, email: `${name}@example.test`, name });
  return (await dir.userForSession(token))!.id;
}

beforeEach(async () => {
  dir = new Directory(newContext() as never, {} as never);
  ids = { coach: await person('Coach'), owner: await person('Owner'), pat: await person('Pat'), quinn: await person('Quinn') };
  const t = dir.createTeam(ids.coach, 'Test team');
  team = t.id;
  const codes = dir.team(team, ids.coach)!.invites!;
  for (const u of [ids.owner, ids.pat, ids.quinn]) dir.joinTeam(u, codes.student);
});

const uid = () => crypto.randomUUID();
const titles = (user: string) => dir.docsFor(user, team).map((d) => d.title).sort();

describe('who can open a team doc', () => {
  it('a new prep doc is private to its owner, partners and coaches', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Prep', kind: 'prep' });
    expect(titles(ids.owner)).toEqual(['Prep']);
    expect(titles(ids.coach)).toEqual(['Prep']);
    expect(titles(ids.quinn)).toEqual([]);
    expect(dir.access(id, ids.quinn).ok).toBe(false);
  });

  it('coach briefs (reference docs) are open to the whole team', () => {
    const id = uid();
    dir.createDoc(ids.coach, { id, teamId: team, title: 'Brief', kind: 'reference' });
    expect(titles(ids.quinn)).toEqual(['Brief']);
  });

  it('the owner can share a doc with the whole team, and take it back', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Prep', kind: 'prep' });
    dir.updateDoc(ids.owner, id, { access: 'team' });
    expect(titles(ids.quinn)).toEqual(['Prep']);
    dir.updateDoc(ids.owner, id, { access: 'partners' });
    expect(titles(ids.quinn)).toEqual([]);
  });

  it('only the owner or a coach can change access', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Prep', kind: 'prep' });
    expect(dir.updateDoc(ids.quinn, id, { access: 'team' })).toBeNull();
    expect(dir.access(id, ids.quinn).ok).toBe(false);
  });

  it('a round doc is always private, even if asked to be team-wide', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'R1', kind: 'prep', round: true, access: 'team' });
    expect(dir.access(id, ids.quinn).ok).toBe(false);
    dir.updateDoc(ids.owner, id, { access: 'team' });
    expect(dir.access(id, ids.quinn).ok).toBe(false);
  });

  it('turning a team-wide doc into a round doc makes it private', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Prep', kind: 'prep', access: 'team' });
    dir.updateDoc(ids.owner, id, { round: true });
    expect(dir.access(id, ids.quinn).ok).toBe(false);
  });

  it('a doc outside any team is open to its owner only', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: null, title: 'Mine', kind: 'prep' });
    expect(dir.access(id, ids.owner).ok).toBe(true);
    expect(dir.access(id, ids.coach).ok).toBe(false);
  });

  it('nobody can claim a doc id that belongs to someone else', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Prep', kind: 'prep' });
    expect(dir.createDoc(ids.quinn, { id, teamId: team, title: 'Mine now', kind: 'prep' })).toBeNull();
  });
});

describe('deleting', () => {
  const make = (extra: object = {}) => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Prep', kind: 'prep', ...extra });
    return id;
  };

  it('a deleted team doc leaves the student but stays open to coaches, and is logged', () => {
    const id = make({ round: true });
    expect(dir.deleteDoc(ids.owner, id)).toEqual({ ok: true, purged: false });
    expect(dir.access(id, ids.owner).ok).toBe(false);
    expect(dir.access(id, ids.coach).ok).toBe(true);
    const trash = dir.trash(team, ids.coach)!;
    expect(trash.docs.map((d) => d.id)).toEqual([id]);
    expect(trash.log[0]).toMatchObject({ action: 'deleted', docId: id, userName: 'Owner' });
  });

  it('students cannot restore or purge; coaches can', () => {
    const id = make();
    dir.deleteDoc(ids.owner, id);
    expect(dir.restoreDoc(ids.owner, id)).toBe(false);
    expect(dir.deleteDoc(ids.owner, id).ok).toBe(false);
    expect(dir.restoreDoc(ids.coach, id)).toBe(true);
    expect(dir.access(id, ids.owner).ok).toBe(true);
    dir.deleteDoc(ids.owner, id);
    expect(dir.deleteDoc(ids.coach, id)).toEqual({ ok: true, purged: true });
    expect(dir.trash(team, ids.coach)!.log.map((l) => l.action)).toEqual(['purged', 'deleted', 'restored', 'deleted']);
  });

  it('a round doc cannot be moved out of the team', () => {
    const id = make({ round: true });
    dir.updateDoc(ids.owner, id, { teamId: null });
    expect(dir.access(id, ids.coach).ok).toBe(true);
  });

  it('a tournament round doc can never be deleted for good', () => {
    const t = dir.createTournament(ids.coach, 'Fall Classic');
    const id = make({ round: true, tournamentCode: t.code, roundLabel: 'R1' });
    dir.deleteDoc(ids.owner, id);
    expect(dir.deleteDoc(ids.coach, id).ok).toBe(false);
    expect(dir.tournamentRounds(t.directorSecret!)!.docs.map((d) => d.id)).toEqual([id]);
  });

  it('a tournament tag cannot be removed or changed once set', () => {
    const t = dir.createTournament(ids.coach, 'Fall Classic');
    const other = dir.createTournament(ids.coach, 'Other');
    const id = make({ round: true, tournamentCode: t.code });
    dir.updateDoc(ids.owner, id, { tournamentCode: null });
    dir.updateDoc(ids.owner, id, { tournamentCode: other.code });
    expect(dir.tournamentRounds(t.directorSecret!)!.docs).toHaveLength(1);
    expect(dir.tournamentRounds(other.directorSecret!)!.docs).toHaveLength(0);
  });
});

describe('partner invitations', () => {
  const make = (partners: string[], extra: object = {}) => {
    const id = uid();
    const d = dir.createDoc(ids.owner, { id, teamId: team, title: 'Round 3', kind: 'prep', round: true, roundLabel: 'Round 3', partners, ...extra })!;
    return { id, d };
  };

  it('picking a partner sends an invite: no access until they accept', () => {
    const { id, d } = make([ids.pat]);
    expect(d.partners).toEqual([]);
    expect(d.pendingPartners).toEqual([ids.pat]);
    expect(dir.access(id, ids.pat).ok).toBe(false);
    expect(titles(ids.pat)).toEqual([]);
    const invites = dir.invitesFor(ids.pat);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ docId: id, title: 'Round 3', ownerName: 'Owner', teamName: 'Test team', round: true });
  });

  it('accepting gives access and clears the invite', () => {
    const { id } = make([ids.pat]);
    const r = dir.respondToInvite(ids.pat, id, true);
    expect(r.ok).toBe(true);
    expect(dir.access(id, ids.pat).ok).toBe(true);
    expect(titles(ids.pat)).toEqual(['Round 3']);
    expect(dir.invitesFor(ids.pat)).toEqual([]);
    expect(dir.access(id, ids.owner).doc!.partners).toEqual([ids.pat]);
  });

  it('declining keeps them out, and the owner can see it and invite again', () => {
    const { id } = make([ids.pat]);
    dir.respondToInvite(ids.pat, id, false);
    expect(dir.access(id, ids.pat).ok).toBe(false);
    expect(dir.invitesFor(ids.pat)).toEqual([]);
    expect(dir.access(id, ids.owner).doc!.declinedPartners).toEqual([ids.pat]);
    dir.updateDoc(ids.owner, id, { partners: [ids.pat] });
    expect(dir.access(id, ids.owner).doc!.pendingPartners).toEqual([ids.pat]);
    expect(dir.invitesFor(ids.pat)).toHaveLength(1);
  });

  it('only the invited person can answer an invite', () => {
    const { id } = make([ids.pat]);
    expect(dir.respondToInvite(ids.quinn, id, true).ok).toBe(false);
    expect(dir.access(id, ids.quinn).ok).toBe(false);
    expect(dir.respondToInvite(ids.owner, id, true).ok).toBe(false);
  });

  it('a declined person cannot accept without a new invite', () => {
    const { id } = make([ids.pat]);
    dir.respondToInvite(ids.pat, id, false);
    expect(dir.respondToInvite(ids.pat, id, true).ok).toBe(false);
    expect(dir.access(id, ids.pat).ok).toBe(false);
  });

  it('removing an accepted partner takes their access away; a partner can also leave', () => {
    const { id } = make([ids.pat, ids.quinn]);
    dir.respondToInvite(ids.pat, id, true);
    dir.respondToInvite(ids.quinn, id, true);
    dir.updateDoc(ids.owner, id, { partners: [ids.quinn] });
    expect(dir.access(id, ids.pat).ok).toBe(false);
    expect(dir.access(id, ids.quinn).ok).toBe(true);
    expect(dir.respondToInvite(ids.quinn, id, false).ok).toBe(true);
    expect(dir.access(id, ids.quinn).ok).toBe(false);
  });

  it('re-saving the partner list does not re-invite someone who already accepted', () => {
    const { id } = make([ids.pat]);
    dir.respondToInvite(ids.pat, id, true);
    dir.updateDoc(ids.owner, id, { partners: [ids.pat] });
    expect(dir.access(id, ids.pat).ok).toBe(true);
    expect(dir.invitesFor(ids.pat)).toEqual([]);
  });

  it('only people on the team can be invited, and never the owner', () => {
    const outsider = uid();
    const { d } = make([outsider, ids.owner]);
    expect(d.pendingPartners).toEqual([]);
  });

  it('a coach can add a partner, who must accept too; coaches never need to', () => {
    const { id } = make([]);
    dir.updateDoc(ids.coach, id, { partners: [ids.pat] });
    expect(dir.access(id, ids.pat).ok).toBe(false);
    expect(dir.access(id, ids.coach).ok).toBe(true);
    expect(dir.invitesFor(ids.pat)).toHaveLength(1);
  });

  it('a student who is only a partner cannot change the partner list', () => {
    const { id } = make([ids.pat]);
    dir.respondToInvite(ids.pat, id, true);
    dir.updateDoc(ids.pat, id, { partners: [ids.pat, ids.quinn] });
    expect(dir.access(id, ids.owner).doc!.pendingPartners).toEqual([]);
  });

  it('a deleted doc no longer shows as an invite', () => {
    const { id } = make([ids.pat]);
    dir.deleteDoc(ids.owner, id);
    expect(dir.invitesFor(ids.pat)).toEqual([]);
  });

  it('partners who were added before invitations existed stay accepted', () => {
    const ctx = newContext();
    ctx.storage.sql.exec('CREATE TABLE doc_partners (doc_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (doc_id, user_id))');
    ctx.storage.sql.exec("INSERT INTO doc_partners VALUES ('d1', 'u1')");
    new Directory(ctx as never, {} as never);
    expect(ctx.storage.sql.exec('SELECT status FROM doc_partners').toArray()).toEqual([{ status: 'accepted' }]);
  });
});

describe('removing someone from the team', () => {
  it('a student removed from the team can no longer open or delete docs they own there', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Mine', kind: 'prep' });
    dir.updateMember(team, ids.coach, ids.owner, { remove: true });
    expect(dir.access(id, ids.owner).ok).toBe(false);
    expect(dir.docsFor(ids.owner, team)).toEqual([]);
    expect(dir.deleteDoc(ids.owner, id).ok).toBe(false);
    expect(dir.access(id, ids.coach).ok).toBe(true); // coaches keep it
  });

  it('they can still use docs of their own outside the team, and rejoin with the invite link', () => {
    const mine = uid();
    dir.createDoc(ids.owner, { id: mine, teamId: null, title: 'Solo', kind: 'prep' });
    dir.updateMember(team, ids.coach, ids.owner, { remove: true });
    expect(dir.access(mine, ids.owner).ok).toBe(true);
    const code = dir.team(team, ids.coach)!.invites!.student;
    dir.joinTeam(ids.owner, code);
    const back = uid();
    dir.createDoc(ids.owner, { id: back, teamId: team, title: 'Back', kind: 'prep' });
    expect(dir.access(back, ids.owner).ok).toBe(true);
  });
});

describe('the regular refresh', () => {
  it('returns who I am, my docs and my invitations in one call', async () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Round', kind: 'prep', round: true, partners: [ids.pat] });
    const token = await dir.signIn({ provider: 'test', subject: 'Pat', email: 'Pat@example.test', name: 'Pat' });
    const r = (await dir.docList(token, team))!;
    expect(r.user.id).toBe(ids.pat);
    expect(r.docs).toEqual([]); // not accepted yet
    expect(r.invites.map((i) => i.docId)).toEqual([id]);
    dir.respondToInvite(ids.pat, id, true);
    const after = (await dir.docList(token, team))!;
    expect(after.docs.map((d) => d.id)).toEqual([id]);
    expect(after.invites).toEqual([]);
  });

  it('says nobody is signed in for a missing or wrong session', async () => {
    expect(await dir.docList(null, team)).toBeNull();
    expect(await dir.docList('not-a-session', team)).toBeNull();
  });
});

describe('a document is a doc or a flow, fixed when it is made', () => {
  it('defaults to a doc and remembers a flow', () => {
    const a = uid();
    const b = uid();
    expect(dir.createDoc(ids.owner, { id: a, teamId: team, title: 'Prep', kind: 'prep' })!.format).toBe('doc');
    expect(dir.createDoc(ids.owner, { id: b, teamId: team, title: 'Round flow', kind: 'prep', format: 'flow' })!.format).toBe('flow');
    expect(dir.docsFor(ids.owner, team).map((d) => [d.title, d.format]).sort()).toEqual([['Prep', 'doc'], ['Round flow', 'flow']]);
  });

  it('can never be changed afterwards', () => {
    const id = uid();
    dir.createDoc(ids.owner, { id, teamId: team, title: 'Flow', kind: 'prep', format: 'flow' });
    expect(dir.updateDoc(ids.owner, id, { format: 'doc' } as never)!.format).toBe('flow');
    const doc = uid();
    dir.createDoc(ids.owner, { id: doc, teamId: team, title: 'Doc', kind: 'prep' });
    expect(dir.updateDoc(ids.owner, doc, { format: 'flow' } as never)!.format).toBe('doc');
    expect(dir.updateDoc(ids.coach, doc, { format: 'flow' } as never)!.format).toBe('doc');
  });

  it('works for round docs and reference docs too', () => {
    const r = dir.createDoc(ids.owner, { id: uid(), teamId: team, title: 'R1 flow', kind: 'prep', round: true, format: 'flow' })!;
    expect([r.round, r.format]).toEqual([true, 'flow']);
    const ref = dir.createDoc(ids.coach, { id: uid(), teamId: team, title: 'Example flow', kind: 'reference', format: 'flow' })!;
    expect([ref.kind, ref.format]).toEqual(['reference', 'flow']);
  });

  it('ignores anything that is not "flow"', () => {
    const d = dir.createDoc(ids.owner, { id: uid(), teamId: team, title: 'X', kind: 'prep', format: 'spreadsheet' as never })!;
    expect(d.format).toBe('doc');
  });

  it('existing docs become docs, except the built-in sample flow', () => {
    const ctx = newContext();
    const first = new Directory(ctx as never, {} as never);
    void first;
    // Simulate a database from before this change: no format column.
    const old = newContext();
    old.storage.sql.exec(`CREATE TABLE docs (id TEXT PRIMARY KEY, team_id TEXT, owner_id TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, round INTEGER NOT NULL DEFAULT 0, ord REAL, check_token TEXT UNIQUE, created_at INTEGER NOT NULL)`);
    old.storage.sql.exec("INSERT INTO docs (id, owner_id, title, kind, created_at) VALUES ('a', 'u', 'My prep', 'prep', 1), ('b', 'u', 'Sample flow: facial recognition', 'prep', 2)");
    new Directory(old as never, {} as never);
    expect(old.storage.sql.exec('SELECT title, format FROM docs ORDER BY id').toArray()).toEqual([
      { title: 'My prep', format: 'doc' },
      { title: 'Sample flow: facial recognition', format: 'flow' },
    ]);
  });
});
