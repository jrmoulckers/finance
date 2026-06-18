// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import { mapAccountDeletionEndpointResponse, submitAccountDeletion } from './deletion-endpoint';

function response(
  status: number,
  contentType = 'application/json',
): Pick<Response, 'ok' | 'status' | 'headers'> {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
  };
}

describe('account deletion endpoint contract', () => {
  const nowIso = '2025-01-01T00:00:00.000Z';

  it('requires step-up reauthentication before issuing DELETE', async () => {
    const fetchImpl = vi.fn();

    await expect(
      submitAccountDeletion({ endpoint: '/api/account', stepUpToken: null, fetchImpl, nowIso }),
    ).resolves.toMatchObject({
      status: 'auth_required',
      retryable: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps success and partial-failure receipts without sensitive detail', () => {
    expect(mapAccountDeletionEndpointResponse(response(204), '', nowIso)).toMatchObject({
      status: 'success',
      deletedDomains: [
        'server-account',
        'server-financial-data',
        'server-auth-identities',
        'server-passkeys',
      ],
    });

    expect(
      mapAccountDeletionEndpointResponse(
        response(200),
        JSON.stringify({
          requestId: 'r1',
          deletedDomains: ['server-account', 'local-storage'],
          failedDomains: [],
        }),
        nowIso,
      ),
    ).toMatchObject({
      status: 'success',
      requestId: 'r1',
      deletedDomains: ['server-account', 'local-storage'],
    });

    expect(
      mapAccountDeletionEndpointResponse(
        response(202),
        JSON.stringify({
          requestId: 'r2',
          deletedDomains: ['server-account'],
          failedDomains: ['server-passkeys'],
        }),
        nowIso,
      ),
    ).toMatchObject({
      status: 'partial_failure',
      retryable: true,
      failedDomains: ['server-passkeys'],
    });
  });

  it('distinguishes auth failure, HTML fallback, retryable, and fatal errors', () => {
    expect(mapAccountDeletionEndpointResponse(response(401), '{}', nowIso).status).toBe(
      'auth_required',
    );
    expect(
      mapAccountDeletionEndpointResponse(response(200, 'text/html'), '<html></html>', nowIso)
        .status,
    ).toBe('html_fallback');
    expect(mapAccountDeletionEndpointResponse(response(503), '{}', nowIso).status).toBe(
      'retryable_error',
    );
    expect(mapAccountDeletionEndpointResponse(response(400), 'not-json', nowIso).status).toBe(
      'fatal_error',
    );
  });

  it('sends a typed DELETE request with the step-up token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi
        .fn()
        .mockResolvedValue(JSON.stringify({ requestId: 'r3', deletedDomains: ['server-account'] })),
    });

    await submitAccountDeletion({
      endpoint: '/api/account',
      stepUpToken: 'step-up',
      fetchImpl,
      nowIso,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/account',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-Step-Up-Token': 'step-up' });
  });
});
