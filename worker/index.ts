// ParliPrepRoom server (Cloudflare Worker).
// Serves the built app (embedded at build time, see scripts/embed-assets.mjs)
// and answers /api/* requests. Live co-editing, accounts and the
// server-stamped typing log are added here in Phase 3.

import { FILES } from './static.gen';

export { DocRoom } from './docRoom';

interface Env {
  DOC_ROOM: DurableObjectNamespace;
}

const DOC_ID = /^[A-Za-z0-9-]{8,64}$/;

function serveFile(path: string): Response | null {
  const f = FILES[path];
  if (!f) return null;
  // Hashed build files never change; everything else is re-checked.
  const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  return new Response(f.body, { headers: { 'content-type': f.type, 'cache-control': cache } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, app: 'parlipreproom', sync: true, time: new Date().toISOString() });
    }
    // /api/sync/<docId>          live editing (WebSocket)
    // /api/sync/<docId>/history  the server's edit record for that doc
    const m = /^\/api\/sync\/([^/]+)(\/history)?$/.exec(url.pathname);
    if (m) {
      if (!DOC_ID.test(m[1])) return Response.json({ error: 'Bad document id' }, { status: 400 });
      return env.DOC_ROOM.get(env.DOC_ROOM.idFromName(m[1])).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    // The app is a single page: unknown paths get index.html.
    return serveFile(url.pathname === '/' ? '/index.html' : url.pathname) ?? serveFile('/index.html')!;
  },
} satisfies ExportedHandler<Env>;
