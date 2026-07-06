// SPDX-License-Identifier: BUSL-1.1

export type OptionalChunkRoute = 'dashboard' | 'transactions';
export type OptionalChunkCategory =
  'primary-shell' | 'chart' | 'analytics' | 'tax' | 'investment' | 'receipt' | 'education';

export interface RouteImportDescriptor {
  readonly route: OptionalChunkRoute;
  readonly moduleId: string;
  readonly category: OptionalChunkCategory;
  readonly requiredForPrimaryShell: boolean;
}

export interface OptionalChunkDecision {
  readonly moduleId: string;
  readonly shouldLazyLoad: boolean;
  readonly prefetchPolicy: 'none' | 'idle' | 'viewport';
  readonly tolerateLoadFailure: boolean;
}

const OPTIONAL_CATEGORIES = new Set<OptionalChunkCategory>([
  'chart',
  'analytics',
  'tax',
  'investment',
  'receipt',
  'education',
]);

export function planOptionalRouteChunks(
  imports: readonly RouteImportDescriptor[],
): readonly OptionalChunkDecision[] {
  return imports.map((descriptor) => {
    const shouldLazyLoad =
      !descriptor.requiredForPrimaryShell && OPTIONAL_CATEGORIES.has(descriptor.category);
    return {
      moduleId: descriptor.moduleId,
      shouldLazyLoad,
      prefetchPolicy: shouldLazyLoad ? prefetchPolicyForCategory(descriptor.category) : 'none',
      tolerateLoadFailure: shouldLazyLoad,
    };
  });
}

export function shouldKeepOptionalChunkFailureNonBlocking(
  decision: OptionalChunkDecision,
): boolean {
  return decision.shouldLazyLoad && decision.tolerateLoadFailure;
}

function prefetchPolicyForCategory(
  category: OptionalChunkCategory,
): OptionalChunkDecision['prefetchPolicy'] {
  if (category === 'chart' || category === 'education') return 'idle';
  if (category === 'receipt') return 'viewport';
  return 'none';
}
