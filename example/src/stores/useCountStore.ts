import { shared } from 'use-post-message-ts';
import { create } from 'zustand';

type CountStore = {
	count: number;
	increment: () => void;
	decrement: () => void;

	mode: string;
	setMode: (mode: 'Sync' | 'Not Sync') => void;
};

export const useCountStore = create<CountStore>()(
	shared(
		(set, get) => ({
			count: 0,
			increment: () => set((s) => ({ count: s.count + 1 })),
			decrement: () => set({ count: get().count - 1 }),

			mode: 'Sync',
			setMode: (mode) => set({ mode }),
		}),
		{
			name: 'count-store',
			targetOriginUrls: [window.origin],
			targetElementIFrameIds: ['demo-iframe'],
		}
	)
);
