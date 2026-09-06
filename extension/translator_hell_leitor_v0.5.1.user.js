// ==UserScript==
// @name         Translator Hell v0.5.1 — Leitor
// @namespace    https://translatorhell.local/
// @version      0.5.1
// @description  Módulo leitor: extração adaptativa, cache atual+próximo e pré-tradução inteligente sem recarregar quando possível.
// @match        *://*/*
// @match        file:///*
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @run-at       document-end
// ==/UserScript==

(function(){
'use strict';
if(location.hash.includes('translatorhell-prefetch-frame')) return;
if(location.hostname==='example.com' && new URL(location.href).searchParams.has('translatorhell-bridge')) return;
const VERSION='0.5.1', REQ='translator-hell:v1:translate-request', RES='translator-hell:v1:translate-response';
const CACHE='th-mod-reader-cache-v2', PROFILE='th-mod-adaptive-extractor-v1', THRESHOLD=.60;
let overlay=null, sourceCtx=null, nav={prev:null,next:null}, busy=false, prefetchBusy=false, prefetchedQueued=false, virtual=false;
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
const J=(s,f)=>{try{return JSON.parse(s)}catch(_){return f}};
const abs=(u,b=location.href)=>{try{return new URL(u,b).href}catch(_){return''}};
function routeKey(url=location.href){try{const u=new URL(url);return u.host+u.pathname.replace(/\/\d+\.(?:html?|shtml?)$/i,'/:chapter').replace(/\/[^/]*$/,'')}catch(_){return location.host}}
function bookKey(url=location.href){try{const u=new URL(url);const m=u.pathname.match(/\/book\/(\d+)/i);return m?u.host+'|book:'+m[1]:routeKey(url)}catch(_){return routeKey(url)}}
function getCache(){return J(localStorage.getItem(CACHE),[])}
function saveCache(list){localStorage.setItem(CACHE,JSON.stringify(list.slice(0,16)))}
function setCache(entry){let list=getCache().filter(x=>x.url!==entry.url);list.unshift(entry);let n=0;list=list.filter(x=>x.bookKey!==entry.bookKey||++n<=2);saveCache(list);}
function prune(current,next){const bk=bookKey(current);const allowed=new Set([abs(current),abs(next)].filter(Boolean));saveCache(getCache().filter(x=>x.bookKey!==bk||allowed.has(abs(x.url))));}
function cached(url){const u=abs(url);return getCache().find(x=>abs(x.url)===u)}
let homeBridge=null, homeBridgeReady=false, pendingLibraryEntry=null;
function ensureHomeBridge(){
  if(location.hostname==='example.com') return null;
  if(homeBridge&&homeBridge.isConnected) return homeBridge;
  homeBridge=document.createElement('iframe'); homeBridge.src='https://example.com/?translatorhell-bridge=1';
  homeBridge.style.cssText='position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0';
  homeBridge.onload=()=>{homeBridgeReady=true;if(pendingLibraryEntry) syncHome(pendingLibraryEntry)};
  (document.documentElement||document.body).appendChild(homeBridge); return homeBridge;
}
function syncHome(entry){
  if(!entry?.url)return; pendingLibraryEntry=entry; const f=ensureHomeBridge(); if(!f||!homeBridgeReady)return;
  try{f.contentWindow.postMessage({type:'translator-hell:v1:library-upsert',entry},'https://example.com')}catch(_){}
}
function libraryEntry(ctx){return {url:ctx.url,title:ctx.title||document.title,chapterTitle:ctx.title||'',bookKey:ctx.bookKey,updatedAt:Date.now()}}

function visible(el,win=window){try{const s=win.getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)!==0&&r.width>0&&r.height>0}catch(_){return true}}
function stableSelector(el,doc=document){if(!el)return'';if(el.id)return'#'+CSS.escape(el.id);for(const c of [...el.classList]){if(c&&doc.querySelectorAll('.'+CSS.escape(c)).length===1)return'.'+CSS.escape(c)}return el.tagName.toLowerCase()}
function profiles(){return J(localStorage.getItem(PROFILE),{})}
function learn(root,url){if(!root||root===document.body)return;const p=profiles(),k=routeKey(url);p[k]={selector:stableSelector(root,root.ownerDocument),updatedAt:Date.now(),hits:(p[k]?.hits||0)+1};const keep=Object.entries(p).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,40);localStorage.setItem(PROFILE,JSON.stringify(Object.fromEntries(keep)))}
function mainRoot(doc,url){const p=profiles()[routeKey(url)];if(p?.selector){try{const x=doc.querySelector(p.selector);if(x&&norm(x.textContent).length>300)return x}catch(_){}}
 const sels=['#content','.content','.chapter-content','.chapter_content','.read-content','.reader-content','.article-content','article','main'];let best=null,score=0;for(const s of sels)for(const e of doc.querySelectorAll(s)){const t=norm(e.textContent).length;if(t>score){best=e;score=t}}if(best)return best;for(const e of doc.querySelectorAll('div,section')){const ps=e.querySelectorAll(':scope > p').length,t=norm(e.textContent).length;if(ps>=3&&t>score){best=e;score=t}}return best||doc.body}
function findNav(doc,type,base){const words=type==='next'?['下一章','下一页','next chapter','next','próximo','seguinte','›','»']:['上一章','上一页','previous chapter','prev','anterior','‹','«'];for(const a of doc.querySelectorAll('a[href]')){const txt=norm(a.textContent).toLocaleLowerCase();if(words.some(w=>txt===w||txt.includes(w))){const h=abs(a.getAttribute('href'),base);if(h&&h!==abs(base))return h}}return null}
function snapshot(doc=document,url=location.href,styleWin=window){const root=mainRoot(doc,url),title=norm((doc.querySelector('h1')||doc.querySelector('.title')||{}).textContent)||norm(doc.title);let els=[...root.querySelectorAll('p,h2,h3,blockquote,li')].filter(e=>visible(e,styleWin)&&norm(e.textContent).length>0);if(els.length<3)els=[...root.children].filter(e=>visible(e,styleWin)&&norm(e.textContent).length>1);const blocks=els.map(e=>({tag:/^(P|H2|H3|BLOCKQUOTE|LI)$/.test(e.tagName)?e.tagName.toLowerCase():'p',text:norm(e.textContent)})).filter(x=>x.text.length>0);if(doc===document&&!virtual&&blocks.length>=3)learn(root,url);return {url:abs(url),bookKey:bookKey(url),title,blocks,prevHref:findNav(doc,'prev',url),nextHref:findNav(doc,'next',url)}}

function requestTranslate(texts,ctx={}){if(window.__translatorHellV1?.translate)return window.__translatorHellV1.translate(texts,ctx);return new Promise((resolve,reject)=>{const id='r'+Date.now()+Math.random();let timer=setTimeout(()=>{document.removeEventListener(RES,on);googleMany(texts,ctx.lang||'pt').then(resolve,reject)},250);function on(e){if(e.detail?.requestId!==id)return;clearTimeout(timer);document.removeEventListener(RES,on);e.detail.ok?resolve(e.detail.results):reject(new Error(e.detail.error||'falha'));}document.addEventListener(RES,on);document.dispatchEvent(new CustomEvent(REQ,{detail:Object.assign({requestId:id,texts},ctx)}));});}
function gm(o){return new Promise((res,rej)=>GM_xmlhttpRequest(Object.assign({},o,{onload:res,onerror:rej,ontimeout:()=>rej(new Error('timeout'))})))}
async function googleOne(t,lang){const r=await gm({method:'GET',url:'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='+encodeURIComponent(lang)+'&dt=t&q='+encodeURIComponent(t),timeout:16000});if(r.status<200||r.status>=300)throw new Error('Google '+r.status);return JSON.parse(r.responseText)[0].map(x=>x[0]||'').join('')}
async function googleMany(a,lang='pt'){const out=[];for(const t of a)out.push(await googleOne(t,lang));return out}

function render(ctx,translations=null){sourceCtx=ctx;nav={prev:ctx.prevHref,next:ctx.nextHref};virtual=ctx.url!==abs(location.href);if(overlay)overlay.remove();overlay=document.createElement('div');overlay.id='th-mod-reader';overlay.style.cssText='position:fixed;inset:0;z-index:2147483645;background:#f6f2e9;color:#211f1b;overflow:auto;padding:0;';const bar=document.createElement('div');bar.style.cssText='position:sticky;top:0;z-index:5;background:#17191e;color:white;padding:10px;display:flex;gap:8px;align-items:center;';const close=document.createElement('button');close.textContent='Fechar';close.onclick=()=>{overlay.remove();overlay=null;virtual=false};const prev=document.createElement('button');prev.textContent='◀';prev.disabled=!nav.prev;prev.onclick=()=>navigate(nav.prev);const tr=document.createElement('button');tr.textContent=translations?'Traduzido':'Traduzir';tr.onclick=()=>translateCurrent(tr);const next=document.createElement('button');next.textContent='▶';next.disabled=!nav.next;next.onclick=()=>navigate(nav.next);const st=document.createElement('span');st.id='th-mod-status';st.style.marginLeft='auto';st.textContent='Leitor '+VERSION;[close,prev,tr,next,st].forEach(x=>bar.appendChild(x));const article=document.createElement('article');article.style.cssText='max-width:760px;margin:0 auto;padding:36px 24px 100px;font:20px/1.85 Georgia,serif;';const h=document.createElement('h1');h.dataset.i='title';h.textContent=translations?.title||ctx.title;article.appendChild(h);ctx.blocks.forEach((b,i)=>{const e=document.createElement(b.tag||'p');e.dataset.i=String(i);e.textContent=translations?.blocks?.[i]??b.text;article.appendChild(e)});overlay.append(bar,article);document.body.appendChild(overlay);if(translations){tr.disabled=true;tr.textContent='Traduzido';}prune(ctx.url,ctx.nextHref);syncHome(libraryEntry(ctx));if(translations&&ctx.nextHref){prefetchedQueued=true;setTimeout(kickPrefetch,100)}}
function status(t){const e=document.getElementById('th-mod-status');if(e)e.textContent=t}
async function translateCurrent(btn){if(busy||!sourceCtx)return;busy=true;btn.disabled=true;const items=[sourceCtx.title,...sourceCtx.blocks.map(x=>x.text)],out=new Array(items.length);let done=0;try{for(let i=0;i<items.length;i+=6){const chunk=items.slice(i,i+6);const r=await requestTranslate(chunk,{bookKey:sourceCtx.bookKey,lang:'pt'});r.forEach((v,j)=>out[i+j]=v);done+=chunk.length;const ratio=done/items.length;status('Traduzindo '+Math.round(ratio*100)+'%');if(ratio>=THRESHOLD&&!prefetchedQueued){prefetchedQueued=true;status('Próximo capítulo na fila');}}
 const trans={title:out[0],blocks:out.slice(1)};[...overlay.querySelectorAll('[data-i]')].forEach(e=>{if(e.dataset.i==='title')e.textContent=trans.title;else e.textContent=trans.blocks[+e.dataset.i]??e.textContent});setCache(Object.assign({},sourceCtx,{translations:trans,prefetched:false,savedAt:Date.now()}));syncHome(libraryEntry(sourceCtx));btn.textContent='Traduzido';status('Tradução concluída');if(prefetchedQueued)setTimeout(kickPrefetch,60);}catch(e){btn.disabled=false;status('Erro: '+e.message)}finally{busy=false}}

function frameSnapshot(url){return new Promise((resolve,reject)=>{const f=document.createElement('iframe');f.style.cssText='position:fixed;left:-12000px;top:0;width:1000px;height:1400px;opacity:0;pointer-events:none';const timer=setTimeout(()=>{f.remove();reject(new Error('timeout do pré-carregamento'))},9000);f.onload=()=>{setTimeout(()=>{try{const d=f.contentDocument,w=f.contentWindow;if(!d)throw new Error('sem documento');const s=snapshot(d,url,w);clearTimeout(timer);f.remove();resolve(s)}catch(e){clearTimeout(timer);f.remove();reject(e)}},220)};f.src=url+(url.includes('#')?'&':'#')+'translatorhell-prefetch-frame';document.documentElement.appendChild(f)})}
async function fetchSnapshot(url){const r=await gm({method:'GET',url,timeout:15000});if(r.status<200||r.status>=300)throw new Error('HTTP '+r.status);const d=new DOMParser().parseFromString(r.responseText,'text/html');return snapshot(d,url,window)}
async function nextSnapshot(url){try{return await frameSnapshot(url)}catch(_){return fetchSnapshot(url)}}
async function kickPrefetch(){if(prefetchBusy||busy||!prefetchedQueued||!sourceCtx?.nextHref||cached(sourceCtx.nextHref))return;prefetchBusy=true;const target=sourceCtx.nextHref;status('Pré-carregando próximo…');try{const s=await nextSnapshot(target);const vals=await requestTranslate([s.title,...s.blocks.map(x=>x.text)],{bookKey:s.bookKey,lang:'pt'});const trans={title:vals[0],blocks:vals.slice(1)};setCache(Object.assign({},s,{translations:trans,prefetched:true,savedAt:Date.now()}));prune(sourceCtx.url,target);status('Próximo capítulo pronto');}catch(e){status('Próximo será traduzido ao abrir');}finally{prefetchBusy=false}}
function navigate(href){if(!href)return;const c=cached(href);if(c?.translations){const old=sourceCtx?.url;history.pushState({translatorHell:true},'',href);render(c,c.translations);prune(c.url,c.nextHref);prefetchedQueued=!!c.nextHref;setTimeout(kickPrefetch,100);return;}location.href=href}

function openReader(){const s=snapshot();const c=cached(s.url);render(c||s,c?.translations||null)}
function install(){if(document.getElementById('th-mod-reader-open'))return;const b=document.createElement('button');b.id='th-mod-reader-open';b.textContent='Leitor';b.style.cssText='position:fixed;left:8px;bottom:8px;z-index:2147483644;border:0;border-radius:10px;padding:8px 12px;background:#222;color:white;opacity:.78';b.onclick=openReader;document.body.appendChild(b)}
window.addEventListener('popstate',()=>{if(overlay){const c=cached(location.href);if(c)render(c,c.translations||null);else render(snapshot(),null)}});
install();
})();
