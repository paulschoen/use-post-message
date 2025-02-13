import { StateCreator, StoreMutatorIdentifier } from 'zustand';

export type SharedOptions<T = unknown> = {
	targetOriginUrls?: string[];
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

interface Messenger {
	sendMessage: (message: Record<string, unknown>) => void;
	addMessageListener: (callback: (event: MessageEvent) => void) => void;
}

const DEFAULT_OPTIONS: SharedOptions<unknown> = {
	targetOriginUrls: ['*'],
	targetElementIFrameIds: [],
	mainTimeout: 1000,
	unsync: false,
	skipSerialization: false,
};

class WindowMessenger implements Messenger {
	private options: SharedOptions<unknown>;
	private windowRef: Window;

	constructor(options: SharedOptions<unknown>, windowRef: Window) {
		this.options = options;
		this.windowRef = windowRef;
	}

	private getTargetWindows(): Window[] {
		return [
			...(this.windowRef.opener ? [this.windowRef.opener] : []),
			...(this.windowRef.parent !== this.windowRef ? [this.windowRef.parent] : []),
			...Array.from({ length: this.windowRef.frames.length }, (_, i) => this.windowRef.frames[i]),
		].filter((win, index, self) => self.indexOf(win) === index);
	}

	private getAllowedOrigins(): string[] {
		return this.options.targetOriginUrls?.includes('*') ? ['*'] : this.options.targetOriginUrls ?? [];
	}

	sendMessage(message: Record<string, unknown>): void {
		this.getTargetWindows().forEach((targetWindow) => {
			try {
				this.getAllowedOrigins().forEach((targetOrigin) => {
					targetWindow.postMessage(message, targetOrigin);
				});
			} catch {
				console.error('Failed to post message to target window');
			}
		});
	}

	addMessageListener(callback: (event: MessageEvent) => void): void {
		this.windowRef.addEventListener('message', callback, false);
	}
}

const generateMessageId = (sourceId: string): string => `${sourceId}-${Date.now()}-${Math.random()}`;

class MessageValidator<T> {
	private processedMessageIds: Set<string>;
	private options: SharedOptions<T>;

	constructor(options: SharedOptions<T>) {
		this.options = options;
		this.processedMessageIds = new Set();
	}

	private doesTheSourceIdMatch(sourceId: string, event: MessageEvent): boolean {
		const message = event.data as { sourceId: string };
		return sourceId === message.sourceId;
	}

	private doesMessageExists(message: Record<string, unknown>): boolean {
		return Boolean(message);
	}

	private isMessageAnObject(message: Record<string, unknown>): boolean {
		return typeof message === 'object';
	}

	private isMessageOriginAllowed(event: MessageEvent): boolean {
		return Boolean(this.options.targetOriginUrls?.includes(event.origin));
	}

	private doesMessageNameMatch(name: string, message: Record<string, unknown>): boolean {
		return name === message.name;
	}

	public addMessage = (message: Record<string, unknown>): void => {
		this.processedMessageIds.add(message.id as string);
	};

	public isABadMessage(name: string, event: MessageEvent, sourceId: string): boolean {
		const message = event.data as { action: string; state?: Record<string, unknown>; id: string; sourceId: string };

		return (
			this.processedMessageIds.has(message.id) ||
			this.doesTheSourceIdMatch(sourceId, event) ||
			!this.doesMessageExists(message) ||
			!this.isMessageAnObject(message) ||
			!this.isMessageOriginAllowed(event) ||
			!this.doesMessageNameMatch(name, message)
		);
	}
}
class MessageHandler<T> {
	private options: SharedOptions<T>;
	private messageValidator: MessageValidator<T>;
	private set: (updater: (state: T) => T) => void;
	private get: () => T;

	constructor(set: (updater: (state: T) => T) => void, get: () => T, options: SharedOptions<T>) {
		this.options = options;
		this.messageValidator = new MessageValidator(options);
		this.set = set;
		this.get = get;
	}

	handleIncomingMessage({
		name,
		event,
		sourceId,
		sendChange,
	}: {
		name: string;
		event: MessageEvent;
		sourceId: string;
		sendChange: (message?: Record<string, unknown>) => void;
	}) {
		if (this.messageValidator.isABadMessage(name, event, sourceId)) {
			return;
		}

		const message = event.data as { action: string; state?: Record<string, unknown>; id: string; sourceId: string };

		if (message.action === 'sync') {
			sendChange();
			return;
		}

		if (message.action === 'change') {
			if (JSON.stringify(message.state) === JSON.stringify(this.get())) return;

			sendChange(message);
			this.messageValidator.addMessage(message);
			this.set((state) =>
				this.options.merge ? this.options.merge(state, message.state as Partial<T>) : (message.state as T)
			);
		}
	}
}

const createStateSync = <T>(get: () => T, options?: SharedOptions<T>) => {
	return (sendMessage: (message: Record<string, unknown>) => void, sourceId: string, name: string) => {
		return (message?: Record<string, unknown>): void => {
			let state: Record<string, unknown> = get() as Record<string, unknown>;
			if (options?.partialize) {
				state = options.partialize(state as T);
			}
			if (!options?.skipSerialization) {
				state = JSON.parse(JSON.stringify(state));
			}

			const messageId = generateMessageId(sourceId);
			const payload = message ?? { name, action: 'change', state, id: messageId, sourceId };
			sendMessage(payload);
		};
	};
};

/**
 * Shared store enhancer
 */
const sharedImpl =
	<T>(
		stateCreatorFunction: StateCreator<T, [], []>,
		options: SharedOptions<T> = DEFAULT_OPTIONS as SharedOptions<T>
	): StateCreator<T, [], []> =>
	(set, get, store) => {
		if (typeof window === 'undefined') return stateCreatorFunction(set, get, store);

		const name = options?.name ?? stateCreatorFunction.toString();
		const sourceId = Math.random().toString(36).slice(2, 11);
		const messenger = new WindowMessenger((options as SharedOptions<unknown>) ?? { targetOriginUrls: [] }, window);
		const sendChange = createStateSync(get, options)(messenger.sendMessage.bind(messenger), sourceId, name);
		const messageHandler = new MessageHandler(set, get, options ?? { targetOriginUrls: [] });

		messenger.addMessageListener((event) =>
			messageHandler.handleIncomingMessage({ name, event, sourceId, sendChange })
		);

		messenger.sendMessage({ name, action: 'sync', id: `${sourceId}-sync`, sourceId });

		return stateCreatorFunction(
			(partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => {
				set(partial as T | ((state: T) => T), replace as true);
				if (!options?.unsync) sendChange();
			},
			get,
			store
		);
	};

export const shared = sharedImpl as Shared;
