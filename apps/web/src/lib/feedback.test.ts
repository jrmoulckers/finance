// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import { submitFeedback, type FeedbackDiagnostics } from './feedback';

const diagnostics: FeedbackDiagnostics = {
  appVersion: '0.1.0',
  buildSha: 'abc123',
  path: '/settings/about',
  userAgent: 'vitest',
  language: 'en-US',
  viewport: '1024x768',
  timezone: 'UTC',
  timestamp: '2026-01-01T00:00:00.000Z',
};

describe('submitFeedback', () => {
  it('posts trimmed feedback and diagnostics to the backend endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ issueUrl: 'https://github.com/jrmoulckers/finance/issues/1' }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await submitFeedback(
      {
        subject: '  Budget chart typo  ',
        body: '  The axis label is clipped.  ',
        includeDiagnostics: true,
        diagnostics,
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/feedback', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Budget chart typo',
        body: 'The axis label is clipped.',
        includeDiagnostics: true,
        diagnostics,
      }),
    });
    expect(result.issueUrl).toBe('https://github.com/jrmoulckers/finance/issues/1');
  });

  it('does not call fetch when required fields are blank', async () => {
    const fetchMock = vi.fn();

    await expect(
      submitFeedback({ subject: ' ', body: 'details', includeDiagnostics: false }, fetchMock),
    ).rejects.toThrow('Please provide a subject.');
    await expect(
      submitFeedback({ subject: 'Subject', body: ' ', includeDiagnostics: false }, fetchMock),
    ).rejects.toThrow('Please provide feedback details.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces backend validation errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Feedback is temporarily unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      submitFeedback({ subject: 'Subject', body: 'Body', includeDiagnostics: false }, fetchMock),
    ).rejects.toThrow('Feedback is temporarily unavailable');
  });
});
