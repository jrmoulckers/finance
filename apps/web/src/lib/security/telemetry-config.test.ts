// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_TELEMETRY_CATEGORIES,
  TELEMETRY_CATEGORY_DESCRIPTIONS,
  clearNetworkLog,
  createDefaultConfig,
  generateTransparencyReport,
  isCategoryEnabled,
  loadNetworkLog,
  loadTelemetryConfig,
  logNetworkRequest,
  setCategoryEnabled,
  setNoTelemetryMode,
} from './telemetry-config';

describe('telemetry-config', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('createDefaultConfig', () => {
    it('defaults to no-telemetry mode', () => {
      const config = createDefaultConfig();
      expect(config.noTelemetryMode).toBe(true);
      for (const cat of ALL_TELEMETRY_CATEGORIES) {
        expect(config.categorySettings[cat]).toBe(false);
      }
    });
  });

  describe('loadTelemetryConfig', () => {
    it('returns default config when no config is stored', () => {
      const config = loadTelemetryConfig();
      expect(config.noTelemetryMode).toBe(true);
    });

    it('returns default config on invalid JSON', () => {
      localStorage.setItem('finance-telemetry-config', 'not-json');
      const config = loadTelemetryConfig();
      expect(config.noTelemetryMode).toBe(true);
    });
  });

  describe('setNoTelemetryMode', () => {
    it('disables no-telemetry mode', () => {
      const config = setNoTelemetryMode(false);
      expect(config.noTelemetryMode).toBe(false);
    });

    it('enables no-telemetry mode', () => {
      setNoTelemetryMode(false);
      const config = setNoTelemetryMode(true);
      expect(config.noTelemetryMode).toBe(true);
    });
  });

  describe('setCategoryEnabled', () => {
    it('enables a specific category', () => {
      setNoTelemetryMode(false);
      const config = setCategoryEnabled('crash_reports', true);
      expect(config.categorySettings.crash_reports).toBe(true);
    });
  });

  describe('isCategoryEnabled', () => {
    it('returns false when no-telemetry mode is on', () => {
      setNoTelemetryMode(true);
      setCategoryEnabled('crash_reports', true);
      // Master switch overrides individual setting
      setNoTelemetryMode(true);
      expect(isCategoryEnabled('crash_reports')).toBe(false);
    });

    it('returns true when category is enabled and no-telemetry is off', () => {
      setNoTelemetryMode(false);
      setCategoryEnabled('crash_reports', true);
      expect(isCategoryEnabled('crash_reports')).toBe(true);
    });
  });

  describe('network request logging', () => {
    it('logs a network request', () => {
      const entry = logNetworkRequest('api.example.com', 'GET', 'Sync data', false);
      expect(entry.id).toBeTruthy();
      expect(entry.destination).toBe('api.example.com');
      expect(entry.blocked).toBe(false);
    });

    it('loads logged requests', () => {
      logNetworkRequest('api.example.com', 'GET', 'Sync', false);
      logNetworkRequest('analytics.example.com', 'POST', 'Telemetry', true);

      const log = loadNetworkLog();
      expect(log).toHaveLength(2);
    });

    it('clears the network log', () => {
      logNetworkRequest('api.example.com', 'GET', 'Sync', false);
      clearNetworkLog();
      expect(loadNetworkLog()).toHaveLength(0);
    });
  });

  describe('generateTransparencyReport', () => {
    it('generates a report from the network log', () => {
      logNetworkRequest('api.example.com', 'GET', 'Sync data', false);
      logNetworkRequest('api.example.com', 'POST', 'Push changes', false);
      logNetworkRequest('analytics.example.com', 'POST', 'Telemetry', true);

      const report = generateTransparencyReport();
      expect(report.totalRequests).toBe(3);
      expect(report.totalBlocked).toBe(1);
      expect(report.destinations).toHaveLength(2);
    });

    it('returns empty report with no log', () => {
      const report = generateTransparencyReport();
      expect(report.totalRequests).toBe(0);
      expect(report.totalBlocked).toBe(0);
      expect(report.destinations).toHaveLength(0);
    });
  });

  describe('constants', () => {
    it('has descriptions for all categories', () => {
      for (const cat of ALL_TELEMETRY_CATEGORIES) {
        expect(TELEMETRY_CATEGORY_DESCRIPTIONS[cat]).toBeTruthy();
      }
    });
  });
});
