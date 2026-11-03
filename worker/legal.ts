// Plain pages served by the worker: the privacy policy (required by Google
// for public sign-in). Keep the wording plain and accurate; update it when
// what the app stores changes.

const CONTACT = 'parlipreproombot@mail.grokbot.com';
const UPDATED = 'November 3, 2026';

export const page = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} · ParliPrepRoom</title>
<style>
  :root { --bg:#f6f5f2; --card:#fff; --text:#1d1f1e; --muted:#5c615e; --line:#e3e3de; --accent:#1f6f5c; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111413; --card:#181c1b; --text:#e7ebe9; --muted:#a5ada9; --line:#2a302e; --accent:#4cc3a0; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
  main { max-width: 720px; margin: 0 auto; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px clamp(16px, 4vw, 36px); }
  h1 { font-size: 26px; line-height: 1.2; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 26px 0 6px; }
  p, li { color: var(--text); }
  .muted { color: var(--muted); font-size: 14px; }
  a { color: var(--accent); }
  ul { padding-left: 20px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;

export function privacyPage(): string {
  return page(
    'Privacy policy',
    `<h1>Privacy policy</h1>
<p class="muted">ParliPrepRoom · Last updated ${UPDATED}</p>
<p>ParliPrepRoom is a prep tool for parliamentary debate teams. This page explains what it stores, why, and who can see it.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Your Google account basics</strong> when you sign in with Google: your name, email address and profile picture. We don't get your Google password or access to your Gmail, Drive or anything else.</li>
  <li><strong>What you write in the app</strong>: your docs and flows, their titles, and which team they belong to.</li>
  <li><strong>An edit record</strong> for each doc: who made each change and when. For round docs this record is what the check page shows, and it includes events the app reports, such as blocked paste attempts, Round Mode being turned on or off, and time spent in other apps or tabs.</li>
  <li><strong>Team membership</strong>: which teams you're on and whether you're a coach or a student.</li>
  <li><strong>A sign-in cookie</strong> that keeps you signed in on that browser. We don't use advertising or tracking cookies.</li>
</ul>
<p>Some things stay only in your browser and are never sent to us: your appearance settings (fonts, theme, colors), your pinned blocks, and the offline copy of your docs.</p>

<h2>How we use it</h2>
<p>Only to run the app: to show you your docs, let partners edit together, let coaches see their team's work, and let anyone with a round doc's check link confirm the prep was typed in the app. We don't sell your information, show ads, or use your writing to train AI models.</p>

<h2>Who can see what</h2>
<ul>
  <li><strong>Team docs</strong>: everyone on that team.</li>
  <li><strong>Round docs</strong>: the person who made it, the partners they add, and the team's coaches.</li>
  <li><strong>Your own docs</strong> (not in a team): only you.</li>
  <li><strong>Check pages</strong>: anyone with a round doc's check link sees a summary: names of the people who typed in it, when, how much, and any flags. The prep itself is shown only to people who already have access to that doc.</li>
  <li><strong>Tournaments</strong>: if you enter a tournament's code when you start a round, that tournament's director (through a private link) can see that round doc's full record, including what was typed and deleted, so they can rule on disputes.</li>
  <li>The people who run ParliPrepRoom can access stored data when needed to keep the service working or fix problems.</li>
</ul>

<h2>Where it's stored</h2>
<p>Data is stored with Cloudflare, which hosts the app. Sign-in is handled by Google. Both process data only to provide their service.</p>

<h2>Keeping and deleting data</h2>
<p>We keep your data while you use the app. A doc in a team is open only to its owner, the partners they pick and the team's coaches, unless the owner shares it with the whole team. You can delete docs you own at any time. Docs in a team go to the team's <strong>Recently deleted</strong> list, where coaches can still open them, restore them or delete them for good, and each deletion is logged for the team's coaches (who deleted what, and when). Round docs entered for a tournament stay available to that tournament's director. You can download a backup of your team's docs (Team → Download all docs). To delete your account, open the account menu (your initials, top right) and choose <strong>Delete my account</strong>. That removes your sign-in, your docs under “My own docs” and teams where you're the only member. Docs you made inside a shared team stay with that team; its coach can delete them. Round docs entered for a tournament are kept for that tournament's director. You can also email us (below) from the address you sign in with.</p>

<h2>Students</h2>
<p>ParliPrepRoom is meant for high school and college debaters and their coaches. It is not meant for children under 13. If you use a school Google account, your school's rules for outside apps also apply.</p>

<h2>Changes</h2>
<p>If we change what we collect or how it's used, we'll update this page and the date above.</p>

<h2>Contact</h2>
<p>Questions or deletion requests: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
<p class="muted"><a href="/">Back to ParliPrepRoom</a></p>`,
  );
}
