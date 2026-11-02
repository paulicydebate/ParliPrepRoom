# Notes for AI assistants and developers

Read [PLAN.md](PLAN.md) first, then [README.md](README.md).

- Project: a parli debate prep app. The user tests with their team and works with several LLMs; keep docs current so anyone can pick up from GitHub.
- This repo is a clean start. Do **not** copy code from CardMirror / CardMirror-Green (PolyForm Noncommercial license). Re-implementing ideas is fine.
- Core idea: one document model (styled outline blocks with stable ids) rendered as a doc now and as a flow later. Don't create a separate data format for the flow.
- Documents are Yjs docs (field `default`) so live co-editing (Phase 3) and the typing log (Phase 4) build on the same edit history.
- Before committing: `npm test` and `npm run build` must pass.
- Don't commit real student prep or coach files. Synthetic examples only.
