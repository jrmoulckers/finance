// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useMemo, useState } from 'react';
import {
  createProductBillingClient,
  type ProductBillingCatalogChoice,
  type ProductBillingClient,
  type ProductBillingState,
} from './productBilling';

export function useProductBilling(client?: ProductBillingClient) {
  const stableClient = useMemo(() => client ?? createProductBillingClient(), [client]);
  const [state, setState] = useState<ProductBillingState>({
    status: 'idle',
    projection: null,
  });

  const startCheckout = useCallback(
    async (choice: ProductBillingCatalogChoice, householdIntent?: string) => {
      try {
        const result = await stableClient.startCheckout(choice, householdIntent);
        setState(result.state);
        return result.checkoutUrl;
      } catch {
        setState({
          status: 'error',
          projection: state.projection,
          message: 'Checkout could not be started. Try again.',
        });
        return null;
      }
    },
    [stableClient, state.projection],
  );

  const refresh = useCallback(
    async (householdId?: string) => {
      try {
        const next = await stableClient.loadProjection(householdId);
        setState(next);
        return next;
      } catch {
        const next: ProductBillingState = {
          status: 'error',
          projection: state.projection,
          message: 'Entitlement status could not be refreshed.',
        };
        setState(next);
        return next;
      }
    },
    [stableClient, state.projection],
  );

  const openPortal = useCallback(async () => {
    try {
      return await stableClient.openPortal();
    } catch {
      setState({
        status: 'error',
        projection: state.projection,
        message: 'Billing management could not be opened.',
      });
      return null;
    }
  }, [stableClient, state.projection]);

  return { state, startCheckout, refresh, openPortal };
}
