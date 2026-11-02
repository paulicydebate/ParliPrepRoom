# Handoff

**Read this first.** Several AI assistants work on this project. Whoever makes a change updates this file in the same commit: what changed, the current state, and what's next.

Last updated: 2026-11-02 by Claude (Claude Code cloud session). Latest: named version history and replay, flow marks, timer, New round and tab room, plus reset invite links, delete my account and download-all, on `main`, not deployed. Coach view deployed 2026-11-02 (version 5fb5c578). In progress next (owner-approved list): import into reference docs. Design and tablet pass deployed 2026-11-02 (version 6795cdc1). Colorways deployed 2026-11-02 (version f0b30f8c). Before that: alternating column shades, pins column inside the flow and delete-a-flow-sheet, all deployed 2026-11-02 (version 1ccc7a0f). Before that, pins matched to flow sheets, the sidebar-rename fix and insert-a-block were deployed 2026-11-02 (version 42837dfa). Round Mode is live. Before that: sign-in, teams, round-doc access and the public check page (Phase 3), deployed to the live site 2026-11-02 (version 503634be) with the owner's approval. Google secrets are set in Cloudflare; the owner is testing sign-in.

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

### Insert a prepped block (2026-11-02; deployed)

- The owner's rule: inserting a copy of a prepped block is fine for coaches building docs in prep, but it must be impossible in Round Mode. I also block it into round docs, since that would be pasting into prep (the owner's no-paste rule for round docs).
- **Insert** buttons on pins and search results (hidden entirely in Round Mode). The copy goes below the caret in the focused pane's doc, without ids, rows, gaps or sheet sides. In a flow it takes the speech of the column the caret is in.
- `useLibrary` now also returns `blockContent(docId, blockId)` (full JSON with formatting). The pane reports its editor to the App via `onEditorChange`.
- If someone inserts into a team doc and later turns it into a round doc, the server record still shows that text as a large live edit on the check page.

### Fix: sidebar rename reverted (2026-11-02; deployed)

- Cause: the doc title is stored twice, in the doc list and inside the Yjs doc (`settings.title`, so partners get it). An open pane re-read the old in-doc title after a sidebar rename and copied it back.
- Fix (`TitleInput` in `src/ui/Pane.tsx`): when a doc first opens, the in-doc title wins (a partner may have renamed it). After that, any local rename (sidebar or title box) is written into the doc. Remote changes still arrive through the map observer (local transactions are ignored there).
- Checked: sidebar rename persists signed in and offline, including after reload; a partner still sees the owner's rename.

### Pins matched to flow sheets (2026-11-02; deployed)

- The owner asked: if the neg reads T, show only my T answers. Pins now have an optional group name (`src/store/pins.ts`; a board per space in localStorage `pp-pins-<space>` with pins, groups, the selected tab and followFlow; older plain-list data still loads).
- The owner's workflow: the MG keeps an MG prep doc with section titles per block ("A2 – T", "A2 – Tix"). Pins work at the caret's level: a section pins everything up to the next section, a claim pins it with its warrants up to the next claim, an analytic pins just itself (a warrant or note pins the claim above). The toolbar button says "Pin section / claim / analytic".
- In round, each pin has a dropdown of the **sheet names from every open flow** (`useFlowSheets` in `RoundModeUI.tsx` reads the flow plugin state of all pane editors, live). Choosing a sheet sets the pin's `group`. Tabs are "All" plus sheets that have pins. There are no free-form groups in the UI any more (the store still supports them). New pins go into the selected tab's sheet.
- Following: the App passes the focused pane's editor to `PinBoard`; when it's a flow and the active sheet's title matches a group name (case-insensitive), the tab switches. Doc-view panes don't change the tab.
- Checked in Playwright: section pin includes both claims and warrants; analytic pin is just the line; the dropdown lists the flow's sheets (T, DA1); opening sheet T shows only the T pin, DA1 only the DA pin.

### Delete a flow sheet (2026-11-02; deployed)

- "Delete sheet" button in the flow's sheet bar (next to Gov/Opp). An empty sheet deletes right away; a sheet with text asks again ("Delete "T" and everything on it?"; the confirm resets after 4 s). Undo restores it.
- `deleteSheet(key)` in `src/editor/flowView.ts` deletes from the sheet's position title to its end; if the doc would be empty, it leaves one empty position title.
- Tests in `tests/flowEditor.test.ts`; checked in the browser (empty delete, confirm, undo).

### Pins column inside the flow (2026-11-02; deployed)

- The owner found the side pin panel too far from the columns. Each flow column header now has a pin button. Clicking it on, say, LOC opens a **Pins** column right after LOC and shifts later columns one to the right; clicking again closes it.
- It shows the pins whose sheet matches the sheet in view (in Round Mode, only pins from round docs). Read-only; tapping a pin opens the block in another pane (or a new one) without replacing the flow (`pp-jump` window event → `jumpTo(..., keepFocused)`).
- How: flow plugin state has `pinCol`; command `togglePinColumn(col)`; decorations place blocks and cells at `dc(col)` (+1 after the pins column) and add one widget, the `pinPanel` element passed via `FlowView.configure({ pinPanel })`, spanning all rows. React renders `PinColumn` into it with a portal. The widget uses `stopEvent: () => true`, and ProseMirror ignores mutations inside widgets.
- Checked in Playwright: headers LOC | Pins | MG…, the pin shows the whole A2 – T section, the MG answer lands in the shifted MG column, and tapping a pin opens the MG doc in the other pane.

### Alternating column shades in the flow (2026-11-02)

- Owner request for visual clarity: each flow column sits on a full-height stripe, alternating two shades of the page background (`--band-a` / `--band-b` in `src/styles.css`, mixed from `--text` and `--surface`, so they work in light, dark and sepia).
- One `fl-band` widget per speech column (`side: -2`, `pointer-events: none`, z-index 0) in the flow decorations; cells are z1, text z2, the pins column z3. Stripes follow the pins-column shift (`dc(col)`).

### Colorways (2026-11-02; deployed)

- Owner wants fun, easy color choices (sports-team style pairs). `src/settings/colorways.ts`: 16 Gov/Opp pairs (Blue & Red default, Teal & Orange, Blue & Orange, Green & Pink, Purple & Gold, Purple & Yellow, Navy & Gold, Green & Gold, Maroon & Gold, Red & Gold, Crimson & Silver, Teal & Black, Sky & Navy, Orange & Navy, Purple & Teal, Lime & Magenta) plus "Pick your own" (two color inputs). Each color has a deeper shade for light backgrounds and a brighter one for dark mode.
- `applySettings` sets `--gov-l/-d`, `--opp-l/-d`; `styles.css` maps `--gov`/`--opp` to the light values on `:root` and the dark values in the dark-theme blocks. Everything using `--gov`/`--opp` (flow headers, cells, speech tags, sheet dots) follows.
- Settings are per browser (like fonts). Picker: **Colors** button in the flow's sheet bar (opens a window) and in Appearance.
- Not yet: the Excel export and the check page still use fixed colors. Round-doc purple stays separate (purple colorways sit next to it, but the round doc border and label make it clear).

### Privacy policy (2026-11-02; deployed, version 4a3c6504)

- Google requires a privacy policy URL to publish the OAuth app (so anyone can sign in without being a listed test user). `worker/legal.ts` serves `/privacy`: what's stored (Google name, email and picture; docs; the edit record and round-doc events; team membership; sign-in cookie), what stays in the browser, who can see what, Cloudflare and Google as processors, deletion by email, not for under-13s. Contact: parlipreproombot@mail.grokbot.com (chosen by the owner). Linked at the bottom of the sidebar.
- **Keep it accurate:** if you change what the app stores or who can see it, update this page and its date.
- Done: the owner set the privacy URL and **published the Google app** (2026-11-02). Anyone with a Google account can sign in; team access still needs an invite link.

### Design and tablet pass (2026-11-02; deployed)

- **Window headers adapt to their own width** (CSS container queries on `.pane`, container `pane`):
  - ≤760px: outline, share, export and history fold into a **⋯** menu (`.pane-more`, which also has "Show a different doc"); the Prep/Reference badge and the same-doc chip are hidden.
  - ≤560px: the Round doc switch says "Round", headings and margins shrink, and the outline is hidden.
  - ≤470px: the Round switch shows only a lock icon.
  - ≤380px: the doc switcher moves into the ⋯ menu.
  - `exportDoc` and `copyShareLink` in `Pane.tsx` are shared by the icons and the menu.
- **Tablets and small laptops** (≤1180px, `is-compact`): the sidebar and pin board slide over the windows (opened with the menu button) instead of taking width. At most 2 windows (`maxPanes`). Phones (≤760px, `is-narrow`) still show one window at a time.
- **Touch:** bigger targets under `(pointer: coarse)`. Sidebar reorder has a grip handle using pointer events tracked on `window` (works with a finger; HTML5 drag-and-drop is turned off on touch because iOS doesn't support it).
- Checked with Playwright at 1440×860, 1280×800, 1024×768 (touch) and 820×1180 (touch): no header overflow, close button always visible, no sideways page scroll; finger-drag reorder works.

### Coach view and deleted text in the record (2026-11-02; deployed)

- **Deleted text:** `worker/measure.ts` (moved out of `docRoom.ts` so it can be tested): `measureUpdate(update, chars)` keeps a map of every inserted character by Yjs item id across the record, so each later delete reports exactly which text it removed (`deletedText`), including a partner deleting someone else's text. `record(withText)` returns `deletedText`. The check page shows bursts with typed and deleted text, the deleted parts crossed out. Tests: `tests/measure.test.ts`.
- **Coach view:** top-bar **Coach view** button (coaches of the current team only) → `src/ui/CoachView.tsx`: every round doc on the team, flagged first (`flags` = large live edits + blocked pastes + round doc turned off + broken record), with owner and partners, last edit, characters typed live and flag chips, plus **Open doc** and **Check page** buttons. Server: `GET /api/teams/<id>/rounds` (coach only; `Directory.roundDocsForCoach`, then `summarizeRecord` in `worker/summary.ts` over each DocRoom record without text). Offline catch-up under 20 characters isn't flagged (it's usually just the doc's empty first line being saved).
- **Typing log tab:** on server round docs it now leads with "This tab only shows typing done on this device" and a link to the full server record (check page), so it no longer looks empty on a coach's device.
- What the server record can't do: per-keystroke timing for text typed offline (it arrives in one catch-up batch and is labeled so), or anything outside the app.
- Checked in Playwright with test sign-in: coach creates a team, a student makes a round doc, types, backspaces "limit use" and retypes, tries a paste; the coach view shows "1 blocked paste"; the check page shows the deleted "limit use" crossed out.

### Reset invite links, delete my account, download all (2026-11-02; on `main`, not deployed yet)

- **New invite link:** Team window → "New link" (asks once more) next to each invite. `POST /api/teams/<id>/invites {which}` (coach only, `Directory.resetInvite`); the old code stops working at once.
- **Delete my account:** account menu → "Delete my account…" (type DELETE). `DELETE /api/me` → `Directory.deleteAccount`: removes sessions, memberships, partner spots, the user, their docs outside any team, and teams where they were the only member (with those teams' docs); `DocRoom.wipe()` erases those docs' contents and records. Refused while they're the only coach of a team with other members. Docs they made in a shared team stay with that team. The privacy page describes this.
- **Download all docs:** Team window → "Download all docs (.zip)" → `src/export/teamZip.ts`: every doc the user can see in that team, as Word files in Prep/, Reference/ and Round docs/ folders, plus a README. New endpoint `GET /api/docs/<id>/state[?seq=N]` (doc as one Yjs update, now or as of update N).
- Also added for upcoming named history and replay: `GET /api/docs/<id>/log` (every update with seq, time, user, via and base64 data; doc access required).
- Checked: curl tests against `wrangler dev` (an old invite gives 404 after reset; a student can't reset; the only coach is refused deletion; a student's deletion removes them and their personal doc) and a browser download of the zip (Word file contains the typed text).

### Timer, New round and Tab room (2026-11-03; on `main`, not deployed yet)

- **Timer** (`src/store/timer.ts`, `src/ui/Timer.tsx`, top bar): presets Prep 20, PMC 7, LOC 8, MG 8, MO 8, LOR 4, PMR 5, Flex 2 and Flex 1 (the owner's flex periods), plus custom minutes; start/pause/reset; amber under 1 minute, flashes red at 0. When a round doc is on screen (the focused one, else any open one) the timer lives in that doc's Yjs map `timer` (`{label, durationMs, endsAt, remainingMs}`), so partners share it. Otherwise it's per device (localStorage). Times use the server clock (`serverNow()`, offset taken from `/api/health` time) so partners' timers agree.
- **New round** (`NewRoundDialog` in `src/ui/Rounds.tsx`, top bar "New round", signed in): round label, side, resolution, partner (team students), optional tournament code (checked live, remembered per device), "start 20-minute prep timer". Creates a server round doc with partners, tournament and round label (`createRoundDoc` → `POST /api/docs` with `partners`, `tournamentCode`, `roundLabel`), writes starting content (resolution note, "Gov case"/"Opp case" position title with side, an empty claim), turns on the round-doc switch, starts the timer, and opens the doc on the left with the same doc as a flow on the right. The round strip shows "Round 2 · Fall Classic".
- **Tab room:**
  - The `Directory` has a `tournaments` table (name, 6-character code without 0/O/1/I, `director_secret`, created_by), and `docs` gained `tournament_id` and `round_label` (added with `ALTER TABLE`, guarded by `PRAGMA table_info`).
  - Account menu → "Tournaments (tab room)…" (`TournamentsDialog`): create a tournament, copy the code for teams and the director link.
  - API: `POST/GET /api/tournaments`, `GET /api/tournaments/lookup?code=`.
  - **Director link `/td/<secret>`** (no sign-in; the link is the key): `worker/tabroomPage.ts` lists every round doc tagged with the tournament from every team, flagged first, with team, round, names, last edit and flag chips. `/td/<secret>/doc/<docId>` shows that doc's full check page **including the text** (owner-approved, so the director can rule on disputes; the privacy page says so).
- Starting content (catch-up within 15 s of a doc's first save) is labeled "Doc created with N characters of starting text" and not counted as offline typing (`isStarting` in `worker/summary.ts`).
- Checked end to end in Playwright with test sign-in: a director creates "Fall Classic"; a coach's team; Ana starts Round 2 with Ben and the code; doc and flow open; both see Prep 19:5x; the director page lists the round with names; the full record shows Ana's text.

### Flow marks (2026-11-03; on `main`, not deployed yet)

- Block attribute `mark` (`src/model/marks.ts`): `extend`, `dropped`, `answered`, `key`; not carried over when a line is split. Command `toggleFlowMark(mark)` on the selected blocks (the same mark again clears it). Keys: Ctrl/Cmd+Shift+E (extend), D (dropped), A (answered), K (key). Toolbar buttons →, !, ✓, ★ in both views.
- Look: position titles, sections and claims get a badge in front ("→ EXT", "! DROPPED", "✓", "★ KEY"); answered lines are crossed out and faded; body lines and flow cells get a colored left edge. Badges use `::before` so they don't clash with the speech tags (`::after`). Word export prefixes "[DROPPED]" etc.; the Excel flow prefixes →, [DROPPED], ✓, ★.
- Search (Ctrl/Cmd+K) now ignores Shift, so Ctrl+Shift+K marks "key" instead of opening search.
- Tests in `tests/editor.test.ts`. Note for Playwright: pressing a shortcut right after a click can hit the previous line, because the caret position syncs a moment later; wait ~300 ms after clicking.

### Named version history and replay (2026-11-03; on `main`, not deployed yet)

- History is built from the **server's record**, so it shows everyone's edits with names (the owner said this is mandatory). In a pane on a server doc, History has tabs **History**, **Replay**, **Saved here** (the old per-device versions) and **Typing log** (this device).
- `src/history/timeline.ts`: `decodeLog` (from `GET /api/docs/<id>/log`; uses `worker/measure.ts` for inserted and deleted text), `sessionsOf` (runs of one person's edits with no pause over 2 minutes; offline catch-up kept separate), `DocReplayer` (rebuilds the doc as of any update, with a saved copy every 40 updates).
- `src/ui/ServerHistory.tsx`:
  - **History:** list of sessions (person color dot, +inserted/−deleted, time). Views: "What changed" (that session's diff, highlighted in that person's color), "Doc then", "Since then". **Restore to this point** (logs a `restore` event on round docs; the restore is itself in the record).
  - **Replay:** play/pause, slider over every edit, speed, the current edit's author, time and text.
- Tests: `tests/timeline.test.ts`. Checked in Playwright: two people edit one doc; Ana's History lists Ben's and Ana's sessions; Ben's diff shows his backspaced word crossed out; Replay steps edit by edit with names.

## Next steps

1. Owner tests Google sign-in, team creation and invites on the live site (OAuth client and secrets are done).
2. Emailed-link sign-in fallback, if school Google accounts are blocked (would need an email-sending service).
3. Further visual polish as the owner's testers report it (the design and tablet pass and colorways are done).
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
- Known small issues: pane header gets crowded with 3 panes; color palette needs a design pass (owner called it "weird");  `npm audit` reports a high-severity `undici` issue inside `wrangler` (local dev tool only, not shipped to users).
