// SPDX-License-Identifier: BUSL-1.1

import {
  type StripeAccount,
  type StripeCharge,
  type StripeGateway,
  type StripeInvoice,
  StripeServiceError,
  type StripeSubscription,
} from './types.ts';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2025-08-27.basil';

export class StripeRestGateway implements StripeGateway {
  constructor(
    private readonly secretKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    if (!secretKey) throw new Error('Stripe secret key is required');
  }

  retrieveAccount(): Promise<StripeAccount> {
    return this.request<StripeAccount>('GET', '/account');
  }

  createCustomer(input: { ownerId: string; idempotencyKey: string }): Promise<{ id: string }> {
    return this.request(
      'POST',
      '/customers',
      {
        'metadata[finance_owner_id]': input.ownerId,
      },
      input.idempotencyKey,
    );
  }

  createCheckoutSession(input: Parameters<StripeGateway['createCheckoutSession']>[0]) {
    const metadata: Record<string, string> = {
      finance_billing_account_id: input.billingAccountId,
      finance_owner_id: input.ownerId,
      finance_catalog_choice: input.entry.choice,
    };
    if (input.householdId) metadata.finance_household_id = input.householdId;

    const form: Record<string, string> = {
      mode: 'subscription',
      customer: input.customerId,
      'line_items[0][price]': input.entry.priceId,
      'line_items[0][quantity]': String(input.entry.quantity),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.ownerId,
      allow_promotion_codes: 'false',
    };
    for (const [key, value] of Object.entries(metadata)) {
      form[`metadata[${key}]`] = value;
      form[`subscription_data[metadata][${key}]`] = value;
    }
    return this.request<{ url: string | null }>(
      'POST',
      '/checkout/sessions',
      form,
      input.idempotencyKey,
    );
  }

  createPortalSession(input: Parameters<StripeGateway['createPortalSession']>[0]) {
    return this.request<{ url: string | null }>('POST', '/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
  }

  retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.request('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  retrieveInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.request('GET', `/invoices/${encodeURIComponent(invoiceId)}`);
  }

  retrieveCharge(chargeId: string): Promise<StripeCharge> {
    return this.request('GET', `/charges/${encodeURIComponent(chargeId)}`);
  }

  async listSubscriptions(customerId: string): Promise<StripeSubscription[]> {
    const response = await this.request<{ data: StripeSubscription[] }>('GET', '/subscriptions', {
      customer: customerId,
      status: 'all',
      limit: '100',
    });
    return response.data;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    values: Record<string, string> = {},
    idempotencyKey?: string,
  ): Promise<T> {
    const body = new URLSearchParams(values);
    const url =
      method === 'GET' && body.size > 0
        ? `${STRIPE_API_BASE}${path}?${body.toString()}`
        : `${STRIPE_API_BASE}${path}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Stripe-Version': STRIPE_API_VERSION,
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(method === 'POST' ? { body } : {}),
      });
    } catch {
      throw new StripeServiceError('Billing provider unavailable', true);
    }

    if (!response.ok) {
      throw new StripeServiceError(
        'Billing provider request failed',
        response.status === 409 || response.status === 429 || response.status >= 500,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new StripeServiceError('Billing provider returned an invalid response', true);
    }
  }
}
