# use-post-message-ts

[![Version](https://img.shields.io/npm/v/use-post-message-ts?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/use-post-message-ts)
[![Build Size](https://img.shields.io/bundlephobia/minzip/use-post-message-ts?label=bundle%20size&style=flat&colorA=000000&colorB=000000)](https://bundlephobia.com/result?p=use-post-message-ts)
![GitHub Workflow Status (with branch)](https://img.shields.io/github/actions/workflow/status/paulschoen/use-post-message/basic.yml?branch=main&colorA=000000&colorB=000000)
![GitHub](https://img.shields.io/github/license/paulschoen/use-post-message?&colorA=000000&colorB=000000)

> **Note:** This project is forked from [use-broadcast](https://github.com/Romainlg29/use-broadcast).

Easily synchronize state across browser tabs and iframes—even **across different origins**—using `window.postMessage` in React, Zustand, and TypeScript. If you require synchronization within the same origin only, please consider using [`use-broadcast-ts`](https://npmjs.com/package/use-broadcast-ts) instead.

```bash
npm install use-post-message-ts
```

This package allows you to use the `window.postMessage` across open windows and iframes. It is useful when you want to share state between different tabs or iframes with different origins.

Check out the [demo](https://paulschoen.github.io/use-post-message/)!

## Usage with Zustand

```jsx
// useStore.ts
import { create } from 'zustand';
import { shared } from 'use-post-message-ts';

type MyStore = {
    count: number;
    set: (n: number) => void;
};

const useStore = create<MyStore>(
    shared(
        (set) => ({
            count: 0,
            set: (n) => set({ count: n })
        }),
        { name: 'my-channel', targetOriginUrls: ['http://localhost:3000'], targetElementIFrameIds: [document.getElementById('iframe')] }
    )
);

// MyComponent.tsx
import { FC } from 'react';

const MyComponent: FC = () => {
    const count = useStore((s) => s.count);
    const set = useStore((s) => s.set);

    return (
        <p>
            <p>Count: {count}</p>
            <button onClick={() => set(10)}/>
        </p>
    );
}

export default MyComponent;
```

You can use the Zustand store like any other Zustand store, but the store will be shared between all windows and iframes.

On the first "render" of the store, the middleware will check if the store already exists in another tab/window. If the store exists, it will be synchronized; otherwise, the store will be created.

If no tab is opened, the store will be created and will be shared as the "main" with the other tabs/windows.

## Usage with hooks

```jsx
import { FC } from 'react';
import { usePostMessage } from 'use-post-message-ts';

const MyComponent: FC = () => {
    const { state, send } = usePostMessage<{ value: number }>('my-channel', { value: 0 });

    return (
        <>
            <p>My value is: {state.value}</p>
            <button onClick={() => send({ value: 10 })} />
        </>
    );
};

export default MyComponent;
```

With the example above, the component will re-render when the channel receives or sends a value.

```jsx
import { FC, useEffect } from 'react';
import { usePostMessage } from 'use-post-message-ts';

const MyComponent: FC = () => {
    const { send, subscribe } = usePostMessage<{ value: number }>('my-post-message-channel', { value: 0 }, { subscribe: true });

    useEffect(() => {
	    const unsub = subscribe(({ value }) => console.log(`My new value is: ${value}`));

	    return () => unsub();
    }, []);

    return (
        <>
            <button onClick={() => send({ value: 10 })} />
        </>
    );
};

export default MyComponent;
```

With the example above, the component will not re-render when the channel receives or sends a value but will call the `subscribe` callback.

## API

### shared (Zustand)

```ts
shared(
    (set, get, ...) => ...,
    options?: SharedOptions
);
```

#### Parameters

##### options

Type: `SharedOptions`

The options of the hook.

##### options.name

Type: `string`

The name of the channel to use.

##### options.targetOriginUrls

Type: `targetOriginUrls` (default: [targetWindow.origin])

The target origins to send the message to. If the target origin is not in the list, the message will be sent to its own origin.

##### options.targetElementIFrameIds

Type: `targetElementIFrameIds[]` (default: [])

The target iframes to send the message to. If the target iframe is not in the list, the message will be sent to all iframes so be aware of that.

##### options.mainTimeout

Type: `number` (default: `100`)

The timeout in ms to wait for the main tab to respond.

##### options.unsync

Type: `boolean` (default: `false`)

If true, the store will only synchronize once with the main tab. After that, the store will be unsynchronized.

##### options.skipSerialization

Type: `boolean` (default `false`)

If true, will not serialize the state with `JSON.parse(JSON.stringify(state))` before sending it. This results in a performance boost, but you will have to ensure there are no unsupported types in the state or it will result in errors. See section [What data can I send?](#what-data-can-i-send) for more info.

##### options.partialize

Type: `(state: T) => Partial<T>` (default: `undefined`)

Similar to `partialize` in the [Zustand persist middleware](https://zustand.docs.pmnd.rs/integrations/persisting-store-data#partialize), allows you to pick which of the state's fields are sent to other tabs. Can also be used to pre-process the state before it's sent if needed.

##### options.merge

Type: `(state: T, receivedState: Partial<T>) => T` (default: `undefined`)

Similar to `merge` in the [Zustand persist middleware](https://zustand.docs.pmnd.rs/integrations/persisting-store-data#merge). A custom function that allows you to merge the current state with the state received from another tab.

### usePostMessage (hooks)

```ts
usePostMessage<T>(name: string, value?: T, options?: UsePostMessageOptions): {
    state: T;
    send: (value: T) => void;
    subscribe: (callback: (e: T) => void) => () => void;
};
```

#### Parameters

##### name

Type: `string`

The name of the channel to use.

##### value

Type: `T` (default: `undefined`)

The initial value of the channel.

##### options

Type: `UsePostMessageOptions` (default: `{}`)

The options of the hook.

##### options.subscribe

Type: `boolean | undefined` (default: `undefined`)

If true, the hook will not re-render the component when the channel receives a new value but will call the `subscribe` callback.

#### Return

##### state

Type: `T`

The current value of the channel.

##### send

Type: `(value: T) => void`

Send a new value to the channel.

##### subscribe

Type: `(callback: (e: T) => void) => () => void`

Subscribe to the channel. The callback will be called when the channel receives a new value and when the options.subscribe is set to true.

## What data can I send?

You can send any of the supported types by the structured clone algorithm and `JSON.stringify`, such as:

- `String`
- `Boolean`
- `Number`
- `Array`
- `Object`
- `Date`
- `...`

In short, you cannot send:

- `Function`
- `DOM Element`
- `BigInt` (This is only unsupported by `JSON.stringify`, so if you set `skipSerialization=true`, `BigInt`s will work)
- And some other types

See the [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) for more information. However, if needed, you could use `partialize` to convert an unsupported type to a string and convert it back on the other end by providing a `merge` function.

## License

MIT