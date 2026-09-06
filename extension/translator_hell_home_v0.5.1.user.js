// ==UserScript==
// @name         Translator Hell v0.5.1 — Home
// @namespace    https://translatorhell.local/
// @version      0.5.1
// @description  Módulo Home/biblioteca. Funciona como home independente e ponte central opcional para o Leitor modular.
// @match        https://example.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function(){
'use strict';
const KEY='th-modular-library-v1';
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){return[]}};
const save=x=>localStorage.setItem(KEY,JSON.stringify(x.slice(0,100)));
function upsert(e){if(!e?.url)return;let a=load().filter(x=>x.url!==e.url);a.unshift(Object.assign({updatedAt:Date.now()},e));save(a)}
window.addEventListener('message',ev=>{const d=ev.data;if(!d||d.type!=='translator-hell:v1:library-upsert')return;upsert(d.entry);try{ev.source?.postMessage({type:'translator-hell:v1:library-ack',url:d.entry.url},'*')}catch(_){}});
if(!new URL(location.href).searchParams.has('translatorhell-home'))return;
document.addEventListener('DOMContentLoaded',render,{once:true});
function render(){document.documentElement.style.background='#101116';document.body.innerHTML='';document.body.style.cssText='margin:0;background:#101116;color:#eee;font:15px system-ui,sans-serif';const app=document.createElement('main');app.style.cssText='max-width:900px;margin:auto;padding:32px 18px';const h=document.createElement('h1');h.textContent='Translator Hell';const p=document.createElement('p');p.textContent='Biblioteca modular · v0.5.1';p.style.opacity='.65';const q=document.createElement('input');q.placeholder='Buscar obra…';q.style.cssText='width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #3a3d46;background:#181a20;color:#fff;margin:12px 0 20px';const list=document.createElement('div');function draw(){const term=q.value.trim().toLocaleLowerCase(),a=load().filter(x=>!term||String(x.title||x.url).toLocaleLowerCase().includes(term));list.innerHTML='';if(!a.length){const e=document.createElement('p');e.textContent='Nenhuma obra salva nesta instalação modular ainda.';e.style.opacity='.55';list.appendChild(e);return;}for(const x of a){const card=document.createElement('div');card.style.cssText='display:flex;gap:10px;align-items:center;background:#181a20;border:1px solid #2d3038;border-radius:12px;padding:14px;margin:8px 0';const info=document.createElement('div');info.style.flex='1';const t=document.createElement('strong');t.textContent=x.title||'Sem título';const u=document.createElement('div');u.textContent=x.chapterTitle||x.url;u.style.cssText='opacity:.6;font-size:12px;margin-top:4px;word-break:break-all';info.append(t,u);const open=document.createElement('button');open.textContent='Continuar';open.onclick=()=>location.href=x.url;const del=document.createElement('button');del.textContent='Excluir';del.onclick=()=>{save(load().filter(y=>y.url!==x.url));draw()};card.append(info,open,del);list.appendChild(card)}}q.oninput=draw;app.append(h,p,q,list);document.body.appendChild(app);draw()}
})();
