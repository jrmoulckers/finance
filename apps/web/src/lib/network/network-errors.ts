// SPDX-License-Identifier: BUSL-1.1

/** Return true when an error represents a recoverable network/offline failure. */
export function isNetworkError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return (
      error.name === 'AbortError' || error.name === 'NetworkError' || error.name === 'TimeoutError'
    );
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (typeof Response !== 'undefined' && error instanceof Response) {
    return error.status === 0 || error.status >= 500;
  }

  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (status === 0 || status >= 500) {
      return true;
    }
  }

  if (error instanceof Error) {
    if (
      error.name === 'AbortError' ||
      error.name === 'NetworkError' ||
      error.name === 'TimeoutError'
    ) {
      return true;
    }

    const message = error.message.toLowerCase();
    return [
      'failed to fetch',
      'fetch failed',
      'networkerror',
      'network error',
      'network request failed',
      'load failed',
      'err_network',
      'econnreset',
      'etimedout',
      'timeout',
      '503',
      '502',
      '500',
    ].some((needle) => message.includes(needle));
  }

  return false;
}
