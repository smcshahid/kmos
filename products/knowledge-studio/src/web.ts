/**
 * The Knowledge Studio single-page UI, served at `/`.
 *
 * Self-contained (inline CSS + vanilla JS, zero build step) to match KMOS's zero-
 * dependency philosophy and stay trivially deployable. Design goals: calm, readable,
 * knowledge-first, accessible (WCAG 2.2 AA — semantic landmarks, keyboard paths,
 * visible focus, aria-live progress, reduced-motion). The UI talks only to the
 * Studio HTTP API; it holds no business logic.
 *
 * NOTE: the inline <script> deliberately avoids backtick template literals and `${}`
 * so it can live safely inside this outer template string.
 */

export const STUDIO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Knowledge Studio</title>
<style>
:root{
  --bg:#faf9f7; --panel:#ffffff; --ink:#1c1b1a; --muted:#6b6864; --line:#e7e4df;
  --accent:#5b4bd6; --accent-soft:#efedfb; --good:#2f7d55; --warn:#b06a17;
  --radius:14px; --shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05);
  --maxw:1160px;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#17161a; --panel:#201f25; --ink:#ece9f0; --muted:#a29fab; --line:#302e37;
  --accent:#a99cff; --accent-soft:#272443; --good:#6fce9a; --warn:#e0a25a;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
}}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}
header.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:16px;height:60px}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.01em;cursor:pointer;background:none;border:0;color:inherit;font-size:16px}
.brand .dot{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,var(--accent),#8b7bff)}
.grow{flex:1}
.searchbar{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:6px 14px;min-width:180px;max-width:360px;flex:1}
.searchbar input{border:0;background:none;outline:none;color:inherit;font-size:14px;width:100%}
button{font:inherit;cursor:pointer}
.btn{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:600;box-shadow:var(--shadow)}
.btn.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line);box-shadow:none}
.btn.small{padding:6px 12px;font-size:13px;border-radius:8px}
.btn:focus-visible,a:focus-visible,input:focus-visible,[tabindex]:focus-visible,.chip:focus-visible{outline:2.5px solid var(--accent);outline-offset:2px}
main{padding:34px 0 80px}
.hero h1{font-size:clamp(30px,4.4vw,46px);line-height:1.08;letter-spacing:-.02em;margin:.1em 0 .3em}
.hero p.lede{font-size:19px;color:var(--muted);max-width:60ch;margin:0 0 26px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.composer{padding:20px}
.tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.tab{background:none;border:1px solid transparent;border-radius:8px;padding:7px 12px;color:var(--muted);font-weight:600;font-size:14px}
.tab[aria-selected=true]{background:var(--accent-soft);color:var(--accent);border-color:transparent}
textarea,input.text{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:10px;color:inherit;padding:12px 14px;font:inherit;resize:vertical}
textarea{min-height:150px;line-height:1.55}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.muted{color:var(--muted)}
.small{font-size:13px}
.section-title{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;margin:34px 0 12px}
.grid{display:grid;gap:14px}
.lib{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.libcard{display:flex;align-items:flex-start;gap:8px;padding:14px 16px;border:1px solid var(--line);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow)}
.libopen{flex:1;min-width:0;text-align:left;background:none;border:0;color:inherit;padding:0}
.libopen h3{margin:0 0 4px;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.libact{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.star{background:none;border:0;font-size:18px;line-height:1;color:var(--muted);padding:2px}
.star.on{color:#e0a53a}
.retry{background:var(--accent-soft);color:var(--accent);border:0;border-radius:7px;padding:4px 10px;font-size:12.5px;font-weight:600}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--muted);background:var(--bg);border:1px solid var(--line);padding:3px 9px;border-radius:999px}
.badge.ok{color:var(--good)} .badge.run{color:var(--accent)} .badge.err{color:var(--warn)}
/* pipeline */
.pipe{display:grid;gap:2px;margin-top:8px}
.stage{display:grid;grid-template-columns:26px 1fr auto;gap:12px;align-items:start;padding:12px;border-radius:10px}
.stage .ic{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);margin-top:2px;display:grid;place-items:center;font-size:12px;color:#fff}
.stage.done .ic{background:var(--good);border-color:var(--good)}
.stage.running .ic{background:var(--accent);border-color:var(--accent);animation:pulse 1.4s ease-in-out infinite}
.stage.skipped .ic{background:var(--muted);border-color:var(--muted)}
.stage.failed .ic{background:var(--warn);border-color:var(--warn)}
.stage .lbl{font-weight:600}
.stage .det{color:var(--muted);font-size:13px}
.stage .mode{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:2px 6px;white-space:nowrap}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* source layout */
.layout{display:grid;grid-template-columns:230px 1fr;gap:26px;align-items:start}
.outline{position:sticky;top:80px}
.outline a{display:block;color:var(--muted);text-decoration:none;padding:6px 8px;border-radius:7px;font-size:14px}
.outline a:hover{background:var(--accent-soft);color:var(--accent)}
.outline .tc{font-variant-numeric:tabular-nums;font-size:12px;opacity:.7;margin-right:6px}
.concepts{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.concept{padding:15px;text-align:left;border:1px solid var(--line);background:var(--panel);border-radius:12px;box-shadow:var(--shadow)}
.concept h4{margin:0 0 6px;font-size:15.5px;letter-spacing:-.01em}
.concept p{margin:0;color:var(--muted);font-size:13.5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.concept .meta{margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tdot{width:9px;height:9px;border-radius:50%;display:inline-block}
.tdot.t{background:var(--good)} .tdot.f{background:var(--warn)}
/* transcript */
.chapter{margin:22px 0 8px;font-weight:650;letter-spacing:-.01em}
.chapter .tc{color:var(--accent);font-variant-numeric:tabular-nums;margin-right:8px}
.seg{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:3px 0}
.seg .tc{color:var(--muted);font-size:12.5px;font-variant-numeric:tabular-nums;padding-top:3px}
mark{background:var(--accent-soft);color:inherit;padding:0 2px;border-radius:3px}
/* downloads */
.dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.dl a{display:flex;gap:10px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--panel);text-decoration:none;color:inherit;box-shadow:var(--shadow)}
.dl a b{font-size:14.5px}
/* drawer (concept detail) */
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.34);opacity:0;pointer-events:none;transition:opacity .18s;z-index:40}
.scrim.open{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;height:100%;width:min(560px,94vw);background:var(--panel);border-left:1px solid var(--line);transform:translateX(100%);transition:transform .22s ease;z-index:50;overflow:auto;box-shadow:-12px 0 40px rgba(0,0,0,.18)}
.drawer.open{transform:none}
.drawer .inner{padding:24px 26px 60px}
.drawer h2{font-size:24px;letter-spacing:-.02em;margin:.2em 40px .1em 0}
.quote{border-left:3px solid var(--accent);padding:8px 0 8px 14px;margin:12px 0;color:var(--ink)}
.quote .cite{display:block;color:var(--muted);font-size:12.5px;margin-top:6px}
.jump{background:var(--accent-soft);color:var(--accent);border:0;border-radius:7px;padding:3px 9px;font-size:12.5px;font-weight:600;margin-left:6px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13px;color:var(--ink)}
.chip .rel{color:var(--muted);font-size:11px}
.lineage{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:13.5px}
.lineage .node{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:5px 10px;color:var(--ink)}
.reasons{list-style:none;padding:0;margin:8px 0}
.reasons li{padding:5px 0 5px 24px;position:relative;font-size:14px}
.reasons li::before{content:"✓";position:absolute;left:0;color:var(--good);font-weight:700}
.close{position:absolute;top:16px;right:18px;background:var(--bg);border:1px solid var(--line);border-radius:9px;width:34px;height:34px;font-size:18px;line-height:1}
.dhead{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;margin:22px 0 6px}
.empty{padding:40px;text-align:center;color:var(--muted)}
.spin{display:inline-block;width:16px;height:16px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;vertical-align:-3px;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;position:fixed;background:var(--panel);padding:8px 12px;border-radius:8px;z-index:99;border:1px solid var(--line)}
@media(max-width:760px){.layout{grid-template-columns:1fr}.outline{position:static}}
</style>
</head>
<body>
<a href="#main" class="skip">Skip to content</a>
<header class="top"><div class="wrap">
  <button class="brand" id="home" aria-label="Knowledge Studio home"><span class="dot" aria-hidden="true"></span> Knowledge&nbsp;Studio</button>
  <div class="grow"></div>
  <div class="searchbar" role="search">
    <span aria-hidden="true">⌕</span>
    <input id="q" type="search" placeholder="Search ideas across everything…" aria-label="Search knowledge" autocomplete="off" />
  </div>
</div></header>
<main id="main" tabindex="-1"><div class="wrap" id="app"></div></main>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Concept detail" tabindex="-1"><div class="inner" id="drawer-body"></div></aside>

<script>
(function(){
"use strict";
var app=document.getElementById('app');
var drawer=document.getElementById('drawer');
var scrim=document.getElementById('scrim');
var dbody=document.getElementById('drawer-body');
var state={current:null,poll:null};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(sec){sec=Math.max(0,Math.floor(sec||0));var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;var mm=h>0?String(m).padStart(2,'0'):String(m);return (h>0?h+':':'')+mm+':'+String(s).padStart(2,'0');}
function api(method,path,body){return fetch(path,{method:method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json();});}
function h(html){var d=document.createElement('div');d.innerHTML=html;return d;}

// ---------- Home ----------
function home(){
  stopPoll();
  app.innerHTML=''
   +'<section class="hero">'
   +'<h1>Drop long-form knowledge in.<br>Leave with understanding.</h1>'
   +'<p class="lede">Paste a YouTube link or a transcript. Knowledge Studio turns it into a navigable map of ideas &mdash; every concept grounded in the exact moment it was said, with lineage and explainable trust.</p>'
   +'<div class="card composer">'
   +'  <div class="tabs" role="tablist" aria-label="Source type">'
   +'    <button class="tab" role="tab" data-k="youtube" aria-selected="false">YouTube URL</button>'
   +'    <button class="tab" role="tab" data-k="transcript" aria-selected="true">Paste transcript</button>'
   +'    <button class="tab" role="tab" data-k="upload" aria-selected="false">Upload</button>'
   +'  </div>'
   +'  <div id="composer-body"></div>'
   +'  <div class="row" style="margin-top:14px">'
   +'    <button class="btn" id="process">Process</button>'
   +'    <button class="btn ghost small" id="sample">Try the sample lecture</button>'
   +'    <span class="grow"></span>'
   +'    <label class="small muted">Translate to <select id="lang" class="btn ghost small" style="padding:6px 8px"><option value="">(none)</option><option value="fr">French</option><option value="ar">Arabic</option><option value="es">Spanish</option></select></label>'
   +'  </div>'
   +'</div>'
   +'</section>'
   +'<div id="library"></div>';
  state.kind='transcript';
  composerBody();
  document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){x.setAttribute('aria-selected','false');});
    t.setAttribute('aria-selected','true');state.kind=t.getAttribute('data-k');composerBody();});});
  document.getElementById('process').addEventListener('click',submit);
  document.getElementById('sample').addEventListener('click',loadSample);
  loadLibrary();
}
function composerBody(){
  var b=document.getElementById('composer-body');
  if(state.kind==='youtube'){b.innerHTML='<input class="text" id="ref" placeholder="https://www.youtube.com/watch?v=…" aria-label="YouTube URL" /><p class="small muted" style="margin:8px 2px 0">Offline, paste the captions/transcript below. In production a yt-dlp + Whisper capability fetches them automatically.</p><textarea id="tx" placeholder="(Optional here) paste transcript / captions" aria-label="Transcript" style="margin-top:8px"></textarea>';}
  else if(state.kind==='upload'){b.innerHTML='<input class="text" id="ref" placeholder="lecture.mp4" aria-label="File name" /><p class="small muted" style="margin:8px 2px 0">Media decode + transcription run via ffmpeg/Whisper capabilities in production. Paste the transcript to process now.</p><textarea id="tx" placeholder="Paste transcript" aria-label="Transcript" style="margin-top:8px"></textarea>';}
  else{b.innerHTML='<textarea id="tx" placeholder="Paste a transcript. Timestamped lines like [00:12] … are used for exact jump-to-moment; plain prose gets estimated timing." aria-label="Transcript"></textarea><input class="text" id="ref" placeholder="Title (optional)" aria-label="Title" style="margin-top:10px" />';}
}
function loadSample(){api('GET','/api/sample').then(function(s){state.kind='transcript';
  document.querySelectorAll('.tab').forEach(function(x){x.setAttribute('aria-selected',x.getAttribute('data-k')==='transcript'?'true':'false');});
  composerBody();document.getElementById('tx').value=s.transcript;document.getElementById('ref').value=s.title;});}
function isYouTube(u){return /(?:youtube\\.com\\/(?:watch\\?[^\\s]*v=|embed\\/|shorts\\/|live\\/)|youtu\\.be\\/)[A-Za-z0-9_-]{11}/.test(u||'');}
function submit(){
  var tx=document.getElementById('tx'),ref=document.getElementById('ref');
  var payload={kind:state.kind,reference:(ref&&ref.value)||'Untitled',transcript:(tx&&tx.value)||'',targetLanguage:document.getElementById('lang').value};
  if(state.kind==='transcript'){payload.title=(ref&&ref.value)||'';payload.reference=payload.title||'Pasted transcript';}
  // Auto-detect a YouTube link pasted into any field (friction reducer).
  if(isYouTube(payload.reference)||isYouTube(payload.transcript.split('\\n')[0])){payload.kind='youtube';if(isYouTube(payload.transcript.split('\\n')[0])&&payload.transcript.split('\\n').length<2){payload.reference=payload.transcript.trim();payload.transcript='';}}
  if(!payload.transcript.trim()&&payload.kind!=='youtube'){alert('Paste a transcript to process.');return;}
  if(payload.kind==='youtube'&&!payload.reference.trim()){alert('Enter a YouTube URL.');return;}
  api('POST','/api/sources',payload).then(function(r){if(r.id){openSource(r.id);}else{alert(r.error||'Could not start.');}});
}
function loadLibrary(){api('GET','/api/sources').then(function(list){
  var lib=document.getElementById('library');if(!lib)return;
  if(!list.length){lib.innerHTML='';return;}
  var favs=list.filter(function(s){return s.favorite;});
  var rest=list.filter(function(s){return !s.favorite;});
  var html='';
  if(favs.length){html+='<div class="section-title">Favorites</div><div class="grid lib">'+favs.map(card).join('')+'</div>';}
  html+='<div class="section-title">'+(favs.length?'Recent':'Your library')+'</div><div class="grid lib">'+rest.map(card).join('')+'</div>';
  lib.innerHTML=html;
  lib.querySelectorAll('.libopen').forEach(function(c){c.addEventListener('click',function(){openSource(c.getAttribute('data-id'));});});
  lib.querySelectorAll('.star').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();
    api('POST','/api/sources/'+b.getAttribute('data-id')+'/favorite').then(function(){loadLibrary();});});});
  lib.querySelectorAll('.retry').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();
    api('POST','/api/sources/'+b.getAttribute('data-id')+'/retry').then(function(){openSource(b.getAttribute('data-id'));});});});
});}
function card(s){
  return '<div class="libcard">'
    +'<button class="libopen" data-id="'+esc(s.id)+'"><h3>'+esc(s.title)+'</h3>'
    +'<div class="muted small">'+badge(s.status)+' &middot; '+s.conceptCount+' concepts &middot; '+s.chapterCount+' chapters</div></button>'
    +'<div class="libact"><button class="star '+(s.favorite?'on':'')+'" data-id="'+esc(s.id)+'" aria-label="'+(s.favorite?'Unfavorite':'Favorite')+'" title="'+(s.favorite?'Unfavorite':'Favorite')+'">'+(s.favorite?'\\u2605':'\\u2606')+'</button>'
    +(s.status==='failed'?'<button class="retry" data-id="'+esc(s.id)+'">Retry</button>':'')+'</div></div>';
}
function badge(st){var cls=st==='ready'?'ok':st==='failed'?'err':'run';var lbl=st==='ready'?'Ready':st==='failed'?'Failed':'Processing';return '<span class="badge '+cls+'">'+lbl+'</span>';}

// ---------- Source (processing + ready) ----------
function openSource(id){stopPoll();window.scrollTo(0,0);tick(id);state.poll=setInterval(function(){tick(id);},900);}
function stopPoll(){if(state.poll){clearInterval(state.poll);state.poll=null;}}
function tick(id){api('GET','/api/sources/'+id).then(function(s){if(s.error&&!s.id){return;}state.current=s;
  if(s.status==='ready'){stopPoll();renderReady(s);}else if(s.status==='failed'){stopPoll();renderProcessing(s);}else{renderProcessing(s);}});}

function renderProcessing(s){
  var html='<a class="btn ghost small" id="back">&larr; Library</a>'
   +'<h1 style="margin:16px 0 2px;font-size:30px;letter-spacing:-.02em">'+esc(s.title)+'</h1>'
   +'<p class="muted" aria-live="polite">'+(s.status==='failed'?'<b style="color:var(--warn)">Could not finish:</b> '+esc(s.error||''):'<span class="spin"></span>Turning this into knowledge…')+'</p>'
   +(s.status==='failed'?'<p style="margin:-6px 0 14px"><button class="btn small" id="retry">Retry processing</button></p>':'')
   +'<div class="card" style="padding:10px"><div class="pipe">';
  s.stages.forEach(function(st){
    var mark=st.status==='done'?'✓':st.status==='skipped'?'–':st.status==='failed'?'!':'';
    html+='<div class="stage '+st.status+'"><div class="ic" aria-hidden="true">'+mark+'</div>'
      +'<div><div class="lbl">'+esc(st.label)+'</div>'+(st.detail?'<div class="det">'+esc(st.detail)+'</div>':'')+'</div>'
      +'<div class="mode">'+modeLabel(st.mode)+'</div></div>';
  });
  html+='</div></div>';
  app.innerHTML=html;document.getElementById('back').addEventListener('click',home);
  var rt=document.getElementById('retry');if(rt){rt.addEventListener('click',function(){api('POST','/api/sources/'+s.id+'/retry').then(function(){openSource(s.id);});});}
}
function modeLabel(m){return m==='kmos'?'KMOS':m==='projection'?'projection':m==='reference'?'reference AI':m==='external'?'needs infra':m;}

function renderReady(s){
  var html='<a class="btn ghost small" id="back">&larr; Library</a>'
   +'<div class="row" style="margin:16px 0 4px"><h1 style="margin:0;font-size:30px;letter-spacing:-.02em">'+esc(s.title)+'</h1>'
   +'<span class="grow"></span><button class="star '+(s.favorite?'on':'')+'" id="fav" aria-label="Favorite" title="Favorite">'+(s.favorite?'\\u2605':'\\u2606')+'</button><span class="badge ok">Ready</span></div>'
   +'<p class="muted small">'+s.chapters.length+' chapters &middot; '+s.conceptIds.length+' concepts &middot; '+Math.round(s.durationSec/60)+' min &middot; grounded in a durable KMOS knowledge graph</p>'
   +'<div class="tabs" role="tablist" style="margin:18px 0 20px">'
   +'<button class="tab" role="tab" data-v="concepts" aria-selected="true">Concepts</button>'
   +'<button class="tab" role="tab" data-v="transcript" aria-selected="false">Transcript</button>'
   +'<button class="tab" role="tab" data-v="downloads" aria-selected="false">Download center</button></div>'
   +'<div id="view"></div>';
  app.innerHTML=html;
  document.getElementById('back').addEventListener('click',home);
  var fav=document.getElementById('fav');if(fav){fav.addEventListener('click',function(){api('POST','/api/sources/'+s.id+'/favorite').then(function(r){s.favorite=r.favorite;fav.className='star'+(r.favorite?' on':'');fav.innerHTML=r.favorite?'\\u2605':'\\u2606';});});}
  var tabs=document.querySelectorAll('.tab');
  tabs.forEach(function(t){t.addEventListener('click',function(){tabs.forEach(function(x){x.setAttribute('aria-selected','false');});t.setAttribute('aria-selected','true');showView(s,t.getAttribute('data-v'));});});
  showView(s,'concepts');
}
function showView(s,v){
  if(v==='transcript')return viewTranscript(s);
  if(v==='downloads')return viewDownloads(s);
  return viewConcepts(s);
}
function viewConcepts(s){
  var view=document.getElementById('view');
  view.innerHTML='<div class="layout"><nav class="outline" aria-label="Chapters"><div class="dhead">Chapters</div>'
    +s.chapters.map(function(c){return '<a href="#" data-t="'+c.startSec+'"><span class="tc">'+fmt(c.startSec)+'</span>'+esc(c.title)+'</a>';}).join('')
    +'</nav><div><div class="dhead">Concepts &mdash; every one verifiable</div><div class="grid concepts" id="cx"><p class="muted">Loading…</p></div></div></div>';
  view.querySelectorAll('.outline a').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();
    document.querySelector('.tab[data-v=transcript]').click();setTimeout(function(){var el=document.getElementById('t'+a.getAttribute('data-t'));if(el)el.scrollIntoView({block:'center'});},60);});});
  api('GET','/api/sources/'+s.id+'/concepts').then(function(cs){
    var cx=document.getElementById('cx');if(!cx)return;
    if(!cs.length){cx.innerHTML='<p class="muted">No concepts were extracted.</p>';return;}
    cx.innerHTML=cs.map(function(c){return '<button class="concept" data-id="'+esc(c.id)+'"><h4>'+esc(c.name)+'</h4><p>'+esc(c.definition)+'</p>'
      +'<div class="meta"><span class="tdot '+(c.trusted?'t':'f')+'" aria-hidden="true"></span><span class="small muted">'+(c.trusted?'Trusted':'Needs review')+'</span>'
      +'<span class="small muted">&middot; '+c.evidenceCount+' quote'+(c.evidenceCount===1?'':'s')+'</span></div></button>';}).join('');
    cx.querySelectorAll('.concept').forEach(function(b){b.addEventListener('click',function(){openConcept(b.getAttribute('data-id'));});});
  });
}
function viewTranscript(s){
  var view=document.getElementById('view');var html='<div style="max-width:74ch">';
  if(!s.chapters.length){s.segments.forEach(function(g){html+=seg(g);});}
  else{s.chapters.forEach(function(ch){html+='<h3 class="chapter" id="t'+ch.startSec+'"><span class="tc">'+fmt(ch.startSec)+'</span>'+esc(ch.title)+'</h3>';
    for(var i=ch.segmentStart;i<=ch.segmentEnd;i++){var g=s.segments[i];if(g)html+=seg(g);}});}
  html+='</div>';view.innerHTML=html;
}
function seg(g){return '<div class="seg" id="seg'+g.startSec+'"><div class="tc">'+fmt(g.startSec)+'</div><div>'+esc(g.text)+'</div></div>';}
function viewDownloads(s){
  var base='/api/sources/'+s.id+'/download/';
  var items=[['transcript.txt','Transcript','Plain, timecoded text'],['transcript.md','Transcript (Markdown)','Chaptered & timecoded'],
    ['study-notes.md','Study notes','Concepts + cited quotes + trust'],['concepts.json','Concepts (JSON)','Machine-readable knowledge'],
    ['package.json','Knowledge package','Everything: transcript, chapters, concepts, evidence, lineage']];
  document.getElementById('view').innerHTML='<p class="muted" style="margin-top:0">One source, many reusable products. Every export carries citations back to the source moment.</p><div class="dl">'
    +items.map(function(it){return '<a href="'+base+it[0]+'" download><span aria-hidden="true">⬇</span><span><b>'+esc(it[1])+'</b><br><span class="small muted">'+esc(it[2])+'</span></span></a>';}).join('')+'</div>';
}

// ---------- Concept drawer ----------
function openConcept(id){
  dbody.innerHTML='<p class="muted" style="padding:30px 0"><span class="spin"></span>Loading concept…</p>';
  openDrawer();
  api('GET','/api/concepts/'+id).then(function(c){if(c.error){dbody.innerHTML='<p>'+esc(c.error)+'</p>';return;}renderConcept(c);});
}
function renderConcept(c){
  var html='<button class="close" id="dclose" aria-label="Close">&times;</button>'
   +'<div class="dhead">Concept</div><h2>'+esc(c.name)+'</h2>'
   +'<p style="margin:.2em 0 4px">'+esc(c.definition||'No definition available.')+'</p>'
   +'<p class="small muted">from '+esc(c.sourceTitle)+'</p>';
  // evidence
  html+='<div class="dhead">Evidence &mdash; the proof</div>';
  if(c.evidence.length){c.evidence.forEach(function(e){
    html+='<blockquote class="quote">&ldquo;'+esc(e.quote)+'&rdquo;<span class="cite">@ '+fmt(e.startSec)+(e.timedExactly?'':' (estimated)')
      +'<button class="jump" data-t="'+e.startSec+'">Jump to moment</button></span></blockquote>';});
  }else{html+='<p class="muted small">No exact passage was located, so this concept is marked as needing review rather than shown with a fabricated quote.</p>';}
  // related
  if(c.related.length){html+='<div class="dhead">Related concepts</div><div class="chips">'
    +c.related.map(function(r){return '<button class="chip" data-id="'+esc(r.id)+'">'+esc(r.name)+' <span class="rel">'+esc(r.relation)+'</span></button>';}).join('')+'</div>';}
  // lineage
  if(c.lineage.length){html+='<div class="dhead">Lineage &mdash; chain of custody</div><div class="lineage">'
    +c.lineage.map(function(n){return '<span class="node">'+esc(n.label)+' <span class="small muted">('+esc(n.kind)+')</span></span>';}).join('<span aria-hidden="true">&larr;</span>')+'</div>';}
  // trust
  html+='<div class="dhead">Trust &mdash; why you can rely on this</div>'
    +'<p class="small" style="margin:.2em 0"><span class="tdot '+(c.trust.trusted?'t':'f')+'"></span> <b>'+(c.trust.trusted?'Trusted':'Needs review')+'</b> <span class="muted">(score '+(Math.round(c.trust.score*100)/100)+')</span></p>'
    +'<ul class="reasons">'+c.trust.reasons.map(function(r){return '<li>'+esc(r)+'</li>';}).join('')+'</ul>';
  dbody.innerHTML=html;
  document.getElementById('dclose').addEventListener('click',closeDrawer);
  dbody.querySelectorAll('.jump').forEach(function(j){j.addEventListener('click',function(){closeDrawer();
    var vt=document.querySelector('.tab[data-v=transcript]');if(vt){vt.click();setTimeout(function(){var el=document.getElementById('seg'+j.getAttribute('data-t'));if(el){el.scrollIntoView({block:'center'});flash(el);}},80);}});});
  dbody.querySelectorAll('.chip[data-id]').forEach(function(ch){ch.addEventListener('click',function(){openConcept(ch.getAttribute('data-id'));});});
  drawer.focus();
}
function flash(el){var m=el.querySelector('div:last-child');if(!m)return;var t=m.innerHTML;m.innerHTML='<mark>'+t+'</mark>';setTimeout(function(){m.innerHTML=t;},1600);}
function openDrawer(){scrim.classList.add('open');drawer.classList.add('open');}
function closeDrawer(){scrim.classList.remove('open');drawer.classList.remove('open');}
scrim.addEventListener('click',closeDrawer);
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDrawer();});

// ---------- Search ----------
var qEl=document.getElementById('q');var qt=null;
qEl.addEventListener('input',function(){clearTimeout(qt);qt=setTimeout(runSearch,220);});
qEl.addEventListener('keydown',function(e){if(e.key==='Enter')runSearch();});
function runSearch(){var q=qEl.value.trim();if(q.length<2){return;}stopPoll();
  api('GET','/api/search?q='+encodeURIComponent(q)).then(function(hits){
    app.innerHTML='<a class="btn ghost small" id="back">&larr; Library</a><h1 style="font-size:26px;margin:16px 0 2px">Results for &ldquo;'+esc(q)+'&rdquo;</h1>'
      +'<p class="muted small">Meaning-based search across every concept &mdash; each with its supporting quote.</p>'
      +(hits.length?'<div class="grid concepts" style="margin-top:16px">'+hits.map(function(x){return '<button class="concept" data-id="'+esc(x.id)+'"><h4>'+esc(x.name)+'</h4>'
        +(x.quote?'<p>&ldquo;'+esc(x.quote)+'&rdquo;</p>':'<p class="muted">No quote located.</p>')
        +'<div class="meta"><span class="small muted">'+(x.startSec!=null?'@ '+fmt(x.startSec):'')+'</span></div></button>';}).join('')+'</div>'
        :'<div class="empty">No matching ideas yet. Process a source to build your knowledge.</div>');
    document.getElementById('back').addEventListener('click',home);
    app.querySelectorAll('.concept').forEach(function(b){b.addEventListener('click',function(){openConcept(b.getAttribute('data-id'));});});
  });
}

document.getElementById('home').addEventListener('click',function(){qEl.value='';home();});
home();
})();
</script>
</body>
</html>`;
