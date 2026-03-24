// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared test fixtures for Edge Function tests (#533).
 *
 * Provides consistent, deterministic test data that mirrors the
 * production schema without containing any real user information.
 *
 * All IDs use UUID v4 format. All monetary values are in cents (BIGINT).
 */

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const TEST_USER = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  email: 'testuser@example.com',
  created_at: '2024-01-15T10:00:00.000Z',
} as const;

export const TEST_USER_2 = {
  id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  email: 'testuser2@example.com',
  created_at: '2024-02-20T12:00:00.000Z',
} as const;

export const TEST_USER_3 = {
  id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
  email: 'testuser3@example.com',
  created_at: '2024-03-10T08:00:00.000Z',
} as const;

// ---------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------

export const TEST_HOUSEHOLD = {
  id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
  name: 'Test Household',
  created_by: TEST_USER.id,
  created_at: '2024-01-15T10:01:00.000Z',
  deleted_at: null,
} as const;

export const TEST_HOUSEHOLD_2 = {
  id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b',
  name: 'Shared Household',
  created_by: TEST_USER.id,
  created_at: '2024-02-01T10:00:00.000Z',
  deleted_at: null,
} as const;

// ---------------------------------------------------------------------------
// Household Members
// ---------------------------------------------------------------------------

export const TEST_MEMBERSHIP = {
  id: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
  household_id: TEST_HOUSEHOLD.id,
  user_id: TEST_USER.id,
  role: 'owner',
  deleted_at: null,
} as const;

export const TEST_MEMBERSHIP_2 = {
  id: 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d',
  household_id: TEST_HOUSEHOLD_2.id,
  user_id: TEST_USER.id,
  role: 'owner',
  deleted_at: null,
} as const;

export const TEST_MEMBERSHIP_SHARED = {
  id: 'b8c9d0e1-f2a3-4b4c-5d6e-7f8a9b0c1d2e',
  household_id: TEST_HOUSEHOLD_2.id,
  user_id: TEST_USER_2.id,
  role: 'member',
  deleted_at: null,
} as const;

// ---------------------------------------------------------------------------
// Passkey Credentials
// ---------------------------------------------------------------------------

export const TEST_CREDENTIAL = {
  id: 'c9d0e1f2-a3b4-4c5d-6e7f-8a9b0c1d2e3f',
  user_id: TEST_USER.id,
  credential_id: 'dGVzdC1jcmVkZW50aWFsLWlk',
  public_key: 'dGVzdC1wdWJsaWMta2V5LWJhc2U2NA==',
  counter: 0,
  device_type: 'singleDevice',
  backed_up: false,
  transports: ['internal'],
  deleted_at: null,
} as const;

export const TEST_CREDENTIAL_2 = {
  id: 'd0e1f2a3-b4c5-4d6e-7f8a-9b0c1d2e3f4a',
  user_id: TEST_USER.id,
  credential_id: 'dGVzdC1jcmVkZW50aWFsLWlkLTI=',
  public_key: 'dGVzdC1wdWJsaWMta2V5LTItYmFzZTY0',
  counter: 5,
  device_type: 'multiDevice',
  backed_up: true,
  transports: ['usb', 'ble'],
  deleted_at: null,
} as const;

// ---------------------------------------------------------------------------
// WebAuthn Challenges
// ---------------------------------------------------------------------------

export const TEST_CHALLENGE = {
  id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  user_id: TEST_USER.id,
  challenge: 'dGVzdC1jaGFsbGVuZ2UtdmFsdWU',
  type: 'registration',
  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
} as const;

export const TEST_AUTH_CHALLENGE = {
  id: 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c',
  user_id: null,
  challenge: 'dGVzdC1hdXRoLWNoYWxsZW5nZS12YWx1ZQ',
  type: 'authentication',
  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
} as const;

export const TEST_EXPIRED_CHALLENGE = {
  id: 'a3b4c5d6-e7f8-4a9b-0c1d-2e3f4a5b6c7d',
  user_id: TEST_USER.id,
  challenge: 'ZXhwaXJlZC1jaGFsbGVuZ2U',
  type: 'registration',
  expires_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
} as const;

// ---------------------------------------------------------------------------
// Household Invitations
// ---------------------------------------------------------------------------

export const TEST_INVITATION = {
  id: 'b4c5d6e7-f8a9-4b0c-1d2e-3f4a5b6c7d8e',
  household_id: TEST_HOUSEHOLD.id,
  invited_by: TEST_USER.id,
  invite_code: 'TESTINVITECODE12345678',
  invited_email: TEST_USER_2.email,
  role: 'member',
  expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  accepted_at: null,
  deleted_at: null,
} as const;

export const TEST_EXPIRED_INVITATION = {
  id: 'c5d6e7f8-a9b0-4c1d-2e3f-4a5b6c7d8e9f',
  household_id: TEST_HOUSEHOLD.id,
  invited_by: TEST_USER.id,
  invite_code: 'EXPIREDINVITECODE1234',
  invited_email: TEST_USER_3.email,
  role: 'member',
  expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  accepted_at: null,
  deleted_at: null,
} as const;

export const TEST_ACCEPTED_INVITATION = {
  id: 'd6e7f8a9-b0c1-4d2e-3f4a-5b6c7d8e9f0a',
  household_id: TEST_HOUSEHOLD.id,
  invited_by: TEST_USER.id,
  invite_code: 'ACCEPTEDINVITECODE12',
  invited_email: TEST_USER_2.email,
  role: 'member',
  expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  accepted_at: '2024-03-01T12:00:00.000Z',
  deleted_at: null,
} as const;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const TEST_ACCOUNT = {
  id: 'e7f8a9b0-c1d2-4e3f-4a5b-6c7d8e9f0a1b',
  household_id: TEST_HOUSEHOLD.id,
  name: 'Checking Account',
  type: 'checking',
  currency: 'USD',
  balance_cents: 150000, // $1,500.00
  created_at: '2024-01-15T10:05:00.000Z',
  deleted_at: null,
} as const;

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const TEST_TRANSACTION = {
  id: 'f8a9b0c1-d2e3-4f4a-5b6c-7d8e9f0a1b2c',
  household_id: TEST_HOUSEHOLD.id,
  account_id: TEST_ACCOUNT.id,
  amount_cents: -5000, // -$50.00
  currency: 'USD',
  description: 'Grocery shopping',
  category_id: null,
  created_at: '2024-03-01T14:30:00.000Z',
  deleted_at: null,
} as const;

// ---------------------------------------------------------------------------
// Webhook Payloads
// ---------------------------------------------------------------------------

export const TEST_WEBHOOK_INSERT_PAYLOAD = {
  type: 'INSERT',
  table: 'users',
  record: {
    id: TEST_USER.id,
    email: TEST_USER.email,
    raw_user_meta_data: {
      full_name: 'Test User',
    },
    created_at: TEST_USER.created_at,
  },
  old_record: null,
} as const;

export const TEST_WEBHOOK_UPDATE_PAYLOAD = {
  type: 'UPDATE',
  table: 'users',
  record: {
    id: TEST_USER.id,
    email: TEST_USER.email,
    raw_user_meta_data: {},
    created_at: TEST_USER.created_at,
  },
  old_record: {
    id: TEST_USER.id,
    email: TEST_USER.email,
  },
} as const;

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

/** Standard environment variables for testing. */
export const TEST_ENV = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-1234567890',
  AUTH_WEBHOOK_SECRET: 'test-webhook-secret-abcdef',
  ALLOWED_ORIGINS: 'https://app.finance.example.com,https://localhost:3000',
  WEBAUTHN_RP_NAME: 'Finance App Test',
  WEBAUTHN_RP_ID: 'finance.example.com',
  WEBAUTHN_ORIGIN: 'https://app.finance.example.com',
} as const;
