// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for consent-history library.
 *
 * References: issue #1641
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadConsentHistory,
  recordConsentChange,
  recordBulkConsentChanges,
  exportConsentHistory,
  clearConsentHistory,
} from './consent-history';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('consent-history', () => {
  describe('loadConsentHistory', () => {
    it('returns empty array when no history exists', () => {
      expect(loadConsentHistory()).toEqual([]);
    });

    it('returns empty array for invalid JSON', () => {
      localStorage.setItem('finance-consent-history', 'not-json');
      expect(loadConsentHistory()).toEqual([]);
    });
  });

  describe('recordConsentChange', () => {
    it('records a single consent change', () => {
      const event = recordConsentChange('analytics', true, 'settings', '1.0.0');

      expect(event.category).toBe('analytics');
      expect(event.granted).toBe(true);
      expect(event.method).toBe('settings');
      expect(event.policyVersion).toBe('1.0.0');
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it('appends events to history', () => {
      recordConsentChange('analytics', true, 'settings', '1.0.0');
      recordConsentChange('sync', false, 'dashboard', '1.0.0');

      const history = loadConsentHistory();
      expect(history).toHaveLength(2);
      expect(history[0].category).toBe('analytics');
      expect(history[1].category).toBe('sync');
    });
  });

  describe('recordBulkConsentChanges', () => {
    it('records multiple changes at once', () => {
      const events = recordBulkConsentChanges(
        [
          { category: 'analytics', granted: true },
          { category: 'sync', granted: false },
        ],
        'bulk',
        '1.0.0',
      );

      expect(events).toHaveLength(2);
      expect(loadConsentHistory()).toHaveLength(2);
    });

    it('all events share the same timestamp', () => {
      const events = recordBulkConsentChanges(
        [
          { category: 'analytics', granted: true },
          { category: 'marketing', granted: true },
        ],
        'first_run',
        '1.0.0',
      );

      expect(events[0].timestamp).toBe(events[1].timestamp);
    });

    // Regression: onboarding privacy buttons were dead in non-secure contexts
    // (plain HTTP on a non-localhost host) because crypto.randomUUID is
    // undefined there and threw, aborting the click handler. Recording consent
    // must never throw so onboarding navigation is never blocked (#3898).
    describe('non-secure context (crypto.randomUUID unavailable)', () => {
      let originalRandomUUID: typeof crypto.randomUUID;

      beforeEach(() => {
        originalRandomUUID = crypto.randomUUID;
        // Simulate a non-secure context where the API is absent.
        (crypto as { randomUUID?: unknown }).randomUUID = undefined;
      });

      afterEach(() => {
        (crypto as { randomUUID?: unknown }).randomUUID = originalRandomUUID;
      });

      it('records bulk changes without throwing and assigns unique ids', () => {
        expect(() =>
          recordBulkConsentChanges(
            [
              { category: 'analytics', granted: false },
              { category: 'error_reporting', granted: false },
              { category: 'sync', granted: false },
              { category: 'marketing', granted: false },
            ],
            'first_run',
            '1.0.0',
          ),
        ).not.toThrow();

        const history = loadConsentHistory();
        expect(history).toHaveLength(4);
        const ids = new Set(history.map((event) => event.id));
        expect(ids.size).toBe(4);
      });

      it('records a single change without throwing', () => {
        expect(() => recordConsentChange('analytics', true, 'settings', '1.0.0')).not.toThrow();
        expect(loadConsentHistory()).toHaveLength(1);
      });
    });
  });

  describe('exportConsentHistory', () => {
    it('exports history as JSON string', () => {
      recordConsentChange('analytics', true, 'settings', '1.0.0');
      const exported = exportConsentHistory();
      const parsed = JSON.parse(exported);

      expect(parsed.type).toBe('gdpr_consent_history');
      expect(parsed.totalEvents).toBe(1);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.exportedAt).toBeDefined();
    });
  });

  describe('clearConsentHistory', () => {
    it('removes all history', () => {
      recordConsentChange('analytics', true, 'settings', '1.0.0');
      expect(loadConsentHistory()).toHaveLength(1);

      clearConsentHistory();
      expect(loadConsentHistory()).toHaveLength(0);
    });
  });
});
