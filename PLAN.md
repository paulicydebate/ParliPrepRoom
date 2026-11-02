# ParliPrepRoom — Plan

Status: draft for review (2026-11-02). Nothing is built yet.

## 1. The goal

A prep app for NPDA/NPTE parli students that:

- Reads and types like a doc, and works as a flow like a spreadsheet or Flower.
- Lets partners co-prep live during the 20 minutes of prep.
- Proves the prep was typed, not pasted.
- Lets the member speakers (MG/MO) find their prepped blocks fast in round.
- Looks modern, with fonts and named styles you can choose.

## 2. Why start fresh instead of continuing CardMirror-Green

- **License.** CardMirror is PolyForm Noncommercial. Anything built on it can never be sold or licensed to a league or school, even cheaply. A clean repo keeps that option open.
- **Wrong center of gravity.** CardMirror is built around policy/LD evidence (Verbatim compatibility, cards, cites, OpenCaselist). Parli has no cards. Most of its code, and most of the "paste-like" paths LOCKDOWN.md had to block, are features parli doesn't need.
- **Desktop-first.** It's an Electron app with separate Windows/Mac builds. Many students prep on Chromebooks and iPads, and need a link they can open with their partner.
- **Flow and doc are separate things.** In CardMirror, the flow is a grid next to documents. The core idea below needs them to be one thing.

What we keep is the **design work**, not the code: the flow layout (LOR/PMR columns, Prep column, colorways, Classic sheet), the list of everything that counts as paste, and the hash-chained typing log with a seal code. We re-implement those cleanly.

## 3. The core idea: one prep, two views

The docs-vs-flow tradeoff exists because they're stored differently. Here, there's one data model and two ways to look at it.

Every piece of prep is an **outline block** with a style:

```
Position title     "Gov: Ban facial recognition"
  Section title    "Advantage 1 — Wrongful arrests"
    Claim          "FRT misidentifies Black faces at 10–100x the rate"
      Warrant      "NIST 2019 ..."
```

Each block can also be tagged with a **speech** (PMC, LOC, MG, MO, LOR, PMR) and **linked** to the block it answers.

- **Doc view:** blocks render as a styled document — fast to read and type into, like Google Docs.
- **Flow view:** the same blocks render as columns (one per speech) and tabs (one per position), like your sheets template or Flower. Answers sit next to what they answer.
- Typing in either view edits the same prep, so there's no copying between them (which would itself look like pasting).

**Split view:** any two (or three) panes side by side — doc + flow, your doc + partner's doc, case + block file. Each pane is independent.

## 4. Features

### Writing
- Named styles: Position title, Section title, Claim, Warrant, plus Analytic and Note. Keyboard shortcuts for each (e.g. Cmd+1…4) and a "promote/demote" key.
- Per-style font, size, color. Ship 6–8 good fonts (Inter, Source Serif, IBM Plex, Atkinson Hyperlegible, etc.) plus themes (light, dark, Classic sheet).
- Collapse/expand any heading. Outline sidebar for navigation.

### Co-prep
- A **Prep Room** per round: resolution, side, partner(s), and a shared 20-min timer.
- Live multi-cursor editing in both views (Google Docs-style), each person's text tinted by author if wanted.
- Works offline and syncs when back online.

### Integrity (anti-paste)
- **Prep Mode** starts with the timer. Paste, drop, and all insert-from-elsewhere paths are blocked; attempts are logged.
- Every edit is already recorded by the sync engine with author and timestamp. We add:
  - a **hash chain** over those edits, so a changed log is detectable;
  - **server receipts**: the server stamps the chain every few seconds. This is stronger than CardMirror's local-only seal, because the student's own computer can't rewrite history the server already saw.
  - a **seal code** at end of prep for the judge/opponent.
- **Replay viewer:** scrub through prep keystroke by keystroke, with flags for bursts (e.g. 200 characters in under a second), long gaps, and time spent in other tabs.
- Shareable integrity report (link or PDF) for a tournament or coach.
- Limit to state plainly: it proves what happened inside the app. It can't stop someone retyping from a phone.

### Round Mode (member speeches)
- One tap ends prep and switches to Round Mode: read-only prep (or edit-but-logged, configurable), big readable type, offline.
- **Block finder:** a search box (Cmd+K) across everything prepped — by keyword, position, style, speech tag. Results show the claim line; Enter opens the block in a pane.
- **Pin board:** pin blocks you expect to use (e.g. "MG: answers to the DA") into a side pane in speaking order.
- The flow view stays live for flowing the round, with prepped blocks dropped into the right column by reference (a link to your own prep, not a paste).

### Import/export
- Export to .docx (styled) and .xlsx (your flow template layout), and PDF.
- Import from Google Docs/Sheets/Flower files **outside** prep only (pre-written blocks, theory shells), clearly marked as imported so the log stays honest.

## 5. Proposed tech

| Piece | Choice | Why |
|---|---|---|
| App | Web app (PWA), TypeScript + React | Runs on Chromebooks, iPads, Macs, Windows from a link; installable; works offline |
| Editor | TipTap (built on ProseMirror) | Same engine family you know from CardMirror; good for styled outline blocks |
| Flow grid | Custom React grid on the same doc model | Spreadsheet libraries can't share the doc's data |
| Live sync | Yjs (CRDT) | Mature, works offline, every edit has an author and order — the base of the log |
| Sync server | Hocuspocus (Yjs server) | Stores edit history, issues the log receipts |
| Accounts + data | Supabase (Postgres + auth, Google sign-in) | Students already have Google accounts |
| Hosting | Fly.io or Railway (sync server), Cloudflare/Vercel (app) | Cheap at team scale |
| Desktop later | Tauri wrapper, if needed | Small, only if a lockdown-style desktop mode becomes important |

## 6. Build phases

Each phase ends with something you can use and test with a student.

1. **Editor core** (1–2 weeks of sessions): new repo scaffold, doc view, the six styles, fonts/themes, outline sidebar, local save, split view. *Test: prep a case solo.*
2. **Flow view** (1–2 weeks): flow grid on the same model, tabs per position, speech columns, Prep column, colorways ported from Green, xlsx/docx export. *Test: prep in doc, flow in grid.*
3. **Co-prep** (1–2 weeks): accounts, Prep Rooms, live sync, presence cursors, timer, offline. *Test: two partners prep one round.*
4. **Integrity** (1–2 weeks): Prep Mode paste blocking, hash chain, server receipts, seal code, replay viewer, report. *Test: a coach reviews a prep log.*
5. **Round Mode** (1 week): block finder, pin board, prepped blocks in the flow, offline round use. *Test: an MG speech from prepped blocks.*
6. **Polish + pilot** (ongoing): visual design pass, onboarding, import, a team pilot at a tournament.

## 7. Open questions for you

1. **In-round devices:** at your tournaments, can students use laptops in round, and is internet allowed? (Decides how much Round Mode must work offline.)
2. **Who checks the log?** Coaches, opponents, tab room, or just self-policing? (Decides how formal the report is.)
3. **Doc and flow as one model** — does that match how your students think, or do they want a doc and a flow that are fully separate?
4. **Web app first** OK, with desktop later only if needed?
5. **Pre-written prep:** should students have a personal library (theory shells, generic DAs) available during prep? Allowed under your rules if typed before the round?
6. **Who it's for at first:** your team only, or other schools too? (Affects accounts, cost, and how much we polish sign-up.)
