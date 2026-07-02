/**
 * The CrawlStation single-page UI, served at `/`.
 *
 * Self-contained (inline CSS + vanilla JS, zero build step) to match KMOS's zero-
 * dependency philosophy and stay trivially deployable. CrawlStation's personality is
 * calm, precise, and confidence-inspiring — a "signal station" for knowledge entering
 * KMOS. Design goals: transparent live acquisition (never a bare spinner), verifiable
 * knowledge with visible provenance/lineage/trust, and accessibility (WCAG 2.2 AA —
 * semantic landmarks, keyboard paths, visible focus, aria-live telemetry, reduced
 * motion). The UI talks only to the CrawlStation HTTP API; it holds no business logic.
 *
 * NOTE: the inline <script> deliberately avoids backtick template literals, `${}`, and
 * backslash regex escapes so it lives safely inside this outer template string.
 */

export const CRAWL_STATION_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CrawlStation</title>
<style>
:root{
  --bg:#f6f8f8; --panel:#ffffff; --ink:#0f1a1c; --muted:#5b6b6e; --line:#e2e9e9;
  --accent:#0d7d8a; --accent-2:#12a594; --accent-soft:#e2f4f3; --ink-soft:#33474a;
  --good:#0f8a5f; --warn:#b4601a; --bad:#c23b3b; --info:#3a6ea5;
  --radius:14px; --shadow:0 1px 2px rgba(8,40,44,.05),0 10px 30px rgba(8,40,44,.06);
  --maxw:1200px;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0c1416; --panel:#121c1f; --ink:#e6efef; --muted:#93a5a8; --line:#213033; --ink-soft:#c3d2d3;
  --accent:#2bb7c4; --accent-2:#33d6c0; --accent-soft:#123033;
  --good:#4fce9a; --warn:#e0a25a; --bad:#f0736f; --info:#7db0e0;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.4);
}}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
header.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(9px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:16px;height:62px}
.brand{display:flex;align-items:center;gap:11px;font-weight:680;letter-spacing:-.015em;cursor:pointer;background:none;border:0;color:inherit;font-size:17px}
.beacon{position:relative;width:24px;height:24px;display:grid;place-items:center}
.beacon .core{width:11px;height:11px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));z-index:2}
.beacon .ring{position:absolute;inset:0;border:2px solid var(--accent);border-radius:50%;opacity:.5;animation:beacon 2.4s ease-out infinite}
@keyframes beacon{0%{transform:scale(.4);opacity:.7}100%{transform:scale(1);opacity:0}}
.grow{flex:1}
.searchbar{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:7px 15px;min-width:180px;max-width:380px;flex:1}
.searchbar input{border:0;background:none;outline:none;color:inherit;font-size:14px;width:100%}
button{font:inherit;cursor:pointer}
.btn{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:620;box-shadow:var(--shadow)}
.btn:hover{background:var(--accent-2)}
.btn.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line);box-shadow:none}
.btn.ghost:hover{border-color:var(--accent);color:var(--accent);background:var(--panel)}
.btn.small{padding:7px 13px;font-size:13px;border-radius:8px}
.btn.danger{background:var(--panel);color:var(--bad);border:1px solid var(--line);box-shadow:none}
.btn:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible,.chip:focus-visible{outline:2.5px solid var(--accent);outline-offset:2px}
main{padding:32px 0 90px}
.hero h1{font-size:clamp(28px,4.2vw,44px);line-height:1.07;letter-spacing:-.025em;margin:.1em 0 .3em}
.hero p.lede{font-size:18px;color:var(--muted);max-width:62ch;margin:0 0 24px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.composer{padding:20px}
.urlrow{display:flex;gap:10px;align-items:stretch;flex-wrap:wrap}
.urlfield{flex:1;min-width:240px;display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:2px 14px}
.urlfield span{color:var(--muted);font-size:16px}
.urlfield input{flex:1;border:0;background:none;outline:none;color:inherit;font-size:16px;padding:13px 0}
.muted{color:var(--muted)} .small{font-size:13px}
.adv{margin-top:14px;border-top:1px dashed var(--line);padding-top:14px}
.adv summary{cursor:pointer;color:var(--muted);font-weight:600;font-size:13.5px;list-style:none}
.adv summary::-webkit-details-marker{display:none}
.adv summary::before{content:"▸ ";color:var(--accent)}
.adv[open] summary::before{content:"▾ "}
.opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:14px}
.opt label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;margin-bottom:5px}
.opt input[type=number]{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;color:inherit;padding:9px 11px;font:inherit}
.toggle{display:flex;align-items:center;gap:9px;font-size:14px}
.section-title{font-size:12.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:750;margin:36px 0 13px}
/* dashboard tiles */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:13px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 17px;box-shadow:var(--shadow)}
.tile .n{font-size:27px;font-weight:720;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tile .k{font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:650;margin-top:2px}
.tile.accent .n{color:var(--accent)}
/* library */
.grid{display:grid;gap:13px}
.lib{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.libcard{display:flex;align-items:flex-start;gap:10px;padding:15px 16px;border:1px solid var(--line);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow)}
.libopen{flex:1;min-width:0;text-align:left;background:none;border:0;color:inherit;padding:0;cursor:pointer}
.libopen h3{margin:0 0 4px;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em}
.libopen .u{color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.libact{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.star{background:none;border:0;font-size:18px;line-height:1;color:var(--muted);padding:2px;cursor:pointer}
.star.on{color:#e0a53a}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:640;color:var(--muted);background:var(--bg);border:1px solid var(--line);padding:3px 10px;border-radius:999px}
.badge.ok{color:var(--good)} .badge.run{color:var(--accent)} .badge.err{color:var(--bad)} .badge.warn{color:var(--warn)} .badge.idle{color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:currentColor}
.badge.run .dot{animation:pulse 1.3s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* crawl view */
.crawlhead{display:flex;align-items:center;gap:14px;margin:16px 0 6px;flex-wrap:wrap}
.crawlhead h1{margin:0;font-size:27px;letter-spacing:-.02em}
.progress{height:8px;background:var(--line);border-radius:999px;overflow:hidden;margin:14px 0 4px}
.progress .fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:999px;transition:width .5s ease}
.telemetry{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:10px;margin:16px 0}
.metric{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:12px 13px;text-align:left}
.metric .n{font-size:21px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.metric .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:650}
.metric.stored .n{color:var(--good)} .metric.err .n{color:var(--bad)} .metric.excl .n{color:var(--warn)}
.split{display:grid;grid-template-columns:1fr 1.35fr;gap:22px;align-items:start;margin-top:8px}
@media(max-width:860px){.split{grid-template-columns:1fr}}
.feed{max-height:520px;overflow:auto;border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:6px}
.feed .ev{display:grid;grid-template-columns:16px 1fr;gap:9px;padding:7px 9px;border-radius:8px;font-size:13.5px;align-items:start}
.feed .ev:hover{background:var(--bg)}
.feed .ev .ico{margin-top:3px;font-size:11px}
.feed .ev .msg{min-width:0}
.feed .ev .msg .m{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.feed .ev .t{color:var(--muted);font-size:11px}
.ico.discover{color:var(--info)} .ico.store{color:var(--good)} .ico.skip{color:var(--muted)} .ico.exclude{color:var(--warn)} .ico.error{color:var(--bad)} .ico.redirect{color:var(--accent)} .ico.info{color:var(--accent)}
/* pages */
.pages{display:grid;gap:9px}
.pagerow{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:11px;background:var(--panel);text-align:left;cursor:pointer;width:100%}
.pagerow:hover{border-color:var(--accent)}
.pagerow.s-skipped,.pagerow.s-excluded{opacity:.72}
.pagerow .tdot{width:10px;height:10px;border-radius:50%}
.tdot.t{background:var(--good)} .tdot.f{background:var(--warn)} .tdot.n{background:var(--line)}
.pagerow h4{margin:0 0 2px;font-size:14.5px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pagerow .u{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pagerow .rt{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.tabs{display:flex;gap:6px;margin:20px 0 16px;flex-wrap:wrap}
.tab{background:none;border:1px solid transparent;border-radius:8px;padding:8px 13px;color:var(--muted);font-weight:620;font-size:14px;cursor:pointer}
.tab[aria-selected=true]{background:var(--accent-soft);color:var(--accent)}
/* drawer */
.scrim{position:fixed;inset:0;background:rgba(6,20,22,.4);opacity:0;pointer-events:none;transition:opacity .18s;z-index:40}
.scrim.open{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;height:100%;width:min(600px,96vw);background:var(--panel);border-left:1px solid var(--line);transform:translateX(100%);transition:transform .22s ease;z-index:50;overflow:auto;box-shadow:-14px 0 44px rgba(0,0,0,.2)}
.drawer.open{transform:none}
.drawer .inner{padding:24px 26px 64px}
.drawer h2{font-size:22px;letter-spacing:-.02em;margin:.2em 40px .15em 0;line-height:1.2}
.close{position:absolute;top:16px;right:18px;background:var(--bg);border:1px solid var(--line);border-radius:9px;width:34px;height:34px;font-size:18px;line-height:1}
.dhead{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:750;margin:22px 0 7px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:5px 16px;font-size:13.5px}
.kv dt{color:var(--muted)} .kv dd{margin:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.excerpt{background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:13px 15px;font-size:14px;color:var(--ink-soft);max-height:280px;overflow:auto;white-space:pre-wrap}
.lineage{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:13.5px}
.lineage .node{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:5px 10px;color:var(--ink)}
.reasons{list-style:none;padding:0;margin:8px 0}
.reasons li{padding:5px 0 5px 24px;position:relative;font-size:13.5px}
.reasons li::before{content:"✓";position:absolute;left:0;color:var(--good);font-weight:700}
.hash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--muted);overflow-wrap:anywhere}
.hero-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.empty{padding:44px;text-align:center;color:var(--muted)}
.spin{display:inline-block;width:15px;height:15px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;vertical-align:-3px;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;position:fixed;background:var(--panel);padding:8px 12px;border-radius:8px;z-index:99;border:1px solid var(--line)}
</style>
</head>
<body>
<a href="#main" class="skip">Skip to content</a>
<header class="top"><div class="wrap">
  <button class="brand" id="home" aria-label="CrawlStation home">
    <span class="beacon" aria-hidden="true"><span class="ring"></span><span class="core"></span></span> CrawlStation
  </button>
  <div class="grow"></div>
  <div class="searchbar" role="search">
    <span aria-hidden="true">⌕</span>
    <input id="q" type="search" placeholder="Search acquired knowledge…" aria-label="Search acquired knowledge" autocomplete="off" />
  </div>
</div></header>
<main id="main" tabindex="-1"><div class="wrap" id="app"></div></main>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Page detail" tabindex="-1"><div class="inner" id="drawer-body"></div></aside>

<script>
(function(){
"use strict";
var app=document.getElementById('app');
var drawer=document.getElementById('drawer');
var scrim=document.getElementById('scrim');
var dbody=document.getElementById('drawer-body');
var state={poll:null,current:null};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function n(x){x=Number(x||0);return x.toLocaleString();}
function bytes(b){b=Number(b||0);if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(1)+' KB';return (b/1048576).toFixed(1)+' MB';}
function api(method,path,body){return fetch(path,{method:method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json();});}
function clock(iso){if(!iso)return '';var d=new Date(iso);return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});}

// ---------- Home / dashboard ----------
function home(){
  stopPoll();
  app.innerHTML=''
   +'<section class="hero">'
   +'<h1>Point CrawlStation at the web.<br>Leave with trustworthy knowledge.</h1>'
   +'<p class="lede">Paste a URL and press Acquire. CrawlStation discovers pages, respects robots.txt, preserves every page as verifiable evidence, and turns it into searchable knowledge &mdash; with provenance, lineage, and explainable trust, all durable in KMOS.</p>'
   +'<div class="card composer">'
   +'  <div class="urlrow">'
   +'    <div class="urlfield"><span aria-hidden="true">◎</span><input id="seed" type="url" inputmode="url" placeholder="https://example.com" aria-label="Website URL to acquire" autocomplete="off" /></div>'
   +'    <button class="btn" id="acquire">Acquire</button>'
   +'    <button class="btn ghost" id="sample">Try a sample</button>'
   +'  </div>'
   +'  <details class="adv"><summary>Crawl settings</summary>'
   +'    <div class="opts">'
   +'      <div class="opt"><label for="o-depth">Max depth</label><input type="number" id="o-depth" value="2" min="0" max="5" /></div>'
   +'      <div class="opt"><label for="o-pages">Max pages</label><input type="number" id="o-pages" value="40" min="1" max="500" /></div>'
   +'      <div class="opt"><label for="o-pol">Politeness (ms)</label><input type="number" id="o-pol" value="400" min="0" max="10000" step="50" /></div>'
   +'      <div class="opt"><label for="o-conc">Concurrency</label><input type="number" id="o-conc" value="4" min="1" max="16" /></div>'
   +'      <div class="opt" style="align-self:end"><label class="toggle"><input type="checkbox" id="o-same" checked /> Stay on this site</label></div>'
   +'      <div class="opt" style="align-self:end"><label class="toggle"><input type="checkbox" id="o-robots" checked /> Respect robots.txt</label></div>'
   +'    </div>'
   +'  </details>'
   +'</div>'
   +'</section>'
   +'<div id="dash"></div>'
   +'<div id="library"></div>';
  document.getElementById('acquire').addEventListener('click',acquire);
  document.getElementById('seed').addEventListener('keydown',function(e){if(e.key==='Enter')acquire();});
  document.getElementById('sample').addEventListener('click',function(){api('GET','/api/sample').then(function(s){var el=document.getElementById('seed');el.value=s.seedUrl;el.focus();});});
  loadDashboard();loadLibrary();
}
function loadDashboard(){api('GET','/api/dashboard').then(function(d){
  var el=document.getElementById('dash');if(!el)return;
  if(!d||d.crawls===0){el.innerHTML='';return;}
  function tile(nv,k,acc){return '<div class="tile'+(acc?' accent':'')+'"><div class="n">'+nv+'</div><div class="k">'+k+'</div></div>';}
  el.innerHTML='<div class="section-title">Knowledge acquired</div><div class="tiles">'
    +tile(n(d.pagesAcquired),'Pages',true)+tile(n(d.totalWords),'Words')+tile(n(d.trustedPages),'Trusted pages')
    +tile(n(d.sites),'Sites')+tile(n(d.crawls),'Crawls')+tile(n(d.active),'Active now')+'</div>';
}); }
function loadLibrary(){api('GET','/api/crawls').then(function(list){
  var lib=document.getElementById('library');if(!lib)return;
  if(!list.length){lib.innerHTML='<div class="section-title">Your crawls</div><div class="empty">No crawls yet. Paste a URL above to acquire your first site.</div>';return;}
  var favs=list.filter(function(s){return s.favorite;});
  var rest=list.filter(function(s){return !s.favorite;});
  var html='';
  if(favs.length){html+='<div class="section-title">Favorites</div><div class="grid lib">'+favs.map(card).join('')+'</div>';}
  html+='<div class="section-title">'+(favs.length?'Recent crawls':'Your crawls')+'</div><div class="grid lib">'+rest.map(card).join('')+'</div>';
  lib.innerHTML=html;
  bindLibrary(lib);
});}
function bindLibrary(lib){
  lib.querySelectorAll('.libopen').forEach(function(c){c.addEventListener('click',function(){openCrawl(c.getAttribute('data-id'));});});
  lib.querySelectorAll('.star').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();
    api('POST','/api/crawls/'+b.getAttribute('data-id')+'/favorite').then(function(){loadLibrary();});});});
}
function card(s){
  return '<div class="libcard"><button class="libopen" data-id="'+esc(s.id)+'">'
    +'<h3>'+esc(s.site)+'</h3><div class="u">'+esc(s.seedUrl)+'</div>'
    +'<div class="muted small" style="margin-top:7px">'+statusBadge(s.status)+' &middot; '+n(s.pagesStored)+' pages &middot; '+n(s.totalWords)+' words</div></button>'
    +'<div class="libact"><button class="star '+(s.favorite?'on':'')+'" data-id="'+esc(s.id)+'" aria-label="Favorite" title="Favorite">'+(s.favorite?'★':'☆')+'</button></div></div>';
}
function statusBadge(st){
  var map={completed:['ok','Complete'],crawling:['run','Crawling'],queued:['run','Queued'],failed:['err','Failed'],cancelled:['warn','Cancelled']};
  var m=map[st]||['idle',st];
  return '<span class="badge '+m[0]+'"><span class="dot"></span>'+m[1]+'</span>';
}

function acquire(){
  var seed=document.getElementById('seed').value.trim();
  if(!seed){document.getElementById('seed').focus();return;}
  var cfg={
    maxDepth:Number(document.getElementById('o-depth').value),
    maxPages:Number(document.getElementById('o-pages').value),
    politenessMs:Number(document.getElementById('o-pol').value),
    concurrency:Number(document.getElementById('o-conc').value),
    sameSiteOnly:document.getElementById('o-same').checked,
    respectRobots:document.getElementById('o-robots').checked
  };
  api('POST','/api/crawls',{seedUrl:seed,config:cfg}).then(function(r){
    if(r.id){openCrawl(r.id);}else{alert(r.error||'Could not start the crawl.');}
  });
}

// ---------- Crawl view ----------
function openCrawl(id){stopPoll();window.scrollTo(0,0);tick(id);state.poll=setInterval(function(){tick(id);},1000);}
function stopPoll(){if(state.poll){clearInterval(state.poll);state.poll=null;}}
function tick(id){api('GET','/api/crawls/'+id).then(function(j){
  if(j.error){stopPoll();app.innerHTML='<div class="empty">'+esc(j.error)+'</div>';return;}
  state.current=j;
  var done=(j.status!=='crawling'&&j.status!=='queued');
  if(done)stopPoll();
  renderCrawl(j,done);
});}

function metric(cls,val,k){return '<div class="metric '+cls+'"><div class="n">'+val+'</div><div class="k">'+k+'</div></div>';}
function renderCrawl(j,done){
  var st=j.stats;
  var attempted=st.stored+st.skipped+st.excluded+st.errors;
  var denom=Math.max(st.discovered,attempted,1);
  var pct=Math.min(100,Math.round(attempted/denom*100));
  var live=(j.status==='crawling'||j.status==='queued');
  var html='<a class="btn ghost small" id="back">&larr; All crawls</a>'
   +'<div class="crawlhead"><h1>'+esc(j.site)+'</h1>'
   +'<button class="star '+(j.favorite?'on':'')+'" id="fav" aria-label="Favorite" title="Favorite">'+(j.favorite?'★':'☆')+'</button>'
   +statusBadge(j.status)+'<span class="grow"></span>'
   +(live?'<button class="btn danger small" id="cancel">Stop</button>':'<button class="btn ghost small" id="retry">Re-crawl</button>')
   +(st.stored>0?' <a class="btn ghost small" href="/api/crawls/'+esc(j.id)+'/export.json" download>Export knowledge</a>':'')
   +'</div>'
   +'<div class="muted small" style="overflow-wrap:anywhere">'+esc(j.seedUrl)+' &middot; depth '+j.config.maxDepth+' &middot; up to '+j.config.maxPages+' pages'+(j.config.respectRobots?' &middot; robots respected':'')+(j.error?' &middot; <b style="color:var(--bad)">'+esc(j.error)+'</b>':'')+'</div>'
   +'<div class="progress"><div class="fill" style="width:'+pct+'%"></div></div>'
   +'<div class="muted small">'+(live?'<span class="spin"></span>Acquiring &mdash; ':'')+n(st.stored)+' acquired of '+n(st.discovered)+' discovered</div>'
   +'<div class="telemetry">'
   +metric('',n(st.discovered),'Discovered')
   +metric('',n(st.queued),'Queued')
   +metric('stored',n(st.stored),'Acquired')
   +metric('excl',n(st.excluded),'Excluded')
   +metric('',n(st.skipped),'Skipped')
   +metric('err',n(st.errors),'Errors')
   +metric('',n(st.redirects),'Redirects')
   +metric('',bytes(st.totalBytes),'Downloaded')
   +'</div>'
   +'<div class="split">'
   +'<div><div class="section-title" style="margin-top:0">Live activity</div><div class="feed" id="feed" aria-live="polite"></div></div>'
   +'<div><div class="section-title" style="margin-top:0">Pages ('+n(j.pages.length)+')</div><div class="pages" id="pages"></div></div>'
   +'</div>';
  app.innerHTML=html;
  document.getElementById('back').addEventListener('click',home);
  var fav=document.getElementById('fav');if(fav)fav.addEventListener('click',function(){api('POST','/api/crawls/'+j.id+'/favorite').then(function(r){fav.className='star'+(r.favorite?' on':'');fav.innerHTML=r.favorite?'★':'☆';});});
  var cancel=document.getElementById('cancel');if(cancel)cancel.addEventListener('click',function(){api('POST','/api/crawls/'+j.id+'/cancel');});
  var retry=document.getElementById('retry');if(retry)retry.addEventListener('click',function(){api('POST','/api/crawls/'+j.id+'/retry').then(function(){openCrawl(j.id);});});
  renderFeed(j);renderPages(j);
}
function renderFeed(j){
  var feed=document.getElementById('feed');if(!feed)return;
  if(!j.activity.length){feed.innerHTML='<div class="muted small" style="padding:12px">Waiting for the first signal…</div>';return;}
  var glyph={discover:'◎',store:'✓',skip:'–',exclude:'⊘',error:'!',redirect:'↪',info:'●'};
  feed.innerHTML=j.activity.map(function(e){
    return '<div class="ev"><div class="ico '+e.kind+'" aria-hidden="true">'+(glyph[e.kind]||'·')+'</div>'
     +'<div class="msg"><div class="m">'+esc(e.message)+'</div><div class="t">'+clock(e.at)+'</div></div></div>';
  }).join('');
}
function renderPages(j){
  var pg=document.getElementById('pages');if(!pg)return;
  var pages=j.pages.slice().sort(function(a,b){var r={stored:0,error:1,excluded:2,skipped:3};return (r[a.status]-r[b.status])||a.depth-b.depth;});
  if(!pages.length){pg.innerHTML='<div class="muted small" style="padding:12px">No pages yet.</div>';return;}
  pg.innerHTML=pages.map(function(p){
    var tcls=p.status==='stored'?(p.trusted?'t':'f'):'n';
    var right=p.status==='stored'?(n(p.wordCount)+' words'):esc(p.status==='error'?(p.error||'error'):(p.skipReason||p.status));
    var clickable=p.status==='stored';
    return '<button class="pagerow s-'+p.status+'"'+(clickable?' data-id="'+esc(p.id)+'"':' disabled style="cursor:default"')+'>'
      +'<span class="tdot '+tcls+'" aria-hidden="true"></span>'
      +'<span style="min-width:0"><h4>'+esc(p.title||p.url)+'</h4><div class="u">'+esc(p.url)+'</div></span>'
      +'<span class="rt">'+right+(p.httpStatus?'<br>'+p.httpStatus:'')+'</span></button>';
  }).join('');
  pg.querySelectorAll('.pagerow[data-id]').forEach(function(b){b.addEventListener('click',function(){openPage(j.id,b.getAttribute('data-id'));});});
}

// ---------- Page drawer ----------
function openPage(jobId,pageId){
  dbody.innerHTML='<p class="muted" style="padding:30px 0"><span class="spin"></span>Loading page…</p>';
  openDrawer();
  api('GET','/api/crawls/'+jobId+'/pages/'+pageId).then(function(p){
    if(p.error){dbody.innerHTML='<button class="close" id="dclose">&times;</button><p>'+esc(p.error)+'</p>';bindClose();return;}
    renderPage(p);
  });
}
function renderPage(p){
  var html='<button class="close" id="dclose" aria-label="Close">&times;</button>'
   +'<div class="dhead">Acquired page</div><h2>'+esc(p.title)+'</h2>'
   +'<div class="hero-links"><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">Open original ↗</a>'
   +'<span class="tdot '+(p.trust.trusted?'t':'f')+'" style="align-self:center"></span><span class="small">'+(p.trust.trusted?'Trusted':'Needs review')+' &middot; score '+(Math.round(p.trust.score*100)/100)+'</span></div>';
  if(p.description){html+='<p style="margin:.5em 0 0;color:var(--muted)">'+esc(p.description)+'</p>';}
  // metadata
  html+='<div class="dhead">Details</div><dl class="kv">'
   +kv('Canonical URL',esc(p.canonicalUrl))
   +kv('HTTP status',p.httpStatus==null?'—':String(p.httpStatus))
   +(p.redirectedTo?kv('Redirected to',esc(p.redirectedTo)):'')
   +kv('Language',esc(p.lang||'—'))
   +kv('Words',n(p.wordCount))
   +kv('Links / images',n(p.linkCount)+' / '+n(p.imageCount))
   +kv('Crawl depth',String(p.depth))
   +(p.discoveredFrom?kv('Discovered from',esc(p.discoveredFrom)):'')
   +kv('Extraction confidence',p.extractionConfidence==null?'—':Math.round(p.extractionConfidence*100)+'%')
   +kv('Fetched at',esc(p.fetchedAt||'—'))
   +'</dl>';
  if(p.contentHash){html+='<div class="dhead">Integrity</div><div class="hash">sha-256: '+esc(p.contentHash)+'</div>';}
  // lineage
  if(p.lineage&&p.lineage.length){html+='<div class="dhead">Lineage &mdash; chain of custody</div><div class="lineage">'
    +p.lineage.map(function(nd){return '<span class="node">'+esc(nd.label)+' <span class="small muted">('+esc(nd.kind)+')</span></span>';}).join('<span aria-hidden="true">&larr;</span>')+'</div>';}
  // excerpt
  if(p.excerpt){html+='<div class="dhead">Readable content</div><div class="excerpt">'+esc(p.excerpt)+'</div>';}
  // trust
  html+='<div class="dhead">Trust &mdash; why you can rely on this</div><ul class="reasons">'
    +p.trust.reasons.map(function(r){return '<li>'+esc(r)+'</li>';}).join('')+'</ul>';
  dbody.innerHTML=html;bindClose();
}
function kv(k,v){return '<dt>'+k+'</dt><dd>'+v+'</dd>';}
function bindClose(){var c=document.getElementById('dclose');if(c)c.addEventListener('click',closeDrawer);}
function openDrawer(){scrim.classList.add('open');drawer.classList.add('open');drawer.focus();}
function closeDrawer(){scrim.classList.remove('open');drawer.classList.remove('open');}
scrim.addEventListener('click',closeDrawer);
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDrawer();});

// ---------- Search ----------
var qEl=document.getElementById('q');var qt=null;
qEl.addEventListener('input',function(){clearTimeout(qt);qt=setTimeout(runSearch,240);});
qEl.addEventListener('keydown',function(e){if(e.key==='Enter')runSearch();});
function runSearch(){var q=qEl.value.trim();if(q.length<2)return;stopPoll();
  api('GET','/api/search?q='+encodeURIComponent(q)).then(function(hits){
    app.innerHTML='<a class="btn ghost small" id="back">&larr; Home</a>'
      +'<h1 style="font-size:25px;margin:16px 0 2px;letter-spacing:-.02em">Results for &ldquo;'+esc(q)+'&rdquo;</h1>'
      +'<p class="muted small">Meaning-based search across every acquired page &mdash; each tied back to its source URL.</p>'
      +(hits.length?'<div class="pages" style="margin-top:16px">'+hits.map(function(x){
        return '<button class="pagerow s-stored" data-job="'+esc(x.jobId)+'" data-id="'+esc(x.pageId)+'">'
         +'<span class="tdot '+(x.trusted?'t':'f')+'"></span>'
         +'<span style="min-width:0"><h4>'+esc(x.title)+'</h4><div class="u">'+esc(x.url)+'</div>'
         +(x.snippet?'<div class="small muted" style="margin-top:4px;white-space:normal">'+esc(x.snippet)+'</div>':'')+'</span>'
         +'<span class="rt">'+esc(x.site)+'</span></button>';
      }).join('')+'</div>':'<div class="empty">No matching knowledge yet. Acquire a site to build your searchable knowledge.</div>');
    document.getElementById('back').addEventListener('click',function(){qEl.value='';home();});
    app.querySelectorAll('.pagerow[data-id]').forEach(function(b){b.addEventListener('click',function(){openPage(b.getAttribute('data-job'),b.getAttribute('data-id'));});});
  });
}

document.getElementById('home').addEventListener('click',function(){qEl.value='';home();});
home();
})();
</script>
</body>
</html>`;
