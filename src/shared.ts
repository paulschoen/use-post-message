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
	onBecomeMain?: (id: number) => void;
	onTabsChange?: (ids: number[]) => void;
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

const determineTargetWindows = (): Window[] => {
	if (window.opener) {
		return [window.opener as Window];
	}

	if (window.parent !== window) {
		return [window.parent as Window];
	}

	return [window];
};

const sharedImpl: SharedImpl = (f, options) => (set, get, store) => {
	if (typeof window === 'undefined') {
		return f(set, get, store);
	}

	type T = ReturnType<typeof get>;
	type Item = { [key: string]: unknown };

	type Message =
		| { action: 'sync' }
		| { action: 'change'; state: Item; name: string }
		| { action: 'add_new_tab'; id: number }
		| { action: 'close'; id: number }
		| { action: 'change_main'; id: number; tabs: number[] };

	const targetWindows = determineTargetWindows();
	let isSynced = get() !== undefined;
	let isMain = false;
	const name = options?.name ?? f.toString();
	let id = 0;
	const tabs: number[] = [0];

	const postMessageToTargetWindows = (message: Message, options?: SharedOptions<T>): void => {
		const { targetElementIFrameIds } = options ?? {};

		for (const targetElement of document.querySelectorAll<HTMLIFrameElement>('iframe')) {
			if (!targetElementIFrameIds || targetElementIFrameIds.includes(targetElement.id)) {
				try {
					const { contentWindow, src } = targetElement;
					if (contentWindow && src) {
						contentWindow.postMessage(message, new URL(src).origin);
					}
				} catch (error) {
					console.error(`Failed to post message to iframe with id '${targetElement.id}':`, error);
				}
			}
		}

		for (const targetWindow of targetWindows) {
			try {
				targetWindow.postMessage(message, targetWindow.origin);
			} catch (error) {
				console.error('Failed to post message to window:', error);
			}
		}
	};

	const sendChangeToOtherTabs = () => {
		let state: Item = get() as Item;
		if (options?.partialize) {
			state = options.partialize(state as T);
		}
		if (!options?.skipSerialization) {
			state = JSON.parse(JSON.stringify(state));
		}

		postMessageToTargetWindows({ name, action: 'change', state });
	};

	const onSet: typeof set = (...args) => {
		set(...(args as Parameters<typeof set>));
		if (options?.unsync) return;
		sendChangeToOtherTabs();
	};

	const onMessage = (event: MessageEvent) => {
		if (!event.data || typeof event.data !== 'object') return;
		const message = event.data as Message;

		if (message.action === 'sync') {
			if (!isMain) return;
			sendChangeToOtherTabs();
			const new_id = tabs[tabs.length - 1] + 1;
			tabs.push(new_id);
			options?.onTabsChange?.(tabs);
			postMessageToTargetWindows({ action: 'add_new_tab', id: new_id });
			return;
		}

		if (message.action === 'add_new_tab' && !isMain && id === 0) {
			id = message.id;
			return;
		}

		if (message.action === 'change') {
			set((state) =>
				options?.merge ? options.merge(state, message.state as Partial<T>) : (message.state as Partial<T>)
			);
			isSynced = true;
		}

		if (message.action === 'close' && isMain) {
			const index = tabs.indexOf(message.id);
			if (index !== 0) {
				tabs.splice(index, 1);
				options?.onTabsChange?.(tabs);
			}
		}

		if (message.action === 'change_main') {
			if (message.id === id) {
				isMain = true;
				tabs.splice(0, tabs.length, ...message.tabs);
				options?.onBecomeMain?.(id);
			}
		}
	};

	const synchronize = (): void => {
		postMessageToTargetWindows({ action: 'sync' });
		setTimeout(() => {
			if (!isSynced) {
				isMain = true;
				isSynced = true;
				options?.onBecomeMain?.(id);
			}
		}, options?.mainTimeout ?? 100);
	};

	const onClose = (): void => {
		postMessageToTargetWindows({ action: 'close', id });
		if (isMain) {
			if (tabs.length === 1) return;
			const remaining_tabs = tabs.filter((tab) => tab !== id);
			postMessageToTargetWindows({ action: 'change_main', id: remaining_tabs[0], tabs: remaining_tabs });
		}
	};

	if (typeof window !== 'undefined') {
		window.addEventListener('message', onMessage, false);
		window.addEventListener('beforeunload', onClose);
	}

	if (!isSynced) {
		synchronize();
	}

	store.setState = onSet;
	return f(onSet, get, store);
};

export const shared = sharedImpl as Shared;
