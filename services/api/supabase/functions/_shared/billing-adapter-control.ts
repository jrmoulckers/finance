// SPDX-License-Identifier: BUSL-1.1

export type BillingAdapter = 'revenuecat' | 'stripe';

type EnvReader = (name: string) => string | undefined;

const STATE_VARIABLES: Record<BillingAdapter, string> = {
  revenuecat: 'REVENUECAT_ADAPTER_STATE',
  stripe: 'STRIPE_ADAPTER_STATE',
};

/**
 * Provider ingress is enabled only by an explicit reviewed environment value.
 * Missing, malformed, or disabled configuration fails closed independently.
 */
export function billingAdapterDisabledResponse(
  adapter: BillingAdapter,
  readEnv: EnvReader = (name) => Deno.env.get(name),
): Response | null {
  if (readEnv(STATE_VARIABLES[adapter]) === 'enabled') return null;

  return new Response(JSON.stringify({ error: 'billing_adapter_disabled' }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': '300',
    },
  });
}
