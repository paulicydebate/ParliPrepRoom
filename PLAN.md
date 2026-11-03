# ParliPrepRoom — Plan

Status (2026-11-03): Phases 1–5 are built and live at https://parlipreproom.paulicydebate.workers.dev. Phase 6 (polish and a pilot with the owner's team) is next. HANDOFF.md has the detailed state and deploy history; README.md says what works.

Legend below: ✅ live · 🔜 planned / open · ✖ dropped or changed.

Decisions that changed the original plan:
- No separate "Prep Mode": any doc can be a **round doc** (toggle, or **New round**). Team docs allow copy and paste; round docs block paste, record every edit on the server, and have a purple border opponents can see.
- Hosting is all Cloudflare (Workers + Durable Objects), not Hocuspocus/Supabase/Fly. One deploy, one bill.
- History, replay and the check page are built from the **server's** record (everyone's edits, with names), which students can't rewrite.

## 1. The goal

A prep app for NPDA/NPTE parli students that:

- Reads and types like a doc, and works as a flow like a spreadsheet or Flower.
- Lets partners co-prep live during the 20 minutes of prep.
- Proves the prep was typed, not pasted.
- Lets students read coach-written reference docs during prep, and retype what they need.
- Lets the member speakers (MG/MO) find their prepped blocks fast in round. In round they only get what they typed by hand.
- Keeps full revision history.
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

**Split view:** any two (or three) panes side by side — reference doc + your prep, doc + flow, your doc + partner's doc. Each pane is independent.

### Two kinds of content

| | Reference library | Prep |
|---|---|---|
| Who writes it | Coaches and students, any time before the round | Students, during the 20 minutes |
| Where it comes from | Typed, pasted, imported (Google Docs, Word, Sheets) — anything goes | Typed by hand only |
| During prep | Open in a side pane, searchable (read-only for students: planned) | Editable, logged |
| In round | **Locked out** | Fully available in Round Mode |

You can't paste or drag from the library into a round doc. Retyping by hand is the point, and the record shows it.

## 4. Features and status

### Writing
- ✅ Named styles: Position title, Section title, Claim, Warrant, Analytic, Note, with keys (Ctrl+1–6 on Mac, Alt+1–6 on Windows, F-key presets) and promote/demote.
- ✅ Fonts, sizes, colors per style; themes; colorways for the flow.
- ✅ Folding, outline sidebar, split view (up to 3 panes; 2 on tablets).
- ✅ Flow marks: extend, dropped, answered, key.

### Flow
- ✅ Same doc as a flow: a sheet per position, a column per speech, 150 rows, column-only copy, alternating column shades.
- ✅ Word and Excel export; Excel flows import back as flows.

### Reference library
- ✅ Reference docs beside prep; import Word, Excel, CSV, text, Markdown.
- 🔜 Students can read but not edit coach briefs (owner to decide).
- 🔜 Folders and tags (only if teams build big libraries).
- 🔜 Flower's own file format (export from Flower as a spreadsheet for now).

### Co-prep
- ✅ Accounts (Google sign-in), teams, student and coach invite links (resettable).
- ✅ Live co-editing with name-labeled cursors; works offline and syncs back (offline catch-up is labeled in the record).
- ✅ **New round**: round, side, resolution, partner, tournament code; opens doc and flow side by side.
- ✅ Shared timer on round docs: speech times, 2- and 1-minute flex, any custom length, ±1:00.
- 🔜 Emailed-link sign-in, if school Google accounts are blocked.

### Integrity (anti-paste)
- ✅ Round docs block paste and drag-in; leaving the app and switching off are logged.
- ✅ Server record: every edit with time, name and exact text (including deleted text), hash-chained.
- ✅ Check link + QR: anyone sees the summary; partners, coaches and the tab room see every character typed and deleted.
- ✅ Coach view: every round doc, flagged first. Deleted team docs stay visible to coaches (Recently deleted, deletion log).
- ✅ Tab room: tournament code for teams, private director link with full records. Tournament round docs can't be deleted.
- ✅ History by person and Replay (scrub or play every edit).
- Limit, stated plainly: it proves what happened in the app. It can't stop someone retyping from a phone.

### Round Mode (member speeches)
- ✅ Round Mode: only round docs open, purple top bar, logged on the check page.
- ✅ Block finder (Ctrl/⌘K), pinned blocks grouped by flow sheet, pins column inside the flow.
- ✅ Insert a prepped block (outside Round Mode, never into a round doc).

### Revision history
- ✅ Server history with names and colors, restore to any point; per-device saved versions too.

### Accounts and data
- ✅ Privacy page, delete my account, download all docs as a zip of Word files.

## 5. Tech as built

| Piece | Choice |
|---|---|
| App | Vite + React + TypeScript, served from the Worker |
| Editor | TipTap v3 (ProseMirror), one custom `block` node with stable ids |
| Flow | Decorations and CSS grid over the same doc (`src/model/flow.ts`) |
| Live sync | Yjs + y-websocket; IndexedDB copy for offline |
| Server | Cloudflare Worker; Durable Objects with SQLite: `DocRoom` (one per doc: live sync, hash-chained record, events) and `Directory` (users, teams, docs, tournaments, deletion log) |
| Sign-in | Google OIDC |

## 6. Build phases

1. ✅ **Editor core**
2. ✅ **Flow view**
3. ✅ **Co-prep**: accounts, teams, live sync, timer, New round
4. ✅ **Integrity**: round docs, server record, check page, history, replay, coach view, tab room
5. ✅ **Round Mode**: block finder, pins, pins column
6. 🔜 **Polish and pilot** (now):
   - Mock round with the team, including a school Google account.
   - Owner decisions: read-only coach briefs, custom domain, emailed-link sign-in.
   - Automated tests of the server's access and deletion rules.
   - Keep a running summary per doc so the tab room page stays fast at big tournaments.
   - Then open sign-up for other teams.

## 7. Decisions so far

- Laptops and internet are allowed in round. Round Mode caches prep but doesn't need to be offline-first.
- The record must be checkable by anyone: coaches, tab room, opponents, the student. Hence the no-account check link.
- One prep, two views (doc and flow) on one data model.
- Round docs instead of a separate Prep Mode; team docs allow copy and paste.
- Web app only; desktop only if needed.
- Pilot with the owner's team, built so many teams can use it later.
- Deleted team docs stay with the coaches; tournament round docs stay with the tab room.
- Don't copy CardMirror code (PolyForm Noncommercial). Re-implementing ideas is fine.
