// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lifecycle status of an async action tracked by {@link useAsyncAction}.
 *
 * - `idle` — no run has started (or the hook was reset).
 * - `pending` — a run is currently in flight.
 * - `success` — the most recent run resolved successfully.
 * - `error` — the most recent run rejected.
 */
export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';

/** A minimal toast emitter, structurally compatible with `useToast().showToast`. */
export type AsyncActionNotify = (toast: { type: 'success' | 'error'; message: string }) => void;

/** Configuration for {@link useAsyncAction}. */
export interface UseAsyncActionOptions<TArgs extends unknown[], TResult> {
  /** Called after a successful run, with the result and the original arguments. */
  onSuccess?: (result: TResult, ...args: TArgs) => void;
  /** Called after a failed run, with the captured error and the original arguments. */
  onError?: (error: Error, ...args: TArgs) => void;
  /**
   * Optional toast emitter. Pass `useToast().showToast` to surface success/error
   * toasts automatically. When omitted, no toasts are emitted.
   */
  notify?: AsyncActionNotify;
  /** Success toast message (or a factory receiving the result). Requires `notify`. */
  successMessage?: string | ((result: TResult) => string);
  /** Error toast message (or a factory receiving the error). Requires `notify`. */
  errorMessage?: string | ((error: Error) => string);
}

/** Return shape of {@link useAsyncAction}. */
export interface UseAsyncActionResult<TArgs extends unknown[], TResult> {
  /**
   * Execute the wrapped action. Never throws — failures are captured in `error`
   * and reflected in `status`. Resolves with the result on success, or `null`
   * on failure or when a run is already in flight.
   */
  run: (...args: TArgs) => Promise<TResult | null>;
  /** Current lifecycle status. */
  status: AsyncActionStatus;
  /** The captured error from the most recent failed run, or `null`. */
  error: Error | null;
  /** `true` when `status === 'idle'`. */
  isIdle: boolean;
  /** `true` when a run is in flight. */
  isPending: boolean;
  /** `true` when the most recent run succeeded. */
  isSuccess: boolean;
  /** `true` when the most recent run failed. */
  isError: boolean;
  /** Reset back to the `idle` state and clear any captured error. */
  reset: () => void;
}

/** Resolve a string-or-factory message option against a value. */
function resolveMessage<T>(
  message: string | ((value: T) => string) | undefined,
  value: T,
): string | undefined {
  if (message === undefined) return undefined;
  return typeof message === 'function' ? message(value) : message;
}

/**
 * Standardises the "run an async action → reflect pending → surface
 * success/error feedback" pattern used across mutation call sites.
 *
 * The hook never throws: errors are captured in state so components can render
 * loading, error, and success feedback declaratively. It guards against
 * overlapping runs (a second `run` while one is pending resolves to `null`) and
 * against state updates after unmount.
 *
 * @example
 * ```tsx
 * const { showToast } = useToast();
 * const save = useAsyncAction(
 *   (input: CreateAccountInput) => createAccount(input),
 *   { notify: showToast, successMessage: 'Account created', errorMessage: 'Could not create account' },
 * );
 *
 * <button onClick={() => save.run(input)} disabled={save.isPending} aria-busy={save.isPending}>
 *   {save.isPending ? 'Saving…' : 'Save'}
 * </button>
 * ```
 *
 * @param action The async function to wrap.
 * @param options Optional success/error callbacks and toast configuration.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions<TArgs, TResult> = {},
): UseAsyncActionResult<TArgs, TResult> {
  const [status, setStatus] = useState<AsyncActionStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest action/options without forcing `run` to change identity.
  const actionRef = useRef(action);
  const optionsRef = useRef(options);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);

  useEffect(() => {
    actionRef.current = action;
    optionsRef.current = options;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus('idle');
    setError(null);
  }, []);

  const run = useCallback(async (...args: TArgs): Promise<TResult | null> => {
    // Ignore overlapping runs so double-clicks don't fire the action twice.
    if (pendingRef.current) return null;

    pendingRef.current = true;
    if (mountedRef.current) {
      setStatus('pending');
      setError(null);
    }

    const opts = optionsRef.current;

    try {
      const result = await actionRef.current(...args);
      pendingRef.current = false;

      if (mountedRef.current) {
        setStatus('success');
      }
      opts.onSuccess?.(result, ...args);

      const successMessage = resolveMessage(opts.successMessage, result);
      if (opts.notify && successMessage) {
        opts.notify({ type: 'success', message: successMessage });
      }

      return result;
    } catch (caught) {
      pendingRef.current = false;
      const normalized = caught instanceof Error ? caught : new Error(String(caught));

      if (mountedRef.current) {
        setStatus('error');
        setError(normalized);
      }
      opts.onError?.(normalized, ...args);

      const errorMessage = resolveMessage(opts.errorMessage, normalized);
      if (opts.notify && errorMessage) {
        opts.notify({ type: 'error', message: errorMessage });
      }

      return null;
    }
  }, []);

  return {
    run,
    status,
    error,
    isIdle: status === 'idle',
    isPending: status === 'pending',
    isSuccess: status === 'success',
    isError: status === 'error',
    reset,
  };
}

export default useAsyncAction;
