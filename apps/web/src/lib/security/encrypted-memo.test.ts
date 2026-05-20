// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  batchProcessMemosForExport,
  decryptMemo,
  encryptMemo,
  isRedacted,
  processMemoForExport,
  redactMemo,
} from './encrypted-memo';
import type { EncryptedMemo } from './types';

describe('encrypted-memo', () => {
  describe('encryptMemo', () => {
    it('encrypts a memo and returns EncryptedMemo', () => {
      const result = encryptMemo('Grocery shopping at Trader Joes');
      expect(result.ciphertext).toBeTruthy();
      expect(result.iv).toBeTruthy();
      expect(result.algorithm).toBe('placeholder-base64');
      expect(result.encryptedAt).toBeTruthy();
    });

    it('produces different ciphertext than plaintext', () => {
      const plaintext = 'Secret memo content';
      const result = encryptMemo(plaintext);
      expect(result.ciphertext).not.toBe(plaintext);
    });

    it('throws on empty memo', () => {
      expect(() => encryptMemo('')).toThrow('Cannot encrypt an empty memo');
    });
  });

  describe('decryptMemo', () => {
    it('decrypts back to original plaintext', () => {
      const plaintext = 'Payment for rent - $1,500';
      const encrypted = encryptMemo(plaintext);
      const decrypted = decryptMemo(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('handles unicode content', () => {
      const plaintext = 'Pago de renta — €500 für die Miete 日本語テスト';
      const encrypted = encryptMemo(plaintext);
      const decrypted = decryptMemo(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('throws on unsupported algorithm', () => {
      const memo: EncryptedMemo = {
        ciphertext: 'test',
        iv: 'test',
        algorithm: 'aes-256-gcm',
        encryptedAt: new Date().toISOString(),
      };
      expect(() => decryptMemo(memo)).toThrow('Unsupported algorithm');
    });
  });

  describe('redactMemo', () => {
    it('returns [REDACTED] marker', () => {
      const encrypted = encryptMemo('Secret content');
      expect(redactMemo(encrypted)).toBe('[REDACTED]');
    });
  });

  describe('isRedacted', () => {
    it('detects redacted text', () => {
      expect(isRedacted('[REDACTED]')).toBe(true);
    });

    it('returns false for non-redacted text', () => {
      expect(isRedacted('Some normal text')).toBe(false);
    });
  });

  describe('processMemoForExport', () => {
    it('returns null when memos are excluded', () => {
      const encrypted = encryptMemo('Test');
      const result = processMemoForExport(encrypted, {
        includeMemos: false,
        redactMemos: false,
      });
      expect(result).toBeNull();
    });

    it('returns redacted text when redaction is enabled', () => {
      const encrypted = encryptMemo('Secret data');
      const result = processMemoForExport(encrypted, {
        includeMemos: true,
        redactMemos: true,
      });
      expect(result).toBe('[REDACTED]');
    });

    it('returns decrypted text when included without redaction', () => {
      const plaintext = 'Visible memo';
      const encrypted = encryptMemo(plaintext);
      const result = processMemoForExport(encrypted, {
        includeMemos: true,
        redactMemos: false,
      });
      expect(result).toBe(plaintext);
    });
  });

  describe('batchProcessMemosForExport', () => {
    it('processes multiple memos', () => {
      const memos = [encryptMemo('Memo 1'), encryptMemo('Memo 2'), encryptMemo('Memo 3')];

      const results = batchProcessMemosForExport(memos, {
        includeMemos: true,
        redactMemos: false,
      });
      expect(results).toEqual(['Memo 1', 'Memo 2', 'Memo 3']);
    });

    it('excludes all memos when not included', () => {
      const memos = [encryptMemo('Memo 1'), encryptMemo('Memo 2')];
      const results = batchProcessMemosForExport(memos, {
        includeMemos: false,
        redactMemos: false,
      });
      expect(results).toHaveLength(0);
    });

    it('redacts all memos when redaction is enabled', () => {
      const memos = [encryptMemo('Secret 1'), encryptMemo('Secret 2')];
      const results = batchProcessMemosForExport(memos, {
        includeMemos: true,
        redactMemos: true,
      });
      expect(results).toEqual(['[REDACTED]', '[REDACTED]']);
    });
  });
});
