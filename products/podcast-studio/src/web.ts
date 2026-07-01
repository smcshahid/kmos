/**
 * Podcast Studio single-page UI (served as one HTML string; zero build step).
 *
 * A calm, transparent dashboard: submit an episode, watch the pipeline honestly, and
 * leave with verifiable knowledge. It holds no business logic — it renders what the
 * Podcast Studio HTTP API returns.
 */

export const STUDIO_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Podcast Studio · KMOS</title>
<style>
  :root{--bg:#0e1116;--panel:#161b22;--panel2:#1c2230;--line:#273040;--fg:#e6edf3;--muted:#8b98a9;--accent:#6ea8fe;--good:#3fb950;--warn:#d29922;--bad:#f85149}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  a{color:var(--accent);text-decoration:none}
  header{padding:18px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}
  header h1{font-size:17px;margin:0;font-weight:650;letter-spacing:.2px}
  header .dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
  header .muted{color:var(--muted);font-size:13px}
  .wrap{display:grid;grid-template-columns:320px 1fr;gap:0;min-height:calc(100vh - 59px)}
  .side{border-right:1px solid var(--line);padding:16px;overflow:auto}
  .main{padding:22px 26px;overflow:auto}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
  .muted{color:var(--muted)} .small{font-size:13px}
  label{display:block;font-size:13px;color:var(--muted);margin:10px 0 4px}
  input,select,textarea{width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:9px 10px;font:inherit}
  textarea{min-height:96px;resize:vertical}
  button{background:var(--accent);color:#04122e;border:0;border-radius:8px;padding:9px 14px;font-weight:650;cursor:pointer}
  button.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
  button:disabled{opacity:.5;cursor:default}
  .row{display:flex;gap:8px;align-items:center}
  .ep{padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer;background:var(--panel)}
  .ep:hover{border-color:var(--accent)} .ep.active{border-color:var(--accent);background:var(--panel2)}
  .ep .t{font-weight:600} .ep .s{font-size:12px;color:var(--muted)}
  .pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
  .pill.ready{color:var(--good);border-color:#1f5132} .pill.failed{color:var(--bad);border-color:#5f2320} .pill.processing{color:var(--accent);border-color:#274b7a}
  .stage{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed var(--line)}
  .stage .ic{width:16px;text-align:center}
  .stage .lbl{flex:1} .stage .md{font-size:11px;color:var(--muted)}
  .concept{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--panel)}
  .concept h4{margin:0 0 4px} .quote{border-left:3px solid var(--accent);padding:4px 10px;color:var(--muted);margin:8px 0}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .tag{font-size:11px;color:var(--good)} .tag.warn{color:var(--warn)}
  .chip{display:inline-block;font-size:12px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:3px 8px;margin:2px}
  .err{color:var(--bad);font-size:13px}
</style></head>
<body>
<header><span class="dot"></span><h1>Podcast Studio</h1><span class="muted">verifiable knowledge from audio · on KMOS</span></header>
<div class="wrap">
  <div class="side">
    <div class="card">
      <div class="row" style="justify-content:space-between"><strong>New episode</strong><a href="#" id="sample" class="small">use sample</a></div>
      <label>Source</label>
      <select id="kind">
        <option value="transcript">Paste transcript</option>
        <option value="audio">Audio URL</option>
        <option value="youtube">YouTube URL</option>
        <option value="rss">RSS episode URL</option>
        <option value="upload">Upload (filename)</option>
      </select>
      <label>Reference</label>
      <input id="ref" placeholder="https://… or a title"/>
      <label>Transcript <span class="muted">(offline: paste; production: fetched by ASR)</span></label>
      <textarea id="tx" placeholder="Paste the transcript / captions to process now"></textarea>
      <div class="row" style="margin-top:10px"><button id="go">Process</button><span id="subinfo" class="small muted"></span></div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between"><strong>Episodes</strong>
        <input id="q" placeholder="search…" style="width:130px"/></div>
      <div id="list" style="margin-top:10px"></div>
    </div>
  </div>
  <div class="main" id="main"><div class="muted">Submit an episode to begin. Everything you get is grounded in the transcript and traceable.</div></div>
</div>
<script>
const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
function api(method,path,body){return fetch(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(r=>r.json());}
const fmt=s=>{s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(x).padStart(2,'0');};
const ICON={done:'✓',skipped:'–',failed:'✕',running:'…',pending:'·'};
let current=null, timer=null;

async function refreshList(){
  const q=$('#q').value.trim();
  const eps=await api('GET','/api/episodes');
  const filtered=q?eps.filter(e=>(e.title||'').toLowerCase().includes(q.toLowerCase())):eps;
  $('#list').innerHTML=filtered.map(e=>\`<div class="ep \${e.id===current?'active':''}" data-id="\${e.id}">
    <div class="row" style="justify-content:space-between"><span class="t">\${e.favorite?'★ ':''}\${esc(e.title)}</span>
    <span class="pill \${e.status}">\${e.status}</span></div>
    <div class="s">\${e.conceptCount} concepts · \${Math.round(e.durationSec/60)} min</div></div>\`).join('')||'<div class="muted small">No episodes yet.</div>';
  $$('#list .ep').forEach(el=>el.onclick=()=>select(el.dataset.id));
}
function esc(s){return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

async function select(id){ current=id; if(timer)clearInterval(timer); await render(); timer=setInterval(render,1200); refreshList(); }

async function render(){
  if(!current)return;
  const e=await api('GET','/api/episodes/'+current);
  if(e.error){$('#main').innerHTML='<div class="err">'+e.error+'</div>';return;}
  const done=e.status==='ready'||e.status==='failed'; if(done&&timer){clearInterval(timer);timer=null;}
  const stages=e.stages.map(s=>\`<div class="stage"><span class="ic">\${ICON[s.status]||'·'}</span>
    <span class="lbl">\${s.label}</span><span class="md">\${s.mode}\${s.detail?' — '+esc(s.detail):''}</span></div>\`).join('');
  let concepts='';
  if(e.status==='ready'){
    const cs=await api('GET','/api/episodes/'+current+'/concepts');
    concepts=cs.map(c=>\`<div class="concept"><h4>\${esc(c.name)}</h4><div class="muted small">\${esc(c.definition)}</div>
      <div class="\${c.trusted?'tag':'tag warn'}" style="margin-top:6px">\${c.trusted?'trusted':'needs review'} · \${c.evidenceCount} passage(s)\${c.startSec!=null?' · @'+fmt(c.startSec):''}</div></div>\`).join('');
  }
  const chapters=(e.chapters||[]).map(c=>\`<span class="chip">\${fmt(c.startSec)} · \${esc(c.title)}</span>\`).join('');
  const moments=(e.moments||[]).map(m=>\`<span class="chip">\${fmt(m.startSec)} · \${esc(m.label)}</span>\`).join('');
  const clips=(e.clips||[]).map(c=>\`<span class="chip">\${fmt(c.startSec)}–\${fmt(c.endSec)} · \${esc(c.title)} (\${c.kind})</span>\`).join('');
  const dls=e.status==='ready'?await api('GET','/api/episodes/'+current+'/downloads'):[];
  $('#main').innerHTML=\`
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">\${esc(e.title)}</h2>
      <div class="row"><button class="ghost" id="fav">\${e.favorite?'★ Favorited':'☆ Favorite'}</button>
      \${e.status==='failed'?'<button id="retry">Retry</button>':''}</div></div>
    \${e.show?'<div class="muted">'+esc(e.show)+'</div>':''}
    \${e.error?'<div class="err" style="margin:8px 0">'+esc(e.error)+'</div>':''}
    <div class="card"><strong>Pipeline</strong><div style="margin-top:8px">\${stages}</div></div>
    \${e.summary?'<div class="card"><strong>Summary</strong><p class="muted">'+esc(e.summary)+'</p></div>':''}
    <div class="grid2">
      <div class="card"><strong>Chapters</strong><div style="margin-top:8px">\${chapters||'<span class="muted small">—</span>'}</div></div>
      <div class="card"><strong>Notable moments</strong><div style="margin-top:8px">\${moments||'<span class="muted small">—</span>'}</div></div>
    </div>
    <div class="card"><strong>Clips & reel</strong> <span class="muted small">(render via ffmpeg on the estate)</span><div style="margin-top:8px">\${clips||'<span class="muted small">—</span>'}</div></div>
    \${concepts?'<div class="card"><strong>Concepts</strong><div style="margin-top:8px">'+concepts+'</div></div>':''}
    \${dls.length?'<div class="card"><strong>Download</strong><div style="margin-top:8px">'+dls.map(d=>'<a class="chip" href="/api/episodes/'+current+'/download/'+d.name+'">'+d.name+'</a>').join('')+'</div></div>':''}
  \`;
  const fav=$('#fav'); if(fav)fav.onclick=async()=>{await api('POST','/api/episodes/'+current+'/favorite');render();refreshList();};
  const rt=$('#retry'); if(rt)rt.onclick=async()=>{await api('POST','/api/episodes/'+current+'/retry');select(current);};
}

$('#go').onclick=async()=>{
  const kind=$('#kind').value, reference=$('#ref').value.trim(), transcript=$('#tx').value.trim();
  if(!reference&&!transcript){$('#subinfo').textContent='Add a reference or a transcript.';return;}
  $('#go').disabled=true;$('#subinfo').textContent='submitting…';
  const r=await api('POST','/api/episodes',{kind,reference:reference||('Pasted '+new Date().toISOString()),transcript});
  $('#go').disabled=false;$('#subinfo').textContent='';
  if(r.id){$('#ref').value='';$('#tx').value='';await refreshList();select(r.id);}
};
$('#sample').onclick=async e=>{e.preventDefault();const s=await api('GET','/api/sample');$('#kind').value='transcript';$('#ref').value=s.title;$('#tx').value=s.transcript;};
$('#q').oninput=refreshList;
refreshList();
</script>
</body></html>`;
