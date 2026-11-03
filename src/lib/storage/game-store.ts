import type { Checkpoint } from '../game/checkpoint';

export const SAVE_DB = 'marathon-150';
const STORE = 'checkpoints';
const SLOT = 'unfinished';

// One exclusive writer per origin. Other tabs remain playable without persistence.
export async function openGameStore(): Promise<GameStore> {
	if (!navigator.locks || !globalThis.indexedDB)
		throw new Error('Хранилище недоступно в этом браузере.');
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let acquired!: (ok: boolean) => void;
	const ready = new Promise<boolean>((resolve) => {
		acquired = resolve;
	});
	const lock = navigator.locks.request(
		'marathon-150-save',
		{ ifAvailable: true },
		async (lease) => {
			acquired(!!lease);
			if (lease) await held;
		}
	);
	void lock.catch(() => acquired(false));
	if (!(await ready))
		throw new Error('Сохранение занято другой вкладкой. Здесь можно играть без сохранения.');
	try {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(SAVE_DB, 1);
			let abandoned = false;
			request.onupgradeneeded = () => {
				request.result.createObjectStore(STORE);
			};
			request.onsuccess = () => {
				if (abandoned) request.result.close();
				else resolve(request.result);
			};
			request.onerror = () => reject(request.error);
			request.onblocked = () => {
				abandoned = true;
				reject(new Error('Обновление хранилища заблокировано другой вкладкой.'));
			};
		});
		return new GameStore(db, release);
	} catch (error) {
		release();
		throw error;
	}
}

export class GameStore {
	private queue: Promise<unknown> = Promise.resolve();
	constructor(
		private db: IDBDatabase,
		private release: () => void
	) {
		db.onversionchange = () => {
			db.close();
			release();
		};
	}
	private transaction<T>(
		mode: IDBTransactionMode,
		operation: (store: IDBObjectStore) => IDBRequest<T>
	): Promise<T> {
		const task = this.queue.then(
			() =>
				new Promise<T>((resolve, reject) => {
					const tx = this.db.transaction(STORE, mode);
					const request = operation(tx.objectStore(STORE));
					tx.oncomplete = () => resolve(request.result);
					tx.onabort = tx.onerror = () =>
						reject(tx.error ?? request.error ?? new Error('Не удалось сохранить партию.'));
				})
		);
		this.queue = task.catch(() => {});
		return task;
	}
	load(): Promise<unknown> {
		return this.transaction('readonly', (store) => store.get(SLOT));
	}
	save(checkpoint: Checkpoint): Promise<IDBValidKey> {
		return this.transaction('readwrite', (store) => store.put(checkpoint, SLOT));
	}
	clear(): Promise<undefined> {
		return this.transaction('readwrite', (store) => store.delete(SLOT));
	}
	async close(): Promise<void> {
		await this.queue;
		this.db.close();
		this.release();
	}
}
