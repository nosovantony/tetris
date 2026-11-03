import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';

const child=spawn('npx',['-y','wrangler@4.156.1','dev','--local','--ip','127.0.0.1','--port','18923','--inspector-port','18924'],{stdio:['ignore','pipe','pipe'],detached:true});
let output='';
const base='http://127.0.0.1:18923';
const quantile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1];
async function request(path) {
  const start=performance.now();
  const response=await fetch(base+path);
  const body=await response.json();
  return {status:response.status,body,wallMs:performance.now()-start,cache:response.headers.get('X-Probe-Cache')};
}
try {
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Wrangler startup timeout: '+output)),60000);
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Wrangler exited '+code+': '+output));});
    function data(chunk) {
      output+=chunk;
      if(output.includes('Ready on http://127.0.0.1:18923')) {clearTimeout(timeout);resolve();}
    }
    child.stdout.on('data',data);child.stderr.on('data',data);
  });
  const sql=await request('/sql');
  assert.equal(sql.status,200);
  const cache={};
  for(const method of ['header','explicit']) {
    cache[method]=[];
    for(let i=0;i<5;i++) cache[method].push(await request('/cache/'+method));
  }
  const timings={};
  for(const route of ['/', '/do']) {
    const first=await request(route);
    const samples=[];
    for(let i=0;i<30;i++) samples.push((await request(route)).wallMs);
    timings[route]={first,unit:'localhost HTTP roundtrip ms, NOT Cloudflare CPU',n:samples.length,
      median:quantile(samples,.5),p95:quantile(samples,.95),max:Math.max(...samples)};
  }
  const results={timestamp:new Date().toISOString(),runtime:'local workerd via Wrangler 4.156.1',
    limitations:'No production CPU enforcement; local cache is not workers.dev/CDN. Local SQL counters measure the exact queries here, not overall billing.',sql,cache,timings};
  writeFileSync('workerd-local-results.json',JSON.stringify(results,null,2));
  writeFileSync('workerd-local.log',output);
  console.log(JSON.stringify(results,null,2));
} finally {
  process.kill(-child.pid,'SIGTERM');
}
