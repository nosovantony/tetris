import { runApi } from '#lib/server/run-api.js';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = (event) => runApi(event, 'start');
