# ParliPrepRoom: what to do next

The open work, in order, and the rules that come with it. Updated 2026-11-13. The current state is in [HANDOFF.md](HANDOFF.md); how things got here is in [CHANGELOG.md](CHANGELOG.md).

## Rules that do not change

1. **The owner merges and the owner says "deploy".** Never merge PR #1 or deploy the live site yourself. The preview Worker is fine to redeploy. Until PR #1 is merged, do not deploy the live site from `main` (it still has the old flow).
2. **A round doc must only hold text that was typed there, and every edit must be in the record.** Any new way to put text into a flow (a field, a shortcut, an import, an undo path) has to block paste and log the edit. Treat a gap here as the most serious kind of bug. `npm run e2e` checks the main paths; extend it when you add one.
3. **Credit Flowist** in the header of any file adapted from it and in README Credits. Elli asked agents to re-read Flowist's `AGENTS.md` and `docs/COLLAB.md`; on 2026-11-12 `COLLAB.md` was not in `paulicydebate/flowist-reference`. **Check again before more Flowist code is adapted, and follow it.**
4. **The owner is a coach, not a programmer:** plain-language updates, outcome first. Update HANDOFF.md and this file in the same commit as any change.

## Owner's decisions (2026-11-13)

1. **Speech tags in docs: removed.** The doc toolbar's speech menu, the speech labels in docs and in their Word export, and `src/model/flow.ts` are gone. Old docs keep their `speech`, `answers` and `newRow` attributes in the schema so they still open; nothing uses them.
2. **Word export of a flow: added** (`src/export/flowDocx.ts`, download menu on a flow: a landscape table per sheet, same rows as Excel).
3. **No restoring a round doc from History:** both Restore buttons are off while Round doc is on (`ROUND_NO_RESTORE` in `src/editor/roundGuard.ts`). Turning Round doc off first is still possible and is recorded and flagged.
4. **Deployed** to the live site.

## Open work

### 1. Next up

1. **Serve the built files as Workers static assets** instead of embedding them in the Worker. The Worker bundle is 2.24 MB (1 MB compressed), fine under the Paid plan's limit, and the font decode was made several times faster on 2026-11-13, but it still runs on each cold start. Blocked in the cloud sessions: asset uploads fail through the credential proxy (CHANGELOG.md, "Live at"). Needs a deploy from the owner's computer or CI, and `run_worker_first` for `/api/*`, `/check/*`, `/guide` and `/admin` so the server routes still work.
2. **Everything still open in BUGS.md and EFFICIENCY.md**, in the order those files give.
3. **An end-to-end test for New round** (the dialog, the resolution on the flow and in Round info, the partner invitation). Checked by hand on 2026-11-13; add it to `tests/e2e/`.

### 2. Polish, when there is time

4. **More than one partner in one cell:** only the first partner's caret and selection are drawn.
5. **Accessibility:** a keyboard-only pass of the flow (moving between sheets, the canvas, the toolbar) and a screen-reader pass of the cell labels and the check page.
6. **Phones:** the flow is usable but cramped; decide with the owner whether phones get a one-column view.

## Done on 2026-11-13

The review, its findings and the fixes are in CHANGELOG.md (section "Review and fixes"). In short:

- **Round record:** redo of pre-round paste, paste into sheet names, a flow's text on the server running together, marks and moves counted as deletions, sheet names not recorded, Undo and restores flagged as large edits (BUGS #4), New round writing hidden lines into flows. The resolution now shows on the flow and in Round info.
- **Editing:** undo steps, emoji, the toolbar's target sheet, held Backspace, input methods (keys, and a partner's edit while composing), row order with many inserts or two people at once, group frames, blank rows kept on delete, cell heights after columns slide or fonts load, pointer cancel, Esc and the cross-apply picker. Partners now see each other's selected text.
- **Two people at once:** orphaned cells, cells in a missing column, duplicate sheets after two restores.
- **Excel:** files made here come back exactly; other files keep blank rows, say which columns they skipped, and are not fooled by a line saying "MG | MO"; 12,000 cells import in about a second; Excel's limits respected.
- **Code:** `Flow2Editor.tsx` split into `SheetView`, `Cell`, `WindowBar`, `RefPicker` and `flowHooks`; `styles.css` split into ordered files with identical output; dead styles removed; HANDOFF.md moved to CHANGELOG.md and rewritten; the build stamp says `-dirty` for uncommitted builds; a pins column keeps open only the docs that have pins; cell labels, the sheet menu and the sheet-list resize handle work for keyboard and screen-reader users.
- **Tests:** 219 unit tests and a two-browser round test (`npm run e2e`, 20 checks).
