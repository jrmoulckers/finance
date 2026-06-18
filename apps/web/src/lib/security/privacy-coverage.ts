// SPDX-License-Identifier: BUSL-1.1

import type { SensitiveSurfaceCategory } from './privacy-screen';

export type SensitiveSurfaceArea =
  | 'dashboard'
  | 'chart'
  | 'detail'
  | 'export'
  | 'notification'
  | 'search'
  | 'navigation';

export interface PrivacySurfaceCoverageItem {
  readonly id: string;
  readonly area: SensitiveSurfaceArea;
  readonly categories: readonly SensitiveSurfaceCategory[];
  readonly maskingBehavior: 'masked' | 'bucketed' | 'redacted_on_export' | 'none';
  readonly exportRedactionExplicit?: boolean;
}

export interface PrivacyCoverageAudit {
  readonly complete: boolean;
  readonly missingMaskingIds: readonly string[];
  readonly missingExportRedactionIds: readonly string[];
  readonly coveredAreas: readonly SensitiveSurfaceArea[];
  readonly uncoveredAreas: readonly SensitiveSurfaceArea[];
}

export const REQUIRED_PRIVACY_SURFACE_AREAS: readonly SensitiveSurfaceArea[] = [
  'dashboard',
  'chart',
  'detail',
  'export',
  'notification',
  'search',
  'navigation',
];

export function auditPrivacySurfaceCoverage(
  surfaces: readonly PrivacySurfaceCoverageItem[],
  requiredAreas: readonly SensitiveSurfaceArea[] = REQUIRED_PRIVACY_SURFACE_AREAS,
): PrivacyCoverageAudit {
  const coveredAreas = requiredAreas.filter((area) =>
    surfaces.some((surface) => surface.area === area),
  );
  const uncoveredAreas = requiredAreas.filter((area) => !coveredAreas.includes(area));
  const sensitiveSurfaces = surfaces.filter((surface) => surface.categories.length > 0);
  const missingMaskingIds = sensitiveSurfaces
    .filter((surface) => surface.area !== 'export' && surface.maskingBehavior === 'none')
    .map((surface) => surface.id);
  const missingExportRedactionIds = sensitiveSurfaces
    .filter((surface) => surface.area === 'export')
    .filter(
      (surface) =>
        surface.maskingBehavior !== 'redacted_on_export' ||
        surface.exportRedactionExplicit !== true,
    )
    .map((surface) => surface.id);

  return {
    complete:
      uncoveredAreas.length === 0 &&
      missingMaskingIds.length === 0 &&
      missingExportRedactionIds.length === 0,
    missingMaskingIds,
    missingExportRedactionIds,
    coveredAreas,
    uncoveredAreas,
  };
}

export function privacySurface(
  id: string,
  area: SensitiveSurfaceArea,
  categories: readonly SensitiveSurfaceCategory[],
  maskingBehavior: PrivacySurfaceCoverageItem['maskingBehavior'],
  exportRedactionExplicit = false,
): PrivacySurfaceCoverageItem {
  return { id, area, categories, maskingBehavior, exportRedactionExplicit };
}
