// SPDX-License-Identifier: BUSL-1.1

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { resolveDocumentTitle } from '../lib/i18n/page-title';
import { useLocalePreferences } from './useLocalePreferences';

/**
 * Keeps the browser tab / `document.title` in sync with the active route.
 *
 * Applied once at the app layout root so every route — authenticated,
 * standalone, and onboarding — gets a descriptive, localized title instead of
 * the static "Finance" fallback from `index.html` (#3104). Re-runs whenever the
 * path or the user's locale changes.
 */
export function useDocumentTitle(): void {
  const { pathname } = useLocation();
  const { locale } = useLocalePreferences();

  useEffect(() => {
    document.title = resolveDocumentTitle(pathname, locale);
  }, [pathname, locale]);
}
