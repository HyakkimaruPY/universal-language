'use strict';
// Real Cheerio, mocked transport/storage; no requests to source sites or Android build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const template = fs.readFileSync(path.resolve(__dirname, '../factory-templates/runtime.template.js'), 'utf8');
let count = 0;
function make(mode = 'child', network = async () => { throw Error('unexpected network'); }, extra = {}) {
  const config = {id:'test',name:'Test',mode,host:'fixture.test',site:'https://fixture.test',targetKey:'pt',targetLanguage:'pt',targetLabel:'Português',perfDebug:false,...(extra.config || {})};
  const kv = extra.kv || new Map();
  const context = {...extra, exports:{},URL,URLSearchParams,AbortController,TextDecoder,Uint8Array,Date,Math,JSON,Promise,Map,Set,console,setTimeout,clearTimeout,
    require(name) {
      if (name === 'cheerio') return cheerio;
      if (name === '@libs/fetch') return {fetchApi: network};
      if (name === '@libs/filterInputs') return {FilterTypes:{}};
      if (name === '@libs/storage') return {storage:{get:k=>kv.get(k),set:(k,v)=>kv.set(k,v),getAllKeys:()=>[...kv.keys()]}};
      throw Error(name);
    }};
  // Same CONFIG substitution as the Python generator.
  vm.runInNewContext(template.replace('__TH_CONFIG__', JSON.stringify(config)), context);
  return context.exports.default;
}
function response(html, status=200, headers={}) {
  return {ok:status>=200&&status<300,status,headers:{get:k=>headers[k]||''},text:async()=>html};
}
function rows(start,end,cls='wp-manga-chapter') {
  return Array.from({length:end-start+1},(_,i)=>`<li class="${cls}"><a href="/novel/alpha/chapter-${start+i}/">Chapter ${start+i}: Title</a></li>`).join('');
}
async function test(label, run) {await run();console.log('PASS '+label);count++;}
(async()=>{
 await test('Madara new POST + explicit page 2 + ascending chapters', async()=>{
  const seen=[];
  const p=make('child',async(url,init)=>{seen.push([url,init]);return response(url.includes('page=2')?rows(3,4):rows(1,2)+'<div class="pagination"><a href="?page=2" data-page="2">2</a></div>');});
  const result=await p.extractChaptersDeep(cheerio.load('<div id="manga-chapters-holder" data-id="42"></div>'),'https://fixture.test/novel/alpha/',{});
  assert.equal(result.chapters.length,4);assert.equal(result.chapters[3].chapterNumber,4);
  assert.equal(seen.length,2);assert.ok(seen.every(x=>x[1].method==='POST'));
  assert.equal(seen[0][1].headers.Referer,'https://fixture.test/novel/alpha/');
 });
 await test('Madara old endpoint uses current work ID, no copied source',async()=>{
  const seen=[];const p=make('child',async(url,init)=>{seen.push([url,init]);return response(url.includes('admin-ajax')?rows(1,3):'0');});
  for (const id of ['42','91']) await p.extractChaptersDeep(cheerio.load(`<div id="manga-chapters-holder" data-id="${id}"></div>`),'https://fixture.test/novel/alpha/',{});
  assert.equal(seen[1][1].body,'action=manga_get_chapters&manga=42');assert.equal(seen[3][1].body,'action=manga_get_chapters&manga=91');
 });
 await test('ReadNovelFull archive + JSON html envelope',async()=>{
  let url;const p=make('child',async(u)=>{url=u;return response(JSON.stringify({html:'<ul class="list-chapter">'+rows(1,3,'chapter')+'</ul>'}));});
  const result=await p.extractChaptersDeep(cheerio.load('<div id="rating" data-novel-id="123"></div>'),'https://fixture.test/alpha.html',{});
  assert.equal(result.chapters.length,3);assert.equal(url,'https://fixture.test/ajax/chapter-archive?novelId=123');
 });
 await test('Unrecognized DOM does not probe AJAX endpoints',async()=>{
  const p=make();assert.equal(p.discoverChapterRequests(cheerio.load('<h1>Book</h1>'),'https://fixture.test/novel/alpha/',{}).length,0);
 });
 await test('AJAX failed/repeated page never becomes a complete catalog',async()=>{
  for(const repeated of [true,false]) {
   const p=make('child',async(url)=>{if(url.includes('page=2'))return repeated?response(rows(1,2)):response('down',503);return response(rows(1,2)+'<div class="pagination"><a href="?page=2">2</a></div>');});
   await assert.rejects(()=>p.extractChaptersDeep(cheerio.load('<div id="manga-chapters-holder" data-id="42"></div>'),'https://fixture.test/novel/alpha/',{}),e=>e.catalogIncomplete===true);
  }
 });
 await test('HTML catalog failure on announced page is explicit',async()=>{
  const p=make();p.getTextSingleStrategy=async(url)=>{if(url.includes('list_2'))throw Error('offline');return '<ul>'+rows(1,5)+'</ul><div class="pagination"><a href="list_2.html">2</a></div>';};
  await assert.rejects(()=>p.fetchCatalogPages('https://fixture.test/n/alpha/list.html',undefined,{inferSiblings:false}),e=>e.catalogIncomplete===true);
 });
 await test('Cloudflare CDN/embedded Turnstile does not block valid content',async()=>{
  const p=make();const html='<title>A novel</title><article>'+rows(1,3)+'</article><form class="cf-turnstile"></form><script src="/cdn-cgi/challenge-platform/x"></script>';
  const res=response(html,200,{server:'cloudflare'});assert.equal(p.detectProtection(res,html,'https://fixture.test').challenge,false);
  assert.equal(await p.consumeHttpResponse(res,'https://fixture.test'),html);
  await assert.rejects(()=>p.consumeHttpResponse(response('not found',404,{server:'cloudflare'}),'https://fixture.test'),e=>e.status===404&&!e.cloudflare);
 });
 await test('Cloudflare blocked document remains typed and no second transport',async()=>{
  const p=make();let error;try{await p.consumeHttpResponse(response('<title>Just a moment...</title>',200),'https://fixture.test');}catch(e){error=e;}
  assert.equal(error.protection.challenge,true);let second=0;
  await assert.rejects(()=>p.runAdaptiveStrategy('factory','https://fixture.test',async()=>{throw error;},async()=>{second++;return 'bad';}));assert.equal(second,0);
 });
 await test('Protected creation produces installable pending child and allows retry',async()=>{
  const p=make('master');let registered=0;p.registerProfile=async(profile)=>{registered++;assert.equal(profile.protection.challenge,true);return {ok:true};};
  p.getText=async()=>{throw Object.assign(Error('challenge'),{cloudflare:true,protection:{cloudflare:true,challenge:true}});};
  const result=await p.searchByUrl('https://fixture.test/');assert.equal(registered,1);assert.equal(result.length,1);assert.ok(result[0].name.includes('WebView'));
  await p.searchByUrl('https://fixture.test/');assert.equal(registered,2);
 });
 await test('Registration failure is not advertised as creation success',async()=>{
  const p=make('master');p.getText=async()=>'<h1>Book</h1>';p.factoryRequest=async()=>{throw Error('offline');};
  await assert.rejects(()=>p.searchByUrl('https://fixture.test/'),e=>e.factoryRegistration===true);assert.equal(p.factorySessionItems().length,0);
 });
 await test('Catalog expires in memory, bounded to four works, identity checked',async()=>{
  const p=make();for(let i=0;i<6;i++)p.setCatalogCache('https://fixture.test/'+i,[{path:'/ch',name:'Chapter'}]);assert.equal(p.catalogMemory.size,4);
  const url='https://fixture.test/5';p.catalogMemory.get(url).expires=0;assert.equal(p.getCatalogCache(url).length,0);
  p.catalogMemory.set(url,{url:'wrong',rows:[1],expires:Date.now()+10000});assert.equal(p.getCatalogCache(url).length,0);
 });
 await test('parseNovel/parsePage contract and no invented chapter on empty catalog',async()=>{
  const p=make();p.mode='child';p.getText=async()=>'<html><h1>Book</h1></html>';p.extractChaptersDeep=async()=>({chapters:Array.from({length:49},(_,i)=>({path:`https://fixture.test/ch/${i+1}`,name:`Chapter ${i+1}`,chapterNumber:i+1}))});
  p.googleTranslateCached=async x=>x;p.translateChapterTitlesGoogle=async x=>x;p.registerProfile=async()=>null;p.refineProfile=async()=>{};
  const novel=await p.parseNovel('https://fixture.test/book/42');assert.equal(novel.totalPages,3);assert.equal(novel.chapters.length,24);assert.equal(novel.chapters[0].page,'1');
  const page=await p.parsePage('https://fixture.test/book/42','3');assert.equal(page.chapters.length,1);assert.equal(page.chapters[0].chapterNumber,49);
  p.metadataCache.clear();p.extractChaptersDeep=async()=>({chapters:[]});const partial=await p.parseNovel('https://fixture.test/book/43');assert.equal(partial.chapters,undefined);assert.equal(partial.totalPages,undefined);assert.match(partial.summary,/catalog unavailable/);assert.equal(p.metadataCache.size,0);
 });
 await test('Native remote pagination renders first 100 of 205, fetches page 3 on demand',async()=>{
  const p=make();const fetched=[];
  const book='<h1 class="novel-title">Book</h1><div class="header-stats"><span><strong>205</strong></span></div><a href="/novel/alpha/chapters/page-1">Chapters</a>';
  p.getText=async()=>book;p.getTextSingleStrategy=async(url)=>{fetched.push(url);const n=Number(url.match(/page-(\d+)/)[1]);return '<ul class="chapter-list">'+rows((n-1)*100+1,Math.min(n*100,205),'chapter')+'</ul>';};
  p.googleTranslateCached=async x=>x;p.translateChapterTitlesGoogle=async x=>x;p.registerProfile=async()=>{};p.refineProfile=async()=>{};
  const novel=await p.parseNovel('https://fixture.test/novel/alpha');assert.equal(novel.totalPages,3);assert.equal(novel.chapters.length,100);assert.equal(fetched.length,1);
  const page=await p.parsePage('https://fixture.test/novel/alpha','3');assert.equal(page.chapters.length,5);assert.equal(page.chapters[0].chapterNumber,201);assert.equal(fetched.length,2);
  assert.equal(p.detectRemoteCatalog(cheerio.load(book.replace('/novel/alpha/chapters','/novel/beta/chapters')),'https://fixture.test/novel/alpha'),null);
  p.getTextSingleStrategy=async()=>'<ul class="chapter-list">'+rows(1,3)+'</ul>';
  await assert.rejects(()=>p.parsePage('https://fixture.test/novel/alpha','2'),e=>e.catalogIncomplete===true);
 });
 await test('Legacy encoding reads the same response, one HTTP request',async()=>{
  let requests=0,decoded='';
  class Reader {readAsText(blob, encoding){decoded=encoding;this.result='正文';this.onloadend();}}
  const p=make('child',async()=>{requests++;return {...response('fallback',200,{'content-type':'text/html; charset=gbk'}),clone:()=>({blob:async()=>({})})};},{FileReader:Reader});
  assert.equal(await p.getTextNative('https://fixture.test/book'),'正文');assert.equal(requests,1);assert.equal(decoded,'gb18030');
 });
 await test('AJAX pager showing only last page expands intermediate pages',async()=>{
  const seen=[];const p=make('child',async(url)=>{seen.push(url);const n=Number(new URL(url).searchParams.get('page')||1);return response(rows((n-1)*2+1,n*2)+(n===1?'<div class="pagination"><a href="?page=3" data-page="3">3</a></div>':''));});
  const result=await p.extractChaptersDeep(cheerio.load('<div id="manga-chapters-holder" data-id="42"></div>'),'https://fixture.test/novel/alpha/',{});
  assert.equal(result.chapters.length,6);assert.equal(seen.length,3);assert.ok(seen[1].endsWith('page=2'));
 });
 await test('HTTP 403 is not cached as empty; same child retries after WebView',async()=>{
  let blocked=true,calls=0;const p=make();
  p.getTextSingleStrategy=async()=>{calls++;if(blocked)throw Object.assign(Error('CF'),{status:403,protection:{challenge:true}});return Array.from({length:5},(_,i)=>`<div class="search_main_box"><div class="search_title"><a href="/series/${i+1}/book/">The silver river ${i+1}</a></div><div class="search_img"><img src="/cover.jpg"></div></div>`).join('');};
  p.presentSourcePageItems=async(_k,_p,x)=>x;
  const profile={host:'www.scribblehub.com',origin:'https://www.scribblehub.com',seedUrl:'https://www.scribblehub.com/',selectors:{},listingUrls:[]};
  await assert.rejects(()=>p.getPopularSourcePage(profile,1,{}),e=>e.status===403);assert.equal(p.sourcePageCache.size,0);assert.equal(calls,1);
  blocked=false;const rows=await p.getPopularSourcePage(profile,1,{});assert.equal(rows.length,5);assert.equal(calls,2);
 });
 await test('Empty first page can recover without reinstalling',async()=>{
  const p=make();p.presentSourcePageItems=async(_k,_p,x)=>x;
  assert.equal((await p.sourcePage('recovery',1,async()=>[])).length,0);
  const result=await p.sourcePage('recovery',1,async()=>[{name:'Now available',path:'https://fixture.test/book/1'}]);assert.equal(result.length,1);
 });
 await test('Quanben-style teaser recovers actual AMP with 2420 chapters',async()=>{
  const p=make();const calls=[];
  const ch=(start,end)=>Array.from({length:end-start+1},(_,i)=>`<li><a href="${start+i+10}.html">第${start+i}章 标题</a></li>`).join('');
  p.getTextSingleStrategy=async(url)=>{calls.push(url);return '<ul class="list">'+(url.includes('/amp/')?ch(1,2420):ch(1,24)+ch(2398,2420))+'</ul>';};
  const result=await p.extractChaptersDeep(cheerio.load('<meta property="og:novel:book_name" content="帝道至尊">'),'https://fixture.test/n/didaozhizun/',{});
  assert.equal(result.chapters.length,2420);assert.equal(calls.length,2);assert.ok(calls[1].includes('/amp/'));assert.ok(result.chapters[0].path.endsWith('/11.html'));
 });
 await test('Novel OG vocabulary and static list cards work across hosts',async()=>{
  const p=make();const html='<meta property="og:novel:book_name" content="帝道至尊"><meta property="og:description" content="An actual synopsis, independent from chapter discovery."><meta property="og:novel:author" content="凌乱的小道"><meta property="og:novel:status" content="完结"><meta property="og:novel:category" content="玄幻"><div class="list2"><h3><a href="/n/work/">Title</a></h3><img src="/cover.jpg"></div>';
  const $=cheerio.load(html);const meta=p.extractMetadata($,'https://different.test/n/work/',{});assert.equal(meta.title,'帝道至尊');assert.equal(meta.author,'凌乱的小道');assert.equal(meta.rawStatus,'完结');assert.ok(meta.summary.includes('actual synopsis'));
  const family=p.detectBrowseAdapter(html,'https://different.test/');assert.equal(family.type,'static-novel');assert.equal(p.extractAdapterBrowseItems($,'https://different.test/','',family.type).length,1);
 });
 await test('Fictionposts AJAX uses real work ID and extracts TOC',async()=>{
  let init;const p=make('child',async(_url,options)=>{init=options;return response('<div class="toc_w"><a class="toc_a" href="/read/43/chapter/9/">Chapter 1: Opening</a></div>');});
  const result=await p.extractChaptersDeep(cheerio.load('<div class="fic_title">Title</div><div class="wi_fic_desc">Summary</div>'),'https://different.test/series/43/title/',{});
  assert.equal(result.chapters.length,1);assert.equal(init.method,'POST');assert.equal(init.body,'action=wi_getreleases_pagination&pagenum=-1&mypostid=43');assert.ok(result.chapters[0].path.endsWith('/chapter/9/'));
  assert.ok(p.pageVariant('https://different.test/series-finder/?sf=1&pg=8',2,{paginationMode:'query-pg'}).includes('pg=2'));
 });
 await test('Malformed translation batch falls back to individual ES titles',async()=>{
  let requests=0;const p=make('child',async(url)=>{requests++;const q=new URL(url).searchParams.get('q');assert.equal(new URL(url).searchParams.get('tl'),'es');return {...response(''),json:async()=>[[[q.includes('THSEP')?'merged unusable response':q==='帝道至尊'?'Emperador Supremo':'Capítulo primero']]]};});
  p.targetLanguage='es';const values=await p.googleTranslateList(['帝道至尊','第一章'],1800);assert.equal(values[0],'Emperador Supremo');assert.equal(values[1],'Capítulo primero');assert.equal(requests,3);
 });
 await test('Mirror compatibility requires matching names and preserves hrefs',async()=>{
  const p=make();const original=[1,2,3].map(n=>({name:'第'+n+'章 标题',path:'https://a.test/n/book/'+n}));
  assert.equal(p.compatibleCatalogRepresentation(original,original,'https://a.test/n/book/','https://b.test/n/book/'),true);
  assert.equal(p.compatibleCatalogRepresentation(original,[{name:'Other book'}],'https://a.test/n/book/','https://b.test/n/book/'),false);
 });
 await test('Rare number resets preserve volume sequence; duplicate URLs removed',async()=>{
  const p=make();const rows=Array.from({length:100},(_,i)=>({name:'Chapter '+(i+1),path:'https://fixture.test/n/a/'+i,order:i,number:i+1,numberSource:'text'}));
  rows.push({name:'Chapter 1: Volume two',path:'https://fixture.test/n/a/100',order:100,number:1,numberSource:'text'});
  const result=p.sortChapters([...rows,rows[0]]);assert.equal(result.length,101);assert.equal(result[100].path,rows[100].path);
 });
 await test('Lazy cover overrides placeholder even with learned @src selector; name OG metadata',async()=>{
  const p=make();const $=cheerio.load('<meta name="og:novel:book_name" content="Book Alpha"><meta name="og:description" content="A long description of this adventure novel."><div class="book-cover"><img src="/placeholder.png" data-src="/covers/alpha.jpg"></div>');
  const m=p.extractMetadata($,'https://fixture.test/book/alpha',{selectors:{cover:'.book-cover img@src'}});
  assert.equal(m.cover,'https://fixture.test/covers/alpha.jpg');assert.equal(m.title,'Book Alpha');assert.match(m.summary,/adventure/);
 });
 await test('Large card DOM caches site metadata once and does not mix listing/detail URLs',async()=>{
  const p=make();const $=cheerio.load('<meta property="og:site_name" content="Portal"><main>'+Array.from({length:200},(_,i)=>`<article><a href="/book/${i}.html"><img data-src="/covers/${i}.jpg">Novel Alpha ${i}</a></article>`).join('')+'</main><a href="/all">All books</a>');
  let metadataScans=0;const wrapped=(selector)=>{if(typeof selector==='string'&&selector.includes('og:site_name')) metadataScans++;return $(selector);};
  const cards=p.extractNovelCandidates(wrapped,'https://fixture.test/');assert.equal(cards.length,80);assert.ok(cards.every(c=>c.cover));assert.equal(metadataScans,1);
  const links=p.discoverListingLinks($,'https://fixture.test/');assert.ok(links.includes('https://fixture.test/all'));assert.ok(links.every(u=>!u.includes('/book/')));
 });
 await test('Catalog failure preserves metadata without caching failure; retry restores chapters',async()=>{
  const p=make();p.getText=async()=>'<h1>Alpha Adventure</h1><meta property="og:image" content="/alpha.jpg"><meta name="description" content="This is the synopsis of the adventure novel.">';
  p.googleTranslateCached=async x=>x;p.translateChapterTitlesGoogle=async x=>x;p.registerProfile=async()=>{};p.refineProfile=async()=>{};
  p.extractChaptersDeep=async()=>{throw Error('catalog transport failed');};
  const partial=await p.parseNovel('https://fixture.test/book/alpha');assert.equal(partial.cover,'https://fixture.test/alpha.jpg');assert.match(partial.summary,/synopsis/);assert.equal(partial.chapters,undefined);assert.equal(p.metadataCache.size,0);
  p.extractChaptersDeep=async()=>({chapters:[{name:'Chapter 1',path:'https://fixture.test/book/alpha/1'}]});
  const full=await p.parseNovel('https://fixture.test/book/alpha');assert.equal(full.chapters.length,1);
 });
 await test('Catalog pager excludes next chapter and unrelated recommendation pagination',async()=>{
  const p=make();const base='https://fixture.test/n/a/list.html';const html='<a rel="next" href="/n/a/2.html">Next chapter</a><a href="/n/b/list_2.html">Next page</a><a href="list_2.html">Next page</a>';
  const dom=p.findCatalogPageCandidates(cheerio.load(html),base);assert.deepEqual(Array.from(dom),['https://fixture.test/n/a/list_2.html']);
  const raw=p.findCatalogPageCandidatesRaw(html,base);assert.deepEqual(Array.from(raw),['https://fixture.test/n/a/list_2.html']);
 });
 await test('Numeric work catalog excludes recommendation chapters and supports more than 98',async()=>{
  const p=make();const html='<ul class="chapter-list">'+Array.from({length:300},(_,i)=>`<li><a href="/chapter/42/${10000+i}">第${i+1}章 标题</a></li>`).join('')+'<li><a href="/chapter/99/77777">第1章 Other work</a></li></ul>';
  const rows=p.extractChapterLinks(cheerio.load(html),'https://fixture.test/chapterlist/42','.chapter-list a');assert.equal(rows.length,300);assert.ok(rows.every(x=>x.path.includes('/chapter/42/')));
 });
 await test('Device sources survive restart, isolate hosts and never request Factory API',async()=>{
  const kv=new Map();const extra={kv,config:{deviceMode:true,host:undefined,factoryBase:''}};
  const p=make('master',async()=>{throw Error('unexpected network');},extra);
  await p.registerProfile({host:'a.test',origin:'https://a.test',selectors:{title:'.title-a'}});
  await p.registerProfile({host:'b.test',origin:'https://b.test',selectors:{title:'.title-b'}});
  await p.refineProfile({host:'a.test',selectors:{summary:'.summary-a'}});
  kv.set('sourceHost','b.test');kv.set('apiKeyG','private-test-key');
  const q=make('master',async()=>{throw Error('unexpected network');},extra);
  assert.equal((await q.getProfiles()).length,2);assert.equal((await q.getCurrentProfile()).host,'b.test');assert.equal(q.site,'https://b.test');
  assert.equal((await q.profileForUrl('https://a.test/book/1')).selectors.title,'.title-a');
  assert.equal((await q.profileForUrl('https://b.test/book/1')).selectors.summary,undefined);
  assert.equal((await q.loadTranslationConfig()).providers.G.key,'private-test-key');
  assert.equal(q.factoryBase,'');assert.equal(q.pluginSettings.sourceHost.options.length,2);
  await assert.rejects(()=>q.factoryRequest('/api/factory/register'),/no server API/);
 });
 await test('Device URL activates local source, returns real books, preserves blocked profile',async()=>{
  const p=make('master',undefined,{config:{deviceMode:true}});
  p.getText=async()=>'<h1>Portal</h1><div class="list2"><h3><a href="/n/alpha/">Alpha Adventure</a></h3></div>';
  p.getPopularSourcePage=async(profile)=>[{name:'Alpha Adventure',path:profile.origin+'/n/alpha/'}];
  const items=await p.searchNovels('https://a.test/',1);assert.equal(items[0].path,'https://a.test/n/alpha/');assert.equal((await p.getProfiles()).length,1);
  assert.equal((await p.searchNovels('https://a.test/',2)).length,0);
  p.getText=async()=>{throw Object.assign(Error('challenge'),{cloudflare:true});};
  await assert.rejects(()=>p.searchNovels('https://b.test/',1),/challenge/);
  assert.equal(p.site,'https://b.test');assert.equal((await p.getCurrentProfile()).host,'b.test');assert.equal((await p.getProfiles()).length,2);
 });
 await test('Stored category from another device source cannot redirect browsing',async()=>{
  const p=make();const profile={host:'b.test',filterDefinitions:[{key:'cat',mode:'url',options:[{value:'https://b.test/category/1'}]}]};
  assert.equal(p.applyDetectedFiltersToUrl('https://b.test/',profile,{cat:'https://a.test/category/1'}),'https://b.test/');
  assert.equal(p.applyDetectedFiltersToUrl('https://b.test/',profile,{cat:'https://b.test/category/1'}),'https://b.test/category/1');
 });
 console.log(`OK — ${count} architecture regression groups (real DOM, mocked network).`);
})().catch(e=>{console.error(e);process.exitCode=1;});
