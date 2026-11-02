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
- Prep docs and Reference docs (coach briefs). Reference docs are editable for now; the prep lockout comes in Phase 4.
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

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest + jsdom)
npm run build      # typecheck + production build in dist/
```

## Layout

| Path | What |
|---|---|
| `src/model/blocks.ts` | The named styles and their outline rules. No UI code. |
| `src/model/speeches.ts`, `src/model/flow.ts` | Speeches and the rules that turn the doc into a flow (pure functions, tested). |
| `src/editor/flowView.ts` | The flow editor: grid placement, sheets, cell commands. |
| `src/export/` | Word and Excel export. |
| `src/editor/` | TipTap/ProseMirror pieces: the styled block node, folding, schema. |
| `src/store/` | Local storage: document list, open-document registry (Yjs + IndexedDB), versions, sample content. |
| `src/history/diff.ts` | Block-level comparison between versions. |
| `src/settings/` | Fonts, themes, per-style appearance. |
| `src/ui/` | React components. |
| `tests/` | Unit tests. |
