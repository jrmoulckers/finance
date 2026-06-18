// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  getReceiptImageMetadata,
  hasSensitiveReceiptToken,
  isReceiptImagePath,
  sanitizeReceiptCacheUrl,
} from './receiptImagePolicy';

describe('receipt image policy', () => {
  it('detects receipt and attachment image paths', () => {
    expect(isReceiptImagePath('/receipts/r-1/thumb.webp')).toBe(true);
    expect(isReceiptImagePath('/attachments/r-1/photo.jpg')).toBe(true);
    expect(isReceiptImagePath('/assets/logo.png')).toBe(false);
  });

  it('strips auth-bearing query parameters from cache keys', () => {
    const url = new URL(
      'https://finance.example/receipts/r-1/thumb.jpg?token=secret&w=160&X-Amz-Signature=sig',
    );

    expect(hasSensitiveReceiptToken(url)).toBe(true);
    expect(sanitizeReceiptCacheUrl(url)).toBe(
      'https://finance.example/receipts/r-1/thumb.jpg?w=160',
    );
  });

  it('extracts lazy receipt metadata from transaction custom fields', () => {
    expect(
      getReceiptImageMetadata(
        { receiptThumbnailUrl: '/receipts/r-1/thumb.webp', receiptUploadStatus: 'cached' },
        'fallback',
      ),
    ).toEqual({ url: '/receipts/r-1/thumb.webp', status: 'cached', alt: 'fallback' });

    expect(getReceiptImageMetadata({ receiptUploadStatus: 'pending' }, 'fallback').status).toBe(
      'pending-upload',
    );
  });
});
