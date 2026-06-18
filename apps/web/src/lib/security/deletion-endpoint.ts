// SPDX-License-Identifier: BUSL-1.1

import type { DeletionDomain } from './deletion-verification';

export type DeletionEndpointStatus =
  | 'success'
  | 'auth_required'
  | 'html_fallback'
  | 'partial_failure'
  | 'retryable_error'
  | 'fatal_error';

export interface AccountDeletionReceiptContract {
  readonly requestId: string;
  readonly completedAt: string;
  readonly status: DeletionEndpointStatus;
  readonly deletedDomains: readonly DeletionDomain[];
  readonly failedDomains: readonly DeletionDomain[];
  readonly retryable: boolean;
  readonly privacySafeMessage: string;
}

const DEFAULT_ENDPOINT_DELETED_DOMAINS: readonly DeletionDomain[] = [
  'server-account',
  'server-financial-data',
  'server-auth-identities',
  'server-passkeys',
];

export interface SubmitAccountDeletionOptions {
  readonly endpoint: string;
  readonly stepUpToken: string | null;
  readonly fetchImpl?: typeof fetch;
  readonly nowIso: string;
}

interface RawDeletionResponse {
  readonly requestId?: unknown;
  readonly deletedDomains?: unknown;
  readonly failedDomains?: unknown;
  readonly status?: unknown;
  readonly message?: unknown;
}

export async function submitAccountDeletion({
  endpoint,
  stepUpToken,
  fetchImpl = globalThis.fetch,
  nowIso,
}: SubmitAccountDeletionOptions): Promise<AccountDeletionReceiptContract> {
  if (!stepUpToken) return authRequiredReceipt(nowIso);

  try {
    const response = await fetchImpl(endpoint, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Step-Up-Token': stepUpToken,
      },
    });
    const bodyText = await response.text();
    return mapAccountDeletionEndpointResponse(response, bodyText, nowIso);
  } catch {
    return receipt(
      'retryable_error',
      'delete-unavailable',
      nowIso,
      [],
      [],
      true,
      'Deletion could not be reached. Try again later.',
    );
  }
}

export function mapAccountDeletionEndpointResponse(
  response: Pick<Response, 'ok' | 'status' | 'headers'>,
  bodyText: string,
  nowIso: string,
): AccountDeletionReceiptContract {
  if (response.status === 401 || response.status === 403) return authRequiredReceipt(nowIso);
  if (isHtmlFallback(response, bodyText)) {
    return receipt(
      'html_fallback',
      'delete-html-fallback',
      nowIso,
      [],
      [],
      true,
      'Deletion endpoint returned an app shell instead of a receipt.',
    );
  }
  if (response.status === 429 || response.status >= 500) {
    return receipt(
      'retryable_error',
      'delete-retryable',
      nowIso,
      [],
      [],
      true,
      'Deletion is temporarily unavailable. Try again later.',
    );
  }
  if (response.ok && bodyText.trim().length === 0) {
    return receipt(
      'success',
      readRequestId(response, `delete-receipt-${nowIso}`),
      nowIso,
      DEFAULT_ENDPOINT_DELETED_DOMAINS,
      [],
      false,
      'Deletion completed and the receipt contains only domain-level status.',
    );
  }

  const payload = parseJson(bodyText);
  if (!response.ok || payload === null) {
    return receipt(
      'fatal_error',
      'delete-failed',
      nowIso,
      [],
      [],
      false,
      'Deletion failed before a privacy-safe receipt was created.',
    );
  }

  const deletedDomains = readDomains(payload.deletedDomains);
  const failedDomains = readDomains(payload.failedDomains);
  const requestId =
    typeof payload.requestId === 'string' && payload.requestId.length > 0
      ? payload.requestId
      : 'delete-receipt';
  const partial = failedDomains.length > 0 || payload.status === 'partial_failure';

  return receipt(
    partial ? 'partial_failure' : 'success',
    requestId,
    nowIso,
    deletedDomains,
    failedDomains,
    partial,
    partial
      ? 'Deletion completed with some domains still requiring retry or support follow-up.'
      : 'Deletion completed and the receipt contains only domain-level status.',
  );
}

function authRequiredReceipt(nowIso: string): AccountDeletionReceiptContract {
  return receipt(
    'auth_required',
    'delete-auth-required',
    nowIso,
    [],
    [],
    true,
    'Confirm your identity again before deleting the account.',
  );
}

function receipt(
  status: DeletionEndpointStatus,
  requestId: string,
  completedAt: string,
  deletedDomains: readonly DeletionDomain[],
  failedDomains: readonly DeletionDomain[],
  retryable: boolean,
  privacySafeMessage: string,
): AccountDeletionReceiptContract {
  return {
    requestId,
    completedAt,
    status,
    deletedDomains,
    failedDomains,
    retryable,
    privacySafeMessage,
  };
}

function isHtmlFallback(response: Pick<Response, 'headers'>, bodyText: string): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return contentType.includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(bodyText);
}

function readRequestId(response: Pick<Response, 'headers'>, fallback: string): string {
  const requestId =
    response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id');
  return requestId && requestId.length > 0 ? requestId : fallback;
}

function parseJson(bodyText: string): RawDeletionResponse | null {
  try {
    const parsed = JSON.parse(bodyText) as RawDeletionResponse;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function readDomains(value: unknown): readonly DeletionDomain[] {
  return Array.isArray(value)
    ? value.filter((item): item is DeletionDomain => typeof item === 'string')
    : [];
}
