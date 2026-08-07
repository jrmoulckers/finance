// SPDX-License-Identifier: BUSL-1.1

/**
 * Minimal, dependency-free Plaid Link (web) loader.
 *
 * Rather than add the `react-plaid-link` npm dependency — which would pull a new
 * package through the repo's `npm audit` merge gate and into the `vendor-app`
 * bundle budget — we load Plaid's official Link script from its CDN **on demand**
 * and drive it through the documented `window.Plaid.create(...).open()` handler
 * API.
 *
 * The Link script and its iframe are served from `https://cdn.plaid.com`; the
 * production Content-Security-Policy is widened to allow exactly those origins
 * (see `deploy/Caddyfile`). Nothing is fetched until the user actually starts a
 * connection, so the CDN script never enters first paint.
 *
 * @module banking/plaid-link
 */

/** URL of Plaid's stable Link initializer. */
const PLAID_LINK_SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

/** Institution metadata Plaid reports for a link. */
export interface PlaidLinkInstitution {
  name: string | null;
  institution_id: string | null;
}

/** Metadata Plaid passes to `onSuccess`. */
export interface PlaidLinkOnSuccessMetadata {
  institution: PlaidLinkInstitution | null;
}

/** Metadata Plaid passes to `onExit`. */
export interface PlaidLinkOnExitMetadata {
  institution: PlaidLinkInstitution | null;
  status: string | null;
}

/** A Plaid error surfaced through `onExit`. */
export interface PlaidLinkError {
  error_type: string;
  error_code: string;
  display_message: string | null;
}

/** Options for {@link openPlaidLink}. */
export interface OpenPlaidLinkOptions {
  /** The `link_token` minted by the backend `create_link_token` call. */
  token: string;
  /** Called with the `public_token` once the user finishes linking. */
  onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  /** Called when the user abandons the flow or Link errors. */
  onExit?: (error: PlaidLinkError | null, metadata: PlaidLinkOnExitMetadata) => void;
}

/** The subset of the Plaid Link handler we use. */
interface PlaidHandler {
  open: () => void;
  exit: (options?: { force?: boolean }) => void;
  destroy: () => void;
}

/** The subset of the global `Plaid` object we use. */
interface PlaidGlobal {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
    onExit?: (error: PlaidLinkError | null, metadata: PlaidLinkOnExitMetadata) => void;
  }) => PlaidHandler;
}

declare global {
  interface Window {
    Plaid?: PlaidGlobal;
  }
}

/** Cached in-flight/settled load so the script is only injected once. */
let scriptPromise: Promise<PlaidGlobal> | null = null;

/**
 * Load Plaid's Link script (idempotent). Resolves with the global `Plaid`.
 *
 * @throws If run outside a browser, or if the script fails to load (e.g. offline
 *   or blocked by the Content-Security-Policy).
 */
export function loadPlaidLink(): Promise<PlaidGlobal> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Plaid Link is only available in the browser.'));
  }
  if (window.Plaid) return Promise.resolve(window.Plaid);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<PlaidGlobal>((resolve, reject) => {
    const fail = () => {
      scriptPromise = null;
      reject(new Error('Could not load Plaid. Check your connection and try again.'));
    };
    const settle = () => {
      if (window.Plaid) resolve(window.Plaid);
      else fail();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PLAID_LINK_SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener('load', settle);
      existing.addEventListener('error', fail);
      if (window.Plaid) resolve(window.Plaid);
      return;
    }

    const script = document.createElement('script');
    script.src = PLAID_LINK_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', settle);
    script.addEventListener('error', fail);
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Load Plaid Link and open the widget for the given `link_token`.
 *
 * @returns The opened Plaid handler so the caller can `exit`/`destroy` it.
 */
export async function openPlaidLink(options: OpenPlaidLinkOptions): Promise<PlaidHandler> {
  const Plaid = await loadPlaidLink();
  const handler = Plaid.create({
    token: options.token,
    onSuccess: options.onSuccess,
    onExit: options.onExit,
  });
  handler.open();
  return handler;
}

/** Reset the cached loader. **Test-only.** @internal */
export function resetPlaidLinkForTests(): void {
  scriptPromise = null;
}
