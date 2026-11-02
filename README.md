# ParliPrepRoom

A prep app for NPDA/NPTE parliamentary debate: a doc you can read and type into fast, that will also work as a flow, with live co-prep with your partner and a checkable record that prep was typed, not pasted.

See [PLAN.md](PLAN.md) for the full plan and phases.

## Status

**Phase 1 (editor core): done.**

- Doc view with six named styles: Position title, Section title, Claim, Warrant, Analytic, Note.
- Keys: Enter starts the next style down (position → section → claim → warrant). Enter on an empty line moves it up a level. Tab / Shift+Tab change level. Ctrl+1–6 on Mac, Alt+1–6 on Windows pick a style (other key sets, including Verbatim-style F4–F9, in Appearance).
- Fonts, sizes, colors per style, and Light / Dark / Sepia themes (Appearance button, saved per browser).
- Fold any heading; "collapse to claims" button; outline sidebar to jump around.
- Split view: up to three documents side by side, resizable. The same doc can be open in two panes.
- Prep docs and Reference docs (coach briefs). Drag docs in the sidebar to reorder them (or move them between sections); double-click a name to rename it.
- When the same doc is open in two panes, both panes say so (they are one document, not copies). Reference docs are editable for now; the prep lockout comes in Phase 4.
- Revision history: auto-saves every 2 minutes while editing (and when the tab closes), named versions, "changes since" view, restore.
- Everything is saved in the browser (IndexedDB). No accounts or server yet; that's Phase 3.

**Phase 2 (flow view): done.**

- Every pane has a **Doc / Flow** switch. Both views edit the same document, so the same prep can be open as a doc on one side and a flow on the other.
- Each Position title is a **sheet** (tab), marked Gov or Opp. Gov sheets have PMC, LOC, MG, MO, LOR, PMR columns; Opp sheets start at the LOC.
- A claim starts a row. Lines tagged with a later speech (toolbar speech menu, or by typing in that column) are answers and sit beside it. Warrants follow their claim. Section titles are full-width label rows.
- Every sheet shows 150 rows. Click any empty cell in any row to type there; the rows above stay blank (stored as a blank-row count on the line, so the doc view has no empty lines).
- Dragging a selection down across cells selects and copies only the column you started in.
- In the flow: Tab / Shift+Tab move to the next/previous speech in the row; Cmd/Ctrl+Enter starts a new row; + Gov / + Opp add a sheet; double-click a tab to rename it.
- The doc view labels answers with their speech (LOC, MG, ...).
- Export: Word (.docx, using your fonts, with real headings) and an Excel flow (.xlsx, one worksheet per sheet, colored gov/opp columns).

**Round docs (early part of Phase 4): done, on this device.**

- Any doc can be switched to a **Round doc** with the toggle at the top right of its pane. Team docs stay normal (copy and paste allowed).
- Round docs get a thick purple border, a purple header and a "Round doc" label, so an opponent can see which windows are round docs. The sidebar marks them with a purple dot.
- In a round doc, paste and drag-and-drop are blocked (with a message). Copying *out* is allowed.
- Each device asks once for the typist's name; every log entry records the name and a device id.
- Every local edit is logged with a timestamp and the exact text: typed text, deleted text, blocked pastes, large single edits (flagged), restores, time in other apps, and the switch being turned on or off. Turning it off needs a second click and is logged. A named version is saved whenever the switch flips.
- The log is saved in batches chained by SHA-256, so editing it afterwards is detectable. History → **Typing log** shows a seal code, whether the log is intact, totals per person, the events worth checking, and everything typed and deleted in order.
- Still to come in Phase 4: the server stamping the log (so it can't be rewritten on the device), a keystroke replay, and a share link anyone can open to check it.

**Live co-editing (Phase 3, part 1): live.**

- On https://parlipreproom.paulicydebate.workers.dev, every doc you open is saved to the server and to the browser (offline copy). A dot in the pane header shows the state.
- The share icon copies a link. Anyone who opens it gets the doc and edits it live with you, with name-labeled cursors.
- The server keeps every edit with the time and the typist's name, in a hash chain (the start of the record students can't rewrite).


**Sign-in, teams and the check page (Phase 3, part 2): live.**

- Sign in with Google (once the Google key is added on the server). A coach creates a team and shares invite links (one for students, one for coaches).
- The sidebar shows the current team's docs; a switcher in the top bar changes team or shows "My own docs".
- Team docs are open to the whole team. Round docs are open to their owner, the partners they pick and the team's coaches.
- Each round doc has a **Check link** with a QR code. Anyone can open it to see who typed, when, how much, blocked pastes, big single edits and whether the server's record is intact. Partners and coaches also see the typed text.

**Round Mode (Phase 5): live.**

- A **Round Mode** switch in the top bar. While it's on, only round docs can be open, the top bar turns purple with "ROUND MODE", and switching it on or off shows on the round docs' check pages.
- **Find a block:** Ctrl+K (⌘K on Mac) searches your prep and jumps to the claim. Nothing is copied.
- **Pinned blocks:** a side panel listing the claims you plan to read, in order. Tap one to jump to it. Put pins in groups named like flow sheets (T, DA 1, CP) and the panel shows the group for the sheet you're on.
- **Insert a block** (outside Round Mode only, and never into a round doc): pins and search results have an Insert button that puts a copy below the cursor, for coaches building docs in prep.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest + jsdom)
npm run build      # typecheck + production build in dist/
```

## Deploy (Cloudflare)

Live: https://parlipreproom.paulicydebate.workers.dev

The app runs on Cloudflare Workers (`wrangler.jsonc`, server code in `worker/`). `npx wrangler deploy` builds the app, embeds it into the worker (`scripts/embed-assets.mjs`) and uploads one script. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; see HANDOFF.md.

- Local server: `npx wrangler dev` (http://localhost:8787, health check at `/api/health`).
- Dry run: `npx wrangler deploy --dry-run`.

## Layout

| Path | What |
|---|---|
| `src/model/blocks.ts` | The named styles and their outline rules. No UI code. |
| `src/model/speeches.ts`, `src/model/flow.ts` | Speeches and the rules that turn the doc into a flow (pure functions, tested). |
| `src/editor/flowView.ts` | The flow editor: grid placement, sheets, cell commands. |
| `src/export/` | Word and Excel export. |
| `src/editor/roundGuard.ts`, `src/store/roundDoc.ts`, `src/store/typingLog.ts` | Round docs: paste blocking, the typing log and its hash chain. |
| `src/editor/` | TipTap/ProseMirror pieces: the styled block node, folding, schema. |
| `src/store/` | Local storage: document list, open-document registry (Yjs + IndexedDB), versions, sample content. |
| `src/history/diff.ts` | Block-level comparison between versions. |
| `src/settings/` | Fonts, themes, per-style appearance. |
| `src/ui/` | React components. |
| `tests/` | Unit tests. |
