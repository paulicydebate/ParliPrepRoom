# Server efficiency plan

Written 2026-11-04 by Claude. Goal: keep what the app does (live co-editing with cursors, the typed-by-hand record, check pages, history and replay, coach view, invitations) while sending the server far less. **Step 1 is built, measured and deployed (2026-11-04); step 2 (F, G, H, I, J and the row-counter fix) is built and tested 2026-11-05, awaiting deploy; step 3 is not.** Figures marked **measured** come from `scripts/measure-traffic.cjs` (real browsers against a local server); figures marked **projected** are estimates from those measurements and need re-measuring after each change.

## Short version

Almost all server traffic comes from five things that are cheap to fix and none of which affects what a student sees:

1. **Cursor echo (bug in the sync library).** A browser re-sends every cursor update it receives, and the server relays the echo again. **Measured:** 3.08 messages to the server per typed character when 2 should do. With 3 or more people in a doc it grows faster (each cursor update is echoed by everyone else, then relayed to everyone).
2. **Cursor updates on every key press.** One per character typed, relayed to every partner.
3. **Idle presence.** An open doc nobody is typing in still costs about 16 messages a minute per tab (cursor presence renewals and our keep-alive pings), and each one wakes the doc's server object. **Measured:** 33 messages and 4 HTTP requests a minute for an idle pair.
4. **Polling.** Every visible tab asks "what changed in my doc list?" every 30 seconds, and each answer costs three calls into the one shared directory object.
5. **One saved row per key press** in the record (the database-write cost).

Projected effect for one pair prepping for an hour (20 minutes typing at about 3 characters a second, doc open the whole hour):

| | Today | After step 1 (small fixes) | + step 2 (batching) | + step 3 (push) |
|---|---|---|---|---|
| Messages to the server | about 14,300 | about 6,500 | about 4,900 | about 4,900 |
| Billed Durable Object requests* | about 1,435 | about 385 | about 305 | about 255 |
| Worker requests (HTTP) | about 240 | about 60 | about 60 | about 10 |
| Database rows written | about 4,000 | about 4,000 | about 1,200 | about 1,200 |

\* Cloudflare bills 20 WebSocket messages as 1 request, and each HTTP call to the directory as separate requests. Pricing and limits are from memory; check the dashboard.

Efficacy kept: partners still see each other's text and cursors within about half a second; every edit is still attributed, timed and hash-chained; check pages, tab room, coach view, history and replay show the same information; invitations still arrive (step 3 makes them instant instead of up to 30 seconds).

Dollar savings are small at team scale (the $5 plan covers it either way). The value is **headroom and fewer ways to spike**: at tournament scale, and on the Free plan's daily limits, these cuts are what keep the app inside the limits.

## Measured baseline (`node scripts/measure-traffic.cjs`)

Two students in one round doc. Ann types 200 characters at 5 a second; Bea only watches.

- Messages sent to the server per typed character: **3.08** (Ann: 1.00 document update + 1.03 cursor update; Bea: 1.02 cursor updates, which are echoes of Ann's, though Bea is not typing).
- Messages relayed out per character: 3.06.
- Idle for 60 seconds, both tabs visible: **33 messages** sent (10 cursor presence, 6 keep-alives, the rest echoes) and **4 HTTP requests**.
- HTTP: one `GET /api/docs` per tab about every 30 seconds. Each costs 1 Worker request and 3 directory calls (session lookup, doc list, invitations).
- Rows: one database row per document update (measured earlier: 1 per key press).
- Not a problem: events reported by the app (blocked pastes, going away and back) are batched and rare.

## What to do, in order

### Step 1: small, safe, mostly on the client (BUILT and DEPLOYED 2026-11-04, version 2963aa16)

**Measured result** (same script, same two-student test; before to after): messages reaching the doc **per typed character 3.08 to 1.41 (-54%)**; an **idle open doc 33 to 4 messages a minute (-88%)**, plus 12 free keep-alive pings a minute that Cloudflare answers without waking the doc; **HTTP requests per idle minute 4 to 1 (-75%)**. Partner still sees text and the cursor label; 100 s idle had no reconnects or page errors; invitations, live typing both ways and the flood protection were re-checked. Code: `src/store/presence.ts` (A, B, C), `docList` in `worker/directory.ts` and `worker/index.ts` (D), `src/store/poll.ts` and the refresh effect in `src/ui/App.tsx` (E); tests in `tests/presence.test.ts`, `tests/poll.test.ts`, `tests/docroom.test.ts`, `tests/directory.test.ts`. A lesson worth keeping: the first version of the echo fix was wired in the wrong order (server updates went through the throttle first and were later sent as if local), which the unit tests with fake pieces missed and only a real-browser measurement caught; `tests/presence.test.ts` now has a test against the real sync library that fails with the wrong order. Not done from the original step 1 list: pausing presence while a tab is hidden (not needed once presence renews only once a minute) and the "unchanged" empty reply for polling (saves bytes, not requests).


| Change | Saves | Efficacy impact | Notes |
|---|---|---|---|
| **A. Stop the cursor echo.** Swap y-websocket's `_awarenessUpdateHandler` for one that ignores updates that came from the server (`origin === provider`). | about 33% of typing traffic, more with 3+ people | None | `src/store/sync.ts`, about 10 lines. Library source confirmed: the handler ignores its `_origin` argument. |
| **B. Throttle cursor updates** to about 2 a second (send the latest one at the end of each window). | about 60% of the remaining cursor traffic | Partner's cursor moves in 0.5 s steps instead of every key | Wrap the socket's `send` for awareness messages, or throttle `setLocalState`. |
| **C. Free keep-alive.** Replace our 20-second ping with a Cloudflare WebSocket auto-response (`ctx.setWebSocketAutoResponse`): the edge answers `"ping"` with `"pong"` without waking the doc or billing a request. Slow cursor presence renewal from every 15 s to about 90 s (replace `awareness._checkInterval`; stale cursors then disappear after about 3 minutes if a laptop dies, instead of 30 s). Pause presence while the tab is hidden. | idle traffic from about 16 to about 1 message a minute per tab | A closed laptop's cursor lingers a little longer | The library treats a string reply as a bad message, so wrap `ws.onmessage` to note "something arrived" for strings (it only uses that to detect dead connections). `type99` pings stay for the connection-check popover. |
| **D. One directory call per request.** A single `bootstrap(token, space)` returns user, docs and invitations (and cache the session lookup for a few seconds in the Worker). | 3 billed calls to 1 per poll | None | `worker/directory.ts`, `worker/index.ts`. |
| **E. Poll smarter.** 30 s while the person has done something in the last 2 minutes, 2 minutes otherwise; add random jitter; send a version number and answer "unchanged" with an empty reply; never poll while hidden (already done). | about 60 to 75% of polling | Invitations and shared docs can take up to 2 minutes to appear for an idle tab (instant after any click, or after step 3) | `src/ui/App.tsx`, `worker/index.ts`. |

### Step 2: batching (BUILT 2026-11-05, not yet deployed; see HANDOFF.md)

Measured in real browsers: messages per typed character 1.41 to 0.91; two people typing at once converge to identical text; 60 typed characters saved as 7 rows. Client batching can be switched off with `localStorage['pp-batch']='0'`.

| Change | Saves | Efficacy impact |
|---|---|---|
| **F. Merge outgoing edits for about 500 ms** (`Y.mergeUpdates`) before sending. Flush when the tab hides or closes. | about 40% of update messages | Partner sees text in half-second chunks. |
| **G. Save one database row per second per author** instead of per message (merge in the room, then hash and store). | about 70% of rows written | Replay and the record step in 1-second chunks instead of per key; "large edit" detection is unaffected (typing cannot reach 40 characters in a second). A crash can lose the last second from the record, but the client re-sends it when it reconnects (it would show as "synced after offline"). |
| **H. Snapshots.** Store the full document state every few hundred edits so a woken room reads one row plus the newest edits instead of the whole history. | rows read per wake from N to about 1 | None |
| **I. Running summary per doc.** Update a small summary row (characters typed, large edits, catch-up, people, first and last edit) as edits arrive, so Coach view and the tab room read one row per doc instead of replaying every edit. Cache check pages for about 30 seconds. | Coach view and tab room cost from O(all edits of every doc) to O(docs) | None; also fixes the free plan's CPU limit for the list pages |
| **J. Incremental history and replay.** `GET /log?since=<seq>`; keep fetched edits in the browser (they never change). | reopening History fetches only new edits | None |

### Step 3: push instead of poll (about 3 days)

One long-lived hibernating WebSocket per signed-in tab to the directory (tagged by user and team). The server sends a tiny "your list changed" message when a doc is created, shared, deleted or an invitation arrives; keep-alive uses the free auto-response from C. The 30-second poll becomes a 5-minute safety net. Efficacy: invitations and shared docs show up instantly. Saves about 90% of the remaining HTTP traffic. Risk: moderate (a new connection type to get right), so do it after steps 1 and 2 prove out.

### Not recommended now

- **Splitting the directory by team** (the single shared object is the scaling ceiling for many schools): big refactor, not needed until well past a few hundred simultaneous users. Steps 1 and 3 cut its load by about 90% first.
- **Moving the app files to Cloudflare's static hosting** (free, unmetered requests): upload failed through this session's proxy earlier; it would save about 13 requests per first visit. Worth doing from a normal computer later.

## Guard rails against surprise spikes

The surprises so far were all "something loops or is left open". Defence in depth:

| Risk | Guard | Status |
|---|---|---|
| A client floods messages (like the 450/s cursor loop) | Server drops cursor floods and cuts a connection above 100 messages a second for 5 seconds; app backs off a minute | Done (2026-11-04) |
| Refused connection retries forever | App stops after 5 failed attempts and checks access | Done |
| Many tabs or devices per person | Cap sockets per person per doc (for example 4) and cap docs open at once | To add (small) |
| Poll storms | Jitter, adaptive interval, hidden-tab skip, per-person rate limit in the directory (for example 60 calls a minute) | Step 1E plus a small rate limiter |
| Reconnect storms after a deploy (everyone reconnects at once) | Random 0 to 5 s delay before reconnecting | To add (tiny) |
| The record or events growing without limit | Cap events per doc per hour; step 2G/H | To add |
| Logs filling up | Logs sampled at 10% | Done |
| Not noticing in time | A daily usage check using the analytics the deploy token can read (requests, Durable Object requests, rows read and written, WebSocket messages), warning above 50% of any monthly allowance; Cloudflare billing alerts in the dashboard | To add: the queries are in HANDOFF.md |
| Needing to stop it fast | A kill switch (a setting that makes the server refuse new sync connections and show a notice) | To add (small) |

## How to know it worked

1. Run `node scripts/measure-traffic.cjs` before and after each step (needs Playwright and a local `wrangler dev`); compare messages per character and idle messages and requests per minute with the baseline above.
2. After deploying, compare Cloudflare's analytics for the same hours: Durable Object requests, WebSocket messages, rows written, Worker requests (queries in HANDOFF.md).
3. Check the things efficacy depends on by hand: two people see each other's text and cursor; a round doc's check page still shows everything typed and deleted; History and Replay still play; an invitation still arrives.

## Honest limits of this plan

- The projections come from one measured pair and simple arithmetic; real classrooms (3+ people in a doc, background tabs, flaky wifi) will differ. Re-measure.
- None of this removes the need for the $5 plan: the Free plan's 10 ms CPU limit per request would still break big check pages unless step 2I is done, and the free allowances are small compared with a tournament.
- Steps 2F and 2G trade a little real-time feel and record detail for a lot of savings. If partners find half-second chunks annoying, drop to 250 ms; the saving shrinks but the rest of the plan stands.
