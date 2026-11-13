# ParliPrepRoom: what to do next

Written 2026-11-13 after a full review of branch `flowist-flow-view` (PR #1, ready for the owner to merge; not merged, not on the live site). It is the working plan for whoever picks this up next. HANDOFF.md has the history; this file has the open work, in order.

## Where things stand

- **Branch `flowist-flow-view`** replaces the old flow with a new cell-based flow ("flow2", `src/flow2/`), built on ideas and some code from Flowist (author Elli; permission and credit rules are in AGENTS.md). Docs are unchanged.
- **Preview:** https://parlipreproom-preview.paulicydebate.workers.dev (own empty data, no Google sign-in). `/api/health` shows the deployed `build`.
- **Live site:** still runs `main` (the old flow). Old flows will open blank after the merge; the owner decided to scrap them (alpha to beta).
- **Checks:** `npm run typecheck`, `npx tsc --noEmit -p worker`, `npm test` (221 tests), `npm run build` all pass.

## Rules that do not change

1. The owner merges and the owner says "deploy". Never merge PR #1 or deploy to production yourself. The preview Worker (`npx wrangler deploy --name parlipreproom-preview`) is fine to redeploy.
2. A round doc must only hold text that was typed there, and every edit must be in the record. Any new way to put text into a flow (a field, a shortcut, an import, an undo path) has to block paste and log the edit. This is the point of the app; treat a gap here as the most serious kind of bug.
3. Credit Flowist in the header of any file adapted from it and in README Credits. Elli asked agents to re-read Flowist's `AGENTS.md` and `docs/COLLAB.md`; on 2026-11-12 `COLLAB.md` was not in `paulicydebate/flowist-reference`. **Check again before more Flowist code is adapted, and follow it.**
4. The owner is a coach, not a programmer: plain-language updates, outcome first. Update HANDOFF.md in the same commit as any change.

## The review of 2026-11-13

Three independent code reviews (flow data, flow editor, shell and server) plus a scripted pass in a real browser. Fixed in the same commit as this file:

| Bug | Fix |
|---|---|
| Text pasted before a round could be brought back inside the round with Redo, unlogged | Switching "Round doc" clears the undo history; undo and redo in a round doc are logged (`useUndo` in `Flow2Editor.tsx`) |
| Sheet names in a round flow took pasted text, with no limit and no log | Paste and drop blocked on both rename fields, 80-character cap, renames logged |
| One Undo took back a whole run of typing across many cells; Redo did nothing once the cell you were in was gone | Each change to the flow's shape starts its own undo step; Ctrl/Cmd+Z and Y work with no cell focused |
| The toolbar could act on a different sheet than the one with the caret | The sheet reports to the toolbar every time a cell takes the caret |
| Emoji could be saved as broken characters (the text diff cut them in half) | `diffText` never splits a pair (`textBinding.ts`) |
| An answer whose argument a partner deleted at the same moment vanished from Excel export and History | `readSheet` reads such cells as roots; a cell in a column the sheet lacks is clamped (it crashed export) |
| Two people adding a row at the same place saw different orders forever | Ties break by cell id |
| Two restores at once listed every sheet twice | `readFlow` lists a sheet once |
| New round wrote hidden "Gov case / Resolution" lines into a flow's record and into search | Flows start empty (`Rounds.tsx`) |
| A doc opened from the flow (pin, search) could open in a hidden pane | Opening a doc shows the docs panel; pane limit respects small screens |
| Flow view settings of the last person stayed on a shared computer | `pp-flow2-*` keys are cleared on sign-out (`device.ts`) |
| Holding Backspace deleted cell after cell and ate the text above | A held key stops at the empty cell |
| Enter, Tab and arrows fired in the middle of typing with an input method | Cell keys wait while composing |
| Smaller: old jump stole the caret when a sheet was redrawn; search jump lost if the flow had not loaded; box-select picked hidden cells; clicks beside the pins column made a cell in the last speech; dragging one sheet moved the others; closing a second window cleared your cursor for partners; lists inside the canvas could not be scrolled; React key warning in the toolbar; import ran one change per cell | Fixed |

## Open work, in order

### 1. Before the pilot (correctness of the round record)

These are not fixed. They are the first things to do after the merge, before students use flows in a real round.

1. **The server's record of a flow reads badly and over-counts.** `worker/measure.ts` pulls typed text out of each Yjs update. For flows: text from different cells runs together with no separator ("answer texta claim of"); each change of a number or mark counts as a deleted character (rename 1, sheet move 2, unlink 2), which pads the "deleted" column on the check page; and typed sheet names count as nothing (they are only in the client log). Make `measureUpdate` flow-aware: a separator per new cell, ignore non-text map writes, count the `name` value as typed text. Tests: `tests/measure.test.ts`, `tests/flow2-record.test.ts`.
2. **Restoring a round flow from History is flagged as one large edit by the restorer**, including the partner's text (`src/flow2/restore.ts`, `worker/summary.ts`). The client logs a `restore` event; the server should excuse an update that arrives with one. The same applies to undoing the delete of a long cell. Decide with the owner whether restore should be allowed in a round doc at all.
3. **The resolution typed in New round is not shown anywhere on a flow.** Store it in the doc's `settings` map and show it in the Round info panel and the sheet list header.
4. **A remote edit while someone is composing with an input method overwrites their text box** (`fromY` in `textBinding.ts`). Hold remote changes during composition and rebase the composed text on the current text at the end. Needs a real-browser test with an IME.
5. **A two-browser round test in the repo.** The Playwright checks used so far live outside the repo and are lost with each session. Add `tests/e2e/` with one script that runs against `wrangler dev --var DEV_LOGIN:1`: two people in a round flow, typing, blocked paste, undo and redo, rename, check page text. Run it before every deploy.

### 2. Flow editor quality

6. **Cell height is measured too early** at some zooms (a wrapped last line is clipped). Port Flowist's approach (`sheet/editor/cell-editor-layout.ts`, pretext measuring) or re-measure after fonts load and on zoom.
7. **Row order maths.** `orderAfter` uses float midpoints (53 inserts in one gap exhaust it), and `createSibling` and `groupCells` compute among same-column roots while roots sort across all columns. Compute against all roots and renumber when a gap gets small.
8. **Group frames** span from the first to the last member without checking they are still next to each other (`layout.ts`); an inserted cell ends up inside the frame.
9. **Deleting a root drops its blank rows** (`gap`), so everything below jumps up (`deleteCell`).
10. **Pointer handling:** no `pointercancel` on sheet drag, canvas pan, sidebar resize or box-select; a cancelled drag keeps following the pointer. Also cancel the camera animation frame on unmount and destroy the `UndoManager`.
11. **Small UI gaps:** Esc cancels link mode only while a cell has the caret; the cross-apply picker does not close on an outside click; a partner's caret mark drifts after a remote edit until they move; per-sheet view keys in localStorage are not removed when a sheet is deleted.
12. **Share selected text between partners** (the owner was offered this and left it for later): send selection start and end in the `flow2` presence field, draw a band with `caret.ts`.
13. **Split `Flow2Editor.tsx`** (about 1,350 lines): `SheetView`, `Cell`, `WindowBar` and the key handling into their own files, with no behaviour change. Do this before adding features to it.

### 3. Import and export

14. **Excel round trip is not exact** (`src/import/flowImport.ts`): an unlinked cell in a later column comes back as an answer to the row above; blank rows are dropped; text that really starts with "→ " or "✓ " becomes a mark; a column whose heading is not a speech is dropped silently; a data row like "MG | MO" can be taken for the heading row. Write our own exports with a hidden marker so they can be read back exactly, and tell the user what was skipped for other files.
15. **Large files are slow:** each new cell re-reads every cell (3,000 cells 1.6 s, 12,000 cells 25 s), and `layoutFlow` and `flowRows` are quadratic too. Build a parent-to-children map once per pass.
16. **Excel limits:** cap cell text at 32,767 characters, strip U+FFFE/U+FFFF, clean apostrophes at the ends of sheet names.
17. **Word export of a flow** (a table per sheet) if the owner wants it; the `docx` library is already a dependency.

### 4. Server, cost and deploy

18. **The pins column keeps up to 40 docs open and syncing** while it shows (`useLibrary`). Index on demand, or keep only docs that have pins open.
19. **Fonts are embedded in the Worker as base64** (the bundle is 2.24 MB of a 3 MB limit, and decoding is slow on a cold start). Serve them as Workers static assets.
20. **The build stamp comes from `git rev-parse`**, so a deploy from uncommitted changes is labelled with the wrong commit. Refuse to stamp a dirty tree, or add "-dirty".
21. Everything still open in BUGS.md and EFFICIENCY.md.

### 5. Clean-up

22. **Docs still carry flow leftovers:** the speech tag menu in the doc toolbar and `src/model/flow.ts` only made sense when a doc could be shown as a flow. Ask the owner whether docs should keep speech tags; if not, remove them and the file.
23. **`src/styles.css` is about 5,000 lines in one file.** Split by area (shell, doc, flow, dialogs).
24. **HANDOFF.md is 380 lines with a one-paragraph header that lists every deploy.** Move the deploy history to a changelog and keep HANDOFF to the current state.
25. **Accessibility pass:** every cell is labelled just "Cell" (say the speech and row); the sheet menu has no Escape or arrow keys; the sidebar resize handle is mouse only.

## How to verify a change

- `npm test` and `npm run build` before every commit (AGENTS.md).
- For anything on screen: `npx vite --port 5199 --host 127.0.0.1` (local-only, no accounts) and drive it with Playwright (Chromium is preinstalled in the cloud sessions).
- For anything about accounts, partners or the record: `npm run build`, then `npx wrangler dev --port 8793 --var DEV_LOGIN:1`; `/api/auth/dev?name=Ann` signs a test user in.
- A fix to a bug in this file is done when a test fails without it and passes with it.
