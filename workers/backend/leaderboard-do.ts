import { DurableObject } from 'cloudflare:workers';
import { parseVerifiedResult, type PublicResult } from '../../src/lib/shared/leaderboard';

type StoredResult = {
	player_name: string;
	score: number;
	lines: number;
	level: number;
	duration_ticks: number;
	is_clear: number;
	achieved_at: number;
};

function publicResult(row: StoredResult): PublicResult {
	return {
		playerName: row.player_name,
		score: row.score,
		lines: row.lines,
		level: row.level,
		durationTicks: row.duration_ticks,
		isClear: row.is_clear === 1,
		achievedAt: row.achieved_at
	};
}

export class LeaderboardDO extends DurableObject {
	constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES ('schema_version', 1);
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, rules_version TEXT NOT NULL,
        score INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_expires_at ON runs(expires_at);
      CREATE TABLE IF NOT EXISTS leaderboard (
        guest_id TEXT NOT NULL, rules_version TEXT NOT NULL, player_name TEXT NOT NULL,
        score INTEGER NOT NULL, lines INTEGER NOT NULL, level INTEGER NOT NULL,
        duration_ticks INTEGER NOT NULL, is_clear INTEGER NOT NULL, achieved_at INTEGER NOT NULL,
        PRIMARY KEY (guest_id, rules_version)
      );
      CREATE INDEX IF NOT EXISTS idx_leaderboard_top
        ON leaderboard(rules_version, score DESC, achieved_at ASC, guest_id ASC);
    `);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const sql = this.ctx.storage.sql;
		if (request.method === 'GET' && url.pathname === '/health') {
			const row = sql
				.exec<{ value: number }>("SELECT value FROM metadata WHERE key = 'schema_version'")
				.one();
			return Response.json({ status: 'ok', storage: 'sqlite', schemaVersion: row.value });
		}
		const rules = url.searchParams.get('rulesVersion');
		if (request.method === 'GET' && url.pathname === '/receipt') {
			const runId = url.searchParams.get('runId');
			const guestId = url.searchParams.get('guestId');
			if (!runId || !guestId) return new Response('Missing receipt key', { status: 400 });
			const row = sql
				.exec<{ guest_id: string }>('SELECT guest_id FROM runs WHERE run_id = ?', runId)
				.toArray()[0];
			if (!row) return new Response('Not found', { status: 404 });
			if (row.guest_id !== guestId) return new Response('Conflict', { status: 409 });
			return Response.json({ accepted: true, duplicate: true, improved: false });
		}
		if (request.method === 'GET' && url.pathname === '/leaderboard') {
			if (!rules || rules.length > 80)
				return new Response('Invalid rules version', { status: 400 });
			const rows = sql
				.exec<StoredResult>(
					`SELECT player_name, score, lines, level, duration_ticks, is_clear, achieved_at
         FROM leaderboard WHERE rules_version = ?
         ORDER BY score DESC, achieved_at ASC, guest_id ASC LIMIT 100`,
					rules
				)
				.toArray();
			return Response.json({ entries: rows.map(publicResult), rulesVersion: rules });
		}
		if (request.method === 'GET' && url.pathname === '/profile') {
			const guest = url.searchParams.get('guestId');
			if (!rules || !guest) return new Response('Missing profile key', { status: 400 });
			const rows = sql
				.exec<StoredResult>(
					`SELECT player_name, score, lines, level, duration_ticks, is_clear, achieved_at
         FROM leaderboard WHERE guest_id = ? AND rules_version = ?`,
					guest,
					rules
				)
				.toArray();
			return Response.json(
				{ result: rows[0] ? publicResult(rows[0]) : null },
				{
					headers: { 'Cache-Control': 'private, no-store' }
				}
			);
		}
		if (request.method === 'POST' && url.pathname === '/results') {
			const now = Date.now();
			let result;
			try {
				result = parseVerifiedResult(await request.json(), now);
			} catch {
				return Response.json({ error: 'Invalid verified result' }, { status: 400 });
			}
			const r = result;
			const receipt = this.ctx.storage.transactionSync(() => {
				// Portable SQLite: DELETE ... LIMIT depends on compile flags. Use a bounded subquery.
				sql.exec(
					`DELETE FROM runs WHERE run_id IN (
          SELECT run_id FROM runs WHERE expires_at <= ? ORDER BY expires_at LIMIT 50
        )`,
					now
				);
				const existing = sql
					.exec<{ guest_id: string; rules_version: string }>(
						'SELECT guest_id, rules_version FROM runs WHERE run_id = ?',
						r.runId
					)
					.toArray()[0];
				if (existing) {
					return {
						accepted: existing.guest_id === r.guestId && existing.rules_version === r.rulesVersion,
						duplicate: true,
						improved: false
					};
				}
				sql.exec(
					'INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?)',
					r.runId,
					r.guestId,
					r.rulesVersion,
					r.score,
					now,
					r.expiresAt
				);
				const update = sql.exec(
					`INSERT INTO leaderboard
          (guest_id, rules_version, player_name, score, lines, level, duration_ticks, is_clear, achieved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(guest_id, rules_version) DO UPDATE SET
            player_name = excluded.player_name, score = excluded.score, lines = excluded.lines,
            level = excluded.level, duration_ticks = excluded.duration_ticks,
            is_clear = excluded.is_clear, achieved_at = excluded.achieved_at
          WHERE excluded.score > leaderboard.score`,
					r.guestId,
					r.rulesVersion,
					r.playerName,
					r.score,
					r.lines,
					r.level,
					r.durationTicks,
					Number(r.isClear),
					now
				);
				return { accepted: true, duplicate: false, improved: update.rowsWritten > 0 };
			});
			return Response.json(receipt, { status: receipt.accepted ? 200 : 409 });
		}
		return new Response('Not found', { status: 404 });
	}
}
