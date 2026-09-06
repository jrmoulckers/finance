// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  ENTITLEMENT_CATALOG_VERSION,
  ENTITLEMENT_CONTRACT_VERSION,
  type EntitlementProjectionRow,
  parseProjectionRow,
  toEnvelope,
} from './contract.ts';

function row(overrides: Partial<EntitlementProjectionRow> = {}): Record<string, unknown> {
  return {
    user_display_tier: 'free',
    household_display_tier: null,
    bank_connection_allowance: 0,
    is_premium_sponsor: false,
    is_family_bound: false,
    effective_at: '2033-05-18T03:33:20+00:00',
    expires_at: null,
    projection_version: 1,
    server_time: '2033-05-18T03:33:21+00:00',
    ...overrides,
  };
}

function parsed(
  overrides: Partial<EntitlementProjectionRow> = {},
  householdRequested = false,
): EntitlementProjectionRow {
  const value = parseProjectionRow(row(overrides), householdRequested);
  if (value === null) throw new Error('fixture did not parse');
  return value;
}

Deno.test('contract — versions are pinned to the ratified catalog', () => {
  assertEquals(ENTITLEMENT_CONTRACT_VERSION, 1);
  assertEquals(ENTITLEMENT_CATALOG_VERSION, 1);
});

Deno.test('contract — Free resolves to a non-entitled user scope', () => {
  const envelope = toEnvelope(parsed());
  assertEquals(envelope.entitlement.tier, 'free');
  assertEquals(envelope.entitlement.scope, 'user');
  assertEquals(envelope.entitlement.access_state, 'not_entitled');
  assertEquals(envelope.entitlement.bank_connections.allowance, 0);
  assertEquals(envelope.entitlement.downgrade.status, 'none');
  assertEquals(envelope.entitlement.downgrade.effective_at, null);
});

Deno.test('contract — Plus is granted through the server-issued validity bound', () => {
  const envelope = toEnvelope(
    parsed({ user_display_tier: 'plus', expires_at: '2033-06-18T03:33:20+00:00' }),
  );
  assertEquals(envelope.entitlement.tier, 'plus');
  assertEquals(envelope.entitlement.scope, 'user');
  assertEquals(envelope.entitlement.access_state, 'granted');
  assertEquals(envelope.entitlement.validity.expires_at, '2033-06-18T03:33:20.000Z');
  assertEquals(envelope.entitlement.validity.server_time, '2033-05-18T03:33:21.000Z');
  // Plus carries no bank allowance, so there is nothing that can reduce.
  assertEquals(envelope.entitlement.downgrade.status, 'none');
});

Deno.test('contract — Premium add-ons are reported above the catalog base', () => {
  const envelope = toEnvelope(
    parsed(
      {
        user_display_tier: 'premium',
        household_display_tier: 'premium',
        bank_connection_allowance: 5,
        is_premium_sponsor: true,
        expires_at: '2033-06-18T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(envelope.entitlement.tier, 'premium');
  // The purchaser already holds Premium, so the household grant does not
  // become the reported subject.
  assertEquals(envelope.entitlement.scope, 'user');
  assertEquals(envelope.entitlement.bank_connections, {
    allowance: 5,
    base_allowance: 2,
    addon_allowance: 3,
  });
  assertEquals(envelope.entitlement.is_premium_sponsor, true);
  // A purchaser grant and a household grant both contribute, so the collapsed
  // bound cannot be attributed to either.
  assertEquals(envelope.entitlement.downgrade, {
    status: 'undetermined',
    effective_at: null,
  });
});

Deno.test('contract — an expiring add-on states the boundary, never a next allowance', () => {
  // A sponsored member holds no purchaser grant, so the projection's bound is
  // the household bound alone — here the earliest add-on expiry. Premium's
  // base of two survives it, which is exactly why no post-boundary allowance
  // is stated.
  const envelope = toEnvelope(
    parsed(
      {
        household_display_tier: 'premium',
        bank_connection_allowance: 5,
        expires_at: '2033-05-25T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(envelope.entitlement.downgrade, {
    status: 'scheduled',
    effective_at: '2033-05-25T03:33:20.000Z',
  });
  assertEquals(Object.hasOwn(envelope.entitlement.downgrade, 'bank_connection_allowance'), false);
});

Deno.test('contract — a weaker purchaser grant never dictates the household boundary', () => {
  // Plus lapses tomorrow while the Family household survives for a month. The
  // projection collapses both bounds with LEAST, so the earlier one belongs to
  // the grant that does *not* determine the effective tier or allowance.
  // Claiming it as the reduction instant would be false.
  const envelope = toEnvelope(
    parsed(
      {
        user_display_tier: 'plus',
        household_display_tier: 'family',
        bank_connection_allowance: 4,
        is_family_bound: true,
        expires_at: '2033-05-19T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(envelope.entitlement.tier, 'family');
  assertEquals(envelope.entitlement.scope, 'household');
  assertEquals(envelope.entitlement.access_state, 'granted');
  assertEquals(envelope.entitlement.bank_connections.allowance, 4);
  assertEquals(envelope.entitlement.downgrade, {
    status: 'undetermined',
    effective_at: null,
  });
  // The bound is still disclosed — it is when the response stops being
  // guaranteed accurate, which is when the client refreshes.
  assertEquals(envelope.entitlement.validity.expires_at, '2033-05-19T03:33:20.000Z');
});

Deno.test('contract — an equal-rank purchaser grant also leaves the boundary undetermined', () => {
  const envelope = toEnvelope(
    parsed(
      {
        user_display_tier: 'premium',
        household_display_tier: 'premium',
        bank_connection_allowance: 2,
        is_premium_sponsor: true,
        expires_at: '2033-05-19T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(envelope.entitlement.tier, 'premium');
  assertEquals(envelope.entitlement.scope, 'user');
  assertEquals(envelope.entitlement.downgrade.status, 'undetermined');
  assertEquals(envelope.entitlement.downgrade.effective_at, null);
});

Deno.test('contract — an expiring Family bound states no retained allowance', () => {
  // A live Premium sponsorship can survive a Family expiry and keep capacity,
  // so inferring zero here would be wrong.
  const envelope = toEnvelope(
    parsed(
      {
        household_display_tier: 'family',
        bank_connection_allowance: 4,
        is_family_bound: true,
        expires_at: '2033-06-18T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(envelope.entitlement.downgrade.status, 'scheduled');
  assertEquals(envelope.entitlement.downgrade.effective_at, '2033-06-18T03:33:20.000Z');
  assertEquals(Object.hasOwn(envelope.entitlement.downgrade, 'bank_connection_allowance'), false);
});

Deno.test('contract — a sponsored Free member reports the household subject', () => {
  const envelope = toEnvelope(
    parsed(
      {
        household_display_tier: 'family',
        bank_connection_allowance: 4,
        is_family_bound: true,
        expires_at: '2033-06-18T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(envelope.entitlement.tier, 'family');
  assertEquals(envelope.entitlement.scope, 'household');
  assertEquals(envelope.entitlement.user_tier, 'free');
  assertEquals(envelope.entitlement.household_tier, 'family');
  assertEquals(envelope.entitlement.is_family_bound, true);
  assertEquals(envelope.entitlement.bank_connections, {
    allowance: 4,
    base_allowance: 4,
    addon_allowance: 0,
  });
});

Deno.test('contract — a passed validity bound lapses and never authorizes', () => {
  const envelope = toEnvelope(
    parsed(
      {
        household_display_tier: 'family',
        bank_connection_allowance: 4,
        is_family_bound: true,
        expires_at: '2033-05-18T03:33:21+00:00',
        server_time: '2033-05-18T03:33:21+00:00',
      },
      true,
    ),
  );
  assertEquals(envelope.entitlement.access_state, 'lapsed');
  assertEquals(envelope.entitlement.downgrade.status, 'none');
  assertEquals(envelope.entitlement.downgrade.effective_at, null);
});

Deno.test('contract — contract version 1 never discloses provider lifecycle', () => {
  assertEquals(toEnvelope(parsed()).entitlement.lifecycle, null);
});

Deno.test('contract — malformed and unknown projection values are rejected', () => {
  const cases: Array<[string, unknown]> = [
    ['not an object', 'free'],
    ['null row', null],
    ['unknown user tier', row({ user_display_tier: 'enterprise' as never })],
    ['unknown household tier', row({ household_display_tier: 'plus' as never })],
    ['fractional allowance', row({ bank_connection_allowance: 2.5 })],
    ['negative allowance', row({ bank_connection_allowance: -1 })],
    ['non-boolean sponsor flag', row({ is_premium_sponsor: 'true' as never })],
    ['offset-less timestamp', row({ effective_at: '2033-05-18T03:33:20' as never })],
    ['unparseable expiry', row({ expires_at: 'never' as never })],
    ['zero projection version', row({ projection_version: 0 })],
    ['missing server time', row({ server_time: null as never })],
    ['allowance without a household scope', row({ bank_connection_allowance: 2 })],
    [
      'sponsor flag without a household scope',
      row({ is_premium_sponsor: true, expires_at: '2033-06-18T03:33:20+00:00' }),
    ],
    ['paid tier without a trusted expiry', row({ user_display_tier: 'premium', expires_at: null })],
  ];
  for (const [label, value] of cases) {
    assertEquals(parseProjectionRow(value, false), null, label);
  }
});

Deno.test('contract — a projection scope mismatch is rejected in both directions', () => {
  // A household was authorized but the projection describes only the user.
  assertEquals(parseProjectionRow(row(), true), null);
  // No household was authorized but the projection carries household state.
  assertEquals(
    parseProjectionRow(
      row({
        household_display_tier: 'family',
        bank_connection_allowance: 4,
        expires_at: '2033-06-18T03:33:20+00:00',
      }),
      false,
    ),
    null,
  );
});

Deno.test('contract — a household allowance outside its catalog capacity is rejected', () => {
  const overAllocated: Array<[string, unknown]> = [
    // Family is fixed at exactly four; it never accrues add-ons.
    [
      'family above the catalog capacity',
      row({
        household_display_tier: 'family',
        bank_connection_allowance: 5,
        expires_at: '2033-06-18T03:33:20+00:00',
      }),
    ],
    [
      'family below the catalog capacity',
      row({
        household_display_tier: 'family',
        bank_connection_allowance: 3,
        expires_at: '2033-06-18T03:33:20+00:00',
      }),
    ],
    [
      'premium below its catalog base',
      row({
        household_display_tier: 'premium',
        bank_connection_allowance: 1,
        expires_at: '2033-06-18T03:33:20+00:00',
      }),
    ],
    [
      'free household with capacity',
      row({ household_display_tier: 'free', bank_connection_allowance: 2 }),
    ],
  ];
  for (const [label, value] of overAllocated) {
    assertEquals(parseProjectionRow(value, true), null, label);
  }
});

Deno.test('contract — only Premium reports add-on capacity above its base', () => {
  const family = toEnvelope(
    parsed(
      {
        household_display_tier: 'family',
        bank_connection_allowance: 4,
        is_family_bound: true,
        expires_at: '2033-06-18T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(family.entitlement.bank_connections.addon_allowance, 0);

  const premium = toEnvelope(
    parsed(
      {
        user_display_tier: 'premium',
        household_display_tier: 'premium',
        bank_connection_allowance: 7,
        is_premium_sponsor: true,
        expires_at: '2033-06-18T03:33:20+00:00',
      },
      true,
    ),
  );
  assertEquals(premium.entitlement.bank_connections.addon_allowance, 5);
});
