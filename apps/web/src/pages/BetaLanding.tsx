// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom';

import './BetaLanding.css';

type SystemStatus = 'operational' | 'degraded' | 'down';

interface DownloadCard {
  id: string;
  title: string;
  description: string;
  url: string;
}

const DOWNLOAD_DEFINITIONS = [
  {
    id: 'ios',
    title: 'iOS TestFlight',
    description: 'Join the iPhone and iPad beta through Apple TestFlight.',
    envKey: 'VITE_NATIVE_IOS_URL',
  },
  {
    id: 'android',
    title: 'Android internal track',
    description: 'Install the Android beta from the Play Store internal test track.',
    envKey: 'VITE_NATIVE_ANDROID_URL',
  },
  {
    id: 'windows',
    title: 'Windows MSI',
    description: 'Try the desktop beta on Windows with the MSI installer.',
    envKey: 'VITE_NATIVE_WINDOWS_URL',
  },
  {
    id: 'macos',
    title: 'macOS DMG',
    description: 'Download the macOS beta build as a signed DMG.',
    envKey: 'VITE_NATIVE_MACOS_URL',
  },
] as const;

function normalizeHealthStatus(payload: unknown, responseOk: boolean): SystemStatus {
  if (!responseOk) {
    return 'degraded';
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const rawStatus = record.status ?? record.state ?? record.health;

    if (typeof rawStatus === 'string') {
      const value = rawStatus.toLowerCase();

      if (value.includes('down') || value.includes('fail') || value.includes('unhealthy')) {
        return 'down';
      }

      if (value.includes('degraded') || value.includes('warn') || value.includes('partial')) {
        return 'degraded';
      }
    }

    if (record.ok === false || record.healthy === false) {
      return 'degraded';
    }
  }

  return 'operational';
}

function getDownloadCards(): DownloadCard[] {
  return DOWNLOAD_DEFINITIONS.flatMap(({ envKey, ...card }) => {
    const url = import.meta.env[envKey]?.trim();
    return url ? [{ ...card, url }] : [];
  });
}

const STATUS_COPY: Record<SystemStatus, string> = {
  operational: '🟢 All systems operational',
  degraded: '🟡 Degraded',
  down: '🔴 Down',
};

export const BetaLanding: FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('degraded');
  const downloadCards = useMemo(() => getDownloadCards(), []);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', {
          headers: { Accept: 'application/json' },
        });
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!cancelled) {
          setSystemStatus(normalizeHealthStatus(payload, response.ok));
        }
      } catch {
        if (!cancelled) {
          setSystemStatus('down');
        }
      }
    }

    void checkHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="beta-landing">
      <section className="beta-landing__hero" aria-labelledby="beta-landing-title">
        <p className="beta-landing__eyebrow">Private preview</p>
        <h1 id="beta-landing-title">Finance — Now in Beta</h1>
        <p className="beta-landing__tagline">
          Secure household budgeting, goals, and insights are ready for early testers. Help shape
          Finance before the public launch.
        </p>
        <Link className="beta-landing__primary-cta" to="/login">
          Sign up for the beta
        </Link>
      </section>

      <section className="beta-landing__status" aria-label="System status">
        <span className={`beta-landing__status-badge beta-landing__status-badge--${systemStatus}`}>
          {STATUS_COPY[systemStatus]}
        </span>
        <span className="beta-landing__status-text">Live status from /api/health</span>
      </section>

      <section className="beta-landing__section" aria-labelledby="beta-downloads-title">
        <div className="beta-landing__section-header">
          <p className="beta-landing__eyebrow">Native apps</p>
          <h2 id="beta-downloads-title">Download beta builds</h2>
          <p>Installers appear here as soon as each beta channel is available.</p>
        </div>

        {downloadCards.length > 0 ? (
          <div className="beta-landing__download-grid">
            {downloadCards.map((card) => (
              <a
                className="beta-landing__download-card"
                href={card.url}
                key={card.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="beta-landing__download-title">{card.title}</span>
                <span className="beta-landing__download-description">{card.description}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="beta-landing__empty-state">
            Native download links are not published yet. Check back soon for TestFlight, Android,
            Windows, and macOS builds.
          </p>
        )}
      </section>

      <section className="beta-landing__feedback" aria-labelledby="beta-feedback-title">
        <div>
          <p className="beta-landing__eyebrow">Feedback</p>
          <h2 id="beta-feedback-title">Tell us what to improve</h2>
          <p>
            Found a bug or missing workflow? Send feedback from the app and review the beta terms in
            the legal index.
          </p>
        </div>
        <Link className="beta-landing__secondary-cta" to="/legal">
          View legal index
        </Link>
      </section>
    </main>
  );
};

export default BetaLanding;
