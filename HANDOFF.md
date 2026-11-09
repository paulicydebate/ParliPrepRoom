# Handoff

**Read this first.** Several AI assistants work on this project. Whoever makes a change updates this file in the same commit: what changed, the current state, and what's next.

Last updated: 2026-11-03 by Claude (Claude Code cloud session). Latest: **flow threads + guard rails (deployed 2026-11-08, version 7fb676a6)**. Before that: **efficiency step 2 + row-counter fix (deployed 2026-11-05, version 1e2fba40)**. Before that: **in a flow, Enter drops down to the next cell (deployed 2026-11-05, version b45db875)**. Before that: **a document is a doc or a flow, fixed when made (no Doc/Flow switch; deployed 2026-11-05, version 7237da80)**. Before that: **Enter no longer auto-formats; Shift+Enter cycles the style (deployed 2026-11-04, version 442dd582)**. Before that (leak fix deployed 2026-11-04, version f049a68d; efficiency step 1 deployed 2026-11-04, version 2963aa16): **EFFICIENCY.md step 1 built (typing traffic -54%, idle -88%, idle HTTP -75%)**, **EFFICIENCY.md (plan to cut server traffic, with measurements)**, **fix for the shared-computer data leak (sign-out and switching accounts remove the last person's work from the device)**, on `main`, not deployed. Before that (deployed 2026-11-04, version 82723daf, with the owner's approval; includes partner invitations): **quick fixes from the bug analysis (removed members lose access, refused connections stop retrying, one failed save no longer stops the record and is shown as a flag, cursor updates no longer reload history)**, **bug analysis in BUGS.md (read it before the pilot: Workers Free plan limits, shared-computer data leak, and more)**, **partner invitations (a partner must accept before they can open or edit a doc)** and automated server-rule tests, on `main`, not deployed. Before that (deployed 2026-11-04, version f5c3af0a, with the owner's approval; includes the tour, /guide and the Round Mode new-doc fix): **fix for a message storm that used up Cloudflare's daily log allowance** (see its section), a one-minute in-app tour, a /guide page, and new docs made during Round Mode become round docs (all deployed). Before that (deployed 2026-11-03, version 6713b8fb, with the owner's approval): flow fix for long section titles and sheet names, plus team prep docs now private to owner, partners and coaches (new `access` setting), one-step "Reset: start fresh" in the sidebar (all deployed). Before that: screen space for small laptops (resizable side panels, Tight spacing, hide the formatting bar, fill-the-screen, shortcuts) and a connection check on the sync dot, deployed 2026-11-03 (version d968cdb0) with the owner's approval. Before that: PLAN.md brought up to date. Before that: deletions are kept and logged for coaches, deployed 2026-11-03 (version 96a6975b) with the owner's approval, along with the timer fixes the stray .js files had left out. Before that: adjustable timer lengths, deployed 2026-11-03 (version 9010a62b) with the owner's approval. Before that: import into reference docs, named version history and replay, flow marks, timer, New round and tab room, plus reset invite links, delete my account and download-all, deployed 2026-11-03 (version a39bedb3) with the owner's approval. Coach view deployed 2026-11-02 (version 5fb5c578). Design and tablet pass deployed 2026-11-02 (version 6795cdc1). Colorways deployed 2026-11-02 (version f0b30f8c). Before that: alternating column shades, pins column inside the flow and delete-a-flow-sheet, all deployed 2026-11-02 (version 1ccc7a0f). Before that, pins matched to flow sheets, the sidebar-rename fix and insert-a-block were deployed 2026-11-02 (version 42837dfa). Round Mode is live. Before that: sign-in, teams, round-doc access and the public check page (Phase 3), deployed to the live site 2026-11-02 (version 503634be) with the owner's approval. Google secrets are set in Cloudflare; the owner is testing sign-in.

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

**Phase 3 (done, live):** accounts, teams, server storage, live co-editing, server record with a public check link. Phases 4 and 5 are live too; PLAN.md has the status of every feature.

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

### Reset invite links, delete my account, download all (2026-11-02; deployed, version a39bedb3)

- **New invite link:** Team window → "New link" (asks once more) next to each invite. `POST /api/teams/<id>/invites {which}` (coach only, `Directory.resetInvite`); the old code stops working at once.
- **Delete my account:** account menu → "Delete my account…" (type DELETE). `DELETE /api/me` → `Directory.deleteAccount`: removes sessions, memberships, partner spots, the user, their docs outside any team, and teams where they were the only member (with those teams' docs); `DocRoom.wipe()` erases those docs' contents and records. Refused while they're the only coach of a team with other members. Docs they made in a shared team stay with that team. The privacy page describes this.
- **Download all docs:** Team window → "Download all docs (.zip)" → `src/export/teamZip.ts`: every doc the user can see in that team, as Word files in Prep/, Reference/ and Round docs/ folders, plus a README. New endpoint `GET /api/docs/<id>/state[?seq=N]` (doc as one Yjs update, now or as of update N).
- Also added for upcoming named history and replay: `GET /api/docs/<id>/log` (every update with seq, time, user, via and base64 data; doc access required).
- Checked: curl tests against `wrangler dev` (an old invite gives 404 after reset; a student can't reset; the only coach is refused deletion; a student's deletion removes them and their personal doc) and a browser download of the zip (Word file contains the typed text).

### Timer, New round and Tab room (2026-11-03; deployed, version a39bedb3)

- **Timer** (`src/store/timer.ts`, `src/ui/Timer.tsx`, top bar): presets Prep 20, PMC 7, LOC 8, MG 8, MO 8, LOR 4, PMR 5, Flex 2 and Flex 1 (the owner's flex periods), plus custom minutes; start/pause/reset; amber under 1 minute, flashes red at 0. When a round doc is on screen (the focused one, else any open one) the timer lives in that doc's Yjs map `timer` (`{label, durationMs, endsAt, remainingMs}`), so partners share it. Otherwise it's per device (localStorage). Times use the server clock (`serverNow()`, offset taken from `/api/health` time) so partners' timers agree.
- **New round** (`NewRoundDialog` in `src/ui/Rounds.tsx`, top bar "New round", signed in): round label, side, resolution, partner (team students), optional tournament code (checked live, remembered per device), "start 20-minute prep timer". Creates a server round doc with partners, tournament and round label (`createRoundDoc` → `POST /api/docs` with `partners`, `tournamentCode`, `roundLabel`), writes starting content (resolution note, "Gov case"/"Opp case" position title with side, an empty claim), turns on the round-doc switch, starts the timer, and opens the doc on the left with the same doc as a flow on the right. The round strip shows "Round 2 · Fall Classic".
- **Tab room:**
  - The `Directory` has a `tournaments` table (name, 6-character code without 0/O/1/I, `director_secret`, created_by), and `docs` gained `tournament_id` and `round_label` (added with `ALTER TABLE`, guarded by `PRAGMA table_info`).
  - Account menu → "Tournaments (tab room)…" (`TournamentsDialog`): create a tournament, copy the code for teams and the director link.
  - API: `POST/GET /api/tournaments`, `GET /api/tournaments/lookup?code=`.
  - **Director link `/td/<secret>`** (no sign-in; the link is the key): `worker/tabroomPage.ts` lists every round doc tagged with the tournament from every team, flagged first, with team, round, names, last edit and flag chips. `/td/<secret>/doc/<docId>` shows that doc's full check page **including the text** (owner-approved, so the director can rule on disputes; the privacy page says so).
- Starting content (catch-up within 15 s of a doc's first save) is labeled "Doc created with N characters of starting text" and not counted as offline typing (`isStarting` in `worker/summary.ts`).
- Checked end to end in Playwright with test sign-in: a director creates "Fall Classic"; a coach's team; Ana starts Round 2 with Ben and the code; doc and flow open; both see Prep 19:5x; the director page lists the round with names; the full record shows Ana's text.

### Flow marks (2026-11-03; deployed, version a39bedb3)

- Block attribute `mark` (`src/model/marks.ts`): `extend`, `dropped`, `answered`, `key`; not carried over when a line is split. Command `toggleFlowMark(mark)` on the selected blocks (the same mark again clears it). Keys: Ctrl/Cmd+Shift+E (extend), D (dropped), A (answered), K (key). Toolbar buttons →, !, ✓, ★ in both views.
- Look: position titles, sections and claims get a badge in front ("→ EXT", "! DROPPED", "✓", "★ KEY"); answered lines are crossed out and faded; body lines and flow cells get a colored left edge. Badges use `::before` so they don't clash with the speech tags (`::after`). Word export prefixes "[DROPPED]" etc.; the Excel flow prefixes →, [DROPPED], ✓, ★.
- Search (Ctrl/Cmd+K) now ignores Shift, so Ctrl+Shift+K marks "key" instead of opening search.
- Tests in `tests/editor.test.ts`. Note for Playwright: pressing a shortcut right after a click can hit the previous line, because the caret position syncs a moment later; wait ~300 ms after clicking.

### Named version history and replay (2026-11-03; deployed, version a39bedb3)

- History is built from the **server's record**, so it shows everyone's edits with names (the owner said this is mandatory). In a pane on a server doc, History has tabs **History**, **Replay**, **Saved here** (the old per-device versions) and **Typing log** (this device).
- `src/history/timeline.ts`: `decodeLog` (from `GET /api/docs/<id>/log`; uses `worker/measure.ts` for inserted and deleted text), `sessionsOf` (runs of one person's edits with no pause over 2 minutes; offline catch-up kept separate), `DocReplayer` (rebuilds the doc as of any update, with a saved copy every 40 updates).
- `src/ui/ServerHistory.tsx`:
  - **History:** list of sessions (person color dot, +inserted/−deleted, time). Views: "What changed" (that session's diff, highlighted in that person's color), "Doc then", "Since then". **Restore to this point** (logs a `restore` event on round docs; the restore is itself in the record).
  - **Replay:** play/pause, slider over every edit, speed, the current edit's author, time and text.
- Tests: `tests/timeline.test.ts`. Checked in Playwright: two people edit one doc; Ana's History lists Ben's and Ana's sessions; Ben's diff shows his backspaced word crossed out; Replay steps edit by edit with names.

### Import into reference docs (2026-11-03; deployed, version a39bedb3)

- Sidebar, Reference header: **Import** (upload icon). Accepts Word (.docx), Excel (.xlsx), CSV, plain text and Markdown. Makes a new reference doc and opens it. Hidden in Round Mode.
- `src/import/importFile.ts`: `parseDocx` (Word heading levels and our own exported style names map to position/section/claim; other paragraphs become warrants or notes), `parseXlsx`/`parseCsv` + `sheetsToDoc` (each sheet becomes a position; columns become speeches, so a flow exported from this app comes back as a flow), `parseText` (Markdown `#`/`##`/`###` headings, bullets). Blocks get fresh ids. `seed.writeJSON` writes the result into the doc.
- Not supported: Flower's own file format (export from Flower as a spreadsheet if it allows that), PDFs, old .doc files.
- Tests: `tests/import.test.ts` (Word and Excel round trips through our exporters, CSV with quotes, Markdown).

### Adjustable timer lengths (2026-11-03; deployed, version 9010a62b)

- Owner asked for any length (prep is sometimes 25 or 30). In the timer menu: **Change times** edits each preset's name and length, adds or removes presets, or resets to defaults; saved per device (`localStorage` `pp-timer-presets-v1`). The custom row takes a name and a length. **−1:00 / +1:00** nudge the current timer, running or paused (shared on round docs like everything else).
- Lengths can be typed as `25`, `2.5` or `2:30` (`parseMinutes` / `formatMinutes` in `src/store/timer.ts`; `adjust` adds or removes time).
- New round has a prep-length box (defaults to this device's Prep preset). A different length there becomes the Prep preset's time on that device.
- Tests: `tests/timer.test.ts`.

### Deleting docs: Recently deleted and a deletion log (2026-11-03; deployed, version 96a6975b)

- Owner's question: did a student's "Delete for good" hide a round doc from the coach with no trace? It did. Now:
  - **Team docs** (owner or coach deletes): `docs.deleted_at / deleted_by / deleted_by_name` are set; the doc leaves every list and only the team's coaches can open it (`canAccess`). Logged in the `deletions` table. Coach view → **Recently deleted** lets coaches open, restore (`POST /api/docs/<id>/restore`) or **delete for good** (a second DELETE on a deleted doc; wipes the DocRoom too). **Deletion log** tab shows every deleted / restored / deleted-for-good / moved-out line, kept after the doc is gone.
  - **Round docs** in Coach view stay listed with a red "Deleted by X" chip and count as flagged. The check page and the tab room page also show "Deleted by X".
  - **Tournament round docs** can't be deleted for good by anyone; the tab room keeps them. A personal (no team) tournament doc is only hidden from its owner. Account deletion keeps them too (hidden, "Name (account deleted)").
  - **My own docs** outside a team and not in a tournament: still deleted for good.
  - Loopholes closed: round docs can't be moved out of a team; a tournament tag can't be removed or changed once set; moving any other doc out of a team is logged.
- Sidebar menu wording comes from `deleteEffect` in `src/store/docs.ts`. Privacy page updated to match.
- Checked against a local server (student delete, no access afterwards, coach sees and restores, student can't restore or purge, coach purges, log lines, tournament tag lock, tab room and check page labels) and in a browser (Coach view tabs).

### Screen space for small laptops, and a connection check (2026-11-03; deployed, version d968cdb0)

- Owner wants students on 13-inch laptops to get the most out of the screen.
  - **Resizable side panels:** drag the edge of the doc list, the pinned blocks panel or a pane's outline (`src/ui/PanelResize.tsx`: `usePanelWidth` saves the width per browser under `pp-width-<name>`; `PanelHandle` is the handle). Drag far past the narrowest width to close the panel; double-click resets; arrow keys work when the handle has focus. Widths reach CSS through `--side-w`, `--pins-w`, `--outline-w`. Not shown when the doc list or pins slide over the windows (screens up to 1180px wide).
  - **Appearance → Screen space:** **Tight** spacing (`data-spacing='tight'` on `<html>`: smaller top bar, pane headers and padding, flow columns down to 138px from 190px) and **Formatting bar** on/off (`data-toolbar`). New fields `spacing` and `toolbar` in `src/settings/settings.ts`.
  - **Fill the screen:** pane ⋯ menu → "Fill the screen with this window", or Ctrl/⌘+Shift+\. Hides the doc list and the other windows; "Show all windows" in the top bar brings them back. Pins stay if open.
  - **Ctrl/⌘+\** shows or hides the doc list.
- **Connection check:** tap the dot in a pane header. Shows the round trip to that doc's server and whether your edits are saved there. It pings every 2 seconds only while open. The app sends message type 99 on the doc's WebSocket; `DocRoom` answers after `await this.writes`, so an answer means everything sent before it is saved (`src/store/sync.ts`: `watchConnection`, `useConnectionCheck`). Unknown to y-websocket servers elsewhere, harmless.
- Checked in a browser at 1280×800 against a local server: resizing, drag-to-close, both shortcuts, Tight spacing, hidden formatting bar, fill-the-screen, and the connection panel (round trip, "All saved on the server", closes on an outside tap).

### Who can open a team doc, and Reset (2026-11-03; deployed, version 6713b8fb)

- **Bug the owner found:** picking one partner on a regular team prep doc still let the whole team edit it, because only *round* docs were restricted and only they had a Partners picker.
- **Now every team doc has `access`** (`docs.access`, `DocRecord.access`): `'partners'` = the owner, the partners picked and the team's coaches; `'team'` = everyone on the team. Round docs are always `'partners'`. **Defaults:** new prep docs `'partners'`, new reference docs (coach briefs) `'team'`. **Migration (first run):** every existing non-reference doc became `'partners'`, so teammates lose sight of other people's existing prep docs until the owner picks "Everyone on the team".
- Only the owner or a coach can change access or partners (the server used to let partners do it). Turning a doc into a round doc makes it private.
- When access changes, anyone connected who lost access is disconnected (`DocRoom.kick`); their connection is marked `revoked`, so nothing they send is accepted and nothing is relayed to them even if the close isn't seen (`connectedUsers`, `kick` in `worker/docRoom.ts`; the PATCH route in `worker/index.ts` does the check).
- UI: a button in each team doc's header (`PartnersButton` in `src/ui/RoundTools.tsx`) reads "Only me", "Partners (n)" or "Whole team" and opens the chooser; round docs keep it in their purple strip.
- **Reset: start fresh** (sidebar footer; one click plus an inline confirm; not shown in Round Mode). `resetWorkspace` in `src/ui/App.tsx`: deletes every doc *I own* in the list on screen (not ones teammates shared with me), closes all windows and clears that list's pins. Team docs still go to the coaches' Recently deleted and tournament rounds stay (same rules as one-by-one delete).
- Checked against a local server with four accounts (owner, partner, other student, coach): who sees what, who can change access, a connected person cut off with edits blocked both ways, reconnect refused, and the two new buttons in a browser.
- Owner reported "text overflows into other columns in spreadsheet mode" and then said to try it with section and position formatting. Cause: in the flow a **section title** was a full-width row (`grid-column: 1 / -1` in `src/editor/flowView.ts`), so a long one ran across the PMC, LOC and MG columns; and a long **position title** made its sheet tab as wide as the title (about 1,900px) so the tab strip scrolled sideways. Fixed: the section title now sits in the first column and wraps there (`grid-column: 1`), with its divider line drawn across all columns by `.fl-section::after` (width from `--fl-cols`); sheet tabs show at most 240px of the name with “…” and the full name as a tooltip (`.sheet-name`). Claims, warrants, analytics and plain long words or URLs already wrapped correctly (tested).
- Known quirk: the pane's "Open a document" picker lists docs from every list, not just the current team.

### Tour, /guide page, and new docs in Round Mode (2026-11-03; deployed 2026-11-04, version f5c3af0a)

- **/guide** (`worker/guidePage.ts`, route in `worker/index.ts`; reuses the page shell exported from `worker/legal.ts`): the one-page "Start here" guide. Plain HTML, works signed out, phone-friendly. **When a feature changes, change this page in the same commit.** It has a "Take the 1-minute tour" button linking to `/#tour`.
- **Tour** (`src/ui/Tour.tsx`, `src/store/tour.ts`): 11 steps that spotlight parts of the screen (doc list, teams, New round, timer, Split view, Doc/Flow, pins panel, Round Mode, sync dot). Steps whose target isn't on screen are skipped (e.g. not signed in). Targets are found by selector; `data-tour="menu|split|pins|round-mode"` attributes mark top-bar buttons. Keys: Next/Back buttons, ← →, Esc. First visit shows a small "New here?" offer (once per browser, `pp-tour-seen`, waits for dialogs to close); a **?** button in the top bar (`HelpMenu`) retakes the tour or opens the guide; `/#tour` starts it. If you add a major feature, add a step.
- **Round Mode creation fix:** the owner asked whether docs made during Round Mode become prep docs. They did not: they were created as ordinary docs and then locked out by Round Mode. Now `create()` in `src/ui/App.tsx` makes a **round doc** (`makeDoc(..., round=true)`: sets the in-doc flag and `setDocRound`) when Round Mode is on; reference docs can't be made then (the Reference "+" and the picker's "New reference doc" are hidden; Import was already hidden). The pane picker lists only round docs in Round Mode.
- **Partners are not notified.** Picking a partner only grants access; the doc appears in their list on the 30-second refresh or when they refocus the app. Owner suggested the partner should have to **accept** co-editing; see Next steps.
- Checked in a browser: offer, every tour step, Esc, `#tour`, Help menu, Round Mode "+" making a round doc, guide on a phone width.

### Fix: message storm and constant reconnecting (2026-11-04; deployed, version f5c3af0a)

- **What the owner saw:** Cloudflare said the account was at 90% of its "observability allowance" (Workers Logs: on the Free plan about 200,000 log events a day, and logging simply stops recording when it runs out; the app keeps working). With about five people testing, that made no sense. Cloudflare's GraphQL analytics (the deploy token can read them) showed ~233,000 Durable Object requests on 2026-11-03, 99% of them between 23:20 and 23:40 UTC (158,000 in one 5-minute bucket, about 500 a second), but only ~4,000 rows written, so they were not document edits.
- **Cause 1 (the storm):** when the **same doc is open in two windows** (New round opens doc + flow side by side, on purpose), both editors had `CollaborationCaret` on the same provider. They share one awareness record, and y-prosemirror's cursor plugin in the unfocused editor deletes a cursor it thinks isn't its own, so the two editors deleted and re-added each other's cursor forever (~450 messages a second as soon as the cursor was in the doc; reproduced in a browser and the fix verified: 450/s to 0). **Fix:** only the first window showing a doc shares its cursor (`carets` prop on `DocEditor`/`FlowEditor`, `showCarets` from `App`). Any future code that puts two editors on one Yjs doc must keep this rule.
- **Cause 2 (constant background traffic):** y-websocket reconnects if it hears nothing from the server for 30 seconds (the timeout is a fixed constant), and our server is silent when nobody types, so **every open doc reconnected twice a minute, all day** (this was the flat ~120 requests an hour overnight). **Fix:** each open doc sends a ping every 20 seconds and the server echoes it (`keepAlive` in `src/store/sync.ts`; message type 99, the same one the connection check uses). Measured: 100 seconds idle with two docs open, zero reconnects, about 13 small messages a minute.
- **Safety valve** in `worker/docRoom.ts` (`throttle`): awareness (cursor) messages over 12 a second per connection are dropped; a connection sending over 100 messages a second for 5 seconds in a row is closed with code 4429 (and logs a warning), and the app waits a minute before reconnecting (`connection-close` handler in `connect()`). Fast typing is far below this. Tested with a fake client flooding ~400 a second (cut after 5 s) and normal typing at 21 keys a second (not cut).
- **Logging:** `wrangler.jsonc` now keeps one in ten log events (`head_sampling_rate: 0.1`). Raise it while hunting a bug.
- **How to see usage yourself:** Cloudflare GraphQL (`api.cloudflare.com/client/v4/graphql`) with the deploy token: `workersInvocationsAdaptive` (HTTP requests), `durableObjectsInvocationsAdaptiveGroups` (DO requests, group by `datetimeFiveMinutes` or `objectId`), `durableObjectsPeriodicGroups` (WebSocket messages, rows read and written).

### Partner invitations and server tests (2026-11-04; deployed, version 82723daf)

- **Owner's call:** a partner should have to accept co-editing, and picking one should notify them. Now picking a partner (in New round or the Partners button) **invites** them (`doc_partners.status` = `pending`); they have no access until they accept. `accepted` partners are `DocRecord.partners` and the only ones `canAccess` counts; `pendingPartners` and `declinedPartners` are returned too so the owner sees "waiting" / "declined" and can invite again. Existing partners were migrated to `accepted`. Coaches never need to accept. Only people on the team can be invited, never the owner; the list is capped at 6.
- **Server** (`worker/directory.ts`): `updateDoc` reconciles the partner list (new names are invited, accepted ones are kept, names left off are removed, declined ones re-invited if listed again); `respondToInvite(user, doc, accept)` (accept a pending invite, decline it, or leave an accepted doc; a declined person needs a new invite); `invitesFor(user)`. Routes: `POST /api/docs/<id>/respond {accept}`; invitations ride along on `GET /api/docs?team=` as `invites` (no extra polling; the app refreshes every 30 seconds, on focus and when the tab becomes visible, and **skips the refresh while the tab is hidden**). Removing or leaving kicks the live connection.
- **App:** `src/ui/Invites.tsx` shows a bar under the top bar for each invitation (Accept/Decline; the tab title shows a count). The Partners button (`src/ui/RoundTools.tsx`) shows each student's status and has "Leave this doc" for a partner. Accepting switches to the doc's team and opens the doc. There is **no email or push**: the person has to open the app (adding an email service would fix that and is also what emailed-link sign-in needs).
- **Automated server tests** (`tests/directory.test.ts`, 25 tests): the real `Directory` class against an in-memory SQLite database via a stand-in for `cloudflare:workers` (`tests/stubs/cloudflare-workers.ts`, alias in `vite.config.ts`; Node's built-in `node:sqlite`). Covers who can open team docs, access changes, deleting/restoring/purging, tournament locks, and every invitation rule. These files are excluded from the root `tsc` (they need Cloudflare/Node types); vitest runs them. **Add a test here whenever you change an access rule.**
- Checked end to end with two browser sessions: owner starts a round with a partner, partner sees the bar, accepts, both type and see each other live.

### Efficiency step 2 and the row-counter fix (2026-11-05; deployed, version 1e2fba40)
- **Counter fix:** `updates` and `events` tables no longer use AUTOINCREMENT (it kept a second counter row, so each saved edit cost about 2 billed rows). Existing tables are rebuilt on first wake (tested). After deploy, compare Cloudflare `rowsWritten` with DO requests (before: 12,687 rows / 8,117 requests, about 1.56).
- **Server batching (`worker/docRoom.ts`):** edits are relayed at once but saved one row per person per second (`FLUSH_MS`), merged with `Y.mergeUpdates`; flushed on ping, close, state/log/record/summary reads, or at 200 edits. A restart loses at most the last second from the record (the client re-sends on reconnect). Snapshot every 200 rows (`SNAPSHOT_EVERY`); a woken room reads the newest snapshot plus the tail. Running summary kept as edits arrive (`room.summary()`), used by Coach view and the tab room instead of replaying every edit. `GET /api/docs/:id/log?since=<seq>`.
- **Client:** `batchEdits` in `src/store/presence.ts` merges outgoing edits for 300 ms (flushes when the tab hides). Off switch: `localStorage['pp-batch'] = '0'` then reload, or `setBatching(false)`. `docLog` keeps fetched edits in memory only and asks for newer ones.
- **Tests:** `tests/docroom-batching.test.ts` (21), `tests/batching.test.ts` (randomized two-person convergence, batching on/off, offline/reconnect), updated `tests/docroom.test.ts`. Real browsers (`scripts/measure-traffic.cjs`): messages per typed character 1.41 to 0.91; idle 4 messages/minute unchanged. Two people typing at once (60 characters) ended with identical text and the server saved 7 rows instead of about 60.
- **Next:** reply "deploy"; then verify rows vs requests in Cloudflare analytics. Still open from EFFICIENCY.md: step 3 (push instead of poll), guard rails.

### Branch `flowist-flow-view`: Flowist-inspired flow layout (2026-11-09; NOT merged, NOT deployed; PR for the owner to review)
- **Permission/credit:** the owner has Elli's (Flowist's author) explicit permission to use and modify Flowist's code for any purpose, with credit "Flowist". Private reference copy: `paulicydebate/flowist-reference` (read its `PARLIPREPROOM-HANDOFF.md` first). AGENTS.md and README.md (Credits) now say so; adapted files carry an "Adapted from Flowist" header. Adapt, do not copy one to one: this app keeps its own block model, doc-or-flow rule and typing record. Flowist's own sheet data model (cell graph, zod, IndexedDB workbooks, Supabase, Electron) was deliberately NOT ported.
- **Milestone 1 (built): cells grow on their own.** `src/model/flowLayout.ts` (new, pure, `tests/flowLayout.test.ts`) turns `computeFlow`'s groups plus each block's measured height into positions: inside a group every speech column is its own stack, a group is as tall as its tallest column, an answer lines up beside the argument it answers (centered but within 76px of its top, like Flowist's "balanced" alignment), and linked answers align to their target. `src/editor/flowView.ts` measures every block after each change (plugin `view`), stores heights in the plugin state, and places blocks with `--c` (column) and `top` instead of CSS grid rows; cell backgrounds are per column and only as tall as their own text. `src/styles.css` ("Flow layout: every cell grows on its own"). Threads, link mode, column copy, pins column, click-to-add cells still work (tests and a real-browser check).
- **Look (2026-11-09, after the owner's feedback on the video):** dark "night" flow by default (Colors dialog has a "Dark flow" checkbox; `src/store/flowTheme.ts`), thin outlined boxes in the side's color, one box per cell (a claim and its lines), empty positions invisible until hovered, column gap 44px for the threads, smooth S-curve threads (grey, green when the argument or any of its answers is selected, with a green outline on that group), and a **+** under linked answers to add another (`addAnswer` command). Layout gaps: lines of one cell touch, cells 4px apart. Empty cells in a selection are deleted (not linked) when the answers collapse (`applyLink`).
- **Box-select and narrow columns (2026-11-09):** drag on an empty spot to draw a box; the cells it touches are picked (`picked` in the flow plugin state, `boxSelect` in `flowView.ts`) and Link uses them (a press that does not move is still a click that makes a cell). Speech columns with no text in them (blank cells made by Tab do not count; the caret in a column does) stay 76px wide until used (`columnTracks` in `flowLayout.ts`; the sheet is a CSS grid only for column widths, blocks sit in their column with `grid-column: var(--c) / span 1` and a top from the layout).
- **Still to do on this branch (owner approved option A):** Flowist's connector-line drawing (shadows, crossings), the pannable multi-sheet canvas, maybe cell groups and cross-sheet links; glow colorway. Option B (Flowist's cell model instead of ours) only if A proves too limiting.
- **Seeing it:** `npx vite --port 5199 --host 127.0.0.1` runs it locally in local-only mode (no accounts); a separate preview Worker `parlipreproom-preview` (own empty data, no sign-in, not the live app) was deployed 2026-11-09 with the owner's OK: https://parlipreproom-preview.paulicydebate.workers.dev (version 53c81300). Redeploy it with `npx wrangler deploy --name parlipreproom-preview` from the branch; delete it when the PR is done. Never deploy to production without "deploy".

### Flow threads: link answers to an argument (2026-11-08; deployed, version 7fb676a6)
- **What it does:** in a flow, select claims in a later speech (drag across them, or put the caret in one), press **Link** in the sheet bar (Ctrl/Cmd+Shift+L), then click the argument in the speech just before. The answers stack beside that argument (its row grows) and a thread is drawn from the argument into each answer. **Unlink** (caret in a linked claim) or Esc.
- **Model (no new data format, nothing moves in the document):** one new block attribute `answers` = id of the argument answered (`src/editor/PrepBlock.ts`). `computeFlow` (`src/model/flow.ts`, rewritten as `layoutPass`) takes linked claims (plus the warrants/analytics/notes right after them) out of the normal row logic and places them in the target's row group, aligned with the target; `FlowSheet.links` lists `{from, to}` doc positions for drawing. A link is ignored (the claim stays where it was typed) if the target is missing, on another sheet, or not in the column just before; chains work (a later speech can answer a linked answer). Moved cells are excluded from `insertPosFor`, so new lines are never inserted inside the wrong group. Because only an attribute changes, linking is not a text edit (nothing for the typing record to flag).
- **UI:** `LinkButtons` and `FlowThreads` in `src/ui/FlowEditor.tsx` (SVG overlay measured from the DOM, redrawn on edits/resizes); link mode in `src/editor/flowView.ts` (`startLinking`, `cancelLinking`, `unlinkBlock`, `applyLink`); the gap between flow columns is now `--fl-gap: 16px` so threads show. Pasted lines clear `answers`.
- **Design source:** built from what the owner showed in a screen recording of another flowing app (Flowist, by Elli). We have no license for its code and **did not copy any**; we only re-implement the idea (ideas are free) in our own model. If Elli gives written permission to reuse specific parts, record it here. Do not read or copy its source.
- **Tests:** `tests/flowlinks.test.ts` (model), `tests/flowEditor.test.ts` (link mode). Checked in a real browser (Playwright): three answers linked to one argument stack beside it with a bracket thread.
- **Not done yet:** only the speech just before can be targeted; linking is not undone as one step beyond normal Undo (it is one transaction, so Undo works); no drag-from-argument linking; glow colorway and the one-big-canvas view are next.

### Guard rails (2026-11-05; deployed 2026-11-08, version 7fb676a6; needs the ADMIN_EMAILS secret for /admin)
- **Pause switch (kill switch):** `/admin` page + `GET/POST /api/admin/pause` (admins only: emails in the `ADMIN_EMAILS` Worker secret, comma-separated; **not set yet**: the owner must run `npx wrangler secret put ADMIN_EMAILS` or add it in the dashboard under Settings > Variables and Secrets). While paused, new sync connections get 503 and every page shows an orange notice; people already connected keep editing (nothing lost). Emergency path with no sign-in: `wrangler deploy --var PAUSED:1` (redeploy without it to resume). State is in the Directory `settings` table; `/api/health` carries `notice`.
- **Per-person limits:** 4 open tabs per person per doc (the oldest is closed with code 4408; the client stops that tab for 10 minutes and says so); `GET /api/docs` limited to 60 a minute per session (429).
- **Reconnect storms:** a refused tab now also checks `/api/health` and waits a minute while the server says it is paused.
- **Usage check:** `scripts/usage-check.cjs` reads this month's Cloudflare numbers (Worker requests, DO requests, rows written/read) against Workers Paid allowances and exits 1 over a warning line (default 50%). A daily scheduled task runs it. It counts from the paid-plan start (`PAID_SINCE`, default 2026-11-05, owner upgraded that day). First reading (2026-11-05): DO requests already 24.75% of the monthly allowance because of the 2026-11-03 message storm; everything else under 1%.
- Not done: caps on events per doc per hour, a limit on docs open at once, reconnect jitter. Tests: `tests/guardrails.test.ts`, `tests/reconnect.test.ts`.

### Bug analysis (2026-11-04)

- `BUGS.md` lists problems likely to be present but not yet hit, each marked Confirmed / Code / Estimate, with evidence, fix and effort, plus what was checked and is fine. Top items: signed-out visitors can read the last user's cached docs (shared Chromebooks); the Workers **Free plan** CPU, rows-written and rows-read limits will break check pages and the record at real prep volume (recommend Workers Paid, about $5 a month); a failed write silently stops the record; Undo is flagged as a "large edit"; a removed student keeps access to docs they own; refused connections retry forever.
- Fixed so far (2026-11-04): items 5, 6 and parts (a) and (b) of item 3, each with tests (`tests/directory.test.ts`, `tests/docroom.test.ts`, `tests/reconnect.test.ts`). `tests/docroom.test.ts` runs the real `DocRoom` against the fake database in `tests/stubs/cloudflare-workers.ts`, which can be told to fail statements. Still open: the rest of BUGS.md.

### Shared-computer data leak fixed (2026-11-04; deployed, version f049a68d)

- See BUGS.md item 1. Local data now belongs to one account: `src/store/device.ts` (`claimDevice` runs inside `loadAccount` once `/api/me` answers; `wipeLocalData`), `signOut` and `deleteAccount` in `src/store/account.ts` wipe, `unsyncedOpenDocs` / `closeAllDocs` in `src/store/registry.ts`, and `App` hides account docs while the app doesn't know who is signed in or nobody is.
- `src/store/idb.ts` is our own `createStore` (used by docs, versions and the typing log instead of idb-keyval's): it closes its connection when asked, otherwise an open connection blocks `deleteDatabase`.
- **If you add a new place that stores private data in the browser, add it to `wipeLocalData`** (IndexedDB names starting `pp-` are found automatically; localStorage keys must be listed in `PRIVATE_KEYS` / `PRIVATE_PREFIXES`).
- Checked in a browser: sign out, switching accounts, an expired session, and a plain reload (layout and docs are kept). 7 new tests in `tests/device.test.ts`.

### Efficiency plan (2026-11-04)

- `EFFICIENCY.md` has the measured traffic baseline and a three-step plan to cut server usage while keeping what users see. **Step 1 is built** (2026-11-04): no cursor echo, cursor updates at most twice a second, presence renewed once a minute, a free "ping"/"pong" keep-alive answered by Cloudflare's edge (`setWebSocketAutoResponse` in `DocRoom`; the app wraps `onmessage` to count text replies), one directory call (`docList`) per refresh, and polling that slows to every 2 minutes when a tab sits idle. Steps 2 and 3 are not built. Main finding: y-websocket re-sends every cursor update it receives (the library ignores the update's origin), so a pair costs 3.08 server messages per typed character; an idle open doc costs about 16 messages a minute per tab; each tab polls the doc list every 30 seconds at 3 directory calls each.
- `scripts/measure-traffic.cjs` re-measures all of that (needs Playwright and a local dev server started with the dev-login flag). Run it before and after any change meant to reduce traffic.

### Enter and Shift+Enter (2026-11-04; deployed, version 442dd582)

- Owner found Enter's auto-formatting (next style down, and "Enter on an empty line moves it up a level") more annoying than useful. Now **Enter** just starts a new line in the **same style** (owner's follow-up: cells should start on claim, so after a position or section title the new line is a **claim**; the flow already started every new cell and row as a claim) (`splitBlock`, middle or end of a line; a selection is replaced as usual). **Shift+Enter** switches the current line to the next style in the list (position, section, claim, warrant, analytic, note, then around); **Ctrl/Cmd+Shift+Enter** goes back. With several lines selected they all get the style after the *first* line's, so they stay uniform. Chosen because Ctrl/Cmd+Enter is already "new row" in the flow, Alt/Ctrl+digits pick styles, and Shift+Enter was only the soft line break (`HardBreak`), which nobody types in prep (imported soft breaks still display).
- Code: `cycleKind` in `src/model/blocks.ts` (the old `KIND_INFO[kind].next` is gone), `cycleBlockKind` command and the key bindings in `src/editor/PrepBlock.ts` (shared by the doc and flow editors). In the flow, Enter after a claim now adds another claim (next row in that column) instead of a warrant; Shift+Enter turns it into a warrant under the claim.
- Text updated: sample prep doc, README, `/guide` shortcuts, the style menu tooltip and the flow toolbar hint. Tests: `tests/editor.test.ts`, `tests/blocks.test.ts`. Checked in a real browser (doc and flow, no stray line breaks).

### A document is a doc or a flow, fixed when it is made (2026-11-05; deployed, version 7237da80)

- **Owner's rule ("no copy and paste"):** the same text must not exist in two forms. Before, any doc could be shown as a Doc or a Flow with a switch in each window, which reformatted one copy. Now each document has a **format**, `doc` or `flow`, chosen at creation and never changed. There is no switch; a flow is always the grid, a doc is always text. Owner's answers: fixed on the document itself; New round asks (prep doc + flow, flow only, or doc only); existing docs all became docs (except the built-in "Sample flow: ..." docs).
- **Server:** `docs.format` column (migration sets existing docs to `doc`, and `Sample flow:%` titles to `flow`), `DocRecord.format`, returned by the API and invitations; set only when creating (`updateDoc` ignores it, tested). **App:** `DocMeta.format` and `formatOf()` in `src/store/docs.ts` (missing means doc); `Pane` picks the editor from the format and shows a "Flow" badge, outline only for docs, export is Word for docs and Excel for flows (also in the team zip); sidebar "+" next to Prep offers New doc / New flow and flows get a grid icon; the empty-window picker has "+ New flow"; Excel/CSV import creates a reference **flow**, Word/text/Markdown a reference doc. The pane layout no longer has `view`.
- **New round** (`src/ui/Rounds.tsx`): "What to make" (default prep doc + flow). It creates two separate round docs (`... · prep` and `... · flow`) with the same partner, tournament and label; the prep timer lives in the flow (else the doc); the app opens doc on the left and flow on the right. The timer no longer follows focus: it uses the flow if one is open, else the first round doc (`timerDocId` in `src/ui/App.tsx`), which also fixes BUGS.md item 13. A partner is invited to both docs; the invitation bar groups them as one (`groupInvites` in `src/ui/Invites.tsx`) and opens both side by side.
- Samples: the first run now also makes a "Sample flow" (a flow). Docs, tour, guide and README updated. Not done: History and Replay still show a flow's blocks as lines of text (that is a read-only view of the record, not a second editable copy).
- AGENTS.md's core-idea line was updated to match; keep that rule: never show one document in both forms.

### Enter in a flow goes to the next cell (2026-11-05; deployed, version b45db875)

- Owner: in a later speech column, Enter made the current cell bigger (it split the line and the new line stacked in the same cell). Now in a flow **Enter drops down one cell** in the same column: the cell in the next row if it has one, an empty cell there if that row has nothing in this column, or a new row after the last one (`nextCell` command in `src/editor/flowView.ts`, called from the Enter handler in `src/editor/PrepBlock.ts`; the doc editor has no such command, so docs are unchanged). This applies to every column including the first (Enter on a claim now moves to the existing claim below instead of inserting a row; Ctrl/Cmd+Enter still inserts a row right below this one).
- **Alt/Option+Enter** adds another line inside the same cell (the old behavior, now on purpose). Enter on a title or section label (not in a cell) and Enter with text selected behave as before. Enter in the middle of a cell's text no longer splits it (like a spreadsheet); use Alt+Enter if you want a split.
- Tests: `tests/flowEditor.test.ts` ("Enter in the flow drops you down to the next cell"). Text updated: toolbar hint, README, `/guide`, sample flow.

## Next steps

1. Owner tests Google sign-in, team creation and invites on the live site (OAuth client and secrets are done).
2. Emailed-link sign-in fallback, if school Google accounts are blocked (would need an email-sending service).
3. Further visual polish as the owner's testers report it (the design and tablet pass and colorways are done).
4. Work through BUGS.md in the order it suggests; decide on Workers Paid first. Then EFFICIENCY.md step 2 (batching, snapshots, running summaries).
5. Owner tests the 2026-11-03 batch on the live site (timer, New round, tab room, marks, history and replay, import, account tools).

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

- Type-check with `npm run typecheck` (no output files). Don't run `tsc -b`: it writes `.js` copies next to the sources, and Vite picks a `.js` file before a `.ts` one, so a stale copy can end up in the build. That happened once (commit 7dafee6, removed in the next commit); the timer deployed as 9010a62b was missing its "Adjust" label and the instant redraw after starting. `.gitignore` now blocks those files.

- Don't copy code from CardMirror / CardMirror-Green (noncommercial license). Re-implementing ideas is fine.
- Don't commit real student prep or credentials.
- The owner reads on a phone and isn't a programmer: plain-language updates, outcome first.
- Known small issues: pane header gets crowded with 3 panes; color palette needs a design pass (owner called it "weird");  `npm audit` reports a high-severity `undici` issue inside `wrangler` (local dev tool only, not shipped to users).
