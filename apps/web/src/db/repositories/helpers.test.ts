// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { Currencies, cents } from '../../kmp/bridge';
import type { Row } from '../sqlite-wasm';
import {
  createLikePattern,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  parseTags,
  requireNumber,
  requireString,
  serializeTags,
  toBoolean,
} from './helpers';

describe('helpers', () => {
  describe('requireString', () => {
    it('should return string value as-is', () => {
      expect(requireString('hello', 'field')).toBe('hello');
      expect(requireString('', 'field')).toBe('');
    });

    it('should convert non-string values to string', () => {
      expect(requireString(123, 'field')).toBe('123');
      expect(requireString(true, 'field')).toBe('true');
    });

    it('should throw on null', () => {
      expect(() => requireString(null, 'test.field')).toThrow('Missing required field: test.field');
    });

    it('should throw on undefined', () => {
      expect(() => requireString(undefined, 'test.field')).toThrow(
        'Missing required field: test.field',
      );
    });
  });

  describe('requireNumber', () => {
    it('should return number value as-is', () => {
      expect(requireNumber(42, 'field')).toBe(42);
      expect(requireNumber(0, 'field')).toBe(0);
      expect(requireNumber(-100, 'field')).toBe(-100);
      expect(requireNumber(3.14, 'field')).toBe(3.14);
    });

    it('should convert bigint to number', () => {
      expect(requireNumber(100n, 'field')).toBe(100);
      expect(requireNumber(0n, 'field')).toBe(0);
    });

    it('should parse numeric string', () => {
      expect(requireNumber('123', 'field')).toBe(123);
      expect(requireNumber('-456', 'field')).toBe(-456);
      expect(requireNumber('78.9', 'field')).toBe(78.9);
    });

    it('should throw on non-numeric string', () => {
      expect(() => requireNumber('abc', 'test.field')).toThrow('Invalid numeric field: test.field');
    });

    it('should throw on empty or whitespace string', () => {
      expect(() => requireNumber('', 'field')).toThrow('Invalid numeric field: field');
      expect(() => requireNumber('   ', 'field')).toThrow('Invalid numeric field: field');
    });

    it('should throw on null', () => {
      expect(() => requireNumber(null, 'field')).toThrow('Invalid numeric field: field');
    });

    it('should throw on undefined', () => {
      expect(() => requireNumber(undefined, 'field')).toThrow('Invalid numeric field: field');
    });
  });

  describe('optionalString', () => {
    it('should return string value as-is', () => {
      expect(optionalString('hello')).toBe('hello');
      expect(optionalString('')).toBe('');
    });

    it('should return null for null', () => {
      expect(optionalString(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(optionalString(undefined)).toBeNull();
    });

    it('should convert non-string values to string', () => {
      expect(optionalString(123)).toBe('123');
      expect(optionalString(true)).toBe('true');
      expect(optionalString(false)).toBe('false');
    });
  });

  describe('toBoolean', () => {
    it('should return boolean value as-is', () => {
      expect(toBoolean(true)).toBe(true);
      expect(toBoolean(false)).toBe(false);
    });

    it('should convert number 1 to true', () => {
      expect(toBoolean(1)).toBe(true);
    });

    it('should convert number 0 to false', () => {
      expect(toBoolean(0)).toBe(false);
    });

    it('should convert non-zero numbers to true', () => {
      expect(toBoolean(42)).toBe(true);
      expect(toBoolean(-1)).toBe(true);
    });

    it('should convert bigint 1n to true', () => {
      expect(toBoolean(1n)).toBe(true);
    });

    it('should convert bigint 0n to false', () => {
      expect(toBoolean(0n)).toBe(false);
    });

    it('should convert string "1" to true', () => {
      expect(toBoolean('1')).toBe(true);
    });

    it('should convert string "true" to true (case-insensitive)', () => {
      expect(toBoolean('true')).toBe(true);
      expect(toBoolean('TRUE')).toBe(true);
      expect(toBoolean('True')).toBe(true);
    });

    it('should convert string "0" to false', () => {
      expect(toBoolean('0')).toBe(false);
    });

    it('should convert string "false" to false', () => {
      expect(toBoolean('false')).toBe(false);
      expect(toBoolean('FALSE')).toBe(false);
    });

    it('should convert other strings to false', () => {
      expect(toBoolean('hello')).toBe(false);
      expect(toBoolean('')).toBe(false);
    });

    it('should convert null to false', () => {
      expect(toBoolean(null)).toBe(false);
    });

    it('should convert undefined to false', () => {
      expect(toBoolean(undefined)).toBe(false);
    });
  });

  describe('mapCurrency', () => {
    it('should map known currency codes', () => {
      expect(mapCurrency('USD')).toEqual(Currencies.USD);
      expect(mapCurrency('EUR')).toEqual(Currencies.EUR);
      expect(mapCurrency('GBP')).toEqual(Currencies.GBP);
    });

    it('should be case-insensitive', () => {
      expect(mapCurrency('usd')).toEqual(Currencies.USD);
      expect(mapCurrency('Eur')).toEqual(Currencies.EUR);
    });

    it('should return fallback for unknown currency', () => {
      const result = mapCurrency('XYZ');
      expect(result).toEqual({ code: 'XYZ', decimalPlaces: 2 });
    });

    it('should throw if value is not a string', () => {
      expect(() => mapCurrency(null)).toThrow();
      expect(() => mapCurrency(undefined)).toThrow();
    });
  });

  describe('mapCents', () => {
    it('should map numeric amount to Cents object', () => {
      const result = mapCents(12345, 'field');
      expect(result).toEqual(cents(12345));
      expect(result.amount).toBe(12345);
    });

    it('should preserve integer amounts', () => {
      const result = mapCents(100, 'field');
      expect(Number.isInteger(result.amount)).toBe(true);
      expect(result.amount).toBe(100);
    });

    it('should handle negative amounts', () => {
      const result = mapCents(-5000, 'field');
      expect(result.amount).toBe(-5000);
    });

    it('should handle zero', () => {
      const result = mapCents(0, 'field');
      expect(result.amount).toBe(0);
    });

    it('should convert string to number', () => {
      const result = mapCents('999', 'field');
      expect(result.amount).toBe(999);
    });

    it('should throw on invalid input', () => {
      expect(() => mapCents(null, 'field')).toThrow();
      expect(() => mapCents('abc', 'field')).toThrow();
    });
  });

  describe('mapSyncMetadata', () => {
    it('should map sync metadata fields', () => {
      const row: Row = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T12:34:56Z',
        deleted_at: null,
        sync_version: 5,
        is_synced: 1,
      };

      const result = mapSyncMetadata(row);

      expect(result).toEqual({
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T12:34:56Z',
        deletedAt: null,
        syncVersion: 5,
        isSynced: true,
      });
    });

    it('should handle deleted_at timestamp', () => {
      const row: Row = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        deleted_at: '2024-01-03T00:00:00Z',
        sync_version: 2,
        is_synced: 0,
      };

      const result = mapSyncMetadata(row);

      expect(result.deletedAt).toBe('2024-01-03T00:00:00Z');
      expect(result.isSynced).toBe(false);
    });
  });

  describe('serializeTags', () => {
    it('should serialize empty array', () => {
      expect(serializeTags([])).toBe('[]');
    });

    it('should serialize array of strings', () => {
      expect(serializeTags(['tag1', 'tag2', 'tag3'])).toBe('["tag1","tag2","tag3"]');
    });

    it('should handle single tag', () => {
      expect(serializeTags(['solo'])).toBe('["solo"]');
    });

    it('should produce valid JSON', () => {
      const tags = ['food', 'restaurant', 'dinner'];
      const serialized = serializeTags(tags);
      const parsed = JSON.parse(serialized);
      expect(parsed).toEqual(tags);
    });

    it('should handle tags with special characters', () => {
      const tags = ['tag with spaces', 'tag"with"quotes', "tag'with'apostrophes"];
      const serialized = serializeTags(tags);
      const parsed = JSON.parse(serialized);
      expect(parsed).toEqual(tags);
    });
  });

  describe('parseTags', () => {
    it('should parse empty array', () => {
      expect(parseTags('[]')).toEqual([]);
    });

    it('should parse array of strings', () => {
      expect(parseTags('["tag1","tag2","tag3"]')).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty array for null', () => {
      expect(parseTags(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(parseTags(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(parseTags('')).toEqual([]);
      expect(parseTags('   ')).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      expect(parseTags('not json')).toEqual([]);
      expect(parseTags('{"invalid": true}')).toEqual([]);
    });

    it('should convert non-string array elements to strings', () => {
      expect(parseTags('[1, 2, true, null]')).toEqual(['1', '2', 'true', 'null']);
    });

    it('should return empty array for non-array JSON', () => {
      expect(parseTags('"just a string"')).toEqual([]);
      expect(parseTags('123')).toEqual([]);
      expect(parseTags('true')).toEqual([]);
    });

    it('should handle tags with special characters', () => {
      const tags = ['tag with spaces', 'tag"with"quotes'];
      const serialized = JSON.stringify(tags);
      expect(parseTags(serialized)).toEqual(tags);
    });
  });

  describe('createLikePattern', () => {
    it('should wrap search term with %', () => {
      expect(createLikePattern('coffee')).toBe('%coffee%');
    });

    it('should trim whitespace', () => {
      expect(createLikePattern('  coffee  ')).toBe('%coffee%');
    });

    it('should handle empty search after trim', () => {
      expect(createLikePattern('   ')).toBe('%%');
    });

    it('should not escape SQL wildcards (basic LIKE)', () => {
      // Basic implementation - does not escape % or _
      expect(createLikePattern('100%')).toBe('%100%%');
      expect(createLikePattern('test_value')).toBe('%test_value%');
    });

    it('should handle special characters', () => {
      expect(createLikePattern("Bob's Store")).toBe("%Bob's Store%");
      expect(createLikePattern('price: $100')).toBe('%price: $100%');
    });
  });

  describe('edge cases', () => {
    it('should handle missing fields in rows', () => {
      const row: Row = {};

      expect(() => requireString(row.missing_field, 'missing')).toThrow();
      expect(() => requireNumber(row.missing_field, 'missing')).toThrow();
      expect(optionalString(row.missing_field)).toBeNull();
      expect(toBoolean(row.missing_field)).toBe(false);
    });

    it('should handle numeric strings with whitespace', () => {
      expect(requireNumber('  123  ', 'field')).toBe(123);
    });

    it('should handle very large numbers', () => {
      const large = 999999999999;
      expect(requireNumber(large, 'field')).toBe(large);
      expect(mapCents(large, 'field').amount).toBe(large);
    });

    it('should handle negative zero', () => {
      // In JavaScript, -0 === 0 but Object.is(-0, 0) is false
      // requireNumber returns -0 as-is which is fine for our use case
      const result = requireNumber(-0, 'field');
      expect(result === 0).toBe(true); // Use === instead of Object.is
      expect(toBoolean(-0)).toBe(false);
    });

    it('should preserve readonly arrays in tags', () => {
      const readonlyTags: readonly string[] = ['a', 'b', 'c'];
      const serialized = serializeTags(readonlyTags);
      expect(parseTags(serialized)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('monetary value integrity', () => {
    it('should always return integer amounts from mapCents', () => {
      const values = [0, 1, -1, 100, 12345, -99999];

      values.forEach((val) => {
        const result = mapCents(val, 'test');
        expect(Number.isInteger(result.amount)).toBe(true);
        expect(result.amount).toBe(val);
      });
    });

    it('should not convert cents to decimal', () => {
      // Ensure we're not dividing by 100 or doing any decimal conversion
      const result = mapCents(12345, 'field');
      expect(result.amount).toBe(12345);
      expect(result.amount).not.toBe(123.45);
    });
  });
});
