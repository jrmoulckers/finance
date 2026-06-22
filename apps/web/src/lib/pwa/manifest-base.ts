// SPDX-License-Identifier: BUSL-1.1

/**
 * Base-path rewriting for the PWA Web App Manifest.
 *
 * `public/manifest.json` is copied verbatim into the build output, so its
 * absolute paths (`scope`, `start_url`, `id`, icon `src`) stay pinned to the
 * site root. That is correct for the default root deploy, but GitHub Pages
 * project sites serve the app under a subpath (`/finance/`), where a root
 * `scope`/`start_url` no longer matches the registered service-worker scope
 * and the PWA becomes non-installable (#2797).
 *
 * {@link applyBaseToWebManifest} rewrites those absolute paths to incorporate
 * the configured Vite base so the manifest, the service-worker scope, and the
 * precached app shell all agree on `/finance/`. The build wires this into a
 * Vite `closeBundle` step (see `vite.config.ts`).
 */

export interface WebManifestIcon {
  readonly src?: string;
  readonly [key: string]: unknown;
}

export interface WebManifest {
  id?: string;
  scope?: string;
  start_url?: string;
  icons?: WebManifestIcon[];
  [key: string]: unknown;
}

/**
 * Normalize a Vite `base` value to a leading-and-trailing-slash path, e.g.
 * `/finance` / `finance/` / `https://host/finance/` all become `/finance/`.
 * A root base resolves to `/`.
 */
export function normalizeManifestBasePath(basePath: string | undefined): string {
  const trimmed = basePath?.trim();
  if (!trimmed || trimmed === '/' || trimmed === '.' || trimmed === './') {
    return '/';
  }

  let pathname = trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    pathname = new URL(trimmed).pathname;
  }

  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

/**
 * Return a copy of `manifest` whose root-absolute paths are rewritten to live
 * under `basePath`. A root base (`/`) returns the manifest unchanged.
 *
 * Only root-absolute values (`/...`) that are not already prefixed with the
 * base are rewritten — external URLs and already-based paths are left intact,
 * making the transform idempotent.
 */
export function applyBaseToWebManifest(manifest: WebManifest, basePath: string): WebManifest {
  const base = normalizeManifestBasePath(basePath);
  if (base === '/') {
    return manifest;
  }

  const withBase = (value: string): string => {
    if (!value.startsWith('/') || value.startsWith(base)) {
      return value;
    }
    return `${base}${value.replace(/^\/+/, '')}`;
  };

  const next: WebManifest = { ...manifest };

  // The PWA scope must equal the service-worker scope (the Vite base).
  if (typeof next.scope === 'string') {
    next.scope = base;
  }
  if (typeof next.start_url === 'string') {
    next.start_url = withBase(next.start_url);
  }
  if (typeof next.id === 'string') {
    next.id = withBase(next.id);
  }
  if (Array.isArray(next.icons)) {
    next.icons = next.icons.map((icon) =>
      icon && typeof icon.src === 'string' ? { ...icon, src: withBase(icon.src) } : icon,
    );
  }

  return next;
}
