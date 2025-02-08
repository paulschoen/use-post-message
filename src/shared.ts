import { StateCreator, StoreMutatorIdentifier } from 'zustand';

export type SharedOptions<T = unknown> = {
	targetOriginUrls: string[];
	targetElementIFrameIds?: string[];
	name?: string;
	mainTimeout?: number;
	unsync?: boolean;
	skipSerialization?: boolean;
	partialize?: (state: T) => Partial<T>;
	merge?: (state: T, receivedState: Partial<T>) => T;
};

export type Shared = <
	T extends object,
	Mps extends [StoreMutatorIdentifier, unknown][] = [],
	Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
	f: StateCreator<T, Mps, Mcs>,
	options?: SharedOptions<T>
) => StateCreator<T, Mps, Mcs>;

type SharedImpl = <T>(f: StateCreator<T, [], []>, options?: SharedOptions<T>) => StateCreator<T, [], []>;

const sharedImpl: SharedImpl = (f, options) => (set, get, store) => {
	if (typeof window === 'undefined') {
		return f(set, get, store);
	}

	const determineTargetWindows = (): Window[] => {
		const targets: Window[] = [];
		if (window.opener && !targets.includes(window.opener)) {
			targets.push(window.opener);
		}
		if (window.parent !== window && !targets.includes(window.parent)) {
			targets.push(window.parent);
		}
		if (window.frames.length > 0) {
			for (let i = 0; i < window.frames.length; i++) {
				const frame = window.frames[i];
				if (!targets.includes(frame)) {
					targets.push(frame);
				}
			}
		}
		return targets;
	};

	type T = ReturnType<typeof get>;
	type Item = { [key: string]: unknown };

	type Message = {
		action: 'sync' | 'change';
		state?: Item;
		name?: string;
		id: string;
		sourceId: string;
	};

	let isSynced = get() !== undefined;
	let isMain = false;
	const name = options?.name ?? f.toString();
	const sourceId = Math.random().toString(36).slice(2, 11);

	const processedMessageIds = new Set<string>();

	const postMessageToAllTargets = (message: Message): void => {
		determineTargetWindows().forEach((targetWindow) => {
			try {
				targetWindow.postMessage(message, targetWindow.origin);
			} catch (error) {
				console.error('Failed to post message to window:', error);
			}
		});
	};

	const sendChangeToOtherTargets = (message?: Message): void => {
		if (processedMessageIds.has(message?.id ?? '')) {
			return;
		}

		let state: Item = get() as Item;
		if (options?.partialize) {
			state = options.partialize(state as T);
		}
		if (!options?.skipSerialization) {
			state = JSON.parse(JSON.stringify(state));
		}

		const messageId = `${sourceId}-${Date.now()}-${Math.random()}`;
		const payload = message ?? { name, action: 'change', state, id: messageId, sourceId };
		postMessageToAllTargets(payload);
		processedMessageIds.add(messageId);
	};

	const onSet: typeof set = (...args) => {
		set(...(args as Parameters<typeof set>));
		if (options?.unsync) return;
		sendChangeToOtherTargets();
	};

	const onMessage = (event: MessageEvent) => {
		if (!event.data || typeof event.data !== 'object') return;

		const message = event.data as Message;

		if (message.sourceId === sourceId || processedMessageIds.has(message.id)) {
			return;
		}

		if (message.action === 'sync') {
			if (!isMain) return;
			sendChangeToOtherTargets();
			return;
		}

		if (message.action === 'change') {
			if (JSON.stringify(message.state) === JSON.stringify(get())) {
				return;
			}
			sendChangeToOtherTargets(message);

			set((state) =>
				options?.merge ? options.merge(state, message.state as Partial<T>) : (message.state as Partial<T>)
			);
			isSynced = true;
		}
	};

	const synchronize = (): void => {
		postMessageToAllTargets({ action: 'sync', id: `${sourceId}-sync`, sourceId });
		setTimeout(() => {
			if (!isSynced) {
				isSynced = true;
			}
		}, options?.mainTimeout ?? 100);
	};

	if (typeof window !== 'undefined') {
		window.addEventListener('message', onMessage, false);
	}

	if (!isSynced) {
		synchronize();
	}

	store.setState = onSet;
	return f(onSet, get, store);
};

export const shared = sharedImpl as Shared;
