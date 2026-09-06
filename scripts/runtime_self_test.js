const Module = require('module');
const path = require('path');
const oldLoad = Module._load;
let aiMode = 'ok';
let factoryConfigAvailable = true;
const kv = new Map();
Module._load = function(req, parent, isMain) {
  if (req === '@libs/fetch') {
    return {
      fetchText: async (url, init, encoding) => '<html><body>legacy</body></html>',
      fetchApi: async (url, init) => {
        const s = String(url);
        if (s.includes('/api/factory/config')) {
          if (!factoryConfigAvailable) throw new Error('factory offline');
          return { ok: true, status: 200, json: async () => ({providers:{P:{key:'LOCAL_ONLY',url:'https://gen.pollinations.ai/v1/chat/completions',model:'nova-fast'}}}) };
        }
        if (s.includes('/api/factory/profile')) return {ok:true,status:200,json:async()=>({profile:null})};
        if (s.includes('/api/factory/register') || s.includes('/api/factory/refine')) return {ok:true,status:200,json:async()=>({ok:true})};
        if (s.includes('gen.pollinations.ai')) {
          if (aiMode === 'ok') return {ok:true,status:200,json:async()=>({choices:[{message:{content:'TRADUÇÃO IA'}}]})};
          return {ok:false,status:429,json:async()=>({})};
        }
        if (s.includes('translate.googleapis.com')) {
          const q = decodeURIComponent((s.match(/[?&]q=([^&]+)/)||[])[1] || '');
          if (q.includes('__THSEP_')) return {ok:true,status:200,json:async()=>[[['Título A\n__THSEP_TEST__\nTítulo B']]]};
          return {ok:true,status:200,json:async()=>[[['TRADUÇÃO GOOGLE']]]};
        }
        throw new Error('URL inesperada no teste: ' + s);
      },
    };
  }
  if (req === '@libs/filterInputs') return {FilterTypes:{Picker:'Picker',Switch:'Switch',TextInput:'TextInput',CheckboxGroup:'Checkbox',ExcludableCheckboxGroup:'XCheckbox'}};
  if (req === '@libs/storage') return {storage:{get:(k)=>kv.get(k),set:(k,v)=>kv.set(k,v),getAllKeys:()=>Array.from(kv.keys())}};
  if (req === 'cheerio') return {load:()=>function(){}};
  return oldLoad.apply(this, arguments);
};

(async () => {
  const pluginPath = path.resolve(__dirname, '../lnreader-prebuilt/.js/src/plugins/multi/translatorHellMaster_pt.js');
  const p = require(pluginPath).default;
  // Exercise retained Termux development mode; device mode has real-DOM tests.
  p.deviceMode = false;
  p.factoryBase = 'http://127.0.0.1:8765';
  // This legacy suite uses a stub DOM; real AJAX/DOM coverage is in architecture_self_test.js.
  p.discoverChapterRequests = () => [];
  p.detectRemoteCatalog = () => null;

  const popular = await p.popularNovels(1, {});
  if (!Array.isArray(popular) || popular.length !== 0) throw new Error('Master popularNovels ainda expõe DNS como novel');

  let remoteScrapeStarted = 0;
  p.getText = async () => { remoteScrapeStarted++; return '<html><head><title>Example</title></head><body></body></html>'; };
  p.inferNovelUrl = () => undefined;
  p.learnProfile = () => ({host:'book.example.com',origin:'https://book.example.com',siteName:'Example',seedUrl:'https://book.example.com/info/1',selectors:{},searchTemplates:[],listingUrls:[]});
  const realRegisterProfile = p.registerProfile.bind(p);
  p.registerProfile = async () => ({ok:true, childCreated:true});
  p.extractMetadata = () => ({title:'Seed Novel'});
  const created = await Promise.race([
    p.searchByUrl('https://book.example.com/info/1'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('primeira criação ficou esperando detecção inicial')), 600)),
  ]);
  if (!Array.isArray(created) || created.length !== 1) throw new Error('Master não retornou cartão transitório de sucesso');
  if (!String(created[0].name).includes('Criado com sucesso')) throw new Error('status de criação não foi localizado: ' + created[0].name);
  if (!String(created[0].cover).includes('/success.png')) throw new Error('cartão de sucesso sem imagem própria');
  const repeatedSamePage = await p.searchNovels('https://book.example.com/info/1', 1);
  if (!Array.isArray(repeatedSamePage) || repeatedSamePage.length !== 1) throw new Error('repetição da mesma URL não preservou cartão único');
  const createdWithStalePage = await p.searchNovels('https://book.example.com/info/1', 99);
  if (!Array.isArray(createdWithStalePage) || createdWithStalePage.length !== 0) throw new Error('URL foi executada novamente em página de busca posterior');
  // A second DNS in the same Master session accumulates a second status card.
  p.factoryCommandState.clear();
  p.learnProfile = (_$, learnedUrl) => { const u = new URL(learnedUrl); return {host:u.hostname,origin:u.origin,siteName:u.hostname.includes('second')?'Second':'Example',seedUrl:learnedUrl,selectors:{},searchTemplates:[],listingUrls:[]}; };
  const second = await p.searchByUrl('https://second.example.net/book/2');
  if (!Array.isArray(second) || second.length !== 2) throw new Error('Factory não acumulou múltiplas extensões na mesma sessão');
  p.registerProfile = realRegisterProfile;

  const duplicateWorks = p.dedupeNovelItems([
    {name:'Obra',path:'https://www.book.example.com/amp/n/obra/?utm_source=home'},
    {name:'Obra completa',path:'https://book.example.com/n/obra/'},
  ]);
  if (duplicateWorks.length !== 1 || /\/amp\//.test(duplicateWorks[0].path)) throw new Error('catálogo de obras ainda duplica variantes www/AMP/tracking');
  if (!p.isGenericNovelTitle('短篇小说 1000本')) throw new Error('card de categoria/contagem não foi rejeitado');
  if (p.isGenericNovelTitle('玄鉴仙族')) throw new Error('título real foi classificado como genérico');
  if (p.cleanChapterTitleText('第1章 初入 新') !== '第1章 初入') throw new Error('selo de capítulo não foi removido');

  // A detail page may mix the first chapters with the latest ones. A discovered
  // catalog must replace/recover that teaser instead of indexing a huge gap.
  const teaser = [
    ...Array.from({length:24}, (_,i)=>({name:`第${i+1}章 前段`,path:`https://book.example.com/ch/${i+1}`,order:i,number:i+1,numberSource:'text'})),
    ...Array.from({length:8}, (_,i)=>({name:`第${3509+i}章 最新`,path:`https://book.example.com/ch/${3509+i}`,order:24+i,number:3509+i,numberSource:'text'})),
  ];
  if (!p.hasLargeChapterGaps(teaser)) throw new Error('lacuna 24 -> 3509 não foi detectada');
  const prefix25 = p.extractChapterNumber('025 应龙', 'https://book.example.com/n/demo/25.html');
  const prefix164 = p.extractChapterNumber('164) El vigésimo octavo día', 'https://book.example.com/n/demo/164.html');
  if (prefix25.number !== 25 || prefix25.numberSource !== 'text' || prefix164.number !== 164) throw new Error('prefixos numéricos sem Chapter/第 não foram reconhecidos');
  const teaser164 = [
    ...Array.from({length:24}, (_,i)=>({name:`${String(i+1).padStart(3,'0')} capítulo`,path:`https://book.example.com/n/q/${i+1}.html`,order:i,number:i+1,numberSource:'text'})),
    ...Array.from({length:22}, (_,i)=>({name:`${164+i}) recente`,path:`https://book.example.com/n/q/${164+i}.html`,order:24+i,number:164+i,numberSource:'text'})),
  ];
  const full185 = Array.from({length:185},(_,i)=>({name:`${String(i+1).padStart(3,'0')} completo`,path:`https://book.example.com/amp/n/q/${i+1}.html`,order:i,number:i+1,numberSource:'text'}));
  if (!p.hasLargeChapterGaps(teaser164) || !p.shouldPreferCompleteCatalog(teaser164, full185)) throw new Error('caso 024 -> 164 não escolheu catálogo integral 1..185');
  const oldFindSelector = p.findBestChapterSelector.bind(p);
  const oldExtractLinks = p.extractChapterLinks.bind(p);
  const oldCatalogLinks = p.discoverCatalogLinks.bind(p);
  const oldFetchCatalogPages = p.fetchCatalogPages.bind(p);
  p.findBestChapterSelector = () => '.latest';
  p.extractChapterLinks = () => teaser;
  p.discoverCatalogLinks = () => ['https://book.example.com/n/test/list.html'];
  p.fetchCatalogPages = async () => ({items:Array.from({length:3516},(_,i)=>({name:`第${i+1}章 完整`,path:`https://book.example.com/ch/${i+1}`,order:i,number:i+1,numberSource:'text'})),chapterSelector:'.all'});
  const recovered = await p.extractChaptersDeep(()=>{}, 'https://book.example.com/n/test/', {host:'book.example.com',origin:'https://book.example.com',selectors:{}});
  if (recovered.chapters.length !== 3516 || recovered.chapters[24].chapterNumber !== 25) throw new Error('catálogo completo não recuperou capítulos intermediários');
  p.findBestChapterSelector = oldFindSelector;
  p.extractChapterLinks = oldExtractLinks;
  p.discoverCatalogLinks = oldCatalogLinks;
  p.fetchCatalogPages = oldFetchCatalogPages;


  // Equivalent chapter URLs (AMP/tracking variants) are one chapter, and the
  // canonical non-AMP URL wins when both representations are present.
  const ampMerged = p.mergeChapterCandidates(
    [{name:'第25章 测试',path:'https://book.example.com/amp/n/demo/25.html?utm_source=x',order:0,number:25,numberSource:'text'}],
    [{name:'第25章 测试完整版',path:'https://book.example.com/n/demo/25.html',order:0,number:25,numberSource:'text'}],
  );
  if (ampMerged.length !== 1 || /\/amp\//.test(ampMerged[0].path)) throw new Error('AMP/tracking ainda duplica capítulo equivalente');

  // Numeric pagination is discovered without mistaking chapter /25.html links
  // for catalog page 25.
  const numericPages = p.findCatalogPageCandidatesRaw(
    '<a href="/n/demo/25.html">第25章</a><div class="pagination"><a href="/n/demo/list_2.html">2</a><a href="/n/demo/list_3.html">3</a></div>',
    'https://book.example.com/n/demo/list.html', new Set(['https://book.example.com/n/demo/list.html'])
  );
  if (!numericPages.some(x=>x.includes('list_2.html')) || !numericPages.some(x=>x.includes('list_3.html')) || numericPages.some(x=>x.endsWith('/25.html'))) throw new Error('paginação numérica do catálogo foi classificada incorretamente');

  // Multilingual browse discovery must recognize Spanish catalogue wording and
  // WordPress-style listing paths (novelasligeras.net class of sites).
  const fakeAnchors = [
    {href:'/index.php/lista-de-novela-ligera-novela-web/', text:'Lista de Novelas', cls:'menu-item', id:''},
    {href:'/login/', text:'Login', cls:'menu-item', id:''},
  ];
  const fake$ = (arg) => {
    if (arg === 'a[href]') return {each:(cb)=>fakeAnchors.forEach((el,i)=>cb(i,el))};
    const el = arg || {};
    return {attr:(k)=>k==='href'?el.href:k==='class'?el.cls:k==='id'?el.id:'', text:()=>el.text||''};
  };
  const spanishListings = p.discoverListingLinks(fake$, 'https://novelasligeras.net/');
  if (!spanishListings.some(x=>x.includes('lista-de-novela-ligera-novela-web'))) throw new Error('catálogo espanhol/WordPress não foi descoberto');

  // Cross-language title translation failure is fail-soft: the browse catalogue
  // is still returned instead of hanging the source.
  const oldBrowseTranslate = p.translateNovelItemTitlesGoogle.bind(p);
  p.translateNovelItemTitlesGoogle = async () => { throw new Error('simulated es->zh display translation failure'); };
  const crossContext = 'cross-language-test';
  p.resetSourceContext(crossContext);
  const crossItems = await p.sourcePage(crossContext, 1, async()=>[{name:'Novela de prueba',path:'https://book.example.com/producto/prueba/'}], false);
  if (crossItems.length !== 1 || crossItems[0].name !== 'Novela de prueba') throw new Error('falha de tradução ainda bloqueia catálogo de obras');
  p.translateNovelItemTitlesGoogle = oldBrowseTranslate;

  // v0.7.7: structural browse cache must keep raw titles. A temporary translation
  // failure must retry on the next render without refetching the website, and a
  // translated result must never become the source key for a second translation.
  const retryContext077 = 'cross-language-retry-v077';
  p.resetSourceContext(retryContext077); p.sourcePageCache.clear(); p.sourcePageInFlight.clear();
  let retryLoads077 = 0, retryTranslations077 = 0;
  const realBrowseTranslate077a = p.translateNovelItemTitlesGoogle.bind(p);
  p.translateNovelItemTitlesGoogle = async items => {
    retryTranslations077++;
    if (retryTranslations077 === 1) throw new Error('temporary visual failure');
    return items.map(x => ({...x, name:'译:'+x.name}));
  };
  const retryFirst077 = await p.sourcePage(retryContext077,1,async()=>{retryLoads077++;return [{name:'Título fuente 077',path:'https://book.example.com/producto/retry077/'}]},false);
  const retrySecond077 = await p.sourcePage(retryContext077,1,async()=>{retryLoads077++;throw new Error('raw page should be cached')},false);
  const rawCached077 = p.sourcePageCache.get(p.sourcePageKey(retryContext077,1));
  if (retryFirst077[0]?.name !== 'Título fuente 077' || retrySecond077[0]?.name !== '译:Título fuente 077') throw new Error('cache visual não repetiu tradução após falha temporária');
  if (retryLoads077 !== 1 || retryTranslations077 !== 2 || rawCached077?.[0]?.name !== 'Título fuente 077') throw new Error('cache estrutural do catálogo foi contaminado por tradução');
  p.translateNovelItemTitlesGoogle = realBrowseTranslate077a;

  // Cached metadata behaves the same way: raw presentation values are hidden from
  // SourceNovel serialization and can be retranslated without fetching the product.
  const cachedNovel077 = {name:'Título detalle 077',path:'https://book.example.com/producto/detail077/',summary:'Resumen detalle 077',chapters:[{name:'Capítulo 1',path:'https://book.example.com/c1'}]};
  p.attachNovelDisplayRaw(cachedNovel077,{name:'Título detalle 077',summary:'Resumen detalle 077',chapters:[{name:'Capítulo 1',path:'https://book.example.com/c1'}]});
  if (JSON.stringify(cachedNovel077).includes('__thDisplayRaw')) throw new Error('metadado interno vazou para SourceNovel');
  const realGoogleCached077a = p.googleTranslateCached.bind(p);
  const realChapterTranslate077a = p.translateChapterTitlesGoogle.bind(p);
  p.googleTranslateCached = async text => '译:'+text;
  p.translateChapterTitlesGoogle = async chapters => chapters.map(ch=>({...ch,name:'译:'+ch.name}));
  const refreshedNovel077 = await p.refreshCachedNovelDisplay(cachedNovel077);
  if (!String(refreshedNovel077.name).startsWith('译:') || !String(refreshedNovel077.summary).startsWith('译:') || !String(refreshedNovel077.chapters?.[0]?.name).startsWith('译:')) throw new Error('metadata cache não reaplicou tradução visual');
  p.googleTranslateCached = realGoogleCached077a; p.translateChapterTitlesGoogle = realChapterTranslate077a;

  // Novel-scoped routing: learning A's catalog must never make B fetch A's list.
  const novelA = 'https://book.example.com/n/a/';
  const novelB = 'https://book.example.com/n/b/';
  const routeA = 'https://book.example.com/n/a/list.html';
  const routeB = 'https://book.example.com/n/b/list.html';
  const profileWithA = {host:'book.example.com',origin:'https://book.example.com',selectors:{},novelRoutes:{[p.novelIdentity(novelA)]:{novelUrl:novelA,catalogUrl:routeA,updatedAt:1}}};
  const seenCatalogRoutes = [];
  p.findBestChapterSelector = () => '.chapters';
  p.extractChapterLinks = (_$, base) => base === novelB ? [{name:'第1章 B',path:'https://book.example.com/n/b/1.html',order:0,number:1,numberSource:'text'}] : [];
  p.discoverCatalogLinks = (_$, base) => base === novelB ? [routeB] : [];
  p.fetchCatalogPages = async url => {
    seenCatalogRoutes.push(url);
    if (url === routeA) return {items:[{name:'第1章 A',path:'https://book.example.com/n/a/1.html',order:0,number:1,numberSource:'text'}]};
    return {items:[{name:'第1章 B',path:'https://book.example.com/n/b/1.html',order:0,number:1,numberSource:'text'},{name:'第2章 B',path:'https://book.example.com/n/b/2.html',order:1,number:2,numberSource:'text'}]};
  };
  const isolatedB = await p.extractChaptersDeep(()=>{}, novelB, profileWithA);
  if (seenCatalogRoutes.includes(routeA)) throw new Error('obra B reutilizou catalogUrl aprendido da obra A');
  if (isolatedB.chapters.some(ch => String(ch.path).includes('/n/a/'))) throw new Error('capítulos da obra A vazaram para B');
  p.findBestChapterSelector = oldFindSelector;
  p.extractChapterLinks = oldExtractLinks;
  p.discoverCatalogLinks = oldCatalogLinks;
  p.fetchCatalogPages = oldFetchCatalogPages;

  // Same request is single-flight; distinct works never share the same identity.
  if (p.novelIdentity(novelA) === p.novelIdentity(novelB)) throw new Error('identidade por obra colidiu');
  const oldParseNovelFresh = p.parseNovelFresh.bind(p);
  p.metadataCache.clear(); p.metadataInFlight.clear();
  let freshCalls = 0;
  p.parseNovelFresh = async path => { freshCalls++; await new Promise(r=>setTimeout(r,30)); return {name:path,path,chapters:[]}; };
  const [sf1,sf2] = await Promise.all([p.parseNovel(novelB),p.parseNovel(novelB)]);
  if (freshCalls !== 1 || sf1.path !== sf2.path) throw new Error('parseNovel não coalesceu chamadas simultâneas');
  p.parseNovelFresh = oldParseNovelFresh;
  p.metadataInFlight.clear();

  // v0.7.7 — official multisrc architecture layer.
  const archWoo = p.detectSiteArchitecture('<html><body class="woocommerce"><ul class="products"><li class="product"></li></ul></body></html>', 'https://shop.example.com/catalog/');
  const archMadara = p.detectSiteArchitecture('<div class="page-item-detail"><div class="wp-manga"></div></div>', 'https://manga.example.com/');
  const archLnwp = p.detectSiteArchitecture('<div class="eplister"><img class="ts-post-image"></div>', 'https://novel.example.com/');
  const archFictioneer = p.detectSiteArchitecture('<link href="/wp-content/themes/fictioneer/style.css"><div class="chapter-group"></div>', 'https://story.example.com/');
  if (archWoo.type !== 'woocommerce' || archMadara.type !== 'madara' || archLnwp.type !== 'lightnovelwp' || archFictioneer.type !== 'fictioneer') throw new Error('detecção de famílias oficiais de arquitetura falhou');

  // Lazy/LiteSpeed/srcset cover extraction rejects the placeholder and takes the
  // real highest-resolution candidate without requiring a site-specific rule.
  const fakePictureSource = {attr:(k)=>k==='srcset'?'https://img.example.com/a-300.jpg 300w, https://img.example.com/a-1200.jpg 1200w':''};
  const fakeImg = {
    0:{name:'img'},
    attr:(k)=>({src:'data:image/gif;base64,AAAA','data-lazy-src':'https://img.example.com/cover.jpg'}[k]||''),
    closest:()=>({find:()=>({first:()=>fakePictureSource})}),
    parent:()=>({attr:()=>''}),
  };
  if (p.extractImageUrl(fakeImg, 'https://book.example.com/') !== 'https://img.example.com/cover.jpg') throw new Error('capa lazy real não venceu placeholder');
  if (p.imageSrcsetCandidate('https://img.example.com/x-300.jpg 300w, https://img.example.com/x-1600.jpg 1600w','https://book.example.com/') !== 'https://img.example.com/x-1600.jpg') throw new Error('srcset não escolheu imagem de maior resolução');

  // Repeated chapter numbers with no volume context preserve DOM order instead of
  // being regrouped into 1,1,1,2,2,2. This is common in volume/part product pages.
  const repeatedNumbers = [1,1,2,1,1,2].map((n,i)=>({name:`Capítulo ${n} parte ${i}`,path:`https://book.example.com/c/${i}`,order:i,number:n,numberSource:'text'}));
  const repeatedSorted = p.sortChapters(repeatedNumbers);
  if (repeatedSorted.some((x,i)=>x.order!==i)) throw new Error('capítulos repetidos sem volume perderam a ordem DOM');

  // When volume context exists, volumes sort numerically but the exact order inside
  // each volume (prologue/parts/chapters) is retained.
  const grouped = [
    {name:'Vol2 Parte 1 Capítulo 1',path:'https://book.example.com/v2/a',order:0,volume:2,volumeOrder:0,number:1,numberSource:'text'},
    {name:'Vol1 Prólogo',path:'https://book.example.com/v1/p',order:1,volume:1,volumeOrder:0},
    {name:'Vol1 Parte 1 Capítulo 1',path:'https://book.example.com/v1/a',order:2,volume:1,volumeOrder:1,number:1,numberSource:'text'},
    {name:'Vol1 Parte 2 Capítulo 1',path:'https://book.example.com/v1/b',order:3,volume:1,volumeOrder:2,number:1,numberSource:'text'},
    {name:'Vol2 Prólogo',path:'https://book.example.com/v2/p',order:4,volume:2,volumeOrder:0},
    {name:'Vol2 Capítulo 2',path:'https://book.example.com/v2/b',order:5,volume:2,volumeOrder:1,number:2,numberSource:'text'},
  ];
  const groupedSorted = p.sortChapters(grouped);
  if (!groupedSorted[0].path.includes('/v1/p') || !groupedSorted[3].path.includes('/v2/')) throw new Error('ordenação por volume/contexto falhou');

  // Architecture fast path must bypass generic catalog probing completely.
  const oldArchChapters = p.extractArchitectureChapters.bind(p);
  const oldBestSelector077 = p.findBestChapterSelector.bind(p);
  p.extractArchitectureChapters = () => ({adapter:'woocommerce-product',chapterSelector:'#tab-description a[href]',chapters:grouped});
  p.findBestChapterSelector = () => { throw new Error('fallback genérico executado indevidamente'); };
  const fastGrouped = await p.extractChaptersDeep(()=>{}, 'https://book.example.com/producto/demo/', {host:'book.example.com',origin:'https://book.example.com',selectors:{},novelAdapter:'woocommerce-product'});
  if (fastGrouped.chapters.length !== grouped.length || fastGrouped.chapters[0].chapterNumber !== 1) throw new Error('fast path de capítulos do produto não retornou catálogo');
  p.extractArchitectureChapters = oldArchChapters;
  p.findBestChapterSelector = oldBestSelector077;

  // A slow source must still trigger cross-language visual translation. v0.7.6
  // conditioned this on source load time and therefore left ES -> ZH untouched.
  const realNow077 = Date.now;
  let fakeNow077 = realNow077();
  Date.now = () => fakeNow077;
  const oldTranslate077 = p.translateNovelItemTitlesGoogle.bind(p);
  let translationCalls077 = 0;
  p.translateNovelItemTitlesGoogle = async items => { translationCalls077++; return items.map(x=>({...x,name:'译:'+x.name})); };
  const slowContext077 = 'slow-cross-language-v077';
  p.resetSourceContext(slowContext077);
  const slowTranslated077 = await p.sourcePage(slowContext077,1,async()=>{fakeNow077 += 5000; return [{name:'Novela lenta',path:'https://book.example.com/producto/lenta/'}]},false);
  Date.now = realNow077;
  p.translateNovelItemTitlesGoogle = oldTranslate077;
  if (translationCalls077 !== 1 || !String(slowTranslated077[0]?.name||'').startsWith('译:')) throw new Error('fonte lenta ainda pulou tradução visual');

  // Large catalog pages should hand Cheerio only the useful TOC fragment when possible.
  const hugeNoise = '<script>' + 'x'.repeat(1200000) + '</script>';
  const toc = '<nav class="chapter-list">' + Array.from({length:30},(_,i)=>`<a href="/n/b/${i+1}.html">第${i+1}章 B</a>`).join('') + '</nav>';
  const compact = p.compactCatalogHtml('<html><body>'+hugeNoise+toc+hugeNoise+'</body></html>');
  if (compact.length >= 200000 || !compact.includes('第30章 B')) throw new Error('compactação do catálogo não isolou o sumário');

  const safeNullProfile = p.ensureProfile(null, 'https://book.example.com/info/1', 'book.example.com');
  if (!safeNullProfile || !safeNullProfile.selectors || safeNullProfile.host !== 'book.example.com') throw new Error('perfil nulo não ganhou fallback seguro');

  const cf = p.detectProtection({status:200,url:'https://book.example.com/',headers:{get:(n)=>n==='server'?'cloudflare':''}}, '<html><body>normal</body></html>', 'https://book.example.com/');
  if (!cf.cloudflare || cf.challenge) throw new Error('Cloudflare por header não foi detectado corretamente');
  const turnstile = p.detectProtection({status:403,url:'https://book.example.com/',headers:{get:(n)=>n==='cf-mitigated'?'challenge':''}}, '<div class="cf-turnstile"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>', 'https://book.example.com/');
  if (!turnstile.cloudflare || !turnstile.challenge || !turnstile.turnstile || !turnstile.requiresCookie) throw new Error('Turnstile/managed challenge não foi detectado');

  const filters = p.buildLnFilters([
    {key:'category',label:'分类',type:'picker',value:'1',options:[{label:'玄幻',value:'1'},{label:'武侠',value:'2'}]},
    {key:'finished',label:'完结',type:'switch',value:false,onValue:'1'},
  ]);
  if (!filters || filters.category.type !== 'Picker' || filters.finished.type !== 'Switch') throw new Error('filtros dinâmicos não foram compilados');
  const checkboxFilters = p.buildLnFilters([{key:'genre',label:'Genre',type:'checkbox',value:['x'],options:[{label:'X',value:'x'},{label:'Y',value:'y'}]},{key:'avoid',label:'Exclude',type:'xcheckbox',value:{include:[],exclude:['r']},options:[{label:'R',value:'r'},{label:'S',value:'s'}]}]);
  if (checkboxFilters.genre.type !== 'Checkbox' || checkboxFilters.avoid.type !== 'XCheckbox') throw new Error('Checkbox/XCheckbox não foram compilados');
  const filteredUrl = p.applyDetectedFiltersToUrl('https://book.example.com/all', {filterDefinitions:[{key:'category',type:'picker'}]}, {category:{value:'2'}});
  if (!filteredUrl.includes('category=2')) throw new Error('filtro não foi aplicado à URL');

  const cleaned = p.trimChapterBlocks([
    '首页', '作品名', '第1章 投胎', '这是正文第一段，长度足够用于检测章节正文。', '这是正文第二段，继续讲述故事内容。', '下一章', '相关推荐'
  ], 'https://book.example.com/chapter/1');
  if (cleaned[0] !== '第1章 投胎' || cleaned.some(x => x === '下一章' || x === '首页')) throw new Error('limpeza de cabeçalho/rodapé falhou: ' + JSON.stringify(cleaned));

  const oldGList = p.googleTranslateList.bind(p);
  p.googleTranslateList = async (values) => values.map((v, i) => 'T:' + v);
  const titles = await p.translateChapterTitlesProgressive(Array.from({length:73}, (_,i)=>({name:`第${i+1}章 测试`,path:`https://book.example.com/${i+1}.html`})));
  if (titles.length !== 73 || titles.some(x => !String(x.name).startsWith('T:'))) throw new Error('catálogo deixou títulos originais depois de um lote');
  p.googleTranslateList = oldGList;


  const longSummary = '句子。'.repeat(900);
  const shortSummary = p.truncateSummary(longSummary, 2000);
  if (shortSummary.length > 2001) throw new Error('sinopse ultrapassou 2000 caracteres: ' + shortSummary.length);

  // Aggregate homepage: once detected as static, page 2 must terminate instantly
  // instead of triggering artificial source pagination / dark loading spacers.
  p.sourceStaticContexts.clear(); p.sourcePageEnd.clear();
  p.sourceStaticContexts.add('popular|quanben.io||{}');
  p.sourcePageEnd.set('popular|quanben.io||{}', 2);
  const noPage2 = await p.sourcePage('popular|quanben.io||{}', 2, async () => { throw new Error('static portal carregou página artificial'); });
  if (noPage2.length !== 0) throw new Error('portal estático não encerrou a paginação');

  // Browse catalog: page cache/dedupe detects sites that ignore pagination.
  p.mode = 'child';
  p.sourcePageCache.clear(); p.sourcePageInFlight.clear(); p.sourcePageSeen.clear(); p.sourcePageEnd.clear();
  let browseLoads = 0;
  const realDiscoverSiteNovels = p.discoverSiteNovels.bind(p);
  p.translateNovelItemTitlesGoogle = async items => items;
  p.discoverSiteNovels = async (_profile, pageNo) => {
    browseLoads++;
    // simulate site ignoring ?page=2 and repeating page 1
    return Array.from({length:6}, (_,i)=>({name:`N${i}`,path:`https://book.example.com/n/${i}`}));
  };
  p.embeddedProfile = {host:'book.example.com',origin:'https://book.example.com',selectors:{}};
  p.profileCache.clear();
  const browse1 = await p.getPopularSourcePage(p.embeddedProfile,1,{});
  const browse2 = await p.getPopularSourcePage(p.embeddedProfile,2,{});
  if (browse1.length !== 6 || browse2.length !== 0) throw new Error('paginação repetida não foi deduplicada');
  const beforeCached = browseLoads;
  await p.getPopularSourcePage(p.embeddedProfile,1,{});
  if (browseLoads !== beforeCached) throw new Error('página de catálogo traduzida não foi reutilizada do cache');
  p.discoverSiteNovels = realDiscoverSiteNovels;

  p.sourcePageCache.clear(); p.sourcePageInFlight.clear(); p.sourcePageSeen.clear(); p.sourcePageEnd.clear();

  // Embedded local profile survives factory unavailability.
  p.mode = 'child';
  p.embeddedProfile = {host:'book.example.com',origin:'https://book.example.com',selectors:{}};
  p.localProfileStorageKey = 'translatorhell:profile:test';
  p.profileCache.clear();
  kv.delete(p.localProfileStorageKey);
  const embeddedOnly = await p.getCurrentProfile();
  if (!embeddedOnly || embeddedOnly.host !== 'book.example.com') throw new Error('perfil embutido falhou quando storage local estava vazio');
  const originalDiscover = p.discoverSiteNovels.bind(p);
  p.discoverSiteNovels = async (profile) => {
    if (!profile || !profile.selectors) throw new Error('popularNovels recebeu perfil nulo');
    return [{name:'原始标题', path:'https://book.example.com/info/1'}];
  };
  p.translateNovelItemTitlesGoogle = async (items) => items;
  const firstCatalog = await p.popularNovels(1, {});
  if (!Array.isArray(firstCatalog) || firstCatalog.length !== 1) throw new Error('filho não abriu catálogo com storage local vazio');
  p.discoverSiteNovels = originalDiscover;
  p.writeLocalProfile({host:'book.example.com',origin:'https://book.example.com',selectors:{chapterContent:'.reader'}});
  const local = p.readLocalProfile();
  if (local?.selectors?.chapterContent !== '.reader') throw new Error('perfil local não persistiu');

  const oldLoadConfig = p.loadTranslationConfig.bind(p);
  const oldTranslateText = p.translateText.bind(p);
  p.loadTranslationConfig = async () => ({providers:{}});
  p.translateText = async (text) => text;
  const batched = await p.translateChapterBlocks(Array.from({length:20}, (_,i)=>`第${i+1}段 正文内容测试`));
  if (batched.length !== 20) throw new Error('batch de capítulo perdeu parágrafos: ' + batched.length);
  p.loadTranslationConfig = oldLoadConfig;
  p.translateText = oldTranslateText;


  // Native LNReader chapter pagination: only requested page is translated/rendered.
  p.catalogPageSize = 24;
  const catalog = Array.from({length:53}, (_,i)=>({name:`第${i+1}章 测试`,path:`https://book.example.com/ch/${i+1}`,page:String(Math.floor(i/24)+1)}));
  p.setCatalogCache('https://book.example.com/info/1', catalog);
  const oldTranslateChapterTitlesGoogle = p.translateChapterTitlesGoogle.bind(p);
  p.translateChapterTitlesGoogle = async (items) => items.map(x=>({...x,name:'T:'+x.name}));
  const pg2 = await p.parsePage('https://book.example.com/info/1','2');
  if (pg2.chapters.length !== 24 || pg2.chapters.some(x=>x.page !== '2' || !x.name.startsWith('T:'))) throw new Error('parsePage não paginou/traduziu corretamente');
  const pg3 = await p.parsePage('https://book.example.com/info/1','3');
  if (pg3.chapters.length !== 5) throw new Error('parsePage última página incorreta: '+pg3.chapters.length);
  p.translateChapterTitlesGoogle = oldTranslateChapterTitlesGoogle;

  // BYOK can work from embedded child snapshot with local factory offline.
  p.embeddedTranslationConfig = {providers:{P:{key:'EMBEDDED',url:'https://gen.pollinations.ai/v1/chat/completions',model:'nova-fast'}}};
  factoryConfigAvailable = false;
  p.aiConfigCache = null;
  let config = await p.loadTranslationConfig(true);
  if (config.providers.P.key !== 'EMBEDDED') throw new Error('snapshot BYOK local não foi usado');
  let value = await p.translateText('原文', config);
  if (value !== 'TRADUÇÃO IA') throw new Error('IA direta falhou: ' + value);
  aiMode = 'fail';
  p.providerHealth.clear();
  value = await p.translateText('原文', config);
  if (value !== 'TRADUÇÃO GOOGLE') throw new Error('fallback Google falhou: ' + value);


  // v0.8.1 — transport learning is stability-first. A successful native path is
  // not intentionally alternated with JS during the first requests; fallback
  // failures/successes teach the alternative instead.
  p.strategyStatsLoaded = true;
  p.strategyStats = {};
  const strategyUrl081 = 'https://book.example.com/chapter/1';
  let choice081 = p.chooseStrategy('chapter',strategyUrl081,true);
  if (choice081 !== 'native') throw new Error('primeira estratégia deveria ser native');
  p.recordStrategy('chapter',strategyUrl081,'native',120,true);
  if (p.chooseStrategy('chapter',strategyUrl081,true) !== 'native') throw new Error('transporte native estável foi alternado sem necessidade');
  const failUrl081 = 'https://slow.example.com/chapter/1';
  const bucket081 = p.strategyBucket('chapter',failUrl081);
  bucket081.total = 3;
  bucket081.native = {count:2,ok:0,fail:2,totalMs:0,ewmaMs:0};
  bucket081.js = {count:1,ok:1,fail:0,totalMs:80,ewmaMs:80};
  if (p.chooseStrategy('chapter',failUrl081,true) !== 'js') throw new Error('fallback JS aprendido não foi preservado');

  // Persistent translated chapter cache survives normal memory-cache eviction.
  p.persistentChapterCacheLoaded = true;
  p.persistentChapterCache = new Map();
  p.setPersistentChapterCache('https://book.example.com/chapter/cache','<p>traduzido</p>');
  if (p.getPersistentChapterCache('https://book.example.com/chapter/cache') !== '<p>traduzido</p>')
    throw new Error('cache persistente de capítulo falhou');

  // v0.7.6 — WordPress/WooCommerce fast path (novelasligeras.net class).
  const wooHtml = '<html><head><link href="/wp-content/a.css"></head><body><ul class="products columns-4"><li class="product type-product"><a href="/index.php/producto/obra-a/"><h2 class="woocommerce-loop-product__title">Obra A</h2></a></li></ul></body></html>';
  const wooAdapter = p.detectBrowseAdapter(wooHtml, 'https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/');
  if (wooAdapter.type !== 'woocommerce' || wooAdapter.paginationMode !== 'wordpress-path') throw new Error('WooCommerce não recebeu fast path WordPress');
  const novaList = 'https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/';
  const novaPage2 = p.pageVariant(novaList, 2, {browseAdapter:'woocommerce',paginationMode:'wordpress-path'});
  if (novaPage2 !== 'https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/page/2/') throw new Error('paginação WordPress incorreta: ' + novaPage2);
  const lnwpAdapter = p.detectBrowseAdapter('<div class="eplister"></div><img class="ts-post-image">', 'https://lnwp.example/series/');
  const lnwpPage2 = p.pageVariant('https://lnwp.example/series/', 2, {browseAdapter:lnwpAdapter.type,paginationMode:lnwpAdapter.paginationMode});
  if (lnwpAdapter.type !== 'lightnovelwp' || lnwpPage2 !== 'https://lnwp.example/series/?page=2') throw new Error('LightNovelWP perdeu paginação ?page=N oficial: '+lnwpPage2);
  const normalizedList = p.listingBaseUrl('https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/page/3/?utm_source=x');
  if (!normalizedList.includes('/lista-de-novela-ligera-novela-web/') || normalizedList.includes('/page/3/')) throw new Error('rota aprendida permaneceu presa em página posterior');

  // Once a listing URL is learned, opening the extension is one listing request;
  // it must not re-probe the homepage/generic candidates.
  const oldFetchBrowsePage = p.fetchBrowsePage.bind(p);
  const oldSiteOrigins = p.siteOrigins.bind(p);
  const oldLearnBrowseRow = p.learnBrowseRow.bind(p);
  let fastPathUrls = [];
  p.fetchBrowsePage = async (_profile, url) => { fastPathUrls.push(url); return {url,adapter:'woocommerce',paginationMode:'wordpress-path',items:Array.from({length:8},(_,i)=>({name:'N'+i,path:`https://novelasligeras.net/index.php/producto/n${i}/`})),discovered:[],filters:[],hasPagination:true}; };
  p.learnBrowseRow = () => {};
  const novaProfile = {host:'novelasligeras.net',origin:'https://novelasligeras.net',seedUrl:novaList,selectors:{},searchTemplates:[],listingUrls:[novaList],filterDefinitions:[],browseAdapter:'woocommerce',paginationMode:'wordpress-path'};
  const fastNova = await p.discoverSiteNovels(novaProfile, 1, {}, 'nova-fast');
  if (fastNova.length !== 8 || fastPathUrls.length !== 1 || fastPathUrls[0] !== novaList) throw new Error('fast path aprendido ainda fez sondagens extras: '+JSON.stringify(fastPathUrls));

  // Cold start inspects one homepage and then the strongest real listing link.
  fastPathUrls = [];
  p.siteOrigins = () => ['https://novelasligeras.net'];
  p.fetchBrowsePage = async (_profile, url) => {
    fastPathUrls.push(url);
    if (url === 'https://novelasligeras.net/') return {url,adapter:'wordpress',paginationMode:'wordpress-path',items:[],discovered:[novaList],filters:[],hasPagination:false};
    if (url === novaList) return {url,adapter:'woocommerce',paginationMode:'wordpress-path',items:Array.from({length:7},(_,i)=>({name:'C'+i,path:`https://novelasligeras.net/index.php/producto/c${i}/`})),discovered:[],filters:[],hasPagination:true};
    return null;
  };
  const coldNova = await p.discoverSiteNovels({...novaProfile,listingUrls:[],browseAdapter:undefined,paginationMode:undefined}, 1, {}, 'nova-cold');
  if (coldNova.length !== 7 || fastPathUrls.length !== 2 || fastPathUrls[0] !== 'https://novelasligeras.net/' || fastPathUrls[1] !== novaList) throw new Error('cold start não convergiu homepage -> catálogo em duas requisições: '+JSON.stringify(fastPathUrls));
  p.fetchBrowsePage = oldFetchBrowsePage;
  p.siteOrigins = oldSiteOrigins;
  p.learnBrowseRow = oldLearnBrowseRow;

  // Real timeout cancellation: when AbortController exists, the losing fetch is
  // signalled, not merely ignored by Promise.race.
  let aborted = false;
  const abortStart = Date.now();
  try {
    await p.withAbortTimeout(signal => new Promise((_resolve,reject) => {
      if (signal?.aborted) { aborted = true; reject(new Error('aborted')); return; }
      signal?.addEventListener?.('abort', () => { aborted = true; reject(new Error('aborted')); }, {once:true});
    }), 140, 'abort regression');
    throw new Error('timeout abortável resolveu sem timeout');
  } catch (error) {
    if (!error?.timeout) throw error;
  }
  if (typeof AbortController === 'function' && !aborted) throw new Error('timeout não abortou fetch subjacente');
  if (Date.now() - abortStart > 800) throw new Error('timeout abortável bloqueou a thread por tempo excessivo');

  // A response that arrives after the browse budget expired must never enter
  // compaction/Cheerio. This protects Back/navigation from stale heavy parsing.
  const oldSingleStrategy = p.getTextSingleStrategy.bind(p);
  const oldCompactBrowse = p.compactBrowseHtml.bind(p);
  let compactCalls = 0;
  p.getTextSingleStrategy = async (_url,_operation,signal) => await new Promise((resolve,reject) => {
    const t=setTimeout(()=>resolve('<html>'+('x'.repeat(500000))+'</html>'),260);
    signal?.addEventListener?.('abort',()=>{clearTimeout(t);reject(new Error('aborted'));},{once:true});
  });
  p.compactBrowseHtml = html => { compactCalls++; return oldCompactBrowse(html); };
  const tinyBudget = {id:999,deadline:Date.now()+120,maxAttempts:1,attempts:0,urls:new Set()};
  const late = await p.fetchBrowsePage(novaProfile, novaList, '', tinyBudget, 100);
  if (late !== null || compactCalls !== 0) throw new Error('resposta atrasada ainda entrou no parser pesado');
  p.getTextSingleStrategy = oldSingleStrategy;
  p.compactBrowseHtml = oldCompactBrowse;

  // Child hot path is fully local: opening a generated source and reading its BYOK
  // snapshot cannot depend on 127.0.0.1 Factory availability.
  const oldFactoryRequest = p.factoryRequest.bind(p);
  let hotFactoryCalls = 0;
  p.factoryRequest = async () => { hotFactoryCalls++; throw new Error('local factory must not be touched'); };
  p.mode = 'child';
  p.embeddedProfile = {host:'offline.example',origin:'https://offline.example',selectors:{},listingUrls:[]};
  p.localProfileStorageKey = 'translatorhell:profile:v076-offline';
  p.profileCache.clear(); kv.delete(p.localProfileStorageKey);
  const localProfile076 = await p.getCurrentProfile();
  p.embeddedTranslationConfig = {providers:{P:{key:'OFFLINE_BYOK'}}};
  p.aiConfigCache = null;
  const localConfig076 = await p.loadTranslationConfig(true);
  if (hotFactoryCalls !== 0 || localProfile076?.host !== 'offline.example' || localConfig076?.providers?.P?.key !== 'OFFLINE_BYOK') throw new Error('filho ainda depende do servidor local no caminho crítico');
  // registerProfile is also local-only for installed children; novel detail must
  // never wait for the compiler server.
  const localReg076 = await p.registerProfile({host:'offline.example',origin:'https://offline.example',selectors:{title:'h1'},listingUrls:[]});
  if (hotFactoryCalls !== 0 || localReg076 !== null) throw new Error('registerProfile do filho voltou a consultar Factory local calls='+hotFactoryCalls+' ret='+String(localReg076));
  p.factoryRequest = oldFactoryRequest;

  // v0.8.4: bounded 6.5s first-paint window includes batch + individual retry.
  // Source result returns originals; no catalog spinner is allowed to own the screen.
  p.sourcePageCache.clear(); p.sourcePageInFlight.clear(); p.sourcePageSeen.clear(); p.sourcePageEnd.clear();
  const oldTitleTranslate076 = p.translateNovelItemTitlesGoogle.bind(p);
  p.translateNovelItemTitlesGoogle = async () => await new Promise(()=>{});
  const hungStart = Date.now();
  const hungItems = await p.sourcePage('es-zh-hung-v076',1,async()=>[{name:'Título español único v076',path:'https://offline.example/producto/unico/'}],false);
  const hungMs = Date.now()-hungStart;
  if (hungItems.length !== 1 || hungItems[0].name !== 'Título español único v076' || hungMs > 7200) throw new Error('tradução visual ainda prende catálogo: '+hungMs+'ms');
  p.translateNovelItemTitlesGoogle = oldTitleTranslate076;

  // Browse sourcePage no longer schedules a hidden page-2 prefetch after Back.
  p.sourcePageCache.clear(); p.sourcePageInFlight.clear(); p.sourcePageSeen.clear(); p.sourcePageEnd.clear();
  let noPrefetchLoads = 0;
  await p.sourcePage('no-prefetch-v076',1,async(page)=>{noPrefetchLoads++;return [{name:'One',path:'https://offline.example/producto/one/'}];},true);
  await new Promise(r=>setTimeout(r,260));
  if (noPrefetchLoads !== 1) throw new Error('prefetch oculto de catálogo ainda executa após a primeira página');


  // v0.7.7 NOVA/WooCommerce architecture regressions.
  // Lazy images behind Cloudflare commonly use data-cfsrc instead of src.
  const fakeImageNode = {
    attr: (key) => key === 'data-cfsrc' ? 'https://cdn.example.org/real-cover.webp' : (key === 'src' ? 'data:image/gif;base64,AAAA' : undefined),
    closest: () => ({find:()=>({first:()=>({attr:()=>undefined})})}),
    parent: () => ({attr:()=>''}),
  };
  const lazyCover = p.extractImageUrl(fakeImageNode, 'https://book.example.com/producto/demo/');
  if (lazyCover !== 'https://cdn.example.org/real-cover.webp') throw new Error('data-cfsrc não venceu placeholder de capa');

  if (p.normalizeNovelStatus('En Proceso') !== 'Ongoing') throw new Error('status espanhol En Proceso não normalizado');
  if (p.normalizeNovelStatus('Completada') !== 'Completed') throw new Error('status espanhol completado não normalizado');
  if (p.normalizeNovelStatus('停更') !== 'On Hiatus') throw new Error('status CJK hiatus não normalizado');

  // Failed display translation must remain retryable instead of caching the
  // source string forever. Then a token-normalized response must split back into
  // the original item count even if private-use sentinel chars disappear.
  const sourceTitle077 = 'Título español que debe traducirse 077';
  const cacheKey077 = `${p.targetLanguage}\u0000${sourceTitle077}`;
  try { p.displayTitleCache?.delete?.(cacheKey077); } catch (_) {}
  const realGoogleTranslate077 = p.googleTranslate.bind(p);
  p.googleTranslate = async () => { throw new Error('temporary network failure'); };
  const failed077 = await p.googleTranslateList([sourceTitle077], 120);
  if (failed077[0] !== sourceTitle077 || p.getDisplayCache(cacheKey077) !== undefined) throw new Error('falha de tradução contaminou cache persistente');
  p.googleTranslate = async (joined) => {
    // Simulate a translation service stripping private-use chars around THSEP.
    const token = (String(joined).match(/THSEP\d*_[a-z0-9]+/i) || ['THSEP0_test'])[0];
    const pieces = String(joined).split(/\uE000?THSEP\d*_[a-z0-9]+\uE001?/i);
    if (pieces.length > 1) return pieces.map((x,i)=>`译${i+1}:${x.trim()}`).join(`\n${token}\n`);
    return '译:' + joined;
  };
  const translated077 = await p.googleTranslateList(['Uno original 077','Dos original 077'], 800);
  if (translated077.length !== 2 || !translated077.every(x => String(x).startsWith('译'))) throw new Error('batch visual não recuperou delimitador normalizado');
  p.googleTranslate = realGoogleTranslate077;

  // Static architecture surface: these selectors are intentionally family-level,
  // not hostname exceptions, and cover the official NOVA/The7/WPBakery structure.
  const wooChaptersSource = String(p.extractWooCommerceChapters);
  const wooBrowseSource = String(p.extractAdapterBrowseItems);
  const searchProfileSource077 = String(p.searchProfile);
  const chapterRootSource077 = String(p.findMainRoot);
  if (!wooChaptersSource.includes('.dt-fancy-title') || !wooChaptersSource.includes('.wpb_tab a[href]')) throw new Error('adapter WPBakery de volumes/capítulos ausente');
  if (!wooBrowseSource.includes('.dt-css-grid div.wf-cell') || !wooBrowseSource.includes('h4.entry-title a')) throw new Error('adapter The7/WooCommerce de catálogo ausente');
  if (!searchProfileSource077.includes('extractAdapterBrowseItems')) throw new Error('busca não reutiliza adapter de cards/cover da arquitetura');
  if (!chapterRootSource077.includes('.wpb_text_column.wpb_content_element > .wpb_wrapper')) throw new Error('conteúdo WPBakery não tem fast-path de capítulo');

  // The7/WooCommerce can expose first-page search as admin-ajax JSON. It is only
  // enabled from strong DOM/script signals and generic WooCommerce remains untouched.
  const ajaxDesc077 = p.detectWooAjaxSearchAdapter('<div class="dt-css-grid"><div class="wf-cell"></div></div><script>var action="product_search"; var ixwps=1;</script>', 'https://shop.example.com/catalog/', 'woocommerce');
  if (ajaxDesc077?.type !== 'the7-product-search' || !String(ajaxDesc077.url).includes('/wp-admin/admin-ajax.php')) throw new Error('adapter AJAX The7/WooCommerce não foi detectado');
  const noAjaxGeneric077 = p.detectWooAjaxSearchAdapter('<ul class="products"><li class="product"></li></ul>', 'https://shop.example.com/catalog/', 'woocommerce');
  if (noAjaxGeneric077) throw new Error('WooCommerce genérico recebeu AJAX The7 sem sinal forte');
  const ajaxItems077 = p.parseWooAjaxNovelItems([{url:'https://shop.example.com/producto/a/',title:'Obra A',thumbnail:'https://cdn.example.com/a.jpg'}],{host:'shop.example.com',origin:'https://shop.example.com'});
  if (ajaxItems077.length !== 1 || ajaxItems077[0].name !== 'Obra A' || !ajaxItems077[0].cover) throw new Error('JSON AJAX WooCommerce não virou NovelItem com capa');

  // v0.7.9 — chapter selectors are authoritative and trademark/menu debris
  // must never become chapters merely because their URL contains a number.
  const fakeChapterAnchor078 = {
    attr: () => '',
    parent: () => ({attr:()=>''}),
    closest: () => ({attr:()=>''}),
  };
  if (p.isPlausibleChapterTitle('®...', 'https://m.qidian.com/chapter/12345.html', fakeChapterAnchor078)) throw new Error('lixo ® ainda aceito como capítulo');
  if (!p.isPlausibleChapterTitle('第25章 青山', 'https://book.example.com/n/demo/25.html', fakeChapterAnchor078)) throw new Error('capítulo CJK explícito rejeitado');
  const runtimeSource078 = require('fs').readFileSync(path.resolve(__dirname, '../factory-templates/runtime.template.js'),'utf8');
  if (!runtimeSource078.includes('if (preferredSelector)') || !runtimeSource078.includes('collect(preferredSelector)')) throw new Error('seletor de capítulos continua ignorado');

  const good078 = [1,2,3].map(n=>({href:`/n/demo/${n}.html`,text:`第${n}章 正文`,cls:'chapter-item'}));
  const junk078 = {href:'/n/demo/999.html',text:'®...',cls:'footer'};
  const wrap078 = el => ({
    attr:(k)=>k==='href'?el.href:(k==='class'?el.cls:''), text:()=>el.text,
    parent:()=>({attr:()=>el.cls||''}), closest:()=>({attr:()=>el.cls||''}),
  });
  const fakeDollar078 = arg => {
    if (typeof arg === 'string') {
      const arr = arg === '.chapters a[href]' ? good078 : [...good078,junk078];
      return {each:cb=>arr.forEach((x,i)=>cb(i,x))};
    }
    return wrap078(arg);
  };
  const selected078 = p.extractChapterLinks(fakeDollar078,'https://book.example.com/n/demo/','.chapters a[href]');
  if (selected078.length !== 3 || selected078.some(x=>String(x.name).includes('®'))) throw new Error('extração não respeitou seletor/filtragem de lixo');

  // Qidian/Yuewen SSR cards may expose one stale lazy-image URL for many books;
  // derive the stable public cover from the canonical book id instead.
  const qidianCover078 = p.deriveArchitectureCover('https://m.qidian.com/book/1031940621.html');
  if (qidianCover078 !== 'https://bookcover.yuewen.com/qdbimg/349573/1031940621/180') throw new Error('capa Qidian por bookId não derivada');
  const sanitized078 = p.sanitizeNovelItemCovers([
    {name:'A',path:'https://m.qidian.com/book/1001.html',cover:'https://bad.example/same.jpg'},
    {name:'B',path:'https://m.qidian.com/book/1002.html',cover:'https://bad.example/same.jpg'},
    {name:'C',path:'https://m.qidian.com/book/1003.html',cover:'https://bad.example/same.jpg'},
  ]);
  if (new Set(sanitized078.map(x=>x.cover)).size !== 3) throw new Error('capa repetida do catálogo Qidian não foi reparada');

  // /n/<slug>/ static portal family must go straight to list.html before generic
  // guesses. This is the deterministic Quanben-style architecture.
  const oldArch078 = p.extractArchitectureChapters.bind(p);
  const oldFetchCat078 = p.fetchCatalogPages.bind(p);
  p.extractArchitectureChapters = () => null;
  let staticCatalogUrl078 = '';
  p.fetchCatalogPages = async (url) => { staticCatalogUrl078 = url; return {items:[1,2,3,4].map((n,i)=>({name:`第${n}章 T`,path:`https://quanben.io/n/demo/${n}.html`,order:i,number:n,numberSource:'text'})),chapterSelector:'.list'}; };
  const static078 = await p.extractChaptersDeep(()=>{}, 'https://quanben.io/n/demo/', {host:'quanben.io',origin:'https://quanben.io',selectors:{}});
  if (staticCatalogUrl078 !== 'https://quanben.io/n/demo/list.html' || static078.chapters.length !== 4) throw new Error('fast-path /n/<slug>/list.html não executou');
  p.extractArchitectureChapters = oldArch078; p.fetchCatalogPages = oldFetchCat078;

  // v0.8.1 — a spectacular teaser jump must never become a normal two-page
  // catalog. The safe fallback keeps the initial contiguous run when full recovery
  // is impossible, while the paginator recognizes non-anchor option/data URLs.
  const gap081 = [
    ...Array.from({length:34},(_,i)=>({name:`第${i+1}章 前`,path:`https://quanben.io/n/gap/${i+1}.html`,order:i,number:i+1,numberSource:'text'})),
    ...Array.from({length:8},(_,i)=>({name:`第${4893+i}章 后`,path:`https://quanben.io/n/gap/${4893+i}.html`,order:34+i,number:4893+i,numberSource:'text'})),
  ];
  if (!p.hasExtremeChapterGap(gap081)) throw new Error('salto 34 -> 4893 não foi classificado como extremo');
  const safe081 = p.contiguousChapterFallback(gap081);
  if (safe081.length !== 34 || Math.max(...safe081.map(x=>x.number)) !== 34) throw new Error('fallback contínuo publicou o bloco 4893+');
  const optionPages081 = p.findCatalogPageCandidatesRaw(
    '<select><option value="/n/gap/list_2.html">2</option><option data-url="/n/gap/list_3.html">3</option></select>',
    'https://quanben.io/n/gap/list.html', new Set(['https://quanben.io/n/gap/list.html'])
  );
  if (!optionPages081.some(x=>x.includes('list_2.html')) || !optionPages081.some(x=>x.includes('list_3.html'))) throw new Error('paginação em option/data-url não foi descoberta');
  const inferred081 = p.inferCatalogSiblingPages('https://quanben.io/n/gap/list.html',4);
  if (!inferred081.some(x=>x.includes('list_2.html'))) throw new Error('série list_N.html não foi inferida');
  const ranked081 = p.rankCatalogUrls([
    'https://m.xs8.cn/book/123/catalog.html',
    'https://m.xs8.cn/chapter/123/999',
    'https://m.xs8.cn/chapterlist/123',
  ], 'https://m.xs8.cn/book/123');
  if (ranked081[0] !== 'https://m.xs8.cn/chapterlist/123' || ranked081.includes('https://m.xs8.cn/chapter/123/999')) throw new Error('ranking Yuewen ainda prioriza rota inventada/leitor');
  const yuewenArch081 = p.detectSiteArchitecture('', 'https://m.xs8.cn/?type=7');
  if (yuewenArch081.type !== 'yuewen') throw new Error('família Yuewen/XS8 não foi reconhecida');
  const coverXs081 = p.deriveArchitectureCover('https://m.xs8.cn/book/32458096004973808');
  if (!String(coverXs081).includes('/32458096004973808/180')) throw new Error('capa Yuewen/XS8 não foi derivada por bookId');

  // URL-valued category filters must be applied BEFORE pagination. v0.8.0 first
  // generated _2.html and then replaced it with the filter's page-1 URL, causing
  // LNReader page 2 to refetch page 1 and dedupe everything to zero.
  const filterProfile081 = {filterDefinitions:[{key:'__th_category_url',mode:'url'}]};
  const selected081 = {__th_category_url:{value:'https://quanben.io/c/xuanhuan.html'}};
  const filteredBase081 = p.applyDetectedFiltersToUrl('https://quanben.io/c/xuanhuan.html', filterProfile081, selected081);
  const pagedFilter081 = p.pageVariant(filteredBase081, 2, filterProfile081);
  if (!pagedFilter081.includes('/c/xuanhuan_2.html')) throw new Error('filtro URL apagou a paginação Quanben: '+pagedFilter081);

  // Detail/page rendering must not schedule hidden chapter work after returning.
  if (runtimeSource078.includes('prefetchChapter(firstChapters') || runtimeSource078.includes('warmDisplayTranslations(next)')) throw new Error('trabalho oculto ainda é iniciado pela tela de detalhes');
  if (!runtimeSource078.includes("perfStart('parseNovel'") || !runtimeSource078.includes("perfStart('browsePage'")) throw new Error('profiler de detalhes/catálogo ausente');

  // v0.8.0 — creation itself learns homepage/catalog and representative detail
  // separately, then embeds both into the generated child profile.
  const oldGetText080 = p.getText.bind(p);
  const oldInfer080 = p.inferNovelUrl.bind(p);
  const oldSiteLearn080 = p.learnSiteProfile.bind(p);
  const oldDetailLearn080 = p.learnDetailProfile.bind(p);
  const oldResolveIcon080 = p.resolveSiteIconDeep.bind(p);
  const oldRegister080 = p.registerProfile.bind(p);
  p.factoryCommandState.clear(); p.factorySessionSuccess.clear();
  p.getText = async (u) => String(u).includes('/novel/sample') ? '<html>DETAIL</html>' : '<html>HOME</html>';
  p.inferNovelUrl = (_$, base) => String(base).endsWith('/') ? 'https://bootstrap.example/novel/sample' : undefined;
  p.learnSiteProfile = () => ({host:'bootstrap.example',origin:'https://bootstrap.example',siteName:'Bootstrap',seedUrl:'https://bootstrap.example/',sourceRoot:'https://bootstrap.example/',listingUrls:['https://bootstrap.example/library/'],searchTemplates:[],filterDefinitions:[],selectors:{},siteIconUrl:'https://bootstrap.example/icon.png'});
  p.learnDetailProfile = () => ({host:'bootstrap.example',origin:'https://bootstrap.example',selectors:{summary:'.novel-summary',cover:'.novel-cover img@src'},novelAdapter:'generic'});
  p.resolveSiteIconDeep = async (_$, _u, value) => value;
  let registered080 = null; p.registerProfile = async prof => { registered080 = prof; return {ok:true}; };
  const created080 = await p.searchByUrl('https://bootstrap.example/');
  if (!created080.length || !registered080) throw new Error('bootstrap 0.8.0 não registrou filho');
  if (registered080.seedUrl !== 'https://bootstrap.example/' || !registered080.listingUrls.includes('https://bootstrap.example/library/') || registered080.selectors.summary !== '.novel-summary') throw new Error('bootstrap site+detalhe não foi mesclado corretamente');
  p.getText=oldGetText080; p.inferNovelUrl=oldInfer080; p.learnSiteProfile=oldSiteLearn080; p.learnDetailProfile=oldDetailLearn080; p.resolveSiteIconDeep=oldResolveIcon080; p.registerProfile=oldRegister080;

  // v0.8.0 — site/catalog context is stable and may not be overwritten by the
  // representative novel used to learn detail selectors.
  const split080 = p.mergeProfiles(
    {host:'split.example',origin:'https://split.example',seedUrl:'https://split.example/',sourceRoot:'https://split.example/',listingUrls:['https://split.example/library/'],siteIconCandidates:['https://split.example/icon.png']},
    {host:'split.example',origin:'https://split.example',seedUrl:'https://split.example/novel/a/',selectors:{summary:'.summary'},siteIconCandidates:['https://split.example/touch.png']}
  );
  if (split080.seedUrl !== 'https://split.example/' || !split080.listingUrls.includes('https://split.example/library/')) throw new Error('novel-amostra ainda sobrescreve contexto do catálogo');
  if (split080.siteIconCandidates.length !== 2) throw new Error('candidatos de logo não foram preservados no perfil');
  const runtime080 = require('fs').readFileSync(path.resolve(__dirname, '../factory-templates/runtime.template.js'),'utf8');
  if (!runtime080.includes('learnSiteProfile(seed$, url, url, html)') || !runtime080.includes('learnDetailProfile(learned$, learnedUrl)')) throw new Error('bootstrap site+detalhe separado ausente');
  if (!runtime080.includes('sourceRoot: u.origin +')) throw new Error('raiz estável da extensão ausente');

  // Browse cards persist source-language hints. A weak detail page can therefore
  // recover the correct title/cover without coupling structural and display caches.
  p.rememberNovelHints([{name:'Nome fonte 080',path:'https://split.example/novel/a/',cover:'https://split.example/a.jpg'}]);
  const hint080 = p.getNovelHint('https://www.split.example/novel/a/?utm_source=x');
  if (!hint080 || hint080.name !== 'Nome fonte 080' || hint080.cover !== 'https://split.example/a.jpg') throw new Error('hint estrutural de catálogo não sobreviveu canonicalização');
  if (!runtime080.includes('full-dom-recovery')) throw new Error('fallback de detalhe completo ausente');

  // v0.8.2 — opening a second Yuewen/XS8 work in the same installed child must
  // never inherit/switch to another bookId. Canonical detail URLs are authoritative
  // and catalog candidates carrying a foreign work token are rejected before fetch.
  const xsA082 = 'https://m.xs8.cn/book/20805366208280104';
  const xsB082 = 'https://m.xs8.cn/chapterlist/28820453107372004';
  if (!p.isCanonicalNovelDetailUrl(xsA082)) throw new Error('detalhe XS8 canônico não foi reconhecido');
  if (p.catalogBelongsToNovel(xsB082, xsA082)) throw new Error('catálogo XS8 de outra obra ainda foi aceito');
  if (!p.catalogBelongsToNovel('https://m.xs8.cn/chapterlist/20805366208280104', xsA082)) throw new Error('catálogo XS8 da própria obra foi rejeitado');
  if (p.novelWorkToken(xsA082) !== 'yuewen:20805366208280104') throw new Error('bookId Yuewen não entrou na identidade da obra');

  // Shuqi: the SSR detail contains only the latest 3 chapters while the page itself
  // advertises thousands. The adapter must classify the family and flatten the full
  // chapterList payload into per-chapter reader URLs instead of publishing the teaser.
  const shuqiArch082 = p.detectSiteArchitecture('<title>书旗小说</title>', 'https://t.shuqi.com/');
  if (shuqiArch082.type !== 'shuqi' || shuqiArch082.paginationMode !== 'static') throw new Error('arquitetura Shuqi não foi detectada');
  if (p.shuqiBookId('https://t.shuqi.com/book/6720460.html') !== '6720460') throw new Error('bookId Shuqi não extraído do detalhe');
  if (p.shuqiBookId('https://t.shuqi.com/reader/6720460/?forceChapterId=1') !== '6720460') throw new Error('bookId Shuqi não extraído do reader');
  if (p.md5Hex('abc') !== '900150983cd24fb0d6963f7d28e17f72') throw new Error('MD5 interno Shuqi incorreto');
  const shuqiPayload082 = {data:{chapterList:[
    {volumeName:'正文',volumeList:[
      {chapterId:'101',chapterName:'第1章 开始',chapterOrdid:1},
      {chapterId:'102',chapterName:'第2章 继续',chapterOrdid:2},
    ]},
    {volumeName:'第二卷',volumeList:[
      {chapterId:'201',chapterName:'第3章 转折',chapterOrdid:3},
      {chapterId:'202',chapterName:'第4章 结尾',chapterOrdid:4},
    ]},
  ]}};
  const shuqiCh082 = p.shuqiChaptersFromPayload(JSON.stringify(shuqiPayload082),'6720460');
  if (shuqiCh082.length !== 4 || !shuqiCh082[3].path.includes('/reader/6720460/?forceChapterId=202')) throw new Error('chapterList Shuqi não foi achatado integralmente');
  if (shuqiCh082.map(x=>x.number).join(',') !== '1,2,3,4') throw new Error('ordem real Shuqi não foi preservada');
  const fakeShuqiRoot082 = {root:()=>({text:()=> '目录共4051章 最新章节 第4051章 第4050章 第4049章'})};
  if (p.shuqiExpectedChapterCount(fakeShuqiRoot082) !== 4051) throw new Error('total anunciado pelo detalhe Shuqi não foi reconhecido');
  const staticPage2082 = await p.discoverSiteNovels({host:'t.shuqi.com',origin:'https://t.shuqi.com',seedUrl:'https://t.shuqi.com/',browseAdapter:'shuqi',paginationMode:'static',listingUrls:['https://t.shuqi.com/']}, 2, {}, 'shuqi-test');
  if (staticPage2082.length !== 0) throw new Error('homepage estática Shuqi ainda fabrica ?page=2');

  const oldSingle082 = p.getTextSingleStrategy.bind(p);
  const apiRows082 = Array.from({length:60},(_,i)=>({chapterId:String(9000+i),chapterName:`第${i+1}章 完整目录`,chapterOrdid:i+1}));
  p.getTextSingleStrategy = async u => String(u).includes('ocean.shuqireader.com')
    ? JSON.stringify({data:{chapterList:[{volumeName:'正文',volumeList:apiRows082}]}})
    : '<html><body>reader shell</body></html>';
  const fullShuqi082 = await p.extractShuqiCatalog('https://t.shuqi.com/book/6720460.html',{root:()=>({text:()=> '目录共60章 最新章节 第60章 第59章 第58章'})});
  p.getTextSingleStrategy = oldSingle082;
  if (!fullShuqi082 || fullShuqi082.items.length !== 60 || fullShuqi082.items[0].number !== 1 || fullShuqi082.items[59].number !== 60) throw new Error('adapter Shuqi não preferiu catálogo integral sobre teaser');

  // v0.8.2 source must contain the architecture-scoped Shuqi card collector. This
  // associates image/text anchors by canonical /book/<id> rather than borrowing the
  // first image from a broad section (the repeated-cover bug from the screenshot).
  const runtime082 = require('fs').readFileSync(path.resolve(__dirname, '../factory-templates/runtime.template.js'),'utf8');
  if (!runtime082.includes("adapterType === 'shuqi'") || !runtime082.includes("const byPath = new Map()")) throw new Error('collector de capas Shuqi por obra ausente');
  if (!runtime082.includes('catalogBelongsToNovel(x, novelUrl)')) throw new Error('trava anti-vazamento de catálogo por bookId ausente');

  if (!p.sameSiteHost('book.qidian.com', 'www.qidian.com')) throw new Error('subdomínios irmãos não reconhecidos');
  console.log('OK — regressões herdadas até v0.8.2: Shuqi completo, isolamento por obra, ícones, continuidade e adapters validados.');
})().catch(err => { console.error(err); process.exit(1); });
