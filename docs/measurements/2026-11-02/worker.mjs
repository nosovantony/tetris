import { DurableObject } from 'cloudflare:workers';
import { boardKernel, burn, encode, decode, trace, timerKernel } from './kernels.mjs';

function compute(url) {
  const rounds = Math.max(1, Math.min(1000, Number(url.searchParams.get('rounds') || 1)));
  if (url.searchParams.get('kind') === 'burn') {
    const iterations = Math.min(200000000, Math.max(0, Number(url.searchParams.get('iterations') || 1000000)));
    return {iterations, checksum: burn(iterations)};
  }
  const events = decode(encode(trace(8)));
  return {board: boardKernel(3750, rounds), timer: timerKernel(events, 216000, true), events: events.length};
}

export class Probe extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/sql') {
      const sql = this.ctx.storage.sql;
      sql.exec('DROP TABLE IF EXISTS cleanup_probe');
      sql.exec('CREATE TABLE cleanup_probe(id INTEGER PRIMARY KEY, expires_at INTEGER)');
      this.ctx.storage.transactionSync(() => {
        for (let i=0;i<1000;i++) sql.exec('INSERT INTO cleanup_probe VALUES (?, ?)',i,i<500?0:4102444800);
      });
      const cleanup = sql.exec('DELETE FROM cleanup_probe WHERE expires_at < ?',100);
      const cleanupResult = {rowsRead:cleanup.rowsRead,rowsWritten:cleanup.rowsWritten};
      const emptyUnindexed = sql.exec('DELETE FROM cleanup_probe WHERE expires_at < ?',100);
      const emptyUnindexedResult = {rowsRead:emptyUnindexed.rowsRead,rowsWritten:emptyUnindexed.rowsWritten};
      sql.exec('CREATE INDEX cleanup_expiry ON cleanup_probe(expires_at)');
      const emptyCleanup = sql.exec('DELETE FROM cleanup_probe WHERE expires_at < ?',100);
      const emptyCleanupResult = {rowsRead:emptyCleanup.rowsRead,rowsWritten:emptyCleanup.rowsWritten};
      let strftime;
      try { strftime = sql.exec("SELECT strftime('%s', 'now') AS seconds").toArray(); }
      catch (error) { strftime = {error:error.message}; }
      sql.exec('DROP TABLE IF EXISTS rank_probe');
      sql.exec('CREATE TABLE rank_probe(id INTEGER PRIMARY KEY, score INTEGER)');
      this.ctx.storage.transactionSync(() => {
        for (let i=0;i<10000;i++) sql.exec('INSERT INTO rank_probe VALUES (?, ?)',i,i);
      });
      sql.exec('CREATE INDEX rank_score ON rank_probe(score DESC)');
      const count = sql.exec('SELECT COUNT(*) AS ahead FROM rank_probe WHERE score > ?',5000);
      const countValue = count.toArray();
      const top = sql.exec('SELECT * FROM rank_probe ORDER BY score DESC LIMIT 100');
      const topValues = top.toArray();
      const lookup = sql.exec('SELECT * FROM rank_probe WHERE id = ?',5000);
      const lookupValue = lookup.toArray();
      return Response.json({cleanupResult,emptyUnindexedResult,emptyCleanupResult,strftime,
        rank:{value:countValue,rowsRead:count.rowsRead},top:{count:topValues.length,rowsRead:top.rowsRead},
        lookup:{value:lookupValue,rowsRead:lookup.rowsRead}});
    }
    const result = compute(url);
    console.log(JSON.stringify({scope: 'do', id: url.searchParams.get('id'), ...result}));
    return Response.json({scope: 'do', ...result});
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/do' || url.pathname === '/sql') return env.PROBE.getByName('temporary-probe').fetch(request);
    if (url.pathname === '/cache/header' || url.pathname === '/cache/explicit') {
      const key = new Request(url.toString());
      if (url.pathname === '/cache/explicit') {
        const hit = await caches.default.match(key);
        if (hit) {
          const headers = new Headers(hit.headers); headers.set('X-Probe-Cache', 'HIT');
          return new Response(hit.body, {headers});
        }
      }
      const response = Response.json({generation: crypto.randomUUID(), colo: request.cf?.colo ?? null}, {
        headers: {'Cache-Control':'public, max-age=15, s-maxage=30', 'X-Probe-Cache':'MISS'}
      });
      if (url.pathname === '/cache/explicit') await caches.default.put(key, response.clone());
      return response;
    }
    const result = compute(url);
    console.log(JSON.stringify({scope: 'worker', id: url.searchParams.get('id'), ...result}));
    return Response.json({scope: 'worker', ...result});
  }
};
