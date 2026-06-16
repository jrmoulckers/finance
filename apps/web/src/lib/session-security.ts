// SPDX-License-Identifier: BUSL-1.1

import { appendSecurityAuditEvent } from './security-audit-log';

export type RiskyAction =
  | 'data_export'
  | 'account_deletion'
  | 'passkey_change'
  | 'third_party_permission_change';

export interface StepUpStatus {
  readonly required: boolean;
  readonly allowed: boolean;
  readonly expiresAt: string | null;
  readonly reason: string;
}

export interface IdleSessionPolicy {
  readonly timeoutMs: number;
  readonly warningMs: number;
  readonly lockBehavior: 'logout' | 'lock';
}

export interface IdleSessionControllerOptions {
  readonly policy: IdleSessionPolicy;
  readonly now?: () => number;
  readonly onWarning?: (remainingMs: number) => void;
  readonly onTimeout?: () => void;
}

export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_IDLE_POLICY: IdleSessionPolicy = {
  timeoutMs: 15 * 60 * 1000,
  warningMs: 60 * 1000,
  lockBehavior: 'logout',
};
export const IDLE_POLICY_STORAGE_KEY = 'finance-idle-session-policy-v1';
const STEP_UP_STORAGE_KEY = 'finance-step-up-auth-v1';

type StepUpStore = Partial<Record<RiskyAction, string>>;

export function loadIdleSessionPolicy(): IdleSessionPolicy {
  try {
    const parsed = JSON.parse(localStorage.getItem(IDLE_POLICY_STORAGE_KEY) ?? 'null') as Partial<IdleSessionPolicy> | null;
    const timeoutMs = typeof parsed?.timeoutMs === 'number' ? parsed.timeoutMs : DEFAULT_IDLE_POLICY.timeoutMs;
    const warningMs = typeof parsed?.warningMs === 'number' ? parsed.warningMs : Math.min(DEFAULT_IDLE_POLICY.warningMs, timeoutMs);
    return {
      timeoutMs: Math.max(timeoutMs, 60_000),
      warningMs: Math.min(Math.max(warningMs, 10_000), Math.max(timeoutMs - 1_000, 10_000)),
      lockBehavior: parsed?.lockBehavior === 'lock' ? 'lock' : 'logout',
    };
  } catch {
    return DEFAULT_IDLE_POLICY;
  }
}

export function saveIdleSessionPolicy(policy: IdleSessionPolicy): IdleSessionPolicy {
  const timeoutMs = Math.max(policy.timeoutMs, 60_000);
  const normalized: IdleSessionPolicy = {
    timeoutMs,
    warningMs: Math.min(Math.max(policy.warningMs, 10_000), Math.max(timeoutMs - 1_000, 10_000)),
    lockBehavior: policy.lockBehavior,
  };
  localStorage.setItem(IDLE_POLICY_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getStepUpStatus(action: RiskyAction, now: Date = new Date()): StepUpStatus {
  const store = readStepUpStore();
  const authenticatedAt = store[action];
  if (!authenticatedAt) {
    return {
      required: true,
      allowed: false,
      expiresAt: null,
      reason: 'Recent re-authentication is required for this sensitive action.',
    };
  }
  const expires = new Date(new Date(authenticatedAt).getTime() + STEP_UP_WINDOW_MS);
  const allowed = now.getTime() < expires.getTime();
  return {
    required: !allowed,
    allowed,
    expiresAt: expires.toISOString(),
    reason: allowed ? 'Recent re-authentication is active.' : 'Your recent re-authentication expired.',
  };
}

export async function markStepUpAuthenticated(
  action: RiskyAction,
  metadata: Record<string, unknown> = {},
  now: Date = new Date(),
): Promise<StepUpStatus> {
  const store = readStepUpStore();
  store[action] = now.toISOString();
  localStorage.setItem(STEP_UP_STORAGE_KEY, JSON.stringify(store));
  await appendSecurityAuditEvent({
    action: 'step_up_reauth',
    result: 'success',
    metadata: { riskyAction: action, ...metadata },
    timestamp: now.toISOString(),
  });
  return getStepUpStatus(action, now);
}

export function clearStepUpAuthentication(action?: RiskyAction): void {
  if (!action) {
    localStorage.removeItem(STEP_UP_STORAGE_KEY);
    return;
  }
  const store = readStepUpStore();
  delete store[action];
  localStorage.setItem(STEP_UP_STORAGE_KEY, JSON.stringify(store));
}

export class IdleSessionController {
  private readonly policy: IdleSessionPolicy;
  private readonly now: () => number;
  private readonly onWarning?: (remainingMs: number) => void;
  private readonly onTimeout?: () => void;
  private lastActivity: number;
  private warned = false;
  private timedOut = false;

  constructor(options: IdleSessionControllerOptions) {
    this.policy = options.policy;
    this.now = options.now ?? Date.now;
    this.onWarning = options.onWarning;
    this.onTimeout = options.onTimeout;
    this.lastActivity = this.now();
  }

  recordActivity(): void {
    if (this.timedOut) return;
    this.lastActivity = this.now();
    this.warned = false;
  }

  handleVisibilityChange(hidden: boolean): void {
    if (!hidden) this.check();
  }

  check(): 'active' | 'warning' | 'timed_out' {
    const idleFor = this.now() - this.lastActivity;
    const remaining = this.policy.timeoutMs - idleFor;
    if (remaining <= 0) {
      if (!this.timedOut) {
        this.timedOut = true;
        this.onTimeout?.();
      }
      return 'timed_out';
    }
    if (remaining <= this.policy.warningMs) {
      this.warned = true;
      this.onWarning?.(remaining);
      return 'warning';
    }
    return 'active';
  }

  get hasWarned(): boolean {
    return this.warned;
  }
}

function readStepUpStore(): StepUpStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STEP_UP_STORAGE_KEY) ?? '{}') as StepUpStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
