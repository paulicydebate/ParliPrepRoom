// "Start here": the one-page guide at /guide. Plain HTML so it opens fast, works
// before anyone signs in, and can be sent to a whole team as a link.
// When a feature changes, change this page in the same commit.

import { page } from './legal';

const CONTACT = 'parlipreproombot@mail.grokbot.com';

export function guidePage(): string {
  const body = `
<style>
  .go { display:inline-block; margin: 6px 0 4px; padding: 10px 16px; border-radius: 10px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; }
  .go.alt { background: transparent; color: var(--accent); border: 1px solid var(--accent); margin-left: 6px; }
  ol.steps { padding-left: 22px; }
  ol.steps > li { margin: 10px 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 15px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 13px; }
  kbd { font: 13px ui-monospace, monospace; padding: 1px 5px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); white-space: nowrap; }
  .tip { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin: 12px 0; font-size: 15px; }
  nav.toc { display:flex; flex-wrap:wrap; gap: 6px 14px; margin: 10px 0 0; font-size: 14px; }
</style>
<h1>Start here</h1>
<p class="muted">ParliPrepRoom · a prep app for parliamentary debate: write prep like a doc, flow it like a spreadsheet, prep live with your partner, and keep a record that it was typed, not pasted.</p>
<p><a class="go" href="/#tour">Take the 1-minute tour</a><a class="go alt" href="/">Open the app</a></p>
<nav class="toc" aria-label="On this page">
  <a href="#quick">Quick start</a> <a href="#styles">Styles</a> <a href="#flow">Docs and flows</a> <a href="#pins">Pins</a> <a href="#roundmode">Round Mode</a>
  <a href="#coaches">Coaches</a> <a href="#keys">Shortcuts</a> <a href="#help">If something's wrong</a>
</nav>

<h2 id="quick">Quick start</h2>
<p class="muted">Steps 1–3 happen once. Steps 4–7 are what you do each round.</p>
<ol class="steps">
  <li><strong>Sign in.</strong> Open the app and click <strong>Sign in with Google</strong>. Use the same account every time.</li>
  <li><strong>Make or join a team.</strong> A coach (or captain) creates the team from the account menu, opens <strong>Team</strong>, and sends the <strong>Students</strong> invite link. Everyone else opens that link and signs in. Use the <strong>Coaches</strong> link only for other coaches.</li>
  <li><strong>Add a coach reference doc.</strong> In the sidebar, under <strong>Reference</strong>, press <strong>+</strong> to write one, or the upload icon to import a Word, Excel, CSV, text or Markdown file. The whole team can read it.</li>
  <li><strong>Start the round.</strong> Press <strong>New round</strong> in the top bar. Choose the round name, your side (Gov or Opp), the resolution, your <strong>partner</strong> and the tournament code if there is one, then <strong>Start round</strong>. Pick <strong>what to make</strong>: a prep doc and a flow side by side (the default), just a flow, or just a doc. You get <em>round docs</em> (purple border) and the prep timer starts. <strong>Your partner gets an invitation</strong>: a bar appears at the top of their screen (within about 30 seconds, or when they switch back to the app) with <strong>Accept</strong> and <strong>Decline</strong>. They can't see or edit the doc until they accept, and you'll see whether they've accepted on the <strong>Partners</strong> button. No email or text is sent, so give them a nudge.</li>
  <li><strong>Prep.</strong> With Round Mode still off, press <strong>Split view</strong> and open the reference doc next to your round doc (or flow). Read from it and retype what you need; paste is blocked in round docs on purpose. Your partner sees your doc live.</li>
  <li><strong>Pin what you might read.</strong> See <a href="#pins">Pins</a> below. Do this in your round doc, before the round.</li>
  <li><strong>Turn on Round Mode</strong> when the round starts (top bar). Only round docs stay available, so you speak from what you typed.</li>
</ol>

<h2 id="styles">The styles</h2>
<p>Every line has a style. The style decides how it looks in a doc and where it goes in a flow. Pick one from the style menu in the toolbar, with the keys (<kbd>Ctrl</kbd>+1–6 on a Mac, <kbd>Alt</kbd>+1–6 on Windows), or press <kbd>Shift</kbd>+<kbd>Enter</kbd> to switch the line to the next style. <kbd>Enter</kbd> just starts a new line: a claim after a position or section title, otherwise the same style as the line above.</p>
<table>
  <tr><th>Style</th><th>Use it for</th></tr>
  <tr><td><strong>Position title</strong></td><td>One case or position, e.g. “Gov: Ban facial recognition”. In a flow, each one is a <em>sheet</em> (tab).</td></tr>
  <tr><td><strong>Section title</strong></td><td>A group inside a position, e.g. “Advantage 1” or “A2 – T”.</td></tr>
  <tr><td><strong>Claim</strong></td><td>One argument. Each claim starts a row in the flow.</td></tr>
  <tr><td><strong>Warrant</strong></td><td>The reasoning or evidence for a claim. Sits under it.</td></tr>
  <tr><td><strong>Analytic</strong></td><td>An on-the-spot point or answer in your own words.</td></tr>
  <tr><td><strong>Note</strong></td><td>A reminder to yourself.</td></tr>
</table>

<h2 id="flow">Docs and flows</h2>
<ul>
  <li>Prep is either a <strong>doc</strong> (written as text) or a <strong>flow</strong> (written in the grid, like a spreadsheet). You choose when you make it, with the <strong>+</strong> next to Prep or in New round, and it <strong>stays that way</strong>. A doc is never shown as a flow or the other way round, so whatever you type exists in only one place.</li>
  <li>Put a prep doc and a flow side by side with <strong>Split view</strong>: write your prep in the doc, flow the round in the flow.</li>
  <li>In a flow, each position title is a sheet, marked Gov or Opp. Gov sheets have PMC, LOC, MG, MO, LOR and PMR columns; Opp sheets start at the LOC.</li>
  <li>A claim starts a row. A line tagged with a later speech (use the speech menu in the toolbar, or just type in that column) is an answer and sits beside the claim it answers.</li>
  <li>Click any empty cell to type there. <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> move to the next or previous speech in the row; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> starts a new row.</li>
  <li>Mark an argument <strong>→ extended</strong>, <strong>! dropped</strong>, <strong>✓ answered</strong> or <strong>★ key</strong> from the toolbar.</li>
  <li>Download a doc as Word, or a flow as Excel, from the download icon in the window header. An Excel flow you import becomes a flow.</li>
</ul>

<h2 id="pins">Pins: finding your blocks fast in the round</h2>
<ol class="steps">
  <li>In your <strong>round doc</strong>, put the cursor in a section title, a claim or an analytic and press <strong>Pin</strong> in the toolbar. A section title pins the whole section, a claim pins the claim with its warrants, and an analytic pins just that line.</li>
  <li>Press the <strong>pin icon</strong> in the top bar to open the <strong>Pinned blocks</strong> panel. It lists your pins in the order you plan to read them; use ↑ ↓ to reorder.</li>
  <li>Give each pin the <strong>flow sheet it answers</strong> (for example “Opp: Regulation CP”). The panel has a tab for each sheet and shows the pins for the sheet your flow is on.</li>
  <li>In the flow, the pin button on a column header (for example LOC) opens a <strong>Pins column</strong> right next to that column.</li>
  <li>Tap a pin to jump to that block. Nothing is copied.</li>
</ol>
<div class="tip">Pin blocks in your <strong>round doc</strong>, not in the reference doc: Round Mode hides everything but round docs, so pins pointing at a reference doc show “Doc not available” during the round. Pins are saved in your own browser, so each partner sets up their own.</div>
<p>Can't remember where something is? Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> to search everything you've typed. <kbd>Enter</kbd> jumps to it; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> pins it.</p>

<h2 id="roundmode">Round docs and Round Mode</h2>
<ul>
  <li>A <strong>round doc</strong> blocks paste, records every edit (who, when, exactly what was typed and deleted) on the server, and shows a purple border so an opponent can tell. New round makes one for you. Any doc can be switched to a round doc with the switch in its header.</li>
  <li>A round doc is open only to you, the partners who accepted your invitation and your coaches. Other team prep docs are private the same way unless you choose <strong>Everyone on the team</strong> with the button in the doc's header.</li>
  <li><strong>Round Mode</strong> (top bar) is for the round itself. The bar turns purple, only round docs can be open or searched, and the reference docs are hidden. Each person turns it on for themselves. A new doc made while it's on is automatically a round doc (typed by hand, paste off); reference docs can't be made until you turn it off. Turning it on or off shows on the round doc's check page.</li>
  <li>Anyone can check a round doc: the <strong>Check link</strong> button gives a link and QR code that shows who typed what, any blocked pastes, and whether the record is intact. No account needed.</li>
  <li><strong>Timer:</strong> pick a speech (PMC 7, LOC 8, MG 8, MO 8, LOR 4, PMR 5) or a flex period (2:00 or 1:00) from the timer in the top bar, or <strong>Change times</strong> to set your own prep length. On a round doc the timer is shared with your partner.</li>
</ul>

<h2 id="coaches">For coaches</h2>
<ul>
  <li><strong>Coach view</strong> (top bar) lists every round doc on the team, anything flagged first, with links to the full typing record. <strong>Recently deleted</strong> and the <strong>Deletion log</strong> show anything a student deleted; coaches can restore it.</li>
  <li><strong>Team</strong> has the invite links (press <strong>New link</strong> to replace one and stop the old one), members and roles.</li>
  <li><strong>Tournaments</strong> (account menu): set up a tournament, give teams its code for New round, and give the tab room the private director link, which shows every tagged round doc with its full record.</li>
  <li>Coaches can open every doc on the team, including private prep docs and round docs.</li>
</ul>

<h2 id="keys">Shortcuts</h2>
<table>
  <tr><th>Keys</th><th>Does</th></tr>
  <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd></td><td>Find a block (and pin it)</td></tr>
  <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>\\</kbd></td><td>Show or hide the doc list</td></tr>
  <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>\\</kbd></td><td>One window fills the screen</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>New line (a claim after a title, otherwise the same style)</td></tr>
  <tr><td><kbd>Shift</kbd>+<kbd>Enter</kbd> · <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd></td><td>Switch the line to the next · previous style (position, section, claim, warrant, analytic, note, then around)</td></tr>
  <tr><td><kbd>Ctrl</kbd>+1–6 (Mac) · <kbd>Alt</kbd>+1–6 (Windows)</td><td>Set the line's style directly</td></tr>
  <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> / <kbd>D</kbd> / <kbd>A</kbd> / <kbd>K</kbd></td><td>Mark extended / dropped / answered / key</td></tr>
  <tr><td><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd></td><td>In the flow: next / previous speech. In the doc: demote / promote a line</td></tr>
</table>
<p class="muted">Small laptop? Appearance (the sliders icon) has <strong>Tight</strong> spacing and can hide the formatting bar. You can also drag the edge of the doc list, pins panel or outline to resize it.</p>

<h2 id="help">If something's wrong</h2>
<ul>
  <li><strong>Can't sign in with a school account:</strong> some schools block outside apps. Try a personal Google account, and tell your coach.</li>
  <li><strong>My partner can't see the doc:</strong> they must be on the team (they used the Students invite link), be invited on the doc (the Partners button in the purple strip), and <strong>accept</strong> the invitation in the bar at the top of their screen. It appears within about 30 seconds, or right away if they reload. If they declined, check their name again on the Partners button to invite them again. A partner can leave a doc from the same button.</li>
  <li><strong>The dot next to a doc's title:</strong> green means saved to the server. Tap it to see the round trip time and whether your edits have reached the server. Red means offline: your edits are kept on your device and sync when you're back.</li>
  <li><strong>Paste doesn't work in a round doc:</strong> that's on purpose. Retype it, or work in a team doc outside the round.</li>
  <li><strong>Shared computer:</strong> press <strong>Sign out</strong> when you're done. It removes your docs from that computer (they stay safe on the server for when you sign in again). If a doc has changes that haven't reached the server yet, you'll be asked before they're lost.</li>
  <li><strong>I want a clean slate:</strong> <strong>Reset: start fresh</strong> at the bottom of the doc list deletes your own docs there and closes every window.</li>
  <li>Anything else: <a href="mailto:${CONTACT}">${CONTACT}</a></li>
</ul>
<p class="muted"><a href="/privacy">Privacy policy</a></p>`;
  return page('Start here', body);
}
