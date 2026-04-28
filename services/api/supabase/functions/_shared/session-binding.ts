// SPDX-License-Identifier: BUSL-1.1

/**
 * Session binding middleware for Edge Functions (#334).
 *
 * Verifies that the request's device fingerprint matches the session's
 * bound fingerprint. Initially operates in soft enforcement mode
 * (log-only), graduating to hard enforcement for sensitive operations.
 *
 * PRIVACY: The device fingerprint is a SHA-256 hash of categorical
 * device attributes. The server never receives the raw attributes.
 * Many devices share the same fingerprint — this is NOT a tracking
 * mechanism.
 */

type SessionBindingAction = 'allow' | 'flag' | 'require_reauth';

interface SessionBindingResult {
  /** Whether the fingerprint matched, mismatched, or was not bound. */
  status: 'match' | 'mismatch' | 'unbound';
  /** The recommended action based on enforcement mode. */
  action: SessionBindingAction;
}

/** HTTP header containing the device fingerprint hash. */
const FINGERPRINT_HEADER = 'x-device-fingerprint';

/**
 * Verify that the request's device context matches the session's
 * bound device fingerprint.
 *
 * @param req The incoming request with device fingerprint header.
 * @param sessionFingerprint The fingerprint hash from the JWT claims.
 * @param hardEnforcement Whether to require re-auth on mismatch.
 * @returns The binding verification result.
 */
export function verifySessionBinding(
  req: Request,
  sessionFingerprint: string | undefined,
  hardEnforcement: boolean = false,
): SessionBindingResult {
  const requestFingerprint = req.headers.get(FINGERPRINT_HEADER);

  if (!requestFingerprint || !sessionFingerprint) {
    return { status: 'unbound', action: 'allow' };
  }

  if (requestFingerprint === sessionFingerprint) {
    return { status: 'match', action: 'allow' };
  }

  // Mismatch — potential token theft or legitimate device change
  return {
    status: 'mismatch',
    action: hardEnforcement ? 'require_reauth' : 'flag',
  };
}
