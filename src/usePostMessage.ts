import { useEffect, useRef, useState } from 'react';

/**
 * Our hook will return an object with three properties:
 * - send: a function that will send a message to all other tabs
 * - state: the current state of the message
 * - subscribe: a function that will subscribe to the message (Only if options.subscribe is true)
 */
export type UsePostMessageReturn<T> = {
	send: (val: T) => void;
	state: T | undefined;
	subscribe: (callback: (e: T) => void) => () => void;
};

/**
 * The options for the usePostMessage hook
 */
export type UsePostMessageOptions = {
	subscribe?: boolean;
};

/**
 * Hook to sync state across tabs using window.postMessage
 *
 * @param name The unique name for the message event
 * @param val The initial value of the state
 * @returns Returns an object with three properties: send, state and subscribe
 */
export const usePostMessage = <T>(name: string, val?: T, options?: UsePostMessageOptions): UsePostMessageReturn<T> => {
	/**
	 * Store the state of the message
	 */
	const [state, setState] = useState<T | undefined>(val);

	/**
	 * Store the listeners
	 */
	const listeners = useRef<((e: T) => void)[]>([]);

	/**
	 * This function sends the value to all other tabs
	 * @param val The value to send
	 */
	const send = (val: T) => {
		window.postMessage({ name, data: val }, '*');

		if (!options?.subscribe) {
			setState(val);
		}

		/**
		 * Dispatch the event to the listeners
		 */
		listeners.current.forEach((listener) => listener(val));
	};

	/**
	 * This function subscribes to the message
	 * @param callback The callback function
	 * @returns Returns a function that unsubscribes the callback
	 */
	const subscribe = (callback: (e: T) => void) => {
		listeners.current.push(callback);

		return () => listeners.current.splice(listeners.current.indexOf(callback), 1);
	};

	useEffect(() => {
		if (typeof window === 'undefined') {
			console.error('window is undefined!');
			return;
		}

		/**
		 * Subscribe to message events
		 */
		const onMessage = (event: MessageEvent) => {
			if (!event.data || typeof event.data !== 'object' || event.data.name !== name) {
				return;
			}

			const { data } = event.data;

			if (!options?.subscribe) {
				setState(data);
			}

			listeners.current.forEach((listener) => listener(data));
		};

		window.addEventListener('message', onMessage);

		/**
		 * Cleanup
		 */
		return () => {
			window.removeEventListener('message', onMessage);
		};
	}, [name, options]);

	return { send, state, subscribe };
};
