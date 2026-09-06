// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { normalizeStripeEvent } from './normalize.ts';
import {
  type StripeEvent,
  type StripeGateway,
  type StripeInvoice,
  type StripeSubscription,
} from './types.ts';

const NOW = 2_000_000_000;
const PERIOD_END = NOW + 86_400;
const HOUSEHOLD_ID = '10000000-0000-4000-8000-000000000001';
const prices: Record<string, string> = {
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_placeholder',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_year_placeholder',
  STRIPE_PRICE_PREMIUM_MONTHLY: 'price_premium_placeholder',
  STRIPE_PRICE_PREMIUM_YEARLY: 'price_premium_year_placeholder',
  STRIPE_PRICE_FAMILY_MONTHLY: 'price_family_placeholder',
  STRIPE_PRICE_FAMILY_YEARLY: 'price_family_year_placeholder',
  STRIPE_PRICE_PREMIUM_BANK_ADDON_MONTHLY: 'price_addon_placeholder',
};
const getEnv = (name: string) => prices[name];

Deno.test(
  'Stripe lifecycle normalization covers trial, active, renewal, and plan changes',
  async () => {
    const cases = [
      {
        type: 'customer.subscription.created',
        status: 'trialing',
        expected: 'trialing',
      },
      {
        type: 'customer.subscription.updated',
        status: 'active',
        expected: 'active',
      },
      { type: 'invoice.paid', status: 'active', expected: 'active' },
    ] as const;
    for (const testCase of cases) {
      const gateway = fakeGateway(subscription(testCase.status), paidInvoice());
      const result = await normalizeStripeEvent(event(testCase.type), gateway, getEnv);
      assertEquals(result?.lifecycle, testCase.expected);
    }

    const changedPlan = subscription('active', {
      priceId: 'price_family_placeholder',
      householdId: HOUSEHOLD_ID,
    });
    const result = await normalizeStripeEvent(
      event('customer.subscription.updated'),
      fakeGateway(changedPlan, paidInvoice()),
      getEnv,
    );
    assertEquals(result?.tier, 'family');
    assertEquals(result?.boundHouseholdId, HOUSEHOLD_ID);
  },
);

Deno.test(
  'Stripe lifecycle normalization covers cancellation, grace, pause, and expiry',
  async () => {
    const cancellation = await normalizeStripeEvent(
      event('customer.subscription.updated'),
      fakeGateway(subscription('active', { cancelAtPeriodEnd: true }), paidInvoice()),
      getEnv,
    );
    assertEquals(cancellation?.lifecycle, 'cancelled_paid_through');

    const grace = await normalizeStripeEvent(
      event('invoice.payment_action_required'),
      fakeGateway(subscription('past_due'), {
        ...paidInvoice(),
        status: 'open',
        next_payment_attempt: NOW + 3_600,
      }),
      getEnv,
    );
    assertEquals(grace?.lifecycle, 'past_due_grace');
    assertEquals(grace?.eventType, 'past_due');

    const paused = await normalizeStripeEvent(
      event('customer.subscription.paused'),
      fakeGateway(subscription('paused'), paidInvoice()),
      getEnv,
    );
    assertEquals(paused?.lifecycle, 'paused_paid_through');

    const expired = await normalizeStripeEvent(
      event('customer.subscription.deleted'),
      fakeGateway(subscription('canceled', { periodEnd: NOW - 1 }), paidInvoice()),
      getEnv,
    );
    assertEquals(expired?.lifecycle, 'expired');

    const actionRequiredWithoutGrace = await normalizeStripeEvent(
      event('invoice.payment_action_required'),
      fakeGateway(subscription('active'), {
        ...paidInvoice(),
        status: 'open',
        next_payment_attempt: null,
      }),
      getEnv,
    );
    assertEquals(actionRequiredWithoutGrace?.lifecycle, 'expired');
  },
);

Deno.test('Stripe lifecycle normalization makes refunds and chargebacks terminal', async () => {
  const gateway = fakeGateway(subscription('active'), paidInvoice());
  const refund = await normalizeStripeEvent(
    event('refund.created', {
      id: 're_placeholder',
      charge: 'ch_placeholder',
      status: 'succeeded',
      livemode: false,
      created: NOW,
    }),
    gateway,
    getEnv,
  );
  assertEquals(refund?.lifecycle, 'refunded');
  assertEquals(refund?.terminalAt, new Date(NOW * 1000).toISOString());

  const dispute = await normalizeStripeEvent(
    event('charge.dispute.created', {
      id: 'dp_placeholder',
      charge: 'ch_placeholder',
      livemode: false,
      created: NOW,
    }),
    gateway,
    getEnv,
  );
  assertEquals(dispute?.lifecycle, 'chargeback');
});

Deno.test(
  'Stripe normalization marks only trusted newer renewal evidence as reactivation',
  async () => {
    const result = await normalizeStripeEvent(
      event(
        'customer.subscription.updated',
        { id: 'sub_placeholder' },
        {
          status: 'canceled',
        },
      ),
      fakeGateway(subscription('active'), paidInvoice()),
      getEnv,
    );
    assertEquals(result?.eventType, 'reactivated');
    assertEquals(result?.trustedReactivation, true);
    assertEquals(result?.providerOrder, NOW);
  },
);

Deno.test('Stripe Premium household intent remains separate from ledger grant scope', async () => {
  const premium = subscription('active', { householdId: HOUSEHOLD_ID });
  const result = await normalizeStripeEvent(
    event('customer.subscription.updated'),
    fakeGateway(premium, paidInvoice()),
    getEnv,
  );
  assertEquals(result?.boundHouseholdId, null);
  assertEquals(result?.premiumSponsorshipHouseholdId, HOUSEHOLD_ID);
});

Deno.test(
  'Stripe normalization rejects wrong mode and unknown prices without granting',
  async () => {
    await assertRejects(() =>
      normalizeStripeEvent(
        event('customer.subscription.updated'),
        fakeGateway({ ...subscription('active'), livemode: true }, paidInvoice()),
        getEnv,
      ),
    );
    const unknown = await normalizeStripeEvent(
      event('customer.subscription.updated'),
      fakeGateway(subscription('active', { priceId: 'price_unreviewed' }), paidInvoice()),
      getEnv,
    );
    assertEquals(unknown, null);
  },
);

Deno.test('Stripe unknown events grant nothing', async () => {
  let networkCalls = 0;
  const gateway = fakeGateway(subscription('active'), paidInvoice(), () => networkCalls++);
  const result = await normalizeStripeEvent(event('customer.created'), gateway, getEnv);
  assertEquals(result, null);
  assertEquals(networkCalls, 0);
});

Deno.test(
  'Stripe duplicate and reordered deliveries retain stable provider ordering keys',
  async () => {
    const gateway = fakeGateway(subscription('active'), paidInvoice());
    const original = event('customer.subscription.updated');
    const duplicateA = await normalizeStripeEvent(original, gateway, getEnv);
    const duplicateB = await normalizeStripeEvent(original, gateway, getEnv);
    assertEquals(duplicateA?.providerEventId, duplicateB?.providerEventId);
    assertEquals(duplicateA?.providerOrder, duplicateB?.providerOrder);

    const older = await normalizeStripeEvent(
      { ...original, id: 'evt_older_placeholder', created: NOW - 60 },
      gateway,
      getEnv,
    );
    assertEquals(older?.providerOrder, NOW - 60);
    assertEquals(duplicateA?.providerOrder, NOW);
  },
);

function event(
  type: string,
  object: unknown = {
    id: type.startsWith('invoice.') ? 'in_placeholder' : 'sub_placeholder',
  },
  previousAttributes?: Record<string, unknown>,
): StripeEvent {
  return {
    id: `evt_${type.replaceAll('.', '_')}_placeholder`,
    type,
    created: NOW,
    livemode: false,
    data: { object, previous_attributes: previousAttributes },
  };
}

function subscription(
  status: StripeSubscription['status'],
  options: {
    priceId?: string;
    householdId?: string;
    cancelAtPeriodEnd?: boolean;
    periodEnd?: number;
  } = {},
): StripeSubscription {
  return {
    id: 'sub_placeholder',
    customer: 'cus_placeholder',
    status,
    livemode: false,
    cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
    current_period_end: options.periodEnd ?? PERIOD_END,
    trial_end: status === 'trialing' ? PERIOD_END : null,
    canceled_at: status === 'canceled' ? NOW : null,
    ended_at: status === 'canceled' ? NOW : null,
    latest_invoice: 'in_placeholder',
    pause_collection: null,
    metadata: options.householdId ? { finance_household_id: options.householdId } : {},
    items: {
      data: [
        {
          id: 'si_placeholder',
          price: { id: options.priceId ?? 'price_premium_placeholder' },
          quantity: 1,
        },
      ],
    },
  };
}

function paidInvoice(): StripeInvoice {
  return {
    id: 'in_placeholder',
    subscription: 'sub_placeholder',
    charge: 'ch_placeholder',
    status: 'paid',
    livemode: false,
    next_payment_attempt: null,
    status_transitions: { paid_at: NOW },
  };
}

function fakeGateway(
  currentSubscription: StripeSubscription,
  invoice: StripeInvoice,
  onCall: () => void = () => undefined,
): StripeGateway {
  return {
    retrieveAccount: () => Promise.resolve({ id: 'acct_placeholder' }),
    createCustomer: () => Promise.resolve({ id: 'cus_placeholder' }),
    createCheckoutSession: () => Promise.resolve({ url: 'https://checkout.example.test/' }),
    createPortalSession: () => Promise.resolve({ url: 'https://portal.example.test/' }),
    retrieveSubscription: () => {
      onCall();
      return Promise.resolve(currentSubscription);
    },
    retrieveInvoice: () => {
      onCall();
      return Promise.resolve(invoice);
    },
    retrieveCharge: () => {
      onCall();
      return Promise.resolve({
        id: 'ch_placeholder',
        invoice: invoice.id,
        refunded: true,
        livemode: false,
      });
    },
    listSubscriptions: () => Promise.resolve([currentSubscription]),
  };
}
