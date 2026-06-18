// SPDX-License-Identifier: BUSL-1.1

export type WebVitalName = 'LCP' | 'INP' | 'CLS' | 'TBT' | 'FCP' | 'TTFB';
export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface WebVitalSampleInput {
  readonly name: WebVitalName;
  readonly value: number;
  readonly route: string;
  readonly viewportWidth: number | null;
  readonly effectiveConnectionType: string | null;
  readonly appVersion: string;
}

export interface TaggedWebVitalSample {
  readonly name: WebVitalName;
  readonly value: number;
  readonly route: string;
  readonly deviceClass: DeviceClass;
  readonly effectiveConnectionType: string;
  readonly appVersion: string;
}

export function createTaggedWebVitalSample(input: WebVitalSampleInput): TaggedWebVitalSample {
  return {
    name: input.name,
    value: input.value,
    route: sanitizeRoute(input.route),
    deviceClass: classifyDevice(input.viewportWidth),
    effectiveConnectionType: input.effectiveConnectionType ?? 'unknown',
    appVersion: input.appVersion,
  };
}

export function shouldSampleWebVital(sessionId: string, sampleRate: number): boolean {
  if (sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return stableHash(sessionId) / 0xffffffff < sampleRate;
}

export function sanitizeRoute(route: string): string {
  const path = route.split('?')[0] ?? route;
  return path
    .replace(/\/transactions\/[^/]+/g, '/transactions/:id')
    .replace(/\/accounts\/[^/]+/g, '/accounts/:id')
    .replace(/\/budgets\/[^/]+/g, '/budgets/:id')
    .replace(/\/investments\/[^/]+/g, '/investments/:id');
}

function classifyDevice(width: number | null): DeviceClass {
  if (width === null || !Number.isFinite(width)) return 'unknown';
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
