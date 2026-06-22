// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  applyBaseToWebManifest,
  normalizeManifestBasePath,
  type WebManifest,
} from '../manifest-base';

const ROOT_MANIFEST: WebManifest = {
  id: '/?source=pwa',
  name: 'Finance',
  scope: '/',
  start_url: '/?source=pwa',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};

describe('normalizeManifestBasePath', () => {
  it('treats root-like values as "/"', () => {
    expect(normalizeManifestBasePath('/')).toBe('/');
    expect(normalizeManifestBasePath('')).toBe('/');
    expect(normalizeManifestBasePath(undefined)).toBe('/');
    expect(normalizeManifestBasePath('./')).toBe('/');
  });

  it('normalizes subpaths to a leading-and-trailing slash form', () => {
    expect(normalizeManifestBasePath('/finance')).toBe('/finance/');
    expect(normalizeManifestBasePath('finance/')).toBe('/finance/');
    expect(normalizeManifestBasePath('https://jrmoulckers.github.io/finance/')).toBe('/finance/');
  });
});

describe('applyBaseToWebManifest', () => {
  it('returns the manifest unchanged for a root base', () => {
    expect(applyBaseToWebManifest(ROOT_MANIFEST, '/')).toBe(ROOT_MANIFEST);
  });

  it('rewrites scope, start_url, id and icon src under a subpath base', () => {
    const result = applyBaseToWebManifest(ROOT_MANIFEST, '/finance/');

    expect(result.scope).toBe('/finance/');
    expect(result.start_url).toBe('/finance/?source=pwa');
    expect(result.id).toBe('/finance/?source=pwa');
    expect(result.icons?.map((icon) => icon.src)).toEqual([
      '/finance/icons/icon-192.png',
      '/finance/icons/icon-512.png',
    ]);
  });

  it('does not mutate the input manifest', () => {
    const input: WebManifest = { ...ROOT_MANIFEST, icons: [...(ROOT_MANIFEST.icons ?? [])] };
    applyBaseToWebManifest(input, '/finance/');

    expect(input.scope).toBe('/');
    expect(input.start_url).toBe('/?source=pwa');
    expect(input.icons?.[0]?.src).toBe('/icons/icon-192.png');
  });

  it('is idempotent — already-based paths are left intact', () => {
    const once = applyBaseToWebManifest(ROOT_MANIFEST, '/finance/');
    const twice = applyBaseToWebManifest(once, '/finance/');

    expect(twice.scope).toBe('/finance/');
    expect(twice.start_url).toBe('/finance/?source=pwa');
    expect(twice.icons?.map((icon) => icon.src)).toEqual([
      '/finance/icons/icon-192.png',
      '/finance/icons/icon-512.png',
    ]);
  });

  it('normalizes a base supplied without a trailing slash', () => {
    const result = applyBaseToWebManifest(ROOT_MANIFEST, '/finance');
    expect(result.scope).toBe('/finance/');
    expect(result.start_url).toBe('/finance/?source=pwa');
  });

  it('leaves non-root (external/relative) values untouched', () => {
    const manifest: WebManifest = {
      scope: '/',
      start_url: '/?source=pwa',
      icons: [{ src: 'https://cdn.example.com/icon.png' }, { src: 'relative/icon.png' }],
    };
    const result = applyBaseToWebManifest(manifest, '/finance/');

    expect(result.icons?.map((icon) => icon.src)).toEqual([
      'https://cdn.example.com/icon.png',
      'relative/icon.png',
    ]);
  });
});
