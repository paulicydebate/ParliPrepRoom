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
| `src/editor/` | TipTap/ProseMirror pieces: the styled block node, folding, schema. |
| `src/store/` | Local storage: document list, open-document registry (Yjs + IndexedDB), versions, sample content. |
| `src/history/diff.ts` | Block-level comparison between versions. |
| `src/settings/` | Fonts, themes, per-style appearance. |
| `src/ui/` | React components. |
| `tests/` | Unit tests. |
