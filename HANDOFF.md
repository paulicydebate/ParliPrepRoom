# Handoff

**Read this first.** Several AI assistants work on this project. Whoever makes a change updates this file in the same commit: what changed, the current state, and what's next.

Last updated: 2026-11-02 by Claude (Claude Code cloud session). Latest: insert-a-block (outside Round Mode, never into round docs) on `main`, not deployed. Round Mode is live. Before that: sign-in, teams, round-doc access and the public check page (Phase 3), deployed to the live site 2026-11-02 (version 503634be) with the owner's approval. Google secrets are set in Cloudflare; the owner is testing sign-in.

## Where the code is

- Repo: https://github.com/paulicydebate/ParliPrepRoom
- **Latest work: branch `phase-5-round-mode`.** Branches are stacked: `main` (plan only) → `phase-1-editor` → `phase-2-flow` → `phase-3-server` → `phase-5-round-mode`. Each one contains everything before it. Nothing has been merged into `main` yet; the owner hasn't decided that. Ask before merging or pushing to `main`.
- Start new work from `main`.

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

### Sign-in, teams, access, check page (deployed 2026-11-02)

The owner approved the deploy. Each later deploy still needs their OK.

- **Directory** (`worker/directory.ts`): a second SQLite Durable Object, a single instance (`idFromName('directory')`), called over RPC. Tables: users, sessions (SHA-256 of the token), teams (student and coach invite codes), members (role coach/student), docs (team, owner, title, kind, round, order, check_token), doc_partners. Migration `v1` declares both classes (nothing with Durable Objects has been deployed yet, so v1 is still free to change; after the first deploy, add new migrations instead of editing v1).
- **Access rules:** team docs are open to all team members; round docs to the owner, partners and the team's coaches; docs with no team to the owner only. `/api/sync/<id>` requires a session cookie and access, then passes the verified `{id, name}` to the DocRoom in an `x-pp-user` header. The DocRoom no longer trusts names from the URL.
- **Auth** (`worker/index.ts`): Google OpenID Connect (`/api/auth/google` → `/api/auth/google/callback`, scope `openid email profile`). Needs Worker secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; until they exist, `/api/health` reports `auth.google: false` and the app shows "Sign-in coming soon". The session cookie `pp_session` is HttpOnly, SameSite=Lax and lasts 60 days. Changes are refused if the Origin header is another site; WebSocket upgrades check Origin too.
- **Test sign-in:** `npx wrangler dev --var DEV_LOGIN:1` enables `/api/auth/dev?name=…` (localhost only). Never set DEV_LOGIN in production.
- **API:** `/api/me` (GET, PATCH name); `/api/teams` (POST); `/api/teams/<id>` (GET, PATCH name); `/api/teams/<id>/members/<uid>` (POST role or remove; coach only; a team keeps at least one coach); `/api/join` (POST code); `/api/docs?team=<id|personal>`; `/api/docs` (POST register, client-chosen UUID); `/api/docs/<id>` (GET, PATCH title/kind/round/order/partners/teamId, DELETE by owner or coach); `/api/docs/<id>/events` (POST client events: blocked pastes, round on/off, away/back); `/api/docs/<id>/record` (full record with text).
- **DocRoom record:** `updates` rows now carry user_id, name and `via` (`live` = sync update while connected; `catchup` = sync step 2 after reconnecting or first upload, not flagged). An `events` table holds client-reported events. `record(withText)` checks the hash chain and pulls the inserted text out of each Yjs update (`measureUpdate`; new blocks count as line breaks).
- **Check page** (`worker/checkPage.ts`, route `/check/<token>`): self-contained HTML, public, in the viewer's time zone (`request.cf.timezone`). Shows the seal and whether the record is intact, totals, typing per minute, per-person table, "worth a look" (large live edits over 40 characters, blocked pastes, round off, time away, catch-up syncs) and, only for signed-in people with access, the text in bursts. The token is created when a doc becomes a round doc.
- **Client:**
  - `src/store/account.ts`: health, me, teams, current "space" (a team or `personal`), API helpers.
  - `src/store/docs.ts`: DocMeta has `teamId` (undefined = only on this device, null = my own docs on the server), `ownerId`, `partners`, `checkToken`. Creating a doc registers it on the server first. Renames, order, round and partners are pushed. `syncDocList(space)` runs on team switch, every 30 s and on focus. On first sign-in, local docs are uploaded as "My own docs".
  - `src/store/registry.ts`: connects only when signed in and the doc is on the server.
  - UI: `src/ui/Account.tsx` (top bar: sign in, team switcher, Team window with invite links and members, new team, sign out) and `src/ui/RoundTools.tsx` (Partners picker; Check link with QR via `qrcode-generator`). A purple strip under the header of round docs. Sidebar shows the current team's docs, plus a "Move to <team>" item for my own docs.
  - Links: `#invite=<code>` joins a team (after sign-in; the link survives the Google redirect via `next`); `#doc=<id>` (or the old `#join=`) opens a doc if you have access. The name prompt only appears when there's no server (preview).
  - The local typing log uploads non-typing events to the server's record.
- **Tests:** `node scripts/sync-smoke.mjs http://localhost:8787` (needs `--var DEV_LOGIN:1`): two signed-in users co-edit, an anonymous connection gets 401, and the record is intact. Also a four-person Playwright run (coach, Ana, Ben, Cleo, anonymous) covering invites, round-doc visibility, partner picking, live edits, the blocked paste on the check page, and text visible only to members. 40 unit tests.

### Round Mode (Phase 5; deployed 2026-11-02)

- The owner ruled out dropping prepped blocks onto the flow during the round: it's effectively pasting. Round Mode only helps people **find and read** what they typed; it never copies text.
- `src/store/roundMode.ts`: per-device switch in the top bar. While on: the top bar turns purple with a "ROUND MODE" label; the sidebar and search list only round docs; panes showing a non-round doc show a blocked message (and don't load it). Switching on or off logs `roundmode-on` / `roundmode-off` to every round doc in the current space; these upload to the server record and show on the check page.
- Block finder (`BlockFinder` in `src/ui/RoundModeUI.tsx`): Ctrl/Cmd+K anywhere. Searches all docs in the current space (round docs only in Round Mode) using `src/model/outline.ts` (every word must appear in the block or the headings above it; body text jumps to the claim above). Enter jumps; Ctrl/Cmd+Enter pins.
- Pin board (`PinBoard`): right-hand panel (top-bar pin icon) of pinned blocks in speaking order, per device and per space (`src/store/pins.ts`, localStorage, stores doc id + block id only). Each pin shows the block and its warrants read-only, kept current; up and down to reorder; tap to jump. Toolbar "Pin" pins the claim/heading the caret is in.
- Jumping: `PaneState.focus = { blockId, n }`; the pane selects the block, scrolls to it and flashes it.
- `src/ui/useLibrary.ts` keeps the searchable docs open (up to 40) and indexed while the finder or pin board is open.
- Tests: `tests/outline.test.ts`; Playwright run with test sign-in: pin from toolbar, Round Mode lockout, search "rubber" → jump, two pins shown, check page lists Round Mode on/off.

### Insert a prepped block (2026-11-02; on `main`, not deployed yet)

- The owner's rule: inserting a copy of a prepped block is fine for coaches building docs in prep, but it must be impossible in Round Mode. I also block it into round docs, since that would be pasting into prep (the owner's no-paste rule for round docs).
- **Insert** buttons on pins and search results (hidden entirely in Round Mode). The copy goes below the caret in the focused pane's doc, without ids, rows, gaps or sheet sides. In a flow it takes the speech of the column the caret is in.
- `useLibrary` now also returns `blockContent(docId, blockId)` (full JSON with formatting). The pane reports its editor to the App via `onEditorChange`.
- If someone inserts into a team doc and later turns it into a round doc, the server record still shows that text as a large live edit on the check page.

## Next steps

1. Owner tests Google sign-in, team creation and invites on the live site (OAuth client and secrets are done).
2. Emailed-link sign-in fallback, if school Google accounts are blocked (would need an email-sending service).
3. Color palette / visual design pass (owner called the palette "weird"); iPad touch drag in the sidebar.
4. Version history from the server (who changed what), now that edits carry verified names.

### Google sign-in setup (owner steps)

1. https://console.cloud.google.com → create a project ("ParliPrepRoom").
2. Google Auth Platform (or APIs & Services → OAuth consent screen): app name, support email, audience **External**. While in Testing, add each tester's email under Test users (up to 100).
3. Clients → Create client → **Web application**. Authorized JavaScript origin: `https://parlipreproom.paulicydebate.workers.dev`. Authorized redirect URI: `https://parlipreproom.paulicydebate.workers.dev/api/auth/google/callback`.
4. Copy the Client ID and Client secret into the Cloudflare dashboard: Workers & Pages → parlipreproom → Settings → Variables and Secrets → add two **Secrets**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Secrets survive later deploys.

Questions still open with the owner: sign-in type (school vs personal Google accounts), custom domain, whether Doc and Flow should be separate document types. Defaults in use: Google sign-in; round docs visible to owner, partners and coaches.

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
