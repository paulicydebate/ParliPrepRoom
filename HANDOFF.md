# ParliPrepRoom: handoff

The current state, for whoever works on this next. Updated 2026-11-13. Read [NEXT.md](NEXT.md) for the open work, [AGENTS.md](AGENTS.md) for the rules, and [CHANGELOG.md](CHANGELOG.md) for how everything got here (it was this file until 2026-11-13).

## What it is

A web app for NPDA/NPTE parli debate prep (owner: a coach, Paul Villa; not a programmer: write to him in plain language, outcome first). Students prep together live, read coach briefs, and flow the round; in a **round doc** paste is blocked and every edit is recorded on the server, so a coach can check the prep was typed. Plan and decisions: [PLAN.md](PLAN.md). Known issues: [BUGS.md](BUGS.md). Server cost work: [EFFICIENCY.md](EFFICIENCY.md).

Each document is a **doc** (styled outline blocks, TipTap, `src/editor/`, `src/ui/DocEditor.tsx`) or a **flow** (cells, `src/flow2/`), chosen when it is made. The flow is built on ideas and some code from **Flowist** (author Elli), used with permission and credited; see AGENTS.md.

## Where things are

- **Live site:** https://parlipreproom.paulicydebate.workers.dev. Deployed 2026-11-13 from branch `flowist-flow-view` at `687c1c5` (Cloudflare version `4804adff`), with the owner's "deploy". Old (pre-flow2) flows open blank there; the owner chose that (alpha to beta).
- **Preview:** https://parlipreproom-preview.paulicydebate.workers.dev (its own empty data, no Google sign-in). Redeploy freely: `npx wrangler deploy --name parlipreproom-preview`. `/api/health` on either shows the deployed `build` (a commit, `-dirty` if built from uncommitted changes).
- **Branches:** the work is on `flowist-flow-view`, PR #1, ready for the owner to merge. `main` is behind (it still has the old flow). **Never merge; never deploy to the live site without the owner saying "deploy".** Until PR #1 is merged, do not deploy the live site from `main`: it would bring the old flow back.
- **Deploying (cloud sessions):** `CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=cc1fffd57d89d16d2e28ed38e9a58cc1 npx wrangler deploy` (add `--name parlipreproom-preview` for the preview). The built app is embedded into the Worker by `scripts/embed-assets.mjs` (Workers static assets cannot be uploaded through the sandbox's credential proxy). Deploy from a clean checkout.
- **Plan:** the owner is on Cloudflare Workers Paid since 2026-11-05.

## Code map

| Area | Files |
|---|---|
| App shell | `src/ui/App.tsx` (layout, tabs, panes, Round Mode, search, pins, import), `src/ui/Pane.tsx` (one window, Home), `src/ui/Account.tsx`, `src/ui/Rounds.tsx` (New round) |
| Flow | `src/flow2/`: `model.ts` (Yjs data and every operation), `layout.ts`, `columns.ts`, `Flow2Editor.tsx` (workspace), `SheetView.tsx` (one sheet, keys, link mode), `Cell.tsx`, `WindowBar.tsx`, `RefPicker.tsx`, `flowHooks.ts`, `Flow2Canvas.tsx`, `Flow2Sidebar.tsx`, `FlowDock.tsx` (toolbar), `PinColumn.tsx`, `textBinding.ts` (text box to shared text), `caret.ts`, `flowist/` (Flowist's palette, fonts and look) |
| Docs | `src/editor/`, `src/ui/DocEditor.tsx`, `src/model/blocks.ts`, `src/model/outline.ts` |
| Round record (client) | `src/editor/roundGuard.ts` (paste blocking, edit log), `src/store/typingLog.ts`, `src/store/roundDoc.ts` (Round doc switch, resolution) |
| Server | `worker/index.ts` (routes), `worker/docRoom.ts` (one Durable Object per doc: sync, hash-chained record), `worker/directory.ts` (accounts, teams, access), `worker/measure.ts` (what text an update typed or deleted), `worker/summary.ts`, `worker/checkPage.ts` |
| History | `src/history/` (replay, flow diff), `src/ui/HistoryView.tsx`, `src/ui/ServerHistory.tsx`, `src/ui/FlowHistory.tsx` |
| Import / export | `src/import/` (Word, Excel, CSV, text; `flowImport.ts`, `flowFile.ts`), `src/export/` (`docx.ts`, `flowXlsx.ts`, `teamZip.ts`) |
| Styles | `src/styles.css` imports `src/styles/NN-area.css` in order (order matters) |

## How to work on it

```sh
npm install
npm run dev                  # local-only app (no accounts) at http://localhost:5173
npm test                     # Vitest, 233 tests
npm run typecheck            # and: npx tsc --noEmit -p worker
npm run build
npx wrangler dev --port 8793 --var DEV_LOGIN:1   # app + server; /api/auth/dev?name=Ann signs a test user in
npm run e2e                  # two people in a round flow, against the wrangler dev server (needs Playwright)
```

Before committing: `npm test` and `npm run build`. Before any deploy: also `npm run e2e`. Update this file and NEXT.md in the same commit as a change.

## Things to know

- Don't run `tsc -b` (it writes stray `.js` files that Vite picks up). Don't copy CardMirror code. Don't commit student prep, `.env` files or keys.
- Flow data: `flow2.order` (sheet ids) and `flow2.sheets` (id to sheet map: name, side, x, y, `cells` map). A cell: col, parent (the cell it answers), order, gap (blank rows above a root), group, mark, refs (`x:` cross-apply, `e:` extend) and text (Y.Text). Two people editing at once can leave odd data; `readSheet` normalizes it and every view relies on that.
- Undo in a flow: each structural change is its own step; switching Round doc clears the history; undo and redo in a round are logged.
- Server record of a flow: a new cell starts a new line, sheet names count as typed, marks, moves and links count as nothing. An insert that only puts back text deleted earlier in the round is marked `restored` and not flagged.
- Search covers docs and flows (`src/model/flowSearch.ts`, Flowist's typo-tolerant matcher in `src/model/fuzzy.ts`). Pins point at doc blocks; a flow shows the pins for its sheet in a Pins column.
