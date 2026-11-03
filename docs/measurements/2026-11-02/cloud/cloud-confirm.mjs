import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
const base='https://tetris-measure-20261102.nosov-antony.workers.dev';
const token=readFileSync('.probe-token','utf8').trim();
const tail=spawn('npx',['-y','wrangler@4.156.1','tail','tetris-measure-20261102','--format','json','--sampling-rate','0.999'],{stdio:['ignore','pipe','pipe'],detached:true});
let logs='';tail.stdout.on('data',b=>logs+=b);tail.stderr.on('data',b=>logs+=b);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const results={startedAt:new Date().toISOString(),requests:[]};
async function request(path) {
  const start=performance.now();
  const r=await fetch(base+path,{headers:{'X-Probe-Token':token},signal:AbortSignal.timeout(20000)});
  const text=await r.text();let body;try{body=JSON.parse(text);}catch{body=text.slice(0,1000);}
  const result={path,status:r.status,wallMs:performance.now()-start,cache:r.headers.get('x-probe-cache'),body};
  results.requests.push(result);return result;
}
try {
  await delay(6000);
  const cacheKey=crypto.randomUUID();
  await request(`/cache/explicit?ttl=${cacheKey}`);
  await request(`/cache/explicit?ttl=${cacheKey}`);
  for(const route of ['/','/do']) {
    for(let i=0;i<12;i++) {await request(`${route}?id=confirm-kernel-${route==='/'?'worker':'do'}-${i}`);await delay(150);}
    for(let i=0;i<6;i++) {await request(`${route}?kind=burn&iterations=200000000&id=confirm-burn-${route==='/'?'worker':'do'}-${i}`);await delay(150);}
  }
  // One bounded TTL check, not a monitoring loop.
  await delay(35000);
  await request(`/cache/explicit?ttl=${cacheKey}`);
  await delay(4000);
} finally {
  results.finishedAt=new Date().toISOString();
  writeFileSync('cloud-confirm-results.json',JSON.stringify(results,null,2));
  writeFileSync('cloud-confirm-tail.log',logs);
  try {process.kill(-tail.pid,'SIGTERM');} catch(error) {if(error.code!=='ESRCH')throw error;}
}
console.log(JSON.stringify({requests:results.requests.map(r=>({path:r.path,status:r.status,cache:r.cache,generation:r.body?.generation})),tailBytes:logs.length},null,2));
