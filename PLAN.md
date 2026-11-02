# ParliPrepRoom — Plan

Status: draft v2 (2026-11-02), updated with answers to the open questions. Nothing is built yet.

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
| During prep | Open in a side pane, read-only, searchable | Editable, logged |
| In round | **Locked out** | Fully available in Round Mode |

You can't copy, drag or link from the library into prep. Retyping by hand is the point, and the log shows it.

## 4. Features

### Writing
- Named styles: Position title, Section title, Claim, Warrant, plus Analytic and Note. Keyboard shortcuts for each (e.g. Cmd+1…4) and a "promote/demote" key.
- Per-style font, size, color. Ship 6–8 good fonts (Inter, Source Serif, IBM Plex, Atkinson Hyperlegible, etc.) plus themes (light, dark, Classic sheet).
- Collapse/expand any heading. Outline sidebar for navigation.

### Reference library
- Team library of coach-written docs (generic DAs, theory shells, topic briefs), organized in folders with tags.
- Same styles and outline as prep, so it reads the same.
- Fast search during prep. Opens in a pane next to your prep.
- Import from Google Docs, Word, and Sheets, since paste is fine here.
- Round Mode hides the library. Limit: we can't stop someone opening it in another browser tab, but the app won't show it and the log records leaving the app.

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
- **Anyone can check.** Each prep gets a verify link and QR code. A coach, opponent, tab room or the student can open it with no account and see the replay, the flags, and whether the log is intact. A PDF version exists for printing.
- Limit to state plainly: it proves what happened inside the app. It can't stop someone retyping from a phone.

### Round Mode (member speeches)
- One tap ends prep and switches to Round Mode: prep stays editable (edits are logged), big readable type, library hidden. Internet is allowed, so it doesn't need to work offline, but it caches the prep in case wifi drops.
- **Block finder:** a search box (Cmd+K) across everything prepped — by keyword, position, style, speech tag. Results show the claim line; Enter opens the block in a pane.
- **Pin board:** pin blocks you expect to use (e.g. "MG: answers to the DA") into a side pane in speaking order.
- The flow view stays live for flowing the round, with prepped blocks dropped into the right column by reference (a link to your own prep, not a paste).

### Revision history
Very doable. The sync engine already keeps every edit, so history comes almost free.
- **Version list** like Google Docs: auto-saved points every few minutes, plus named versions ("before tournament", "coach edits").
- See what changed between two versions, colored by author.
- Restore an old version or copy a section back (outside prep; inside prep a restore only brings back text you typed in that same prep, and it's logged).
- Works for both prep and library docs.
- The prep version of this is the replay viewer above.

### Import/export
- Export to .docx (styled) and .xlsx (your flow template layout), and PDF.
- Import from Google Docs/Sheets/Word/Flower goes into the reference library only, never into prep.

## 5. Proposed tech

| Piece | Choice | Why |
|---|---|---|
| App | Web app (PWA), TypeScript + React | Runs on Chromebooks, iPads, Macs, Windows from a link; installable; works offline |
| Editor | TipTap (built on ProseMirror) | Same engine family you know from CardMirror; good for styled outline blocks |
| Flow grid | Custom React grid on the same doc model | Spreadsheet libraries can't share the doc's data |
| Live sync | Yjs (CRDT) | Mature, works offline, every edit has an author and order — the base of the log |
| Sync server | Hocuspocus (Yjs server) | Stores edit history, issues the log receipts |
| Accounts + data | Supabase (Postgres + auth, Google sign-in) | Students already have Google accounts. Teams, coaches and students are in the data model from day one so other schools can join later |
| Hosting | Fly.io or Railway (sync server), Cloudflare/Vercel (app) | Cheap at team scale |
| Desktop later | Tauri wrapper, if needed | Small, only if a lockdown-style desktop mode becomes important |

## 6. Build phases

Each phase ends with something you can use and test with a student.

1. **Editor core** (1–2 weeks of sessions): new repo scaffold, doc view, the six styles, fonts/themes, outline sidebar, local save, split view, revision history. *Test: prep a case solo with a reference doc open beside it.*
2. **Flow view** (1–2 weeks): flow grid on the same model, tabs per position, speech columns, Prep column, colorways ported from Green, xlsx/docx export. *Test: prep in doc, flow in grid.*
3. **Co-prep + library** (1–2 weeks): accounts, teams, coach library with import, Prep Rooms, live sync, presence cursors, timer. *Test: coach writes a brief; two partners prep one round from it.*
4. **Integrity** (1–2 weeks): Prep Mode paste blocking, hash chain, server receipts, seal code, replay viewer, public verify link/QR. *Test: an opponent checks a prep log from a link.*
5. **Round Mode** (1 week): library lockout, block finder, pin board, prepped blocks in the flow. *Test: an MG speech from prepped blocks.*
6. **Polish + pilot** (ongoing): visual design pass, onboarding, your team pilots it, then open sign-up for other teams.

## 7. Decisions so far

- Laptops and internet are allowed in round. Round Mode caches prep but doesn't need to be offline-first.
- The log must be checkable by anyone: coaches, tab room, opponents, the student. Hence the no-account verify link.
- One prep, two views: yes. Plus a reference library that coaches write in, readable during prep, hidden in round.
- Web app first; desktop only if needed.
- Students can consult anything during prep; only hand-typed prep is available in round.
- Pilot with your team, built so many teams can use it later.
- Revision history is in scope (Phase 1, with the prep replay in Phase 4).
