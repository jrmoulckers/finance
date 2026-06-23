// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  LOCAL_TIMESTAMP_FIELD_KEYS,
  applyLocalTimestampToCustomFields,
  captureFromInstant,
  captureNow,
  createLocalTimestamp,
  formatLocalTimestamp,
  formatTimeZoneLabel,
  formatTimeZoneOffset,
  getLocalCalendarDay,
  getTransactionLocalDay,
  getZoneOffsetMinutes,
  isLocalTimestampFieldKey,
  localTimestampFromCustomFields,
  localTimestampToCustomFields,
  normalizeLocalDateTime,
} from './local-timestamp';

describe('local-timestamp', () => {
  describe('captureFromInstant', () => {
    it('captures the merchant wall clock and east-positive offset for Bangkok', () => {
      // 2026-06-22T16:50:00Z === 2026-06-22 23:50 in Bangkok (UTC+7).
      const ts = captureFromInstant('2026-06-22T16:50:00.000Z', 'Asia/Bangkok');
      expect(ts).toEqual({
        localDateTime: '2026-06-22T23:50',
        timeZone: 'Asia/Bangkok',
        offsetMinutes: 420,
      });
    });

    it('returns null for an invalid instant', () => {
      expect(captureFromInstant('not-a-date', 'Asia/Bangkok')).toBeNull();
    });
  });

  describe('captureNow', () => {
    it('captures the supplied moment in the given zone', () => {
      const ts = captureNow('Asia/Bangkok', new Date('2026-06-22T16:50:00.000Z'));
      expect(ts.localDateTime).toBe('2026-06-22T23:50');
      expect(ts.timeZone).toBe('Asia/Bangkok');
      expect(ts.offsetMinutes).toBe(420);
    });
  });

  describe('getZoneOffsetMinutes', () => {
    it('is DST-aware for the same zone across the year', () => {
      // New York: EST (-300) in January, EDT (-240) in July.
      expect(getZoneOffsetMinutes('2026-01-15T12:00:00.000Z', 'America/New_York')).toBe(-300);
      expect(getZoneOffsetMinutes('2026-07-15T12:00:00.000Z', 'America/New_York')).toBe(-240);
      expect(getZoneOffsetMinutes('2026-06-22T16:50:00.000Z', 'Asia/Bangkok')).toBe(420);
    });
  });

  describe('createLocalTimestamp', () => {
    it('derives the offset for a wall-clock input from the zone (winter)', () => {
      const ts = createLocalTimestamp('2026-01-15T09:30', 'America/New_York');
      expect(ts).toEqual({
        localDateTime: '2026-01-15T09:30',
        timeZone: 'America/New_York',
        offsetMinutes: -300,
      });
    });

    it('derives the offset for a wall-clock input from the zone (summer/DST)', () => {
      const ts = createLocalTimestamp('2026-07-15T09:30', 'America/New_York');
      expect(ts?.offsetMinutes).toBe(-240);
    });

    it('keeps offset null when no zone is provided', () => {
      const ts = createLocalTimestamp('2026-06-22T23:50', null);
      expect(ts).toEqual({
        localDateTime: '2026-06-22T23:50',
        timeZone: null,
        offsetMinutes: null,
      });
    });

    it('returns null for unparsable input', () => {
      expect(createLocalTimestamp('', 'Asia/Bangkok')).toBeNull();
      expect(createLocalTimestamp('nonsense', 'Asia/Bangkok')).toBeNull();
    });
  });

  describe('normalizeLocalDateTime', () => {
    it('strips seconds and normalizes to minute precision', () => {
      expect(normalizeLocalDateTime('2026-06-22T23:50:17')).toBe('2026-06-22T23:50');
    });

    it('treats a bare date as midnight', () => {
      expect(normalizeLocalDateTime('2026-06-22')).toBe('2026-06-22T00:00');
    });

    it('returns null for missing or invalid values', () => {
      expect(normalizeLocalDateTime(null)).toBeNull();
      expect(normalizeLocalDateTime(undefined)).toBeNull();
      expect(normalizeLocalDateTime('garbage')).toBeNull();
    });
  });

  describe('getLocalCalendarDay', () => {
    it('returns the captured local day independent of the viewer time zone', () => {
      // A purchase just after midnight in Bangkok belongs to the Bangkok day,
      // even though the same instant is still the previous day in Lisbon.
      const instant = '2026-06-22T17:30:00.000Z';
      const bangkok = captureFromInstant(instant, 'Asia/Bangkok'); // 2026-06-23 00:30
      const lisbon = captureFromInstant(instant, 'Europe/Lisbon'); // 2026-06-22 18:30

      expect(getLocalCalendarDay(bangkok)).toBe('2026-06-23');
      expect(getLocalCalendarDay(lisbon)).toBe('2026-06-22');
      // The captured Bangkok day does not change when reviewed elsewhere.
      expect(getLocalCalendarDay(bangkok)).not.toBe(getLocalCalendarDay(lisbon));
    });

    it('handles the late-night day boundary (11:50 PM Bangkok stays same day)', () => {
      const ts = captureFromInstant('2026-06-22T16:50:00.000Z', 'Asia/Bangkok');
      expect(getLocalCalendarDay(ts)).toBe('2026-06-22');
    });

    it('falls back to the provided date when the timestamp is missing', () => {
      expect(getLocalCalendarDay(null, '2026-06-22')).toBe('2026-06-22');
      expect(getLocalCalendarDay(undefined, '2026-06-22')).toBe('2026-06-22');
      expect(getLocalCalendarDay(null)).toBeNull();
    });
  });

  describe('getTransactionLocalDay', () => {
    it('uses the captured local day from customFields', () => {
      const transaction = {
        date: '2026-06-22',
        customFields: {
          [LOCAL_TIMESTAMP_FIELD_KEYS.localDateTime]: '2026-06-23T00:30',
          [LOCAL_TIMESTAMP_FIELD_KEYS.timeZone]: 'Asia/Bangkok',
          [LOCAL_TIMESTAMP_FIELD_KEYS.offsetMinutes]: '420',
        },
      };
      expect(getTransactionLocalDay(transaction)).toBe('2026-06-23');
    });

    it('falls back to the legacy date when no captured timestamp exists', () => {
      expect(getTransactionLocalDay({ date: '2026-06-22', customFields: null })).toBe('2026-06-22');
      expect(getTransactionLocalDay({ date: '2026-06-22' })).toBe('2026-06-22');
      expect(getTransactionLocalDay({ date: '2026-06-22', customFields: { foo: 'bar' } })).toBe(
        '2026-06-22',
      );
    });
  });

  describe('formatTimeZoneOffset', () => {
    it('formats positive, negative, and zero offsets', () => {
      expect(formatTimeZoneOffset(420)).toBe('GMT+07:00');
      expect(formatTimeZoneOffset(-300)).toBe('GMT-05:00');
      expect(formatTimeZoneOffset(330)).toBe('GMT+05:30');
      expect(formatTimeZoneOffset(0)).toBe('GMT+00:00');
    });

    it('degrades gracefully for null/NaN', () => {
      expect(formatTimeZoneOffset(null)).toBe('GMT');
      expect(formatTimeZoneOffset(undefined)).toBe('GMT');
      expect(formatTimeZoneOffset(Number.NaN)).toBe('GMT');
    });
  });

  describe('formatTimeZoneLabel', () => {
    it('combines a friendly zone name and offset', () => {
      const ts = createLocalTimestamp('2026-06-22T23:50', 'Asia/Bangkok');
      expect(formatTimeZoneLabel(ts)).toBe('Bangkok \u00b7 GMT+07:00');
    });

    it('omits the zone name when only an offset is known', () => {
      expect(
        formatTimeZoneLabel({
          localDateTime: '2026-06-22T23:50',
          timeZone: null,
          offsetMinutes: 420,
        }),
      ).toBe('GMT+07:00');
    });
  });

  describe('formatLocalTimestamp', () => {
    it('renders the original wall-clock time and zone verbatim', () => {
      const ts = createLocalTimestamp('2026-06-22T23:50', 'Asia/Bangkok');
      const formatted = formatLocalTimestamp(ts);
      expect(formatted).toContain('11:50');
      expect(formatted).toContain('PM');
      expect(formatted).toContain('Jun 22, 2026');
      expect(formatted).toContain('Bangkok');
      expect(formatted).toContain('GMT+07:00');
    });

    it('can omit the zone label', () => {
      const ts = createLocalTimestamp('2026-06-22T23:50', 'Asia/Bangkok');
      const formatted = formatLocalTimestamp(ts, { includeZone: false });
      expect(formatted).not.toContain('Bangkok');
      expect(formatted).toContain('11:50');
    });

    it('returns an empty string when the timestamp is missing', () => {
      expect(formatLocalTimestamp(null)).toBe('');
      expect(formatLocalTimestamp(undefined)).toBe('');
    });
  });

  describe('customFields round-trip', () => {
    it('serializes and reads back the same timestamp', () => {
      const ts = createLocalTimestamp('2026-06-22T23:50', 'Asia/Bangkok');
      const fields = localTimestampToCustomFields(ts);
      expect(fields).toEqual({
        occurredLocalTime: '2026-06-22T23:50',
        occurredTimeZone: 'Asia/Bangkok',
        occurredOffsetMinutes: '420',
      });
      expect(localTimestampFromCustomFields(fields)).toEqual(ts);
    });

    it('re-derives a missing offset from the stored zone', () => {
      const fields = {
        [LOCAL_TIMESTAMP_FIELD_KEYS.localDateTime]: '2026-01-15T09:30',
        [LOCAL_TIMESTAMP_FIELD_KEYS.timeZone]: 'America/New_York',
      };
      expect(localTimestampFromCustomFields(fields)?.offsetMinutes).toBe(-300);
    });

    it('returns null when customFields are missing or lack the field', () => {
      expect(localTimestampFromCustomFields(null)).toBeNull();
      expect(localTimestampFromCustomFields(undefined)).toBeNull();
      expect(localTimestampFromCustomFields({ foo: 'bar' })).toBeNull();
    });

    it('produces no fields for a null timestamp', () => {
      expect(localTimestampToCustomFields(null)).toEqual({});
    });
  });

  describe('applyLocalTimestampToCustomFields', () => {
    it('merges the timestamp while preserving unrelated fields', () => {
      const ts = createLocalTimestamp('2026-06-22T23:50', 'Asia/Bangkok');
      const merged = applyLocalTimestampToCustomFields({ liabilityType: 'BNPL' }, ts);
      expect(merged.liabilityType).toBe('BNPL');
      expect(merged.occurredLocalTime).toBe('2026-06-22T23:50');
      expect(merged.occurredTimeZone).toBe('Asia/Bangkok');
    });

    it('strips reserved keys when the timestamp is null', () => {
      const existing = {
        liabilityType: 'BNPL',
        occurredLocalTime: '2026-06-22T23:50',
        occurredTimeZone: 'Asia/Bangkok',
        occurredOffsetMinutes: '420',
      };
      const merged = applyLocalTimestampToCustomFields(existing, null);
      expect(merged).toEqual({ liabilityType: 'BNPL' });
    });

    it('does not mutate the input map', () => {
      const existing = { foo: 'bar' };
      applyLocalTimestampToCustomFields(existing, createLocalTimestamp('2026-06-22T23:50', null));
      expect(existing).toEqual({ foo: 'bar' });
    });
  });

  describe('isLocalTimestampFieldKey', () => {
    it('recognizes reserved keys only', () => {
      expect(isLocalTimestampFieldKey('occurredLocalTime')).toBe(true);
      expect(isLocalTimestampFieldKey('occurredTimeZone')).toBe(true);
      expect(isLocalTimestampFieldKey('occurredOffsetMinutes')).toBe(true);
      expect(isLocalTimestampFieldKey('liabilityType')).toBe(false);
    });
  });
});
