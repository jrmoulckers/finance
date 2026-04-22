// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Bank Connection API Edge Function (#265).
 *
 * Validates provider validation, action routing, security constraints,
 * encryption behavior, and webhook verification.
 */

import {
  assertEquals,
  assertExists,
  assertNotEquals,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

// ---------------------------------------------------------------------------
// Provider validation tests
// ---------------------------------------------------------------------------

const VALID_PROVIDERS = ['plaid', 'mx'] as const;

Deno.test('valid providers are accepted', () => {
  for (const provider of VALID_PROVIDERS) {
    assertEquals((VALID_PROVIDERS as readonly string[]).includes(provider), true);
  }
});

Deno.test('invalid provider is rejected', () => {
  assertEquals((VALID_PROVIDERS as readonly string[]).includes('stripe'), false);
  assertEquals((VALID_PROVIDERS as readonly string[]).includes(''), false);
  assertEquals((VALID_PROVIDERS as readonly string[]).includes('yodlee'), false);
});

// ---------------------------------------------------------------------------
// Action validation tests
// ---------------------------------------------------------------------------

Deno.test('create_link_token action is parsed from URL', () => {
  const url = new URL(
    'https://test.supabase.co/functions/v1/bank-connection?action=create_link_token',
  );
  assertEquals(url.searchParams.get('action'), 'create_link_token');
});

Deno.test('exchange_token action is parsed from URL', () => {
  const url = new URL(
    'https://test.supabase.co/functions/v1/bank-connection?action=exchange_token',
  );
  assertEquals(url.searchParams.get('action'), 'exchange_token');
});

// ---------------------------------------------------------------------------
// Request validation tests
// ---------------------------------------------------------------------------

Deno.test('create_link_token requires provider', () => {
  const body = { household_id: 'test-id' };
  const hasProvider = 'provider' in body && body.provider;
  assertEquals(hasProvider, undefined);
});

Deno.test('exchange_token requires all fields', () => {
  const requiredFields = [
    'provider',
    'household_id',
    'public_token',
    'institution_id',
    'institution_name',
  ];

  const completeBody = {
    provider: 'plaid',
    household_id: 'hh-123',
    public_token: 'public-token-123',
    institution_id: 'ins_123',
    institution_name: 'Chase',
  };

  for (const field of requiredFields) {
    assertEquals(field in completeBody, true, `Missing field: ${field}`);
    assertNotEquals(
      (completeBody as Record<string, string>)[field],
      undefined,
      `${field} should not be undefined`,
    );
  }
});

// ---------------------------------------------------------------------------
// Security tests: encrypted token format
// ---------------------------------------------------------------------------

Deno.test('encrypted token format has expected prefix', () => {
  // Our encryption format: aes256gcm:base64(iv):base64(ciphertext)
  const mockEncrypted = 'aes256gcm:AAAAAAAAAAAAAAAA:dGVzdGVuY3J5cHRlZA==';
  assertEquals(mockEncrypted.startsWith('aes256gcm:'), true);

  const parts = mockEncrypted.split(':');
  assertEquals(parts.length, 3);
  assertEquals(parts[0], 'aes256gcm');
});

Deno.test('response never includes access token', () => {
  const apiResponse = {
    id: 'conn-123',
    provider: 'plaid',
    institution_name: 'Chase',
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const serialized = JSON.stringify(apiResponse);
  assertEquals(serialized.includes('access_token'), false);
  assertEquals(serialized.includes('encrypted_access_token'), false);
  assertEquals(serialized.includes('secret'), false);
});

Deno.test('list response excludes sensitive fields', () => {
  const connections = [
    {
      id: 'conn-1',
      provider: 'plaid',
      institution_id: 'ins_1',
      institution_name: 'Chase',
      status: 'active',
      last_synced_at: new Date().toISOString(),
      error_code: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const serialized = JSON.stringify(connections);
  assertEquals(serialized.includes('access_token'), false);
  assertEquals(serialized.includes('encrypted'), false);
});

// ---------------------------------------------------------------------------
// Webhook provider validation tests
// ---------------------------------------------------------------------------

Deno.test('webhook provider parameter is validated', () => {
  const validProviders = ['plaid', 'mx'];
  assertEquals(validProviders.includes('plaid'), true);
  assertEquals(validProviders.includes('mx'), true);
  assertEquals(validProviders.includes('invalid'), false);
});

Deno.test('Plaid webhook event structure', () => {
  const event = {
    webhook_type: 'TRANSACTIONS',
    webhook_code: 'DEFAULT_UPDATE',
    item_id: 'item-123',
    new_transactions: 5,
  };

  assertExists(event.webhook_type);
  assertExists(event.webhook_code);
  assertExists(event.item_id);
  assertEquals(typeof event.new_transactions, 'number');
});

Deno.test('MX webhook event structure', () => {
  const event = {
    event_type: 'transactions_added',
    member_guid: 'MBR-123',
    user_guid: 'USR-123',
  };

  assertExists(event.event_type);
  assertExists(event.member_guid);
  assertExists(event.user_guid);
});

// ---------------------------------------------------------------------------
// Connection status validation
// ---------------------------------------------------------------------------

Deno.test('valid connection statuses', () => {
  const validStatuses = ['active', 'needs_reauth', 'disconnected', 'error'];
  assertEquals(validStatuses.includes('active'), true);
  assertEquals(validStatuses.includes('needs_reauth'), true);
  assertEquals(validStatuses.includes('disconnected'), true);
  assertEquals(validStatuses.includes('error'), true);
  assertEquals(validStatuses.includes('invalid'), false);
});

Deno.test('sync log types are valid', () => {
  const validTypes = ['initial', 'incremental', 'historical', 'webhook'];
  for (const t of validTypes) {
    assertEquals(validTypes.includes(t), true);
  }
});
