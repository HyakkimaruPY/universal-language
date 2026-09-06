'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(process.argv[2],'utf8').replace("document.addEventListener('dblclick'", "window.correctForTest=correct;document.addEventListener('dblclick'");
async function run(fetcher, original='原文',before='Anterior'){
 let status;const box={style:{},setAttribute(){},remove(){},set textContent(x){status=x;}};
 const document={readyState:'loading',addEventListener(){},getElementById(){return box;},createElement(){return box;},body:{appendChild(){}},documentElement:{}};
 const window={};const context={document,window,fetch:fetcher,AbortController,console,setTimeout:()=>1,clearTimeout(){}};
 vm.runInNewContext(code,context);
 const el={dataset:original?{thOriginal:original}:{},textContent:before,classList:{add(){},remove(){}}};
 await window.correctForTest(el);return {el,status};
}
const response=(d,ok=true)=>({ok,status:ok?200:503,json:async()=>d});
(async()=>{
 let request;let r=await run(async(u,i)=>{request=JSON.parse(i.body);return response({translation:'Nueva'});});
 assert.equal(r.el.textContent,'Nueva');assert.equal(request.text,'原文');assert.equal(request.currentTranslation,'Anterior');assert.equal(request.repair,true);
 let calls=0;r=await run(async u=>{calls++;if(u.includes('/api/factory/'))throw Error('offline');return response([[['Respaldo']]]);});assert.equal(r.el.textContent,'Respaldo');assert.equal(calls,2);
 r=await run(async()=>{throw Error('NETWORK_ERROR');});assert.equal(r.el.textContent,'Anterior');assert.match(r.status,/conservó/);assert.equal(r.el.dataset.thBusy,undefined);assert.equal(r.el.dataset.thCorrected,undefined);
 r=await run(async()=>response({translation:'Anterior'}));assert.equal(r.el.dataset.thCorrected,undefined);assert.match(r.status,/mismo texto/);
 r=await run(async()=>response({translation:'原文'}));assert.equal(r.el.textContent,'Anterior');assert.equal(r.el.dataset.thCorrected,undefined);
 r=await run(async()=>{throw Error('must not fetch');},'');assert.match(r.status,/MISSING_ORIGINAL/);
 console.log('PASS reader: original, repair payload, direct fallback, unchanged, failure preserved, missing original');
})().catch(e=>{console.error(e);process.exitCode=1;});
