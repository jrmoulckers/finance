// SPDX-License-Identifier: BUSL-1.1

import {
  useAccessibilityContext,
  type AccessibilityContextValue,
} from '../contexts/AccessibilityContext';

export type UseAccessibilityResult = AccessibilityContextValue;

export function useAccessibility(): UseAccessibilityResult {
  return useAccessibilityContext();
}

export default useAccessibility;
