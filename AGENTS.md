# Notes for AI assistants and developers

Read [HANDOFF.md](HANDOFF.md) first (current state, branch to use, next steps), then [PLAN.md](PLAN.md) and [README.md](README.md).

- **After every change, update HANDOFF.md in the same commit** (what changed, current state, next steps). Several different AI assistants work on this repo.

- Project: a parli debate prep app. The user tests with their team and works with several LLMs; keep docs current so anyone can pick up from GitHub.
- This repo is a clean start. Do **not** copy code from CardMirror / CardMirror-Green (PolyForm Noncommercial license). Re-implementing ideas is fine.
- Core idea: one document model (styled outline blocks with stable ids) rendered as a doc now and as a flow later. Don't create a separate data format for the flow.
- Documents are Yjs docs (field `default`) so live co-editing (Phase 3) and the typing log (Phase 4) build on the same edit history.
- Before committing: `npm test` and `npm run build` must pass.
- Don't commit real student prep or coach files. Synthetic examples only.
