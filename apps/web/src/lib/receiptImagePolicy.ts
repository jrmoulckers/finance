// SPDX-License-Identifier: BUSL-1.1

export const RECEIPT_CACHE_NAME_PREFIX = 'finance-receipts';
export const RECEIPT_CACHE_MAX_ENTRIES = 120;

const RECEIPT_PATH_PATTERN = /\/(receipts?|attachments?)\//i;
const RECEIPT_IMAGE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|webp)$/i;
const SENSITIVE_QUERY_PARAMS = new Set([
  'access_token',
  'authorization',
  'expires',
  'key',
  'policy',
  'signature',
  'sig',
  'token',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature',
]);

export interface ReceiptImageMetadata {
  readonly url: string | null;
  readonly status: 'cached' | 'pending-upload' | 'unavailable' | 'remote' | 'none';
  readonly alt: string;
}

export function isReceiptImagePath(pathname: string): boolean {
  return RECEIPT_PATH_PATTERN.test(pathname) && RECEIPT_IMAGE_EXTENSION_PATTERN.test(pathname);
}

export function sanitizeReceiptCacheUrl(input: URL): string {
  const url = new URL(input.toString());
  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.hash = '';
  return url.toString();
}

export function hasSensitiveReceiptToken(input: URL): boolean {
  for (const key of input.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function getReceiptImageMetadata(
  customFields: Readonly<Record<string, string>> | null | undefined,
  fallbackAlt: string,
): ReceiptImageMetadata {
  const fields = customFields ?? {};
  const url =
    fields.receiptThumbnailUrl ??
    fields.receiptThumbnailURL ??
    fields.receiptImageUrl ??
    fields.receiptImageURL ??
    fields.receiptUrl ??
    fields.receiptURL ??
    fields.merchantLogoUrl ??
    null;

  const rawStatus = (fields.receiptUploadStatus ?? fields.receiptStatus ?? '').toLowerCase();
  const status =
    rawStatus === 'pending' || rawStatus === 'pending-upload'
      ? 'pending-upload'
      : rawStatus === 'cached'
        ? 'cached'
        : rawStatus === 'unavailable' || rawStatus === 'missing'
          ? 'unavailable'
          : url
            ? 'remote'
            : 'none';

  return {
    url,
    status,
    alt: fields.receiptAltText ?? fields.receiptDescription ?? fallbackAlt,
  };
}
