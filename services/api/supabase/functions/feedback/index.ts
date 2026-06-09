// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/feedback — create a GitHub issue from in-app feedback.
 *
 * The browser calls the same-origin `/api/feedback` facade, which is rewritten
 * to this Supabase Edge Function. The GitHub token stays server-side in
 * GITHUB_FEEDBACK_TOKEN and is never exposed to the web app.
 */

import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, methodNotAllowedResponse } from '../_shared/response.ts';

const GITHUB_ISSUES_URL = 'https://api.github.com/repos/jrmoulckers/finance/issues';
const FEEDBACK_LABELS = ['feedback', 'beta-triage'] as const;
const MAX_SUBJECT_LENGTH = 160;
const MAX_BODY_LENGTH = 12_000;

interface FeedbackRequestBody {
  subject?: unknown;
  body?: unknown;
  includeDiagnostics?: unknown;
  diagnostics?: unknown;
}

interface GitHubIssueResponse {
  html_url?: string;
  number?: number;
}

interface FeedbackHandlerDeps {
  fetchImpl?: typeof fetch;
  getToken?: () => string | undefined;
}

export function createFeedbackHandler(deps: FeedbackHandlerDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getToken = deps.getToken ?? (() => Deno.env.get('GITHUB_FEEDBACK_TOKEN') ?? undefined);

  return async function feedbackHandler(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return handleCorsPreflightRequest(req);
    }

    if (req.method !== 'POST') {
      return methodNotAllowedResponse(req);
    }

    const token = getToken()?.trim();
    if (!token) {
      return errorResponse(req, 'Feedback is temporarily unavailable.', 503);
    }

    let payload: FeedbackRequestBody;
    try {
      payload = (await req.json()) as FeedbackRequestBody;
    } catch {
      return errorResponse(req, 'Request body must be valid JSON.');
    }

    const subject = coerceString(payload.subject).trim();
    const body = coerceString(payload.body).trim();
    const includeDiagnostics = payload.includeDiagnostics === true;

    if (!subject) {
      return errorResponse(req, 'Subject is required.');
    }

    if (!body) {
      return errorResponse(req, 'Feedback details are required.');
    }

    if (subject.length > MAX_SUBJECT_LENGTH) {
      return errorResponse(req, `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`);
    }

    if (body.length > MAX_BODY_LENGTH) {
      return errorResponse(req, `Feedback details must be ${MAX_BODY_LENGTH} characters or fewer.`);
    }

    const issueBody = buildIssueBody(body, includeDiagnostics ? payload.diagnostics : undefined);

    try {
      const githubResponse = await fetchImpl(GITHUB_ISSUES_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'finance-feedback-edge-function',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title: subject,
          body: issueBody,
          labels: FEEDBACK_LABELS,
        }),
      });

      if (!githubResponse.ok) {
        const responseText = await githubResponse.text();
        console.error(
          JSON.stringify({
            level: 'error',
            function: 'feedback',
            status: githubResponse.status,
            message: 'GitHub issue creation failed',
            response: responseText.slice(0, 500),
          }),
        );
        return errorResponse(req, 'Could not create feedback issue.', 502);
      }

      const issue = (await githubResponse.json()) as GitHubIssueResponse;
      return jsonResponse(
        req,
        {
          issueUrl: issue.html_url,
          issueNumber: issue.number,
        },
        201,
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          function: 'feedback',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return errorResponse(req, 'Could not create feedback issue.', 502);
    }
  };
}

export const handler = createFeedbackHandler();

if (import.meta.main) {
  Deno.serve(handler);
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildIssueBody(body: string, diagnostics: unknown): string {
  const diagnosticBlock = sanitizeDiagnostics(diagnostics);
  if (!diagnosticBlock) {
    return body;
  }

  return `${body}\n\n---\n### Diagnostic info\n\`\`\`json\n${JSON.stringify(
    diagnosticBlock,
    null,
    2,
  )}\n\`\`\``;
}

function sanitizeDiagnostics(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const safeDiagnostics: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue !== 'string') {
      continue;
    }

    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const safeValue = rawValue.trim().slice(0, 500);
    if (safeKey && safeValue) {
      safeDiagnostics[safeKey] = safeValue;
    }
  }

  return Object.keys(safeDiagnostics).length > 0 ? safeDiagnostics : null;
}
