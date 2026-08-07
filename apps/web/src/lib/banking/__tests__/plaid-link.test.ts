// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the dependency-free Plaid Link CDN loader (#3846).
 *
 * jsdom provides no real network, so we fake Plaid's CDN by intercepting the
 * `<script>` append and dispatching `load`/`error` events, setting
 * `window.Plaid` as the real CDN script would.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadPlaidLink, openPlaidLink, resetPlaidLinkForTests } from '../plaid-link';

const SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

interface FakeHandler {
  open: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function makeFakeHandler(): FakeHandler {
  return { open: vi.fn(), exit: vi.fn(), destroy: vi.fn() };
}

function makeFakePlaid(handler: FakeHandler) {
  return { create: vi.fn(() => handler) };
}

/**
 * Whenever the Plaid script is appended, run `onAppend` (e.g. set window.Plaid)
 * and fire the given DOM event on the script on the next microtask.
 */
function fakeCdn(eventType: 'load' | 'error', onAppend: () => void = () => {}): void {
  const realAppend = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation((node: unknown) => {
    const result = realAppend(node as Node);
    if (node instanceof HTMLScriptElement && node.src === SCRIPT_URL) {
      queueMicrotask(() => {
        onAppend();
        node.dispatchEvent(new Event(eventType));
      });
    }
    return result;
  });
}

function removeInjectedScripts(): void {
  document.querySelectorAll(`script[src="${SCRIPT_URL}"]`).forEach((node) => node.remove());
}

describe('plaid-link loader', () => {
  beforeEach(() => {
    resetPlaidLinkForTests();
    delete (window as { Plaid?: unknown }).Plaid;
    removeInjectedScripts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPlaidLinkForTests();
    delete (window as { Plaid?: unknown }).Plaid;
    removeInjectedScripts();
  });

  it('injects the Plaid CDN script and resolves with window.Plaid', async () => {
    const fakePlaid = makeFakePlaid(makeFakeHandler());
    fakeCdn('load', () => {
      (window as { Plaid?: unknown }).Plaid = fakePlaid;
    });

    const plaid = await loadPlaidLink();

    expect(plaid).toBe(fakePlaid);
    expect(document.querySelectorAll(`script[src="${SCRIPT_URL}"]`).length).toBe(1);
  });

  it('is idempotent — concurrent and repeat loads inject a single script', async () => {
    const fakePlaid = makeFakePlaid(makeFakeHandler());
    fakeCdn('load', () => {
      (window as { Plaid?: unknown }).Plaid = fakePlaid;
    });

    const [a, b] = await Promise.all([loadPlaidLink(), loadPlaidLink()]);
    await loadPlaidLink();

    expect(a).toBe(fakePlaid);
    expect(b).toBe(fakePlaid);
    expect(document.querySelectorAll(`script[src="${SCRIPT_URL}"]`).length).toBe(1);
  });

  it('returns the cached global without injecting when Plaid already exists', async () => {
    const fakePlaid = makeFakePlaid(makeFakeHandler());
    (window as { Plaid?: unknown }).Plaid = fakePlaid;
    const appendSpy = vi.spyOn(document.head, 'appendChild');

    const plaid = await loadPlaidLink();

    expect(plaid).toBe(fakePlaid);
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('rejects and clears the cache when the script fails to load', async () => {
    fakeCdn('error');

    await expect(loadPlaidLink()).rejects.toThrow(/Could not load Plaid/);

    // Cache cleared: a subsequent successful load works from a clean slate.
    vi.restoreAllMocks();
    removeInjectedScripts();
    const fakePlaid = makeFakePlaid(makeFakeHandler());
    fakeCdn('load', () => {
      (window as { Plaid?: unknown }).Plaid = fakePlaid;
    });

    await expect(loadPlaidLink()).resolves.toBe(fakePlaid);
  });

  it('openPlaidLink creates the handler with the link token and opens it', async () => {
    const handler = makeFakeHandler();
    const fakePlaid = makeFakePlaid(handler);
    fakeCdn('load', () => {
      (window as { Plaid?: unknown }).Plaid = fakePlaid;
    });

    const onSuccess = vi.fn();
    const onExit = vi.fn();
    const returned = await openPlaidLink({ token: 'link-token-123', onSuccess, onExit });

    expect(fakePlaid.create).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'link-token-123', onSuccess, onExit }),
    );
    expect(handler.open).toHaveBeenCalledTimes(1);
    expect(returned).toBe(handler);
  });
});
