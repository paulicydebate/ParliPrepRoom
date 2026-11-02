// ParliPrepRoom server (Cloudflare Worker).
// Serves the built app from dist/ and answers /api/* requests.
// Live co-editing, accounts and the server-stamped typing log are added here
// in Phase 3.

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, app: 'parlipreproom', time: new Date().toISOString() });
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
