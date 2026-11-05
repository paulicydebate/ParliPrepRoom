/** /admin: the pause switch. Only people listed in the ADMIN_EMAILS secret can use it (checked on the server). */
export function adminPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ParliPrepRoom admin</title>
<style>body{font:16px system-ui,sans-serif;max-width:34rem;margin:2rem auto;padding:0 1rem}button{font:inherit;padding:.6rem 1rem;margin:.3rem .3rem .3rem 0}textarea{width:100%;font:inherit;box-sizing:border-box}.on{color:#b45309;font-weight:600}</style></head>
<body><h1>Pause switch</h1><p id="s">Loading…</p>
<p>While paused, nobody can open new live-sync connections (people already connected keep editing, so nothing is lost). The app shows the notice below.</p>
<textarea id="n" rows="3" maxlength="300" placeholder="Notice to show (optional)"></textarea>
<div><button id="p">Pause</button><button id="r">Resume</button></div>
<script>
const s=document.getElementById('s');
async function call(on){
  const r=await fetch('/api/admin/pause',{method:on===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:on===undefined?undefined:JSON.stringify({on,notice:document.getElementById('n').value})});
  if(r.status===403){s.textContent='Not allowed. Sign in to the app with an admin account first, then reload this page.';return}
  const d=await r.json();
  s.innerHTML=(d.paused||d.envPaused)?'<span class="on">PAUSED</span>'+(d.envPaused?' (emergency setting, remove it by redeploying)':''):'Running normally';
}
document.getElementById('p').onclick=()=>call(true);
document.getElementById('r').onclick=()=>call(false);
call();
</script></body></html>`;
}
