// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect } from 'react';

import { type ProductBillingCatalogChoice } from '../../billing/productBilling';
import { useProductBilling } from '../../billing/useProductBilling';
import { useOptionalFeatureGate } from '../../components/feature-gate';
import { displayTierName, entitlementStatusText } from '../../entitlements';
import { useHousehold } from '../../hooks/useHousehold';
import './billing-settings.css';

interface BillingOption {
  name: string;
  cadence: string;
  choice: ProductBillingCatalogChoice;
  householdBound?: boolean;
  sponsorsHousehold?: boolean;
}

const BILLING_OPTIONS: readonly BillingOption[] = [
  { name: 'Plus', cadence: 'Monthly', choice: 'plus_monthly' },
  { name: 'Plus', cadence: 'Yearly', choice: 'plus_yearly' },
  {
    name: 'Premium',
    cadence: 'Monthly',
    choice: 'premium_monthly',
    sponsorsHousehold: true,
  },
  {
    name: 'Premium',
    cadence: 'Yearly',
    choice: 'premium_yearly',
    sponsorsHousehold: true,
  },
  { name: 'Family', cadence: 'Monthly', choice: 'family_monthly', householdBound: true },
  { name: 'Family', cadence: 'Yearly', choice: 'family_yearly', householdBound: true },
];

export const SettingsBillingPage: React.FC = () => {
  const { household } = useHousehold();
  const { state, startCheckout, refresh, reconcile, openPortal } = useProductBilling();
  const entitlementContext = useOptionalFeatureGate();
  const entitlement = entitlementContext?.entitlement;
  const householdId = household?.id;
  const busy = state.status === 'pending';

  useEffect(() => {
    void refresh(householdId);
  }, [householdId, refresh]);

  const redirect = useCallback((url: string) => {
    window.location.assign(url);
  }, []);

  const handleCheckout = useCallback(
    async (option: BillingOption) => {
      const intent = option.householdBound || option.sponsorsHousehold ? householdId : undefined;
      const checkoutUrl = await startCheckout(option.choice, intent);
      if (checkoutUrl) redirect(checkoutUrl);
    },
    [householdId, redirect, startCheckout],
  );

  const handlePortal = useCallback(async () => {
    const portalUrl = await openPortal();
    if (portalUrl) redirect(portalUrl);
  }, [openPortal, redirect]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(householdId), entitlementContext?.refreshEntitlement()]);
  }, [entitlementContext, householdId, refresh]);

  const handleReconcile = useCallback(async () => {
    await reconcile(householdId);
    await entitlementContext?.refreshEntitlement();
  }, [entitlementContext, householdId, reconcile]);

  const displayedPlan = entitlement ? displayTierName(entitlement.displayTier) : 'Unavailable';
  const statusText =
    state.status === 'pending'
      ? 'Waiting for Finance to confirm trusted billing evidence.'
      : entitlement
        ? entitlementStatusText(entitlement)
        : 'Plan status is unavailable. Your local data and controls remain available.';

  return (
    <>
      <h2 className="settings-subpage__title">Plan &amp; Billing</h2>
      <section aria-labelledby="billing-current-plan" className="page-section">
        <div className="settings-group">
          <h3 id="billing-current-plan" className="settings-group__title">
            Current plan
          </h3>
          <div className="settings-item settings-item--static">
            <span className="settings-item__label">{displayedPlan}</span>
            <span
              className="settings-item__value billing-settings__status"
              role="status"
              aria-live="polite"
            >
              {statusText}
            </span>
          </div>
          <p className="billing-settings__explanation">
            Checkout completion is pending until Finance receives and applies verified Stripe
            evidence. A redirect or browser session never grants access by itself.
          </p>
          {state.status === 'error' && (
            <p className="billing-settings__error" role="alert">
              {state.message}
            </p>
          )}
          <div className="billing-settings__actions">
            <button
              type="button"
              className="form-button form-button--secondary"
              disabled={busy}
              onClick={() => {
                void handleRefresh();
              }}
            >
              Refresh status
            </button>
            <button
              type="button"
              className="form-button form-button--secondary"
              disabled={busy}
              onClick={() => {
                void handleReconcile();
              }}
            >
              Restore purchases
            </button>
            <button
              type="button"
              className="form-button form-button--secondary"
              disabled={busy}
              onClick={() => {
                void handlePortal();
              }}
            >
              Manage billing
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="billing-options" className="page-section">
        <div className="settings-group">
          <h3 id="billing-options" className="settings-group__title">
            Choose a plan
          </h3>
          <p className="settings-group__description">
            Stripe securely handles payment for Web purchases. Existing data remains available after
            a downgrade.
          </p>
          <div className="billing-settings__plans">
            {BILLING_OPTIONS.map((option) => {
              const requiresHousehold = option.householdBound && !householdId;
              return (
                <button
                  key={option.choice}
                  type="button"
                  className="settings-item settings-item--button billing-settings__plan"
                  disabled={busy || requiresHousehold}
                  aria-label={`${option.name} ${option.cadence}`}
                  onClick={() => {
                    void handleCheckout(option);
                  }}
                  aria-describedby={requiresHousehold ? 'family-plan-requirement' : undefined}
                >
                  <span className="settings-item__label">{option.name}</span>
                  <span className="settings-item__value">{option.cadence}</span>
                </button>
              );
            })}
          </div>
          {!householdId && (
            <p id="family-plan-requirement" className="billing-settings__explanation">
              Create or join a household before selecting Family.
            </p>
          )}
        </div>
      </section>

      <p className="billing-settings__store-note">
        Direct-distributed Windows purchases also use Stripe. Microsoft Store billing is planned for
        a future release and is not available yet.
      </p>
    </>
  );
};

export default SettingsBillingPage;
