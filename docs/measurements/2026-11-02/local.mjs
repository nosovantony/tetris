import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { boardKernel, encode, decode, trace, timerKernel, burn } from './kernels.mjs';

const quantile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(p*values.length)-1];
function stats(values) { return {n:values.length, min:Math.min(...values), median:quantile(values, .5), p95:quantile(values, .95), max:Math.max(...values)}; }
function measure(fn, n=100, batch=10) {
  for (let i=0;i<30;i++) fn();
  const cpu=[], wall=[];
  for (let i=0;i<n;i++) {
    const startCpu=process.cpuUsage(), start=performance.now();
    for (let j=0;j<batch;j++) fn();
    wall.push((performance.now()-start)/batch);
    const elapsed=process.cpuUsage(startCpu);
    cpu.push((elapsed.user+elapsed.system)/1000/batch);
  }
  return {wallMs:stats(wall), processCpuMs:stats(cpu), batch};
}

if (process.argv.includes('--cold')) {
  const bytes=encode(trace(8));
  const startCpu=process.cpuUsage(), start=performance.now();
  const events=decode(bytes);
  const output={board:boardKernel(), timer:timerKernel(events,216000,true)};
  const wall=performance.now()-start, cpu=process.cpuUsage(startCpu);
  console.log(JSON.stringify({wallMs:wall, cpuMs:(cpu.user+cpu.system)/1000,output}));
  process.exit();
}

const sizeResults=[];
for (const eventsPerPlacement of [4,6,8,12]) {
  const events=trace(eventsPerPlacement), bytes=encode(events);
  assert.deepEqual(decode(bytes),events);
  sizeResults.push({eventsPerPlacement, events:events.length, binaryBytes:bytes.length,
    base64Bytes:Math.ceil(bytes.length/3)*4, jsonArrayBytes:Buffer.byteLength(JSON.stringify(events)),
    fits20000:events.length<=20000, fits64KiB:bytes.length<=65536});
}
const boundaryEvents=[[0,1],[127,2],[255,3],[16639,4],[216000,5],[216000,6],[648000,7]];
assert.deepEqual(decode(encode(boundaryEvents)), boundaryEvents);
const heldEvents=[[0,0],[100,1],[100,2],[170,3],[170,0],[200,1]];
const heldFixed=timerKernel(heldEvents,300,false),heldLeap=timerKernel(heldEvents,300,true);
const hf={...heldFixed},hl={...heldLeap};delete hf.iterations;delete hl.iterations;
assert.deepEqual(hl,hf);assert.ok(heldFixed.dasCount>0);
let seed=123;
for(let trial=0;trial<100;trial++) {
  const events=[];
  let tick=0;
  for(let i=0;i<200;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    tick+=seed%30;
    events.push([tick,(seed>>>16)%12]);
  }
  const fixed=timerKernel(events,tick+100,false), leap=timerKernel(events,tick+100,true);
  delete fixed.iterations; delete leap.iterations;
  assert.deepEqual(leap,fixed);
}
const events=trace(8), bytes=encode(events);
const fixed=timerKernel(events,216000,false), leap=timerKernel(events,216000,true);
const f={...fixed},l={...leap};delete f.iterations;delete l.iterations;assert.deepEqual(f,l);
assert.equal(boardKernel().lines,1500);
const cold=Array.from({length:20},()=>{
  const child=spawnSync(process.execPath,[import.meta.filename,'--cold'],{encoding:'utf8'});
  if(child.status!==0) throw new Error(child.stderr);
  return JSON.parse(child.stdout);
});
const result={timestamp:new Date().toISOString(),node:process.version,cpu:cpus()[0].model,
  caveat:'Node process CPU/wall timings are not Cloudflare CPU time. No complete Tetris engine or legal Marathon replays.',
  codec:'unsigned LEB128 delta tick + one action byte',sizeResults,checks:{timerDifferentialCases:102,boundaryVarintRoundtrip:true,boardLines:1500,fixed,leap,heldFixed,heldLeap},
  warm:{boardOnly:measure(()=>boardKernel()),decode:measure(()=>decode(bytes)),
    timerFixed:measure(()=>timerKernel(events,216000,false)),timerLeap:measure(()=>timerKernel(events,216000,true)),
    combined:measure(()=>{const e=decode(bytes);boardKernel();timerKernel(e,216000,true);})},
  cold:{n:20,wallMs:stats(cold.map(c=>c.wallMs)),processCpuMs:stats(cold.map(c=>c.cpuMs))},
  burnCalibration:[1000000,10000000,100000000].map(n=>({iterations:n,...measure(()=>burn(n),5,1)}))};
writeFileSync('local-results.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
