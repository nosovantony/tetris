const DB_NAME = 'marathon_custom_audio_db';
const STORE_NAME = 'custom_audio_tracks';
const TRACK_KEY = 'custom_bgm';

export interface CustomTrackMetadata {
	name: string;
	size: number;
	type: string;
	updatedAt: number;
}

function openAudioDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB is not supported in this environment'));
			return;
		}
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Saves a custom audio file blob/arrayBuffer into IndexedDB.
 */
export async function saveCustomAudioTrack(
	file: File | Blob,
	name?: string
): Promise<CustomTrackMetadata> {
	const db = await openAudioDb();
	const buffer = await file.arrayBuffer();
	const meta: CustomTrackMetadata = {
		name: name || (file instanceof File ? file.name : 'custom_audio.mp3'),
		size: file.size,
		type: file.type || 'audio/mpeg',
		updatedAt: Date.now()
	};

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		store.put({ buffer, meta }, TRACK_KEY);

		tx.oncomplete = () => {
			db.close();
			resolve(meta);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
		tx.onabort = () => {
			db.close();
			reject(new Error('Failed to save audio track to IndexedDB'));
		};
	});
}

/**
 * Retrieves the stored custom audio file as an ArrayBuffer along with metadata.
 */
export async function loadCustomAudioTrack(): Promise<{
	buffer: ArrayBuffer;
	meta: CustomTrackMetadata;
} | null> {
	try {
		const db = await openAudioDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const request = store.get(TRACK_KEY);

			request.onsuccess = () => {
				db.close();
				if (request.result && request.result.buffer) {
					resolve(request.result);
				} else {
					resolve(null);
				}
			};
			request.onerror = () => {
				db.close();
				reject(request.error);
			};
		});
	} catch {
		return null;
	}
}

/**
 * Deletes the stored custom audio track from IndexedDB.
 */
export async function deleteCustomAudioTrack(): Promise<void> {
	try {
		const db = await openAudioDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			store.delete(TRACK_KEY);

			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => {
				db.close();
				reject(tx.error);
			};
		});
	} catch {
		// Ignore error if DB couldn't be opened
	}
}
