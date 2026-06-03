// SPDX-License-Identifier: BUSL-1.1

/** Client helpers for the password-reset auth flow. */

const PASSWORD_RESET_REQUEST_ENDPOINT = '/api/auth/request-password-reset';
const PASSWORD_RESET_ENDPOINT = '/api/auth/reset-password';

interface ErrorBody {
  error?: string;
}

/** Request a password reset email without revealing whether the account exists. */
export async function requestPasswordResetEmail(email: string, redirectTo: string): Promise<void> {
  const response = await fetch(PASSWORD_RESET_REQUEST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirectTo }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not send reset email.'));
  }
}

/** Update the current recovery session's password. */
export async function resetPassword(accessToken: string, password: string): Promise<void> {
  const response = await fetch(PASSWORD_RESET_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, password }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not update password.'));
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return body.error ?? fallback;
}
