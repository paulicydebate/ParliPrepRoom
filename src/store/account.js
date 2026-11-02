import { useSyncExternalStore } from 'react';
import { setProfileName } from '../settings/profile';
import { createSignal } from './emitter';
export const PERSONAL = 'personal';
const SPACE_KEY = 'pp-space-v1';
const changed = createSignal();
function storedSpace() {
    try {
        return localStorage.getItem(SPACE_KEY) || PERSONAL;
    }
    catch {
        return PERSONAL;
    }
}
let state = { loaded: false, server: false, signIn: { google: false, dev: false }, user: null, teams: [], space: storedSpace() };
function set(patch) {
    state = { ...state, ...patch };
    changed.emit();
}
export function getAccount() {
    return state;
}
export function useAccount() {
    return useSyncExternalStore(changed.subscribe, getAccount);
}
export function onAccountChange(fn) {
    return changed.subscribe(fn);
}
/** True when docs should sync with the server. */
export function syncing() {
    return state.server && !!state.user;
}
async function api(path, init) {
    const res = await fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers: { ...(init?.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
        body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
    const body = (await res.json().catch(() => ({})));
    if (!res.ok)
        throw new Error(body.error || `Request failed (${res.status})`);
    return body;
}
let loading = null;
/** Difference between the server's clock and this device's, so shared timers agree. */
let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;
/** Find out whether the server is there and who's signed in. */
export function loadAccount() {
    if (!loading) {
        loading = (async () => {
            try {
                const res = await fetch('/api/health', { cache: 'no-store' });
                const health = res.ok ? (await res.json()) : null;
                if (!health?.sync) {
                    set({ loaded: true, server: false });
                    return;
                }
                const health2 = health;
                if (health2.time)
                    serverOffset = Date.parse(health2.time) - Date.now();
                const me = await api('/api/me');
                let space = state.space;
                if (space !== PERSONAL && !me.teams.some((t) => t.id === space))
                    space = me.teams[0]?.id ?? PERSONAL;
                set({ loaded: true, server: true, signIn: health.auth ?? { google: false, dev: false }, user: me.user, teams: me.teams, space });
                if (me.user)
                    setProfileName(me.user.name);
            }
            catch {
                set({ loaded: true, server: false });
            }
        })();
    }
    return loading;
}
export function setSpace(space) {
    try {
        localStorage.setItem(SPACE_KEY, space);
    }
    catch {
        // ignore
    }
    set({ space });
}
/** Where sign-in should come back to (keeps an invite link in the address). */
export function signInUrl() {
    const next = location.pathname + location.hash;
    if (state.signIn.google)
        return `/api/auth/google?next=${encodeURIComponent(next)}`;
    return '';
}
/** Local testing only (server started with DEV_LOGIN). */
export function devSignInUrl(name) {
    return `/api/auth/dev?name=${encodeURIComponent(name)}&next=${encodeURIComponent(location.pathname + location.hash)}`;
}
export async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    location.reload();
}
export async function renameMe(name) {
    const me = await api('/api/me', { method: 'PATCH', json: { name } });
    set({ user: me.user });
    setProfileName(me.user.name);
}
export async function refreshTeams() {
    const me = await api('/api/me');
    set({ user: me.user, teams: me.teams });
}
export async function createTeam(name) {
    const t = await api('/api/teams', { method: 'POST', json: { name } });
    await refreshTeams();
    setSpace(t.id);
    return t;
}
export async function joinTeam(code) {
    const t = await api('/api/join', { method: 'POST', json: { code } });
    await refreshTeams();
    setSpace(t.id);
    return t;
}
export const teamDetails = (id) => api(`/api/teams/${id}`);
export const renameTeam = (id, name) => api(`/api/teams/${id}`, { method: 'PATCH', json: { name } }).then(async (t) => (await refreshTeams(), t));
export const updateMember = (teamId, userId, change) => api(`/api/teams/${teamId}/members/${userId}`, { method: 'POST', json: change });
export const listServerDocs = (space) => api(`/api/docs?team=${encodeURIComponent(space)}`).then((r) => r.docs);
export const getServerDoc = (id) => api(`/api/docs/${id}`);
export const createServerDoc = (doc) => api('/api/docs', { method: 'POST', json: doc });
export const patchServerDoc = (id, patch) => api(`/api/docs/${id}`, { method: 'PATCH', json: patch });
export const deleteServerDoc = (id) => api(`/api/docs/${id}`, { method: 'DELETE' });
export const postDocEvents = (id, events) => api(`/api/docs/${id}/events`, { method: 'POST', json: { events } });
/** Coach view: every round doc on the team with a summary of its record. */
export const teamRounds = (teamId) => api(`/api/teams/${teamId}/rounds`).then((r) => r.rounds);
/** Coaches: replace an invite link (the old one stops working). */
export const resetInvite = (teamId, which) => api(`/api/teams/${teamId}/invites`, { method: 'POST', json: { which } });
/** Delete the signed-in account (see the privacy page for what goes). */
export async function deleteAccount() {
    await api('/api/me', { method: 'DELETE' });
}
/** A doc's current contents (or as of update `seq`) as one Yjs update. */
export async function docState(id, seq) {
    const res = await fetch(`/api/docs/${id}/state${seq ? `?seq=${seq}` : ''}`, { credentials: 'same-origin' });
    if (!res.ok)
        throw new Error(`Couldn't load the doc (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
}
/** Every saved edit to a doc, with who and when (for named history and replay). */
export const docLog = (id) => api(`/api/docs/${id}/log`).then((r) => r.updates);
export const createTournament = (name) => api('/api/tournaments', { method: 'POST', json: { name } });
export const myTournaments = () => api('/api/tournaments').then((r) => r.tournaments);
export const lookupTournament = (code) => api(`/api/tournaments/lookup?code=${encodeURIComponent(code)}`);
