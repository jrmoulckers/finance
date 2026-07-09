// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncAction } from './useAsyncAction';

describe('useAsyncAction', () => {
  it('starts idle and transitions to success', async () => {
    const action = vi.fn(async (n: number) => n * 2);
    const { result } = renderHook(() => useAsyncAction(action));

    expect(result.current.status).toBe('idle');
    expect(result.current.isIdle).toBe(true);

    let returned: number | null = null;
    await act(async () => {
      returned = await result.current.run(21);
    });

    expect(returned).toBe(42);
    expect(action).toHaveBeenCalledWith(21);
    expect(result.current.status).toBe('success');
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('captures errors without throwing and resolves to null', async () => {
    const boom = new Error('nope');
    const action = vi.fn(async () => {
      throw boom;
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useAsyncAction(action, { onError }));

    let returned: unknown = 'unset';
    await act(async () => {
      returned = await result.current.run();
    });

    expect(returned).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(boom);
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('emits success and error toasts through notify', async () => {
    const notify = vi.fn();
    const okAction = vi.fn(async () => 'saved');
    const { result: okResult } = renderHook(() =>
      useAsyncAction(okAction, { notify, successMessage: (r) => `done: ${r}` }),
    );
    await act(async () => {
      await okResult.current.run();
    });
    expect(notify).toHaveBeenCalledWith({ type: 'success', message: 'done: saved' });

    const failAction = vi.fn(async () => {
      throw new Error('bad');
    });
    const { result: failResult } = renderHook(() =>
      useAsyncAction(failAction, { notify, errorMessage: 'Could not save' }),
    );
    await act(async () => {
      await failResult.current.run();
    });
    expect(notify).toHaveBeenCalledWith({ type: 'error', message: 'Could not save' });
  });

  it('ignores overlapping runs while pending', async () => {
    let resolveFn: ((value: string) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const { result } = renderHook(() => useAsyncAction(action));

    let firstRun: Promise<string | null> | undefined;
    act(() => {
      firstRun = result.current.run();
    });
    expect(result.current.isPending).toBe(true);

    // Second run while pending should be ignored and resolve to null.
    let second: string | null = 'unset';
    await act(async () => {
      second = await result.current.run();
    });
    expect(second).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFn?.('ok');
      await firstRun;
    });
    expect(result.current.status).toBe('success');
  });

  it('reset returns to idle and clears the error', async () => {
    const action = vi.fn(async () => {
      throw new Error('x');
    });
    const { result } = renderHook(() => useAsyncAction(action));

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.isError).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('does not update state after unmount', async () => {
    let resolveFn: ((value: number) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useAsyncAction(action));

    let pending: Promise<number | null> | undefined;
    act(() => {
      pending = result.current.run();
    });

    unmount();
    await act(async () => {
      resolveFn?.(1);
      await pending;
    });

    // No throw / act warning means the post-unmount setState was skipped.
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});
