// SPDX-License-Identifier: BUSL-1.1

import { parseReceiptText, type ExtractedReceiptText } from './receipt-parser';

export interface ReceiptOcrAdapter {
  /** Runs OCR entirely on this device and returns parsed receipt text. */
  extract(file: File | Blob): Promise<ExtractedReceiptText>;
}

interface TesseractRecognizeResult {
  readonly data: {
    readonly text: string;
    readonly confidence?: number;
  };
}

interface TesseractModule {
  recognize(image: File | Blob, language?: string): Promise<TesseractRecognizeResult>;
}

/**
 * Browser receipt OCR adapter backed by Tesseract.js WASM.
 *
 * Invariant: this adapter never calls an app backend. The only runtime work is
 * a dynamic local module load plus Tesseract's browser worker/WASM execution.
 */
export class TesseractReceiptOcrAdapter implements ReceiptOcrAdapter {
  async extract(file: File | Blob): Promise<ExtractedReceiptText> {
    const tesseract = (await import('tesseract.js')) as unknown as TesseractModule;
    const result = await tesseract.recognize(file, 'eng');
    return parseReceiptText(result.data.text, { ocrConfidence: result.data.confidence });
  }
}

/** Default web OCR adapter. */
export const webReceiptOcrAdapter: ReceiptOcrAdapter = new TesseractReceiptOcrAdapter();
