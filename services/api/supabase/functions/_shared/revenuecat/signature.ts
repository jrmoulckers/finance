// SPDX-License-Identifier: BUSL-1.1

import { timingSafeEqual } from '../crypto.ts';

export const REVENUECAT_SIGNATURE_TOLERANCE_SECONDS = 300;

export interface RevenueCatSignature {
  timestamp: number;
  signatures: readonly string[];
}

export function parseRevenueCatSignature(value: string | null): RevenueCatSignature | null {
  if (!value) return null;

  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const component of value.split(',')) {
    const [key, ...valueParts] = component.trim().split('=');
    const fieldValue = valueParts.join('=');
    if (key === 't') {
      if (timestamp !== undefined || !/^\d+$/.test(fieldValue)) return null;
      timestamp = Number(fieldValue);
    } else if (key === 'v1') {
      if (!/^[a-fA-F0-9]{64}$/.test(fieldValue)) return null;
      signatures.push(fieldValue.toLowerCase());
    }
  }

  if (!Number.isSafeInteger(timestamp) || signatures.length === 0) return null;
  return { timestamp: timestamp!, signatures };
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sign(secret: string, timestamp: number, rawBody: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${timestamp}.`);
  const signedPayload = new Uint8Array(prefix.length + rawBody.length);
  signedPayload.set(prefix);
  signedPayload.set(rawBody, prefix.length);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, signedPayload));
}

export async function verifyRevenueCatWebhook(
  headers: Headers,
  rawBody: Uint8Array,
  expectedAuthorization: string,
  signatureSecrets: readonly string[],
  nowMs: number = Date.now(),
): Promise<boolean> {
  const authorization = headers.get('authorization');
  if (!authorization || !(await timingSafeEqual(authorization, expectedAuthorization))) {
    return false;
  }

  const parsed = parseRevenueCatSignature(headers.get('x-revenuecat-webhook-signature'));
  if (!parsed) return false;

  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > REVENUECAT_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  let verified = false;
  for (const secret of signatureSecrets) {
    const expected = await sign(secret, parsed.timestamp, rawBody);
    for (const candidate of parsed.signatures) {
      verified = (await timingSafeEqual(expected, candidate)) || verified;
    }
  }
  return verified;
}

export async function createRevenueCatTestSignature(
  secret: string,
  timestamp: number,
  rawBody: Uint8Array,
): Promise<string> {
  return sign(secret, timestamp, rawBody);
}
