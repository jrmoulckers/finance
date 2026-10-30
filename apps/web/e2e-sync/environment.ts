// SPDX-License-Identifier: BUSL-1.1

function localUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Live sync proof only permits an HTTP loopback service origin.');
  }
  return url.origin;
}

/** Public local-only coordinates; never reads an environment/credential file. */
export function localSyncEnvironment() {
  return {
    supabaseUrl: localUrl(process.env.LOCAL_SYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321'),
    powerSyncUrl: localUrl(process.env.LOCAL_SYNC_POWERSYNC_URL ?? 'http://127.0.0.1:8080'),
    anonKey: process.env.LOCAL_SYNC_ANON_KEY?.trim() ?? '',
  };
}
