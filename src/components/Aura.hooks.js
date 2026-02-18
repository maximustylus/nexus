/**
 * ==============================================================================
 * AURA HOOKS — Extracted, testable, tree-shakeable utilities
 * ==============================================================================
 * Companion to AuraPulseBot.jsx v15.1
 * Import only what you need: tree-shaking will drop the rest.
 * ==============================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── useOnlineStatus ──────────────────────────────────────────────────────────
/**
 * Tracks browser online/offline state with event listeners.
 * Cleans up on unmount — no leaks.
 * @returns {boolean} true if online
 */
export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const on  = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener('online',  on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online',  on);
            window.removeEventListener('offline', off);
        };
    }, []);

    return isOnline;
}

// ─── useSafeTimeouts ─────────────────────────────────────────────────────────
/**
 * Provides a `safeTimeout` wrapper that tracks all timer IDs and clears them
 * all on component unmount. Prevents the classic "setState on unmounted
 * component" memory leak pattern.
 *
 * @returns {{ safeTimeout: (fn: () => void, ms: number) => number }}
 *
 * @example
 * const { safeTimeout } = useSafeTimeouts();
 * safeTimeout(() => inputRef.current?.focus(), 400);
 */
export function useSafeTimeouts() {
    const ids = useRef(/** @type {number[]} */ ([]));

    useEffect(() => {
        return () => ids.current.forEach(clearTimeout);
    }, []);

    const safeTimeout = useCallback((fn, ms) => {
        const id = setTimeout(fn, ms);
        ids.current.push(id);
        return id;
    }, []);

    return { safeTimeout };
}

// ─── useRateLimit ─────────────────────────────────────────────────────────────
/**
 * Returns a boolean `isThrottled` and a function `recordCall`.
 * Call `recordCall()` before any throttled action — it will return false
 * if the cooldown hasn't elapsed yet.
 *
 * @param {number} cooldownMs  Minimum ms between allowed calls.
 * @returns {{ isThrottled: boolean, recordCall: () => boolean }}
 *
 * @example
 * const { recordCall } = useRateLimit(2000);
 * const handleSend = () => {
 *   if (!recordCall()) return; // within cooldown — abort
 *   // proceed with send
 * };
 */
export function useRateLimit(cooldownMs) {
    const lastCallRef  = useRef(0);
    const [isThrottled, setIsThrottled] = useState(false);
    const throttleTimer = useRef(null);

    const recordCall = useCallback(() => {
        const now = Date.now();
        if (now - lastCallRef.current < cooldownMs) return false;
        lastCallRef.current = now;

        // Flip throttled indicator for UI feedback
        setIsThrottled(true);
        clearTimeout(throttleTimer.current);
        throttleTimer.current = setTimeout(() => setIsThrottled(false), cooldownMs);
        return true;
    }, [cooldownMs]);

    useEffect(() => () => clearTimeout(throttleTimer.current), []);

    return { isThrottled, recordCall };
}

// ─── useAbortableRequest ──────────────────────────────────────────────────────
/**
 * Provides a managed AbortController that is automatically aborted on unmount
 * and replaced each time `reset()` is called. Ideal for cancellable async AI
 * or fetch calls.
 *
 * @returns {{
 *   signal: AbortSignal,
 *   reset: () => AbortController,
 *   abort: () => void
 * }}
 *
 * @example
 * const { signal, reset, abort } = useAbortableRequest();
 *
 * const fetchData = async () => {
 *   const controller = reset(); // cancel previous, get fresh controller
 *   const res = await fetch(url, { signal: controller.signal });
 * };
 */
export function useAbortableRequest() {
    const controllerRef = useRef(/** @type {AbortController|null} */ (null));

    useEffect(() => {
        return () => controllerRef.current?.abort();
    }, []);

    const reset = useCallback(() => {
        controllerRef.current?.abort();
        const next = new AbortController();
        controllerRef.current = next;
        return next;
    }, []);

    const abort = useCallback(() => {
        controllerRef.current?.abort();
    }, []);

    return {
        get signal() { return controllerRef.current?.signal; },
        reset,
        abort,
    };
}

// ─── useRotatingPool ──────────────────────────────────────────────────────────
/**
 * Given a stable array of strings, returns `next()` which cycles through them
 * in order without repetition. Replaces the fragile `.filter()[0]` anti-pattern.
 *
 * @param {string[]} pool  Array of responses/strings to rotate through.
 * @returns {{ next: () => string, reset: () => void }}
 *
 * @example
 * const { next } = useRotatingPool(['Good.', 'Noted.', 'I see.']);
 * const reply = next(); // "Good." → "Noted." → "I see." → "Good." ...
 */
export function useRotatingPool(pool) {
    const indexRef = useRef(0);

    const next = useCallback(() => {
        if (!pool.length) return '';
        const item = pool[indexRef.current % pool.length];
        indexRef.current++;
        return item;
    }, [pool]);

    const reset = useCallback(() => {
        indexRef.current = 0;
    }, []);

    return { next, reset };
}

// ─── useInitGuard ─────────────────────────────────────────────────────────────
/**
 * Prevents an async initialiser from running more than once concurrently.
 * Returns a `runOnce(fn)` wrapper — subsequent calls while `fn` is in-flight
 * are silently dropped.
 *
 * @returns {{ runOnce: (fn: () => Promise<void>) => Promise<void>, reset: () => void }}
 *
 * @example
 * const { runOnce } = useInitGuard();
 * useEffect(() => {
 *   runOnce(initializeLiveUser);
 * }, [isOpen]);
 */
export function useInitGuard() {
    const isRunning = useRef(false);

    const runOnce = useCallback(async (fn) => {
        if (isRunning.current) return;
        isRunning.current = true;
        try {
            await fn();
        } finally {
            isRunning.current = false;
        }
    }, []);

    const reset = useCallback(() => {
        isRunning.current = false;
    }, []);

    return { runOnce, reset };
}

// ─── useScrollToBottom ────────────────────────────────────────────────────────
/**
 * Returns a ref to attach to a sentinel element at the bottom of a scroll
 * container. Automatically scrolls into view whenever `deps` change.
 *
 * @param {readonly unknown[]} deps  Dependency array (e.g. [messages, loading])
 * @returns {React.RefObject<HTMLDivElement>}
 *
 * @example
 * const bottomRef = useScrollToBottom([messages, loading]);
 * return <div ref={bottomRef} />;
 */
export function useScrollToBottom(deps) {
    const ref = useRef(/** @type {HTMLDivElement|null} */ (null));

    useEffect(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return ref;
}
