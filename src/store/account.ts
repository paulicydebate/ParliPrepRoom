import { useSyncExternalStore } from 'react';
import { setProfileName } from '../settings/profile';
import { createSignal } from './emitter';

// Signed-in account, teams and the server's doc list. Everything here only
// does something when the app is served by the ParliPrepRoom server; in the
// claude.ai preview or plain `npm run dev` the app stays local-only.

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

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface TeamDetails extends TeamSummary {
  members: Member[];
  invites: { student: string; coach: string } | null;
}

export interface ServerDoc {
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
  tournamentName?: string | null;
  roundLabel?: string | null;
  /** Who on the team can open it: everyone, or only the owner, partners and coaches. */
  access?: 'team' | 'partners';
  /** Partners who accepted are in `partners`; these are invited or said no. */
  pendingPartners?: string[];
  declinedPartners?: string[];
  deletedAt?: number | null;
  deletedByName?: string | null;
}

export interface Tournament {
  id: string;
  name: string;
  code: string;
  directorSecret?: string;
  createdAt?: number;
}

/** Which list the sidebar shows: a team id, or 'personal' (my docs outside any team). */
export type Space = string;
export const PERSONAL = 'personal';

export interface AccountState {
  loaded: boolean;
  /** The server is there (live site). */
  server: boolean;
  signIn: { google: boolean; dev: boolean };
  user: User | null;
  teams: TeamSummary[];
  space: Space;
}

const SPACE_KEY = 'pp-space-v1';
const changed = createSignal();

function storedSpace(): Space {
  try {
    return localStorage.getItem(SPACE_KEY) || PERSONAL;
  } catch {
    return PERSONAL;
  }
}

let state: AccountState = { loaded: false, server: false, signIn: { google: false, dev: false }, user: null, teams: [], space: storedSpace() };

function set(patch: Partial<AccountState>) {
  state = { ...state, ...patch };
  changed.emit();
}

export function getAccount() {
  return state;
}

export function useAccount(): AccountState {
  return useSyncExternalStore(changed.subscribe, getAccount);
}

export function onAccountChange(fn: () => void) {
  return changed.subscribe(fn);
}

/** True when docs should sync with the server. */
export function syncing(): boolean {
  return state.server && !!state.user;
}

async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

let loading: Promise<void> | null = null;

/** Difference between the server's clock and this device's, so shared timers agree. */
let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;

/** Find out whether the server is there and who's signed in. */
export function loadAccount(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const health = res.ok ? ((await res.json()) as { sync?: boolean; auth?: { google: boolean; dev: boolean } }) : null;
        if (!health?.sync) {
          set({ loaded: true, server: false });
          return;
        }
        const health2 = health as { time?: string };
        if (health2.time) serverOffset = Date.parse(health2.time) - Date.now();
        const me = await api<{ user: User | null; teams: TeamSummary[] }>('/api/me');
        let space = state.space;
        if (space !== PERSONAL && !me.teams.some((t) => t.id === space)) space = me.teams[0]?.id ?? PERSONAL;
        set({ loaded: true, server: true, signIn: health.auth ?? { google: false, dev: false }, user: me.user, teams: me.teams, space });
        if (me.user) setProfileName(me.user.name);
      } catch {
        set({ loaded: true, server: false });
      }
    })();
  }
  return loading;
}

export function setSpace(space: Space) {
  try {
    localStorage.setItem(SPACE_KEY, space);
  } catch {
    // ignore
  }
  set({ space });
}

/** Where sign-in should come back to (keeps an invite link in the address). */
export function signInUrl(): string {
  const next = location.pathname + location.hash;
  if (state.signIn.google) return `/api/auth/google?next=${encodeURIComponent(next)}`;
  return '';
}

/** Local testing only (server started with DEV_LOGIN). */
export function devSignInUrl(name: string): string {
  return `/api/auth/dev?name=${encodeURIComponent(name)}&next=${encodeURIComponent(location.pathname + location.hash)}`;
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.reload();
}

export async function renameMe(name: string) {
  const me = await api<{ user: User; teams: TeamSummary[] }>('/api/me', { method: 'PATCH', json: { name } });
  set({ user: me.user });
  setProfileName(me.user.name);
}

export async function refreshTeams() {
  const me = await api<{ user: User | null; teams: TeamSummary[] }>('/api/me');
  set({ user: me.user, teams: me.teams });
}

export async function createTeam(name: string): Promise<TeamSummary> {
  const t = await api<TeamSummary>('/api/teams', { method: 'POST', json: { name } });
  await refreshTeams();
  setSpace(t.id);
  return t;
}

export async function joinTeam(code: string): Promise<TeamSummary> {
  const t = await api<TeamSummary>('/api/join', { method: 'POST', json: { code } });
  await refreshTeams();
  setSpace(t.id);
  return t;
}

export const teamDetails = (id: string) => api<TeamDetails>(`/api/teams/${id}`);
export const renameTeam = (id: string, name: string) => api<TeamDetails>(`/api/teams/${id}`, { method: 'PATCH', json: { name } }).then(async (t) => (await refreshTeams(), t));
export const updateMember = (teamId: string, userId: string, change: { role?: Role; remove?: boolean }) =>
  api<{ ok: true }>(`/api/teams/${teamId}/members/${userId}`, { method: 'POST', json: change });

/** An invitation to co-edit someone's doc. */
export interface Invite {
  docId: string;
  teamId: string;
  title: string;
  round: boolean;
  roundLabel: string | null;
  tournamentName: string | null;
  ownerName: string;
  teamName: string;
  invitedAt: number;
}

let invites: Invite[] = [];
const invitesChanged = createSignal();
const setInvites = (next: Invite[]) => {
  if (JSON.stringify(next) === JSON.stringify(invites)) return;
  invites = next;
  invitesChanged.emit();
};

/** Invitations waiting for me (refreshed with the doc list). */
export function useInvites(): Invite[] {
  return useSyncExternalStore(invitesChanged.subscribe, () => invites);
}

export const listServerDocs = (space: Space) =>
  api<{ docs: ServerDoc[]; invites?: Invite[] }>(`/api/docs?team=${encodeURIComponent(space)}`).then((r) => {
    if (r.invites) setInvites(r.invites);
    return r.docs;
  });

/** Answer an invitation. Accepting returns the doc (now open to me). */
export const respondToInvite = (docId: string, accept: boolean) =>
  api<{ ok: true; accepted: boolean; doc: ServerDoc | null }>(`/api/docs/${docId}/respond`, { method: 'POST', json: { accept } });
export const forgetInvite = (docId: string) => setInvites(invites.filter((i) => i.docId !== docId));
export const getServerDoc = (id: string) => api<ServerDoc>(`/api/docs/${id}`);
export const createServerDoc = (doc: {
  id: string;
  teamId: string | null;
  title: string;
  kind: string;
  round?: boolean;
  order?: number | null;
  partners?: string[];
  tournamentCode?: string | null;
  roundLabel?: string | null;
  access?: 'team' | 'partners';
}) =>
  api<ServerDoc>('/api/docs', { method: 'POST', json: doc });
export const patchServerDoc = (id: string, patch: Partial<Pick<ServerDoc, 'title' | 'kind' | 'round' | 'order' | 'partners' | 'teamId' | 'access'>>) =>
  api<ServerDoc>(`/api/docs/${id}`, { method: 'PATCH', json: patch });
export const deleteServerDoc = (id: string) => api<{ ok: true; purged: boolean }>(`/api/docs/${id}`, { method: 'DELETE' });
export const restoreServerDoc = (id: string) => api<{ ok: true }>(`/api/docs/${id}/restore`, { method: 'POST' });

export interface DeletedDoc extends ServerDoc {
  owner: string;
  /** Tagged with a tournament: the tab room keeps it, so it can't be deleted for good. */
  tournamentLocked: boolean;
}
export interface DeletionEntry {
  docId: string;
  title: string;
  round: boolean;
  action: 'deleted' | 'restored' | 'purged' | 'moved-out';
  userId: string;
  userName: string;
  at: number;
}
/** Coaches: Recently deleted and the deletion log. */
export const teamDeleted = (teamId: string) => api<{ docs: DeletedDoc[]; log: DeletionEntry[] }>(`/api/teams/${teamId}/deleted`);
export const postDocEvents = (id: string, events: unknown[]) => api<{ ok: true }>(`/api/docs/${id}/events`, { method: 'POST', json: { events } });

export interface RoundRow {
  id: string;
  title: string;
  owner: string;
  partners: string[];
  checkToken: string | null;
  createdAt: number;
  deletedAt?: number | null;
  deletedByName?: string | null;
  summary: {
    firstAt: number | null;
    lastAt: number | null;
    typedLive: number;
    catchup: number;
    large: number;
    blocked: number;
    roundOff: number;
    saveFailed?: number;
    roundModeOff: number;
    awayMs: number;
    intact: boolean;
    seal: string | null;
    people: { name: string; typed: number }[];
    flags: number;
  };
}

/** Coach view: every round doc on the team with a summary of its record. */
export const teamRounds = (teamId: string) => api<{ rounds: RoundRow[] }>(`/api/teams/${teamId}/rounds`).then((r) => r.rounds);

/** Coaches: replace an invite link (the old one stops working). */
export const resetInvite = (teamId: string, which: 'student' | 'coach') => api<{ code: string }>(`/api/teams/${teamId}/invites`, { method: 'POST', json: { which } });

/** Delete the signed-in account (see the privacy page for what goes). */
export async function deleteAccount() {
  await api<{ ok: true }>('/api/me', { method: 'DELETE' });
}

/** A doc's current contents (or as of update `seq`) as one Yjs update. */
export async function docState(id: string, seq?: number): Promise<Uint8Array> {
  const res = await fetch(`/api/docs/${id}/state${seq ? `?seq=${seq}` : ''}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Couldn't load the doc (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export interface LogUpdate {
  seq: number;
  at: number;
  userId: string;
  name: string;
  via: string;
  /** base64 Yjs update */
  data: string;
}

/** Every saved edit to a doc, with who and when (for named history and replay). */
export const docLog = (id: string) => api<{ updates: LogUpdate[] }>(`/api/docs/${id}/log`).then((r) => r.updates);

export const createTournament = (name: string) => api<Tournament>('/api/tournaments', { method: 'POST', json: { name } });
export const myTournaments = () => api<{ tournaments: Tournament[] }>('/api/tournaments').then((r) => r.tournaments);
export const lookupTournament = (code: string) => api<Tournament>(`/api/tournaments/lookup?code=${encodeURIComponent(code)}`);
