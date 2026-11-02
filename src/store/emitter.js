/** A tiny change signal for React hooks to subscribe to. */
export function createSignal() {
    const listeners = new Set();
    return {
        subscribe(fn) {
            listeners.add(fn);
            return () => {
                listeners.delete(fn);
            };
        },
        emit() {
            for (const fn of listeners)
                fn();
        },
    };
}
