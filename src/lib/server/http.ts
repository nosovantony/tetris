export class HttpFailure extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

// Enforce actual streamed size; Content-Length alone is not a security boundary.
export async function readLimited(request: Request, limit: number): Promise<string> {
	const length = request.headers.get('content-length');
	if (length && (!/^\d+$/.test(length) || Number(length) > limit))
		throw new HttpFailure(413, 'Слишком большой запрос');
	if (!request.body) throw new HttpFailure(400, 'Пустой запрос');
	const reader = request.body.getReader();
	let total = 0;
	const chunks: Uint8Array[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > limit) {
				void reader.cancel().catch(() => {});
				throw new HttpFailure(413, 'Слишком большой запрос');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
	} catch {
		throw new HttpFailure(400, 'Некорректный UTF-8');
	}
}

export function failure(error: unknown): Response {
	return Response.json(
		{ error: error instanceof HttpFailure ? error.message : 'Сервис временно недоступен' },
		{
			status: error instanceof HttpFailure ? error.status : 503,
			headers: { 'Cache-Control': 'private, no-store' }
		}
	);
}
