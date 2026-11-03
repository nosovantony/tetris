declare global {
	namespace App {
		interface Platform {
			env: { BACKEND: Fetcher; ASSETS: Fetcher; RUN_RATE: RateLimit };
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
