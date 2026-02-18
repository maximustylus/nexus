/**
 * ==============================================================================
 * AURA HOOKS — Unit Test Suite
 * ==============================================================================
 * Runner: Vitest + @testing-library/react
 * Run:    npx vitest run aura.hooks.test.js
 *
 * Tests focus on:
 *   - Cleanup (no memory leaks after unmount)
 *   - Correct state transitions
 *   - Guard/lock semantics
 * ==============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
    useOnlineStatus,
    useSafeTimeouts,
    useRateLimit,
    useAbortableRequest,
    useRotatingPool,
    useInitGuard,
    useScrollToBottom,
} from './aura.hooks';

afterEach(cleanup);

// ─── useOnlineStatus ──────────────────────────────────────────────────────────
describe('useOnlineStatus', () => {
    const fireEvent = (type) =>
        window.dispatchEvent(new Event(type));

    it('returns true when navigator.onLine is true at mount', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current).toBe(true);
    });

    it('returns false when navigator.onLine is false at mount', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current).toBe(false);
    });

    it('updates to false when "offline" event fires', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        const { result } = renderHook(() => useOnlineStatus());
        act(() => fireEvent('offline'));
        expect(result.current).toBe(false);
    });

    it('updates to true when "online" event fires', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const { result } = renderHook(() => useOnlineStatus());
        act(() => fireEvent('online'));
        expect(result.current).toBe(true);
    });

    it('removes event listeners on unmount (no memory leak)', () => {
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        const { unmount } = renderHook(() => useOnlineStatus());
        unmount();
        expect(removeSpy).toHaveBeenCalledWith('online',  expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    });
});

// ─── useSafeTimeouts ─────────────────────────────────────────────────────────
describe('useSafeTimeouts', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('safeTimeout fires the callback after the specified delay', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useSafeTimeouts());
        act(() => result.current.safeTimeout(fn, 500));
        expect(fn).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(500));
        expect(fn).toHaveBeenCalledOnce();
    });

    it('clears all pending timeouts on unmount', () => {
        const fn = vi.fn();
        const { result, unmount } = renderHook(() => useSafeTimeouts());
        act(() => result.current.safeTimeout(fn, 1000));
        unmount(); // triggers cleanup
        act(() => vi.advanceTimersByTime(2000));
        expect(fn).not.toHaveBeenCalled(); // confirmed cleared
    });

    it('supports multiple concurrent timeouts', () => {
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        const { result } = renderHook(() => useSafeTimeouts());
        act(() => {
            result.current.safeTimeout(fn1, 300);
            result.current.safeTimeout(fn2, 600);
        });
        act(() => vi.advanceTimersByTime(300));
        expect(fn1).toHaveBeenCalledOnce();
        expect(fn2).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(300));
        expect(fn2).toHaveBeenCalledOnce();
    });
});

// ─── useRateLimit ─────────────────────────────────────────────────────────────
describe('useRateLimit', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('recordCall returns true on the first call', () => {
        const { result } = renderHook(() => useRateLimit(2000));
        let allowed;
        act(() => { allowed = result.current.recordCall(); });
        expect(allowed).toBe(true);
    });

    it('recordCall returns false within the cooldown window', () => {
        const { result } = renderHook(() => useRateLimit(2000));
        act(() => result.current.recordCall());
        let second;
        act(() => { second = result.current.recordCall(); });
        expect(second).toBe(false);
    });

    it('recordCall returns true again after cooldown elapses', () => {
        const { result } = renderHook(() => useRateLimit(2000));
        act(() => result.current.recordCall());
        act(() => vi.advanceTimersByTime(2001));
        let again;
        act(() => { again = result.current.recordCall(); });
        expect(again).toBe(true);
    });

    it('isThrottled is true immediately after a call', () => {
        const { result } = renderHook(() => useRateLimit(2000));
        act(() => result.current.recordCall());
        expect(result.current.isThrottled).toBe(true);
    });

    it('isThrottled returns to false after cooldown', () => {
        const { result } = renderHook(() => useRateLimit(2000));
        act(() => result.current.recordCall());
        act(() => vi.advanceTimersByTime(2001));
        expect(result.current.isThrottled).toBe(false);
    });
});

// ─── useAbortableRequest ──────────────────────────────────────────────────────
describe('useAbortableRequest', () => {
    it('reset returns a new AbortController each call', () => {
        const { result } = renderHook(() => useAbortableRequest());
        let c1, c2;
        act(() => { c1 = result.current.reset(); });
        act(() => { c2 = result.current.reset(); });
        expect(c1).not.toBe(c2);
    });

    it('reset aborts the previous controller before returning a new one', () => {
        const { result } = renderHook(() => useAbortableRequest());
        let prev;
        act(() => { prev = result.current.reset(); });
        act(() => result.current.reset());
        expect(prev.signal.aborted).toBe(true);
    });

    it('abort() aborts the current controller', () => {
        const { result } = renderHook(() => useAbortableRequest());
        let ctrl;
        act(() => { ctrl = result.current.reset(); });
        act(() => result.current.abort());
        expect(ctrl.signal.aborted).toBe(true);
    });

    it('aborts on unmount to prevent in-flight state updates', () => {
        const { result, unmount } = renderHook(() => useAbortableRequest());
        let ctrl;
        act(() => { ctrl = result.current.reset(); });
        unmount();
        expect(ctrl.signal.aborted).toBe(true);
    });
});

// ─── useRotatingPool ─────────────────────────────────────────────────────────
describe('useRotatingPool', () => {
    const pool = ['alpha', 'beta', 'gamma'];

    it('returns items in order', () => {
        const { result } = renderHook(() => useRotatingPool(pool));
        const calls = Array.from({ length: 3 }, () => {
            let val;
            act(() => { val = result.current.next(); });
            return val;
        });
        expect(calls).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('wraps around after exhausting the pool', () => {
        const { result } = renderHook(() => useRotatingPool(pool));
        act(() => result.current.next());
        act(() => result.current.next());
        act(() => result.current.next());
        let val;
        act(() => { val = result.current.next(); });
        expect(val).toBe('alpha'); // back to start
    });

    it('reset restarts the cycle from index 0', () => {
        const { result } = renderHook(() => useRotatingPool(pool));
        act(() => result.current.next()); // alpha
        act(() => result.current.next()); // beta
        act(() => result.current.reset());
        let val;
        act(() => { val = result.current.next(); });
        expect(val).toBe('alpha');
    });

    it('returns empty string for an empty pool', () => {
        const { result } = renderHook(() => useRotatingPool([]));
        let val;
        act(() => { val = result.current.next(); });
        expect(val).toBe('');
    });
});

// ─── useInitGuard ─────────────────────────────────────────────────────────────
describe('useInitGuard', () => {
    it('runs the function on the first call', async () => {
        const fn = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useInitGuard());
        await act(async () => result.current.runOnce(fn));
        expect(fn).toHaveBeenCalledOnce();
    });

    it('does NOT run a second concurrent call while the first is in-flight', async () => {
        let resolve;
        const fn = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; }));
        const { result } = renderHook(() => useInitGuard());

        // Fire first call — leaves fn in-flight (unresolved)
        act(() => { result.current.runOnce(fn); }); // don't await

        // Fire second call immediately — should be dropped
        await act(async () => result.current.runOnce(fn));

        expect(fn).toHaveBeenCalledOnce();

        // Clean up the pending promise
        resolve();
    });

    it('allows a new call after reset()', async () => {
        const fn = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useInitGuard());
        await act(async () => result.current.runOnce(fn));
        act(() => result.current.reset());
        await act(async () => result.current.runOnce(fn));
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('releases the lock even if the function throws', async () => {
        const failFn = vi.fn().mockRejectedValue(new Error('boom'));
        const okFn   = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useInitGuard());

        // First call throws
        await act(async () => {
            try { await result.current.runOnce(failFn); } catch (_) {}
        });

        // Lock should be released; second call should proceed
        await act(async () => result.current.runOnce(okFn));
        expect(okFn).toHaveBeenCalledOnce();
    });
});

// ─── useScrollToBottom ────────────────────────────────────────────────────────
describe('useScrollToBottom', () => {
    it('returns a ref object', () => {
        const { result } = renderHook(() => useScrollToBottom([]));
        expect(result.current).toHaveProperty('current');
    });

    it('calls scrollIntoView on the ref element when deps change', async () => {
        const scrollMock = vi.fn();
        const { result, rerender } = renderHook(
            ({ deps }) => useScrollToBottom(deps),
            { initialProps: { deps: [0] } }
        );

        // Attach a mock element to the ref
        act(() => {
            result.current.current = { scrollIntoView: scrollMock };
        });

        // Re-render with changed dep to trigger useEffect
        rerender({ deps: [1] });
        await act(async () => {}); // flush

        expect(scrollMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
});
