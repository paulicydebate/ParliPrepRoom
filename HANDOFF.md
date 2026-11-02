# Handoff

**Read this first.** Several AI assistants work on this project. Whoever makes a change updates this file in the same commit: what changed, the current state, and what's next.

Last updated: 2026-11-02 by Claude (Claude Code cloud session).

## Where the code is

- Repo: https://github.com/paulicydebate/ParliPrepRoom
- **Latest work: branch `phase-3-server`.** Branches are stacked: `main` (plan only) → `phase-1-editor` → `phase-2-flow` → `phase-3-server`. Each one contains everything before it. Nothing has been merged into `main` yet; the owner hasn't decided that. Ask before merging or pushing to `main`.
- Start new work from `phase-3-server` unless the owner says otherwise.

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

- `worker/index.ts` + `wrangler.jsonc`: a Cloudflare Worker that serves the built app and `/api/health`. Tested locally with `npx wrangler dev`.
- **Not deployed yet.** A Cloudflare API token is stored as a network secret in the Claude Code cloud environment; requests to `api.cloudflare.com` get it added automatically. Cloudflare account ID: `cc1fffd57d89d16d2e28ed38e9a58cc1`. The owner must explicitly approve a production deploy. Once approved: `CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=cc1fffd57d89d16d2e28ed38e9a58cc1 npx wrangler deploy` (the placeholder token gets replaced by the real one on its way out).
- Alternative the owner was offered: connect the repo in the Cloudflare dashboard (Workers & Pages → Import a repository) so Cloudflare deploys on push.

## Next steps (Phase 3)

1. Deploy (waiting on the owner's OK), then confirm `/api/health` on the `workers.dev` address.
2. Live co-editing: one Durable Object per document, speaking the Yjs sync protocol over WebSocket. Keep IndexedDB as the offline cache.
3. Server-stamped log: the Durable Object records each update to a round doc with server time and user, so the student can't rewrite it. Public check page and QR per round doc.
4. Accounts: Google sign-in (free; the owner still has to create a Google Cloud OAuth client, steps not sent yet). Maybe an emailed-link fallback, since schools may block student Google accounts.
5. Teams: a coach creates a team and shares an invite link. Team docs are shared; round docs are visible to partners and coaches (default, not yet confirmed).
6. Upload the browser's local docs the first time someone signs in.

Questions still open with the owner: sign-in type (school vs personal Google accounts), round-doc visibility, custom domain, whether to open sign-up to other teams now, whether Doc and Flow should be separate document types.

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
- Known small issues: pane header gets crowded with 3 panes; color palette needs a design pass (owner called it "weird"); sidebar drag doesn't work on iPad touch yet; `npm audit` reports a high-severity `undici` issue inside `wrangler` (local dev tool only, not shipped to users).
