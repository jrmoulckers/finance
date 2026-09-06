// SPDX-License-Identifier: BUSL-1.1

const encoder = new TextEncoder();

export type StripeSignatureFailure = 'missing' | 'malformed' | 'stale' | 'mismatch';

export class StripeSignatureError extends Error {
  constructor(readonly failure: StripeSignatureFailure) {
    super('Stripe signature verification failed');
    this.name = 'StripeSignatureError';
  }
}

interface ParsedSignature {
  timestamp: number;
  signatures: Uint8Array[];
}

export async function verifyStripeSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecrets: readonly string[];
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<void> {
  const parsed = parseSignatureHeader(input.signatureHeader);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const toleranceSeconds = input.toleranceSeconds ?? 300;

  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    throw new StripeSignatureError('stale');
  }

  const payload = `${parsed.timestamp}.${input.rawBody}`;
  const secrets = input.webhookSecrets.filter((secret) => secret.length > 0);
  for (const secret of secrets) {
    const expected = await hmacSha256(secret, payload);
    for (const provided of parsed.signatures) {
      if (constantTimeEqual(expected, provided)) return;
    }
  }

  throw new StripeSignatureError('mismatch');
}

export async function createStripeTestSignature(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  return bytesToHex(await hmacSha256(secret, `${timestamp}.${rawBody}`));
}

function parseSignatureHeader(header: string | null): ParsedSignature {
  if (!header) throw new StripeSignatureError('missing');

  let timestamp: number | null = null;
  const signatures: Uint8Array[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && timestamp === null && /^\d+$/.test(value ?? '')) {
      timestamp = Number(value);
    } else if (key === 'v1' && /^[a-f0-9]{64}$/i.test(value ?? '')) {
      signatures.push(hexToBytes(value));
    }
  }

  if (timestamp === null || !Number.isSafeInteger(timestamp) || signatures.length === 0) {
    throw new StripeSignatureError('malformed');
  }
  return { timestamp, signatures };
}

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function bytesToHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
