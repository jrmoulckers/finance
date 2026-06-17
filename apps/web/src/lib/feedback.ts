// SPDX-License-Identifier: BUSL-1.1

export interface FeedbackDiagnostics {
  appVersion: string;
  buildSha: string;
  path: string;
  userAgent: string;
  language: string;
  viewport: string;
  timezone: string;
  timestamp: string;
}

export interface FeedbackSubmitPayload {
  subject: string;
  body: string;
  includeDiagnostics: boolean;
  diagnostics?: FeedbackDiagnostics;
}

export interface FeedbackSubmitResult {
  issueUrl?: string;
  issueNumber?: number;
}

export function buildFeedbackDiagnostics(options: {
  appVersion: string;
  buildSha: string;
}): FeedbackDiagnostics {
  const { appVersion, buildSha } = options;
  return {
    appVersion,
    buildSha: buildSha || 'Not available in this build',
    path: window.location.pathname,
    userAgent: window.navigator.userAgent,
    language: window.navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };
}

export async function submitFeedback(
  payload: FeedbackSubmitPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackSubmitResult> {
  const subject = payload.subject.trim();
  const body = payload.body.trim();

  if (!subject) {
    throw new Error('Please provide a subject.');
  }

  if (!body) {
    throw new Error('Please provide feedback details.');
  }

  const response = await fetchImpl('/api/feedback', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject,
      body,
      includeDiagnostics: payload.includeDiagnostics,
      ...(payload.includeDiagnostics && payload.diagnostics
        ? { diagnostics: payload.diagnostics }
        : {}),
    }),
  });

  if (!response.ok) {
    let message = 'Could not send feedback. Please try again later.';
    try {
      const errorBody = (await response.json()) as { error?: unknown };
      if (typeof errorBody.error === 'string' && errorBody.error.trim()) {
        message = errorBody.error;
      }
    } catch {
      // Keep the generic error message for non-JSON failures.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return {};
  }

  try {
    return (await response.json()) as FeedbackSubmitResult;
  } catch {
    return {};
  }
}
