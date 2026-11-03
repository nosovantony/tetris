import type { PageLoad } from './$types';
import type { PublicResult } from '#lib/shared/leaderboard.js';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/leaderboard');
		if (!response.ok) return { entries: [] as PublicResult[], unavailable: true };
		const data = (await response.json()) as { entries: PublicResult[] };
		return { entries: data.entries, unavailable: false };
	} catch {
		return { entries: [] as PublicResult[], unavailable: true };
	}
};
