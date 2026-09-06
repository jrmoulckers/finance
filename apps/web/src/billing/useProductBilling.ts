// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  createProductBillingClient,
  stateFromCheckoutReturn,
  type ProductBillingCatalogChoice,
  type ProductBillingClient,
  type ProductBillingState,
} from './productBilling';

export function useProductBilling(client?: ProductBillingClient) {
  const stableClient = useMemo(() => client ?? createProductBillingClient(), [client]);
  const [state, setState] = useState<ProductBillingState>(() =>
    stateFromCheckoutReturn(window.location.search, null),
  );
  const stateRef = useRef(state);
  const updateState = useCallback((next: ProductBillingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const startCheckout = useCallback(
    async (choice: ProductBillingCatalogChoice, householdIntent?: string) => {
      try {
        const result = await stableClient.startCheckout(choice, householdIntent);
        updateState(result.state);
        return result.checkoutUrl;
      } catch {
        updateState({
          status: 'error',
          projection: stateRef.current.projection,
          message: 'Checkout could not be started. Try again.',
        });
        return null;
      }
    },
    [stableClient, updateState],
  );

  const refresh = useCallback(
    async (householdId?: string) => {
      try {
        const next = await stableClient.loadProjection(householdId);
        updateState(next);
        return next;
      } catch {
        const next: ProductBillingState = {
          status: 'error',
          projection: stateRef.current.projection,
          message: 'Entitlement status could not be refreshed.',
        };
        updateState(next);
        return next;
      }
    },
    [stableClient, updateState],
  );

  const reconcile = useCallback(
    async (householdId?: string) => {
      updateState({ status: 'pending', projection: stateRef.current.projection });
      try {
        await stableClient.reconcile();
        const next = await stableClient.loadProjection(householdId);
        updateState(next);
        return next;
      } catch {
        const next: ProductBillingState = {
          status: 'error',
          projection: stateRef.current.projection,
          message: 'Billing reconciliation could not be completed.',
        };
        updateState(next);
        return next;
      }
    },
    [stableClient, updateState],
  );

  const openPortal = useCallback(async () => {
    try {
      return await stableClient.openPortal();
    } catch {
      updateState({
        status: 'error',
        projection: stateRef.current.projection,
        message: 'Billing management could not be opened.',
      });
      return null;
    }
  }, [stableClient, updateState]);

  return { state, startCheckout, refresh, reconcile, openPortal };
}
