(function () {
  'use strict';
  // Reader-side companion intentionally stays conservative: parseChapter() remains
  // authoritative so downloads/offline chapters contain the translated text too.
  // This layer only removes exact navigation chrome that may survive unusual sites.
  const exactNoise = /^(上一章|下一章|上一页|下一页|目录|目錄|返回目录|返回目錄|previous chapter|next chapter|table of contents|contents)$/i;
  function clean(root) {
    const nodes = (root || document).querySelectorAll ? (root || document).querySelectorAll('p,div,span,a') : [];
    for (const el of nodes) {
      if (el.children && el.children.length > 0) continue;
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length <= 64 && exactNoise.test(text)) el.setAttribute('data-th-noise', '1');
    }
    document.documentElement && document.documentElement.setAttribute('data-translatorhell-reader', '1');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => clean(document), {once:true});
  else clean(document);
  try {
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes || []) if (node && node.nodeType === 1) clean(node);
    });
    observer.observe(document.documentElement || document.body, {childList:true, subtree:true});
    setTimeout(() => observer.disconnect(), 12000);
  } catch (_) {}
})();
