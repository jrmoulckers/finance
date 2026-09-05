// SPDX-License-Identifier: BUSL-1.1

/**
 * Fail-closed direct transport for server-side HTTP requests.
 *
 * Standard Deno fetch cannot pin a validated DNS answer while preserving TLS
 * hostname verification. The direct transport therefore rejects every DNS
 * hostname and only sends to globally routable IP literals. Keep callers behind
 * OutboundHttpTransport so an explicitly trusted, network-enforced egress proxy
 * can support hostname destinations without changing delivery code.
 */

/** Minimal fetch signature used by the direct outbound transport. */
export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Transport boundary for outbound requests. */
export interface OutboundHttpTransport {
  /**
   * Send a request after enforcing the transport's destination policy.
   *
   * Implementations must reject redirects or validate every redirect target.
   */
  send(url: string, init: RequestInit): Promise<Response>;
}

/** Dependencies for the direct transport; injectable for deterministic tests. */
export interface DirectOutboundTransportDependencies {
  fetch?: FetchImplementation;
}

/** A destination was malformed or cannot be reached safely by the direct transport. */
export class OutboundDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundDestinationError';
  }
}

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // "this" network and unspecified
  [0x0a000000, 8], // private
  [0x64400000, 10], // carrier-grade NAT, including Alibaba metadata
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, including common metadata services
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // documentation
  [0xc0586300, 24], // deprecated 6to4 relay anycast
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmark testing
  [0xc6336400, 24], // documentation
  [0xcb007100, 24], // documentation
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved and limited broadcast
  [0xa83f8110, 32], // Azure platform virtual IP
];

const BLOCKED_IPV6_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::ffff:0:0', 96], // IPv4-mapped
  ['2001::', 32], // Teredo
  ['2001:2::', 48], // benchmark testing
  ['2001:10::', 28], // deprecated ORCHID
  ['2001:20::', 28], // ORCHIDv2
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // deprecated 6to4
  ['3fff::', 20], // documentation
];

/**
 * Validate a URL for the direct outbound transport.
 *
 * The returned URL is canonicalized by the platform URL parser, which handles
 * legacy IPv4 integer, octal, hexadecimal, and shortened textual forms.
 * DNS hostnames are deliberately rejected because fetch would resolve them
 * again at connection time, creating a DNS-rebinding window.
 */
export function validateOutboundDestination(rawUrl: string): URL {
  let destination: URL;
  try {
    destination = new URL(rawUrl);
  } catch {
    throw new OutboundDestinationError('Invalid outbound URL');
  }

  if (destination.protocol !== 'https:') {
    throw new OutboundDestinationError('Outbound URL must use HTTPS');
  }

  if (destination.username || destination.password) {
    throw new OutboundDestinationError('Outbound URL credentials are not allowed');
  }

  const hostname = normalizeHostname(destination.hostname);
  if (!hostname) {
    throw new OutboundDestinationError('Outbound URL must include a hostname');
  }

  const literalAddress = parseIpAddress(hostname);
  if (literalAddress === null) {
    throw new OutboundDestinationError(
      'Direct outbound destinations must use a globally routable IP literal',
    );
  }

  if (isBlockedIpAddress(literalAddress)) {
    throw new OutboundDestinationError('Outbound destination address is not allowed');
  }

  return destination;
}

/**
 * Create the default direct-network transport.
 *
 * DNS hostnames are denied before fetch, so this path has no validation-to-use
 * DNS race. Redirects are always disabled. A future trusted egress-proxy
 * transport can implement OutboundHttpTransport and enforce hostname policy at
 * the network boundary.
 */
export function createDirectOutboundTransport(
  dependencies: DirectOutboundTransportDependencies = {},
): OutboundHttpTransport {
  const fetchImplementation = dependencies.fetch ?? fetch;

  return {
    async send(url: string, init: RequestInit): Promise<Response> {
      const destination = validateOutboundDestination(url);
      return await fetchImplementation(destination, {
        ...init,
        redirect: 'manual',
      });
    },
  };
}

/** Default production transport; it never sends requests to DNS hostnames. */
export const directOutboundTransport = createDirectOutboundTransport();

function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

function parseIpAddress(address: string): number | bigint | null {
  const normalized = normalizeHostname(address);
  return normalized.includes(':') ? parseIpv6(normalized) : parseIpv4(normalized);
}

function parseIpv4(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function parseIpv6(address: string): bigint | null {
  if (address.includes('%')) return null;

  const expandedAddress = expandIpv4Tail(address);
  if (expandedAddress === null) return null;

  const doubleColonParts = expandedAddress.split('::');
  if (doubleColonParts.length > 2) return null;

  const left = splitIpv6Side(doubleColonParts[0]);
  const right = splitIpv6Side(doubleColonParts[1] ?? '');
  if (left === null || right === null) return null;

  const omittedCount = 8 - left.length - right.length;
  if (
    (doubleColonParts.length === 1 && omittedCount !== 0) ||
    (doubleColonParts.length === 2 && omittedCount < 1)
  ) {
    return null;
  }

  const groups = [...left, ...Array<bigint>(omittedCount).fill(0n), ...right];
  if (groups.length !== 8) return null;

  return groups.reduce((value, group) => (value << 16n) | group, 0n);
}

function expandIpv4Tail(address: string): string | null {
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (!tail.includes('.')) return address;

  const ipv4 = parseIpv4(tail);
  if (ipv4 === null) return null;

  const high = Math.floor(ipv4 / 0x10000).toString(16);
  const low = (ipv4 % 0x10000).toString(16);
  return `${address.slice(0, lastColon + 1)}${high}:${low}`;
}

function splitIpv6Side(side: string): bigint[] | null {
  if (!side) return [];

  const groups: bigint[] = [];
  for (const group of side.split(':')) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    groups.push(BigInt(`0x${group}`));
  }
  return groups;
}

function isBlockedIpAddress(address: number | bigint): boolean {
  if (typeof address === 'number') {
    return BLOCKED_IPV4_RANGES.some(([network, prefix]) => isIpv4InRange(address, network, prefix));
  }

  // Only globally routable unicast (2000::/3) is eligible.
  if (!isIpv6InRange(address, parseIpv6('2000::')!, 3)) {
    return true;
  }

  return BLOCKED_IPV6_RANGES.some(([network, prefix]) =>
    isIpv6InRange(address, parseIpv6(network)!, prefix),
  );
}

function isIpv4InRange(address: number, network: number, prefix: number): boolean {
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(address / blockSize) === Math.floor(network / blockSize);
}

function isIpv6InRange(address: bigint, network: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return address >> shift === network >> shift;
}
