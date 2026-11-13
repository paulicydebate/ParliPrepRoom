# Bug analysis: problems likely to be present

Written 2026-11-04 by Claude after reading the server and the riskiest app code and testing the suspicious parts. The goal: find bugs we haven't hit yet, because so far only a few people have tested with almost no real prep.

How to read this: **Confirmed** = reproduced or measured here. **Code** = the code can only behave this way (read it; no run needed). **Estimate** = a calculation or a likely scenario that should be checked against real numbers. Items marked **FIXED** were fixed on 2026-11-04; the rest are open. When you fix one, change its line here and add a test (`tests/directory.test.ts` runs the real server rules on an in-memory database).

Cloudflare limits below are from memory of the Free plan (a documentation page could not be opened from this session); check them in the Cloudflare dashboard before relying on them.

## Read this first

The Workers **Free plan will break the app at real prep volume**, in ways that look like random failures. The cheap fix for most of items 1–3 is the **Workers Paid plan (about $5 a month)**, which raises those limits by orders of magnitude. Earlier advice that the free plan "should cover a team" holds only for light testing like we have done so far.

## High priority (fix before the pilot)

### 1. A signed-out visitor can read the last user's docs (shared computers) — Confirmed — FIXED 2026-11-04
- **What:** documents are cached in the browser (IndexedDB). Signing out does not clear them. After one student signs out, the next person on that browser, even signed out, sees the sidebar list and can open and read the private doc. Local version history, typing logs, pins and layout also stay. Signing in as someone else hides the docs from the list but leaves the data on the device.
- **Why it matters:** school Chromebooks are shared.
- **Reproduced:** sign in as Alice, type text, sign out, reload: the doc is listed and its text is readable. Script: scratchpad `shared-device.cjs`.
- **Fixed** (`src/store/device.ts`, `src/store/idb.ts`, `tests/device.test.ts`): the device remembers whose data it holds (`pp-data-owner`). **Sign out** deletes this person's docs, versions, typing logs, pins and layout (asks first if a doc has changes that haven't reached the server). **A different person signing in** wipes the last person's data first and reloads. **A session that ended without signing out** hides account docs from the next (signed-out) visitor and keeps them for the same person to return to. Appearance and other preferences are kept. Deleting an account also wipes the device.
- **Limits still true:** data created before this fix has no owner mark, so the first person to sign in after the deploy claims it; docs made while signed out stay visible to the next signed-out visitor (that is local-only mode); and someone with developer tools could still read a hidden session-ended person's data from the browser's storage until the next sign-in or sign-out.

### 2. Check page and tab-room pages are too slow for the Free plan's CPU limit — Estimate from a measurement
- **What:** building the check page takes about 80 µs per saved edit: **about 108 ms for 1,000 edits, 411 ms for 5,000, 1.5 s for 20,000** (measured in Node, linear). Free-plan Workers get about 10 ms of CPU per request. A real prep session is thousands of edits (one per key press), so these pages will fail (Cloudflare error 1102) for any real round doc. Today's test docs are tiny, which is why nothing has failed.
- **Also:** `GET /api/docs/<id>/log` (History and Replay) returns every edit base64-encoded in one JSON response; same scaling problem.
- **Fix:** Workers Paid (30 s CPU) removes the limit. Separately, make the page cheaper: group edits into bursts before building HTML and cap the detailed list; page the log endpoint. Effort: paid plan is a setting; optimizing is medium.

### 3. Database limits will be hit, and the failure silently loses the record — Code + Estimate (parts (a) and (b) FIXED 2026-11-04)
- **Rows written:** every saved edit is one database row (`updates` table). Free plan: about 100,000 rows written per day. One student typing for a 20-minute prep is about 4,000 rows. A team doing a few prep sessions a day gets close; a tournament weekend exceeds it. (Measured so far: about 4,200 rows written on the busiest test day.)
- **Failure mode (Code):** `worker/docRoom.ts` chains writes as `this.writes = this.writes.then(async () => { …INSERT… })`. If one INSERT throws (limit reached, row too large), the chain becomes a rejected promise and **every later write is skipped, silently, until the room restarts**, while edits are still relayed to partners. The hash-chained record then has a hole, and `await this.writes` in message handlers starts throwing.
- **Rows read (Code):** `webSocketMessage` calls `loadDoc()` before looking at the message type, so even the small 15–20 second keep-alives and cursor updates make a woken room re-read and re-apply the **whole history** from storage. With hibernation that can happen every 15–20 seconds per open doc. A doc with 4,000 edits left open in one idle tab could read up to about 17 million rows a day against a Free limit of about 5 million. (Cloudflare analytics show only about 28,000 rows read on the busiest day so far because the docs are tiny.)
- **Fix:** (a) **FIXED**: errors are caught inside the write chain, later saves continue, and the failure is recorded as a `save-failed` event that shows as a red flag in Coach view, the tab room and the check page (`tests/docroom.test.ts`); (b) **FIXED**: `loadDoc()` now runs only for edits, not for cursor updates and keep-alives (tested); still open: (c) save one row per second per person (merge updates with `Y.mergeUpdates`, keeping attribution) instead of one per key press; (d) periodically store a snapshot so loading reads one row; (e) Workers Paid. (a) and (b) are small.

### 4. Undo and Redo get flagged as "large single edits" — Confirmed — FIXED 2026-11-13
- **Fixed:** the server marks an edit `restored` when every line it puts in was deleted earlier in the doc since it became a round doc (`isRestore` in `worker/measure.ts`, `DocRoom.record` and the running counts); the check page, Coach view and summary do not flag those. Text deleted before Round doc was switched on does not count, so prep pasted before the round cannot be brought back unflagged. Test: `tests/docroom.test.ts`.
- **What:** deleting a paragraph and pressing Undo re-inserts it in one edit. The server counts it as 116 typed characters in a single edit (over the 40-character limit), so an honest student gets a red "large edit" flag in Coach view and on the check page.
- **Reproduced:** typed about 115 characters in a round doc, Ctrl+A, Delete, Ctrl+Z, then read `/api/docs/<id>/record`: one live update inserting 116. (Splitting a line with Enter and rejoining it with Backspace did *not* trigger it.)
- **Fix:** treat an insert as a restore when its text equals text that same person deleted earlier in that doc (the server already tracks deleted text by item id in `worker/measure.ts`). Effort: small to medium.

### 5. A student removed from the team keeps access to their docs there — Confirmed — FIXED 2026-11-04
- **What:** `canAccess` in `worker/directory.ts` returns true for the doc's owner before checking that the owner is still on the team. A removed student can still open, edit and sync the docs they own in that team, including round docs.
- **Reproduced:** `tests/directory.test.ts`, test marked `it.fails` under "known bugs".
- **Fixed:** team docs now require current membership for the owner too (`canAccess` and `deleteDoc` in `worker/directory.ts`); tests in `tests/directory.test.ts` ("removing someone from the team"). Coaches keep access; the person can still use docs outside the team and rejoin with the invite link.

### 6. A refused connection retries forever — Confirmed in the library; Code in the app — FIXED 2026-11-04
- **What:** y-websocket reconnects every 2.5 seconds with no limit (`maxBackoffTime`). When the server refuses (student removed, partner left, doc deleted or made private, expired session), the open tab keeps trying: about 34,000 refused requests a day per tab against the Free plan's 100,000 requests a day for the whole app. Observed in testing as repeated `403` lines for the same doc.
- **Fixed:** `guardReconnects` in `src/store/sync.ts`: stops on "no access" (close code 4403) and after 5 attempts in a row that never connect, then checks `/api/docs/<id>` before reconnecting; if refused it stays stopped and shows a message; an ordinary dropped connection still reconnects by itself. Tests in `tests/reconnect.test.ts`. Not testable in the local dev server (it does not deliver the server's disconnect), so worth watching after deploy.

## Medium priority

### 7. Blank screen if the browser blocks local storage — Confirmed
With IndexedDB blocked (some private or locked-down browser profiles), the app shows only the top bar: no docs, no panes, no message. Fix: catch the failure in `listDocs` / `acquireDoc`, run in memory with a visible banner, and say what to change. Small.

### 8. The typing record can be fooled in several ways, and the README/guide wording should say so — Code
Hard flags exist only for obvious pastes (over 40 characters in one edit), blocked-paste events, round doc turned off, and a broken hash chain (`worker/summary.ts`). Not detected:
- **A macro or typing simulator** typing at human speed (no rate check, no look at how little was corrected).
- **Scripted inserts of 40 characters or less** at a time.
- **Text typed or injected while offline.** It arrives as "catch-up"; it is shown as a chip when 20 or more characters, but it is **not counted in `flags`**, so the doc still reads "Nothing flagged". Also any catch-up within 15 seconds of the doc's first save is treated as starting content and ignored (`STARTING_MS`).
- Offline paste-block events are reported by the client, so a modified client can omit them.
Ideas: flag sustained rates over about 12 characters per second, flag text with almost no backspacing, and count large catch-up as a flag. Be honest in the guide that it proves what happened inside the app, not who or what was pressing the keys.

### 9. Browser storage grows without limit — Code
Every 2 minutes of editing saves a full copy of the document into IndexedDB (`src/store/registry.ts`, `src/store/versions.ts`); old ones are never pruned. Each doc also keeps its own database even after it is deleted by someone else. On a small Chromebook this eventually hits the storage quota and writes fail. Fix: keep the last N auto-saves, thin out old ones, and clear data for docs the server no longer lists.

### 10. No offline start, and starting offline silently becomes "local only" — Code
There is no service worker, so the page cannot load without internet (open tabs keep working and merge on reconnect: tested). If the app starts offline, `/api/health` fails, the app acts as if there is no server (asks for a name, creates local-only docs) and does not recover until reload. Fix: retry the health check; consider a service worker for the app shell.

### 11. Invite links are permanent bearer links; no way to leave a team — Code
Anyone holding the Students link joins immediately and can read all team-wide docs; the Coaches link makes anyone a coach (sees every round doc, can remove members). There is no approval step and links never expire (coaches can replace them). There is no endpoint for a student to leave a team. Fix: optional "approve new members", expiry, a Leave team button.

### 12. Students can edit and vandalize coach briefs — Code (known open decision)
Reference docs are open to the whole team for editing. Version history can restore them, but nothing stops it. Pending decision: read-only for students.

### 13. Timer attaches to whichever round doc is focused — Code
`TimerHost` picks the focused round doc's shared timer, else any open round doc. With two round docs open, clicking between panes silently switches which timer you are looking at. Fix: attach the timer to one chosen doc.

### 14. Sessions are a fixed 60 days, with no "sign out everywhere" — Code
Minor, but relevant to shared computers (see item 1).

### 15. One database object handles every API call — Code
`Directory` is a single Durable Object, so all sign-ins, doc lists and checks go through one place. Fine for one school; a ceiling of roughly hundreds of requests per second and a single point of failure if many teams join.

### 16. Old pages keep running after a deploy — Code
`index.html` is `no-cache` but an already-open tab keeps its old code until reloaded; API changes have been additive so far. Keep that rule, or add a "new version available, reload" notice.

### 17. Safari storage clearing — Estimate
Safari clears website storage for sites not used for about 7 days. On iPads that would wipe local pins, layout and settings, and any unsynced offline edits. Server-saved docs are safe. Pins are the most exposed (local only).

## Checked and fine (no need to re-check)
- **Script injection:** doc titles, team names, tournament names, user names and round labels with HTML were all escaped on the check page, the tab-room list and the director's doc page.
- **Cross-site requests:** changing requests need a same-origin `Origin`, cookies are `SameSite=Lax`, the sync socket checks origin too.
- **Sign-in:** state check, issuer, audience, expiry and verified-email checks are present; the dev login only works on localhost.
- **Invite codes and tokens:** 72-bit invite codes, 96-bit check tokens, 6-letter tournament codes (guessing is impractical).
- **Offline editing:** two people editing, one offline, merged correctly with all text on both sides after reconnecting.
- **Imports:** empty Word/CSV/text files produce a valid empty doc, not a crash.
- **Flow:** sheets with more than 150 rows lay out correctly.
- **Honest edits not flagged:** splitting and rejoining lines.
- **Access rules:** 26 automated tests cover team docs, private docs, invitations, deleting, restoring and tournament locks.

## Suggested order
1. ~~Item 5, item 6, and parts (a) and (b) of item 3~~ done 2026-11-04.
2. Item 1 (shared-computer leak).
3. Decide on Workers Paid; then item 2 (check page cost) and the batching in item 3.
4. Item 4 (undo false flags) and item 7 (blank screen).
5. The rest as the pilot shows what matters.
