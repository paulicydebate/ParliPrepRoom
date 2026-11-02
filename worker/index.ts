// ParliPrepRoom server (Cloudflare Worker).
// Serves the built app (embedded at build time, see scripts/embed-assets.mjs),
// sign-in, teams, docs, live sync and the public round-doc check page.

import { renderCheckPage } from './checkPage';
import { privacyPage } from './legal';
import type { DocRecord, Role } from './directory';
import { FILES } from './static.gen';

export { DocRoom } from './docRoom';
export { Directory } from './directory';

interface Env {
  DOC_ROOM: DurableObjectNamespace<import('./docRoom').DocRoom>;
  DIRECTORY: DurableObjectNamespace<import('./directory').Directory>;
  /** Google sign-in (set as Worker secrets; sign-in is off until they exist). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Local testing only: `wrangler dev --var DEV_LOGIN:1` allows sign-in without Google. Never set in production. */
  DEV_LOGIN?: string;
}

const DOC_ID = /^[A-Za-z0-9-]{8,64}$/;
const COOKIE = 'pp_session';

function serveFile(path: string): Response | null {
  const f = FILES[path];
  if (!f) return null;
  // Hashed build files never change; everything else is re-checked.
  const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  return new Response(f.body, { headers: { 'content-type': f.type, 'cache-control': cache } });
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const fail = (message: string, status: number) => json({ error: message }, status);

function cookie(request: Request, name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get('cookie') ?? '');
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name: string, value: string, maxAgeSec: number, secure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ location });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

/** Only allow returning to a path on this site. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function b64urlJson(part: string): Record<string, unknown> {
  const pad = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))));
}

async function body<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** The doc as the app sees it: names for partners, check link only for round docs. */
function publicDoc(d: DocRecord) {
  return { id: d.id, teamId: d.teamId, ownerId: d.ownerId, title: d.title, kind: d.kind, round: d.round, order: d.order, partners: d.partners, checkToken: d.round ? d.checkToken : null, createdAt: d.createdAt };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
    const secure = url.protocol === 'https:';
    const googleOn = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    const devOn = env.DEV_LOGIN === '1' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

    if (path === '/privacy') {
      return new Response(privacyPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
    }

    if (path === '/api/health') {
      return json({ ok: true, app: 'parlipreproom', sync: true, auth: { google: googleOn, dev: devOn }, time: new Date().toISOString() });
    }

    // Changes must come from this site's own pages (no cross-site form posts).
    if (request.method !== 'GET' && request.method !== 'HEAD' && path.startsWith('/api/')) {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return fail('Cross-site request refused', 403);
    }

    // ---------- Sign-in ----------
    if (path === '/api/auth/google') {
      if (!googleOn) return fail('Google sign-in is not set up on this server yet', 503);
      const state = crypto.randomUUID();
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
      auth.searchParams.set('redirect_uri', `${url.origin}/api/auth/google/callback`);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('scope', 'openid email profile');
      auth.searchParams.set('state', state);
      auth.searchParams.set('prompt', 'select_account');
      return redirect(auth.toString(), [setCookie('pp_oauth', `${state}|${safeNext(url.searchParams.get('next'))}`, 600, secure)]);
    }

    if (path === '/api/auth/google/callback') {
      const [state, next] = (cookie(request, 'pp_oauth') ?? '|').split('|');
      if (!googleOn || !state || state !== url.searchParams.get('state')) return redirect('/#signin-error=state');
      const code = url.searchParams.get('code');
      if (!code) return redirect('/#signin-error=cancelled');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${url.origin}/api/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) return redirect('/#signin-error=google');
      const { id_token } = (await tokenRes.json()) as { id_token?: string };
      if (!id_token) return redirect('/#signin-error=google');
      // The token came straight from Google over HTTPS in exchange for our
      // secret, so its contents can be trusted after checking who it's for.
      const claims = b64urlJson(id_token.split('.')[1]);
      const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
      if (!issuerOk || claims.aud !== env.GOOGLE_CLIENT_ID || Number(claims.exp) * 1000 < Date.now() || claims.email_verified !== true) {
        return redirect('/#signin-error=google');
      }
      const token = await dir.signIn({
        provider: 'google',
        subject: String(claims.sub),
        email: String(claims.email),
        name: String(claims.name ?? claims.email),
        picture: typeof claims.picture === 'string' ? claims.picture : null,
      });
      return redirect(safeNext(next), [setCookie(COOKIE, token, 60 * 24 * 3600, secure), setCookie('pp_oauth', '', 0, secure)]);
    }

    if (path === '/api/auth/dev') {
      if (!devOn) return fail('Not found', 404);
      const name = (url.searchParams.get('name') ?? 'Test user').slice(0, 80);
      const token = await dir.signIn({ provider: 'dev', subject: name.toLowerCase(), email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`, name });
      return redirect(safeNext(url.searchParams.get('next')), [setCookie(COOKIE, token, 24 * 3600, secure)]);
    }

    if (path === '/api/auth/logout' && request.method === 'POST') {
      const t = cookie(request, COOKIE);
      if (t) await dir.signOut(t);
      return new Response(null, { status: 204, headers: { 'set-cookie': setCookie(COOKIE, '', 0, secure) } });
    }

    const user = await dir.userForSession(cookie(request, COOKIE));

    // ---------- Public check page for round docs ----------
    const check = /^\/check\/([A-Za-z0-9_-]{8,40})$/.exec(path);
    if (check) {
      const found = await dir.docByCheckToken(check[1]);
      if (!found) return new Response('This check link is not valid (or the doc is no longer a round doc).', { status: 404 });
      const room = env.DOC_ROOM.get(env.DOC_ROOM.idFromName(found.doc.id));
      // People on the doc (partners, coaches) also see the typed text.
      const withText = user ? (await dir.access(found.doc.id, user.id)).ok : false;
      const record = await room.record(withText);
      const partners = await dir.names(found.doc.partners);
      return new Response(renderCheckPage({ doc: found.doc, team: found.team, owner: found.owner, partners: Object.values(partners), record, withText, url: url.toString(), tz: typeof request.cf?.timezone === 'string' ? request.cf.timezone : undefined }), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    if (path === '/api/me') {
      if (request.method === 'PATCH') {
        if (!user) return fail('Sign in first', 401);
        const b = await body<{ name?: string }>(request);
        if (b?.name) await dir.renameUser(user.id, b.name);
      }
      if (!user) return json({ user: null, teams: [] });
      const fresh = (await dir.userForSession(cookie(request, COOKIE)))!;
      return json({ user: fresh, teams: await dir.teamsFor(user.id) });
    }

    if (path.startsWith('/api/') && !path.startsWith('/api/sync/') && !user) {
      if (path.startsWith('/api/teams') || path.startsWith('/api/docs') || path === '/api/join') return fail('Sign in first', 401);
    }

    // ---------- Teams ----------
    if (path === '/api/teams' && request.method === 'POST') {
      const b = await body<{ name?: string }>(request);
      return json(await dir.createTeam(user!.id, b?.name ?? ''));
    }
    const teamM = /^\/api\/teams\/([A-Za-z0-9-]{8,64})$/.exec(path);
    if (teamM) {
      if (request.method === 'PATCH') {
        const b = await body<{ name?: string }>(request);
        if (!(await dir.renameTeam(teamM[1], user!.id, b?.name ?? ''))) return fail('Only coaches can rename the team', 403);
      }
      const t = await dir.team(teamM[1], user!.id);
      return t ? json(t) : fail('Not on this team', 403);
    }
    const memberM = /^\/api\/teams\/([A-Za-z0-9-]{8,64})\/members\/([A-Za-z0-9-]{8,64})$/.exec(path);
    if (memberM && request.method === 'POST') {
      const b = await body<{ role?: Role; remove?: boolean }>(request);
      const role = b?.role === 'coach' || b?.role === 'student' ? b.role : undefined;
      const ok = await dir.updateMember(memberM[1], user!.id, memberM[2], { role, remove: b?.remove === true });
      return ok ? json({ ok: true }) : fail("Only coaches can change members, and a team needs at least one coach", 403);
    }
    if (path === '/api/join' && request.method === 'POST') {
      const b = await body<{ code?: string }>(request);
      const t = b?.code ? await dir.joinTeam(user!.id, b.code) : null;
      return t ? json(t) : fail('That invite link is not valid', 404);
    }

    // ---------- Docs ----------
    if (path === '/api/docs' && request.method === 'GET') {
      const team = url.searchParams.get('team');
      return json({ docs: (await dir.docsFor(user!.id, team && team !== 'personal' ? team : null)).map(publicDoc) });
    }
    if (path === '/api/docs' && request.method === 'POST') {
      const b = await body<{ id?: string; teamId?: string | null; title?: string; kind?: string; round?: boolean; order?: number | null }>(request);
      if (!b?.id || !DOC_ID.test(b.id)) return fail('Bad document id', 400);
      const d = await dir.createDoc(user!.id, { id: b.id, teamId: b.teamId ?? null, title: b.title ?? 'Untitled', kind: b.kind ?? 'prep', round: b.round, order: b.order ?? null });
      return d ? json(publicDoc(d)) : fail('That doc belongs to someone else', 403);
    }
    const docM = /^\/api\/docs\/([A-Za-z0-9-]{8,64})(\/events|\/record)?$/.exec(path);
    if (docM) {
      const [, id, sub] = docM;
      if (!sub && request.method === 'PATCH') {
        const b = await body<{ title?: string; kind?: string; round?: boolean; order?: number | null; partners?: string[]; teamId?: string | null }>(request);
        const d = b ? await dir.updateDoc(user!.id, id, b) : null;
        return d ? json(publicDoc(d)) : fail('No access to this doc', 403);
      }
      if (!sub && request.method === 'GET') {
        const { ok, doc } = await dir.access(id, user!.id);
        return ok && doc ? json(publicDoc(doc)) : fail('No access to this doc', 403);
      }
      if (!sub && request.method === 'DELETE') {
        return (await dir.deleteDoc(user!.id, id)) ? json({ ok: true }) : fail('Only the owner or a coach can delete this doc', 403);
      }
      const { ok } = await dir.access(id, user!.id);
      if (!ok) return fail('No access to this doc', 403);
      const room = env.DOC_ROOM.get(env.DOC_ROOM.idFromName(id));
      if (sub === '/events' && request.method === 'POST') {
        const b = await body<{ events?: { t: number; k: string; n?: number }[] }>(request);
        await room.addEvents({ id: user!.id, name: user!.name }, Array.isArray(b?.events) ? b!.events : []);
        return json({ ok: true });
      }
      if (sub === '/record') return json(await room.record(true));
    }

    // ---------- Live sync ----------
    const syncM = /^\/api\/sync\/([^/]+)$/.exec(path);
    if (syncM) {
      if (!DOC_ID.test(syncM[1])) return fail('Bad document id', 400);
      if (!user) return fail('Sign in first', 401);
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return fail('Cross-site request refused', 403);
      const { ok } = await dir.access(syncM[1], user.id);
      if (!ok) return fail('No access to this doc', 403);
      const headers = new Headers(request.headers);
      headers.set('x-pp-user', JSON.stringify({ id: user.id, name: user.name }));
      return env.DOC_ROOM.get(env.DOC_ROOM.idFromName(syncM[1])).fetch(new Request(request, { headers }));
    }

    if (path.startsWith('/api/')) return fail('Not found', 404);

    // The app is a single page: unknown paths get index.html.
    return serveFile(path === '/' ? '/index.html' : path) ?? serveFile('/index.html')!;
  },
} satisfies ExportedHandler<Env>;
