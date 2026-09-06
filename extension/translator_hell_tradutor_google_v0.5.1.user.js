// ==UserScript==
// @name         Translator Hell v0.5.1 — Tradutor Google
// @namespace    https://translatorhell.local/
// @version      0.5.1
// @description  Módulo de tradução Google-only compatível com o protocolo Translator Hell v1.
// @match        *://*/*
// @match        file:///*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      translate.googleapis.com
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  if (location.hash.includes('translatorhell-prefetch-frame')) return;
  if (location.hostname === 'example.com' && new URL(location.href).searchParams.has('translatorhell-bridge')) return;

  const VERSION = '0.5.1';
  const REQ = 'translator-hell:v1:translate-request';
  const RES = 'translator-hell:v1:translate-response';
  const CFG_KEY = 'th-mod-translator-google-config-v1';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const json = (s, fallback = {}) => { try { return JSON.parse(s); } catch (_) { return fallback; } };
  const cfg = Object.assign({ provider: 'google', lang: 'pt' }, json(localStorage.getItem(CFG_KEY), {}));
  cfg.provider = 'google';
  const saveCfg = () => localStorage.setItem(CFG_KEY, JSON.stringify(cfg));

  function gmRequest(opts) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest(Object.assign({}, opts, {
      onload: resolve,
      onerror: reject,
      ontimeout: () => reject(new Error('timeout')),
    })));
  }

  function splitLongText(text, max = 3500) {
    const s = String(text ?? '');
    if (s.length <= max) return [s];
    const parts = [];
    let rest = s;
    while (rest.length > max) {
      let cut = Math.max(rest.lastIndexOf('\n', max), rest.lastIndexOf('。', max), rest.lastIndexOf('！', max), rest.lastIndexOf('？', max), rest.lastIndexOf('. ', max), rest.lastIndexOf(' ', max));
      if (cut < Math.floor(max * 0.45)) cut = max;
      else cut += 1;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) parts.push(rest);
    return parts;
  }

  async function googleChunk(text, lang) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(lang) + '&dt=t&q=' + encodeURIComponent(text);
    const r = await gmRequest({ method: 'GET', url, timeout: 18000 });
    if (r.status < 200 || r.status >= 300) throw new Error('Google HTTP ' + r.status);
    const data = JSON.parse(r.responseText);
    return (data?.[0] || []).map(x => x?.[0] || '').join('');
  }

  async function google(text, lang = 'pt') {
    const chunks = splitLongText(text);
    const out = [];
    for (const chunk of chunks) {
      out.push(await googleChunk(chunk, lang));
      if (chunks.length > 1) await sleep(45);
    }
    return out.join('');
  }

  async function translateOne(text, opts = {}) {
    const source = String(text ?? '');
    if (!norm(source)) return source;
    const lang = opts.lang || cfg.lang || 'pt';
    let out = await google(source, lang);
    // Uma retentativa simples para respostas vazias/truncadas grosseiramente.
    if (!norm(out) || (source.length > 100 && out.length < source.length * 0.12)) {
      await sleep(120);
      const retry = await google(source, lang);
      if (norm(retry)) out = retry;
    }
    return out;
  }

  async function translateMany(texts, opts = {}) {
    const src = Array.isArray(texts) ? texts : [texts];
    const out = new Array(src.length);
    let cursor = 0;
    const workers = Math.min(2, src.length || 1);
    await Promise.all(Array.from({ length: workers }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= src.length) break;
        out[i] = await translateOne(src[i], opts);
        await sleep(55);
      }
    }));
    return out;
  }

  window.__translatorHellV1 = Object.assign(window.__translatorHellV1 || {}, {
    version: VERSION,
    provider: 'google',
    translate: translateMany,
    getConfig: () => Object.assign({}, cfg, { provider: 'google' }),
    setConfig: v => {
      if (v && v.lang) cfg.lang = String(v.lang);
      cfg.provider = 'google';
      saveCfg();
    },
  });

  document.addEventListener(REQ, async ev => {
    const d = ev.detail || {};
    const requestId = d.requestId || ('th-' + Date.now());
    try {
      const results = await translateMany(d.texts || [], d);
      document.dispatchEvent(new CustomEvent(RES, { detail: { requestId, ok: true, results, provider: 'google' } }));
    } catch (e) {
      document.dispatchEvent(new CustomEvent(RES, { detail: { requestId, ok: false, error: String(e?.message || e), provider: 'google' } }));
    }
  });

  function installMiniUI() {
    if (document.getElementById('th-mod-translator-mini')) return;
    const box = document.createElement('div');
    box.id = 'th-mod-translator-mini';
    box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483646;background:#16181d;color:#fff;border:1px solid #444;border-radius:10px;padding:6px;font:12px sans-serif;display:flex;gap:5px;align-items:center;opacity:.78';
    const label = document.createElement('span');
    label.textContent = 'Google';
    const btn = document.createElement('button');
    btn.textContent = 'Traduzir página';
    btn.onclick = async () => {
      const els = [...document.querySelectorAll('h1,h2,h3,p,li,blockquote')]
        .filter(e => e.offsetParent !== null && norm(e.textContent).length > 0)
        .slice(0, 120);
      btn.disabled = true;
      const old = btn.textContent;
      try {
        const translated = await translateMany(els.map(e => e.textContent), { lang: cfg.lang });
        els.forEach((e, i) => { e.textContent = translated[i] ?? e.textContent; });
        btn.textContent = 'Pronto';
      } catch (e) {
        btn.textContent = 'Erro';
      } finally {
        setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1000);
      }
    };
    box.append(label, btn);
    document.documentElement.appendChild(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installMiniUI, { once: true });
  else installMiniUI();
})();
