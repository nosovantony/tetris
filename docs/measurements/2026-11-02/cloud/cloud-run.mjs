import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
const base='https://tetris-measure-20261102.nosov-antony.workers.dev';
const token=readFileSync('.probe-token','utf8').trim();
const headers={'X-Probe-Token':token};
const tail=spawn('npx',['-y','wrangler@4.156.1','tail','tetris-measure-20261102','--format','json'],{stdio:['ignore','pipe','pipe'],detached:true});
let logs='';
tail.stdout.on('data',b=>{logs+=b;});tail.stderr.on('data',b=>{logs+=b;});
async function request(path) {
  const start=performance.now();
  try {
    const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(20000)});
    const text=await r.text();let body;try{body=JSON.parse(text);}catch{body=text.slice(0,1000);}
    return {path,status:r.status,wallMs:performance.now()-start,headers:Object.fromEntries(['cf-ray','cf-cache-status','age','x-probe-cache','cache-control'].map(h=>[h,r.headers.get(h)])),body};
  } catch(e) {return {path,error:e.message,wallMs:performance.now()-start};}
}
const results={startedAt:new Date().toISOString(),base,caveat:'Client wall time is NOT CPU time; burn is NOT replay.',cache:{},compute:[]};
try {
  await new Promise(r=>setTimeout(r,6000));
  for(const kind of ['header','explicit']) {
    results.cache[kind]=[];
    const key=crypto.randomUUID();
    for(let i=0;i<6;i++) results.cache[kind].push(await request(`/cache/${kind}?key=${key}`));
  }
  for(const route of ['/','/do']) {
    for(let i=0;i<6;i++) results.compute.push(await request(`${route}?id=kernel-${route==='/'?'worker':'do'}-${i}`));
    for(const n of [1000000,10000000,100000000]) {
      for(let i=0;i<5;i++) results.compute.push(await request(`${route}?kind=burn&iterations=${n}&id=burn-${route==='/'?'worker':'do'}-${n}-${i}`));
    }
  }
  results.finishedAt=new Date().toISOString();
  await new Promise(r=>setTimeout(r,3000));
} finally {
  writeFileSync('cloud-results.json',JSON.stringify(results,null,2));
  writeFileSync('cloud-tail.log',logs);
  process.kill(-tail.pid,'SIGTERM');
}
console.log(JSON.stringify({cache:Object.fromEntries(Object.entries(results.cache).map(([k,v])=>[k,v.map(r=>({status:r.status,cache:r.headers?.['x-probe-cache'],generation:r.body?.generation,colo:r.body?.colo}))])),compute:results.compute.map(r=>({path:r.path,status:r.status,error:r.error,wallMs:r.wallMs})),tailBytes:logs.length},null,2));
