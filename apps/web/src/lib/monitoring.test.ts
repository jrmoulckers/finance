// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { scrubSentryEvent, scrubSensitiveMonitoringPayload } from './monitoring';

describe('scrubSensitiveMonitoringPayload', () => {
  it('scrubs sensitive keys in nested objects and arrays', () => {
    const payload = {
      user: {
        email: 'user@example.com',
        profile: {
          password: 'secret',
          keep: 'safe',
        },
      },
      accounts: [
        { accountNumber: '123456789', routingNumber: '021000021', name: 'Checking' },
        { iban: 'GB82WEST12345698765432', balance: 1234.56, amount: 100 },
      ],
      auth: [{ token: 'token-value', accessToken: 'access', refreshToken: 'refresh' }],
      card: { pan: '4111111111111111' },
    };

    expect(scrubSensitiveMonitoringPayload(payload)).toEqual({
      user: {
        email: '[scrubbed]',
        profile: {
          password: '[scrubbed]',
          keep: 'safe',
        },
      },
      accounts: [
        { accountNumber: '[scrubbed]', routingNumber: '[scrubbed]', name: 'Checking' },
        { iban: '[scrubbed]', balance: '[scrubbed]', amount: '[scrubbed]' },
      ],
      auth: [{ token: '[scrubbed]', accessToken: '[scrubbed]', refreshToken: '[scrubbed]' }],
      card: { pan: '[scrubbed]' },
    });
  });

  it('does not mutate the original payload', () => {
    const payload = { email: 'user@example.com', nested: { amount: 42 } };

    scrubSensitiveMonitoringPayload(payload);

    expect(payload).toEqual({ email: 'user@example.com', nested: { amount: 42 } });
  });
});

describe('scrubSentryEvent', () => {
  it('scrubs breadcrumb data and nested event contexts', () => {
    const event = {
      user: { email: 'user@example.com' },
      contexts: {
        transaction: {
          amount: 99,
          nested: [{ refreshToken: 'refresh' }],
        },
      },
      breadcrumbs: [
        {
          category: 'auth',
          message: 'login',
          data: {
            token: 'token-value',
            accountNumber: '123456789',
            safe: 'value',
          },
        },
      ],
    };

    expect(scrubSentryEvent(event)).toEqual({
      user: { email: '[scrubbed]' },
      contexts: {
        transaction: {
          amount: '[scrubbed]',
          nested: [{ refreshToken: '[scrubbed]' }],
        },
      },
      breadcrumbs: [
        {
          category: 'auth',
          message: 'login',
          data: {
            token: '[scrubbed]',
            accountNumber: '[scrubbed]',
            safe: 'value',
          },
        },
      ],
    });
  });
});
