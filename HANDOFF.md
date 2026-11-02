# Handoff

**Read this first.** Several AI assistants work on this project. Whoever makes a change updates this file in the same commit: what changed, the current state, and what's next.

Last updated: 2026-11-02 by Claude (Claude Code cloud session). Latest: live co-editing (Phase 3, step 2).

## Where the code is

- Repo: https://github.com/paulicydebate/ParliPrepRoom
- **Latest work: branch `phase-3-server`.** Branches are stacked: `main` (plan only) → `phase-1-editor` → `phase-2-flow` → `phase-3-server`. Each one contains everything before it. Nothing has been merged into `main` yet; the owner hasn't decided that. Ask before merging or pushing to `main`.
- Start new work from `phase-3-server` unless the owner says otherwise.

## What the app is

A web app for NPDA/NPTE parliamentary debate prep. Full plan and decisions: [PLAN.md](PLAN.md). What works and how to use it: [README.md](README.md). Rules for assistants: [AGENTS.md](AGENTS.md).

The main idea: one document model (styled outline blocks: position title, section title, claim, warrant, analytic, note) shown two ways, as a **doc** and as a **flow** (spreadsheet-like grid of speech columns). Both views edit the same Yjs document.

## Current state

Done and tested (40 unit tests, plus manual browser checks with Playwright):

- **Phase 1, editor:** named styles, style keys (Ctrl+1–6 Mac, Alt+1–6 Windows, presets incl. F4–F9), fonts/themes per browser, folding, outline, split view (up to 3 panes), revision history (auto + named versions, compare, restore).
- **Phase 2, flow:** Doc/Flow switch per pane; position titles = sheets (gov/opp); claims = rows; answers tagged with a speech go in later columns; 150 pre-made rows you can click anywhere (stored as a `gap` count on the line, so the doc stays clean); column-only selection and copy; Word and Excel export.
- **Round docs (early Phase 4):** toggle per doc. Paste and drop blocked, purple border, typing log with the exact text typed and deleted, who typed it (a name asked once per device) and a SHA-256 hash chain with a seal code. Sidebar drag to reorder, double-click rename.
- Everything is stored **in the browser only** (IndexedDB). No accounts or server data yet.

**Phase 3 (in progress):** accounts, teams, server storage, live co-editing, server-stamped typing log with a public check link.

- **Live at https://parlipreproom.paulicydebate.workers.dev** (deployed 2026-11-02 from `phase-3-server`, with the owner's approval). Health check: `/api/health`. So far it's the same app as the preview (data still in the browser), served from Cloudflare.
- `worker/index.ts` + `wrangler.jsonc`: the Worker. The built app is **embedded into the worker** by `scripts/embed-assets.mjs` (generates `worker/static.gen.ts`, gitignored) instead of using Workers static assets. Reason: in the Claude cloud sandbox the credential proxy replaces the one-time token Cloudflare uses for asset uploads, so asset uploads fail with 401. A single script upload works. Size: ~360 KB gzipped (free plan limit is 3 MB).
- **Deploying:** the Cloudflare API token is a network secret in the Claude Code cloud environment (the proxy adds it to requests to `api.cloudflare.com`). Account ID `cc1fffd57d89d16d2e28ed38e9a58cc1`. Command: `CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=cc1fffd57d89d16d2e28ed38e9a58cc1 npx wrangler deploy`. The owner approves deploys; ask before deploying. Other environments need their own token (`CLOUDFLARE_API_TOKEN`) with Workers Scripts edit, D1 edit, Account Settings read, User Details read.
- The sandbox can't open `*.workers.dev` (network policy), so live checks need the owner, or adding `*.workers.dev` to the environment's allowed domains.

### Live co-editing (done, 2026-11-02)

- **Server:** `worker/docRoom.ts`, a Durable Object `DocRoom`, one per document (`idFromName(docId)`), SQLite-backed (migration `v1`). It speaks the y-websocket protocol (sync and awareness messages) and uses WebSocket hibernation. Every update is stored in the `updates` table with the server time, sender name and device id (from the URL query, not verified yet) and a SHA-256 chain (`prev`, `hash`). The doc is rebuilt from those rows when the room wakes up.
- **Routes:** `GET /api/sync/<docId>` (WebSocket) and `GET /api/sync/<docId>/history` (JSON list of updates: seq, time, user, device, bytes, hash; no contents). `/api/health` returns `sync: true`.
- **Client:** `src/store/sync.ts`. Turns on only if `/api/health` says `sync: true`, so the claude.ai preview and `npm run dev` stay local-only. `src/store/registry.ts` attaches a `WebsocketProvider` per open doc next to IndexedDB (offline cache). `useYDoc` returns `{ doc, provider }`; editors add `CollaborationCaret` (live cursors with names) when there's a provider.
- **Sharing:** pane header share icon copies `<origin>/#join=<docId>`. `App.tsx` handles `#join=`: adds the doc to the sidebar ("Shared doc" until the real title syncs) and opens it, and skips the first-visit samples. The doc title is mirrored in the doc's Yjs map `settings.title` (written only after the server sync, so a joining device can't overwrite it). The round-doc flag already lives in `settings.round`.
- **Pane header:** dot showing saved to server (green), connecting (yellow) or offline (red).
- **Test:** `npx wrangler dev`, then `node scripts/sync-smoke.mjs http://localhost:8787` (two clients, a late joiner, checks the server record). Also checked in a two-browser Playwright run: share link, live text both ways, partner cursor label, per-user server record.
- **Security limits right now:** no sign-in. Anyone with a doc's id or link can edit it and read `/history`. Ids are random UUIDs. Names in the record are whatever each device entered. Accounts (next) fix this.

## Next steps (Phase 3)

1. Accounts: Google sign-in (free; the owner still has to create a Google Cloud OAuth client, steps not sent yet). Maybe an emailed-link fallback, since schools may block student Google accounts. Then the server uses the signed-in name for the record instead of the URL name, and requires sign-in for `/api/sync`.
2. Teams: a coach creates a team and shares an invite link. Team docs are shared; round docs are visible to partners and coaches (default, not yet confirmed).
3. Round-doc check page: public read-only page per round doc built from the server record (who typed what, when, flags, hash chain), with a QR code.
4. Upload a device's local docs to the server at sign-in (docs already sync whenever they're opened on the live site).

Questions still open with the owner: sign-in type (school vs personal Google accounts), round-doc visibility, custom domain, whether to open sign-up to other teams now, whether Doc and Flow should be separate document types.

## How to work on it

```sh
npm install
npm run dev          # app at http://localhost:5173
npm test             # Vitest (jsdom + fake IndexedDB)
npm run build        # typecheck + build to dist/
npx wrangler dev     # app + worker at http://localhost:8787
npm run preview:artifact   # builds dist/preview.html for the claude.ai preview link
```

Before committing, `npm test` and `npm run build` must pass.

Preview link the owner tests on (published from Claude sessions): https://claude.ai/artifact/XMuzs4ucc6NxyLLAjhQLoa. Downloads (export) don't work there; they will on the real site.

## Things to know

- Don't copy code from CardMirror / CardMirror-Green (noncommercial license). Re-implementing ideas is fine.
- Don't commit real student prep or credentials.
- The owner reads on a phone and isn't a programmer: plain-language updates, outcome first.
- Known small issues: pane header gets crowded with 3 panes; color palette needs a design pass (owner called it "weird"); sidebar drag doesn't work on iPad touch yet; `npm audit` reports a high-severity `undici` issue inside `wrangler` (local dev tool only, not shipped to users).
