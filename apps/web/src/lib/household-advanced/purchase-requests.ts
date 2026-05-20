// SPDX-License-Identifier: BUSL-1.1

/**
 * Purchase discussion requests above a household threshold.
 *
 * Allows household members to create discussion requests for purchases
 * above a configurable per-category threshold. Supports approve, deny,
 * and discuss workflows with auto-approve for amounts below threshold.
 *
 * All monetary values are in integer cents. All functions are pure.
 *
 * References: issue #1791
 */

import type {
  ApprovalStatus,
  HouseholdId,
  ISODateString,
  PurchaseRequest,
  PurchaseThreshold,
  UserId,
} from './types';

// ---------------------------------------------------------------------------
// Threshold Configuration
// ---------------------------------------------------------------------------

/**
 * Create a purchase threshold for a category.
 *
 * @param categoryId - The spending category.
 * @param thresholdCents - Amount in cents above which discussion is required.
 * @param autoApproveBelow - Whether sub-threshold purchases are auto-approved.
 * @returns A {@link PurchaseThreshold}.
 */
export function createThreshold(
  categoryId: string,
  thresholdCents: number,
  autoApproveBelow: boolean = true,
): PurchaseThreshold {
  return { categoryId, thresholdCents: Math.max(0, thresholdCents), autoApproveBelow };
}

/**
 * Determine whether a purchase amount requires discussion.
 *
 * @param amountCents - Purchase amount in cents.
 * @param threshold - Threshold configuration for the category.
 * @returns `true` if the amount is at or above the threshold.
 */
export function requiresDiscussion(amountCents: number, threshold: PurchaseThreshold): boolean {
  return amountCents >= threshold.thresholdCents;
}

/**
 * Determine whether a purchase should be auto-approved.
 *
 * @param amountCents - Purchase amount in cents.
 * @param threshold - Threshold configuration for the category.
 * @returns `true` if below threshold and auto-approve is enabled.
 */
export function shouldAutoApprove(amountCents: number, threshold: PurchaseThreshold): boolean {
  return threshold.autoApproveBelow && amountCents < threshold.thresholdCents;
}

// ---------------------------------------------------------------------------
// Request Creation
// ---------------------------------------------------------------------------

/**
 * Create a new purchase discussion request.
 *
 * @param id - Unique request identifier.
 * @param householdId - Household context.
 * @param requestedBy - User requesting the purchase.
 * @param categoryId - Spending category.
 * @param amountCents - Purchase amount in cents.
 * @param description - Human-readable description.
 * @param now - Current ISO timestamp.
 * @returns A new {@link PurchaseRequest} in `pending` status.
 */
export function createPurchaseRequest(
  id: string,
  householdId: HouseholdId,
  requestedBy: UserId,
  categoryId: string,
  amountCents: number,
  description: string,
  now: ISODateString,
): PurchaseRequest {
  return {
    id,
    householdId,
    requestedBy,
    categoryId,
    amountCents,
    description,
    status: 'pending',
    createdAt: now,
    resolvedAt: null,
    resolvedBy: null,
    note: '',
  };
}

// ---------------------------------------------------------------------------
// Workflow Actions
// ---------------------------------------------------------------------------

/**
 * Resolve a purchase request with a given status.
 *
 * @param request - The request to resolve.
 * @param status - Resolution status (approved, denied, or discussed).
 * @param resolvedBy - User who resolved the request.
 * @param now - Current ISO timestamp.
 * @param note - Optional resolution note.
 * @returns Updated {@link PurchaseRequest}.
 */
export function resolveRequest(
  request: PurchaseRequest,
  status: Exclude<ApprovalStatus, 'pending'>,
  resolvedBy: UserId,
  now: ISODateString,
  note: string = '',
): PurchaseRequest {
  return {
    ...request,
    status,
    resolvedAt: now,
    resolvedBy,
    note,
  };
}

/**
 * Approve a purchase request.
 *
 * @param request - The request to approve.
 * @param approvedBy - User approving the request.
 * @param now - Current ISO timestamp.
 * @param note - Optional note.
 * @returns Updated {@link PurchaseRequest} with status `approved`.
 */
export function approveRequest(
  request: PurchaseRequest,
  approvedBy: UserId,
  now: ISODateString,
  note: string = '',
): PurchaseRequest {
  return resolveRequest(request, 'approved', approvedBy, now, note);
}

/**
 * Deny a purchase request.
 *
 * @param request - The request to deny.
 * @param deniedBy - User denying the request.
 * @param now - Current ISO timestamp.
 * @param note - Optional reason for denial.
 * @returns Updated {@link PurchaseRequest} with status `denied`.
 */
export function denyRequest(
  request: PurchaseRequest,
  deniedBy: UserId,
  now: ISODateString,
  note: string = '',
): PurchaseRequest {
  return resolveRequest(request, 'denied', deniedBy, now, note);
}

/**
 * Mark a purchase request for further discussion.
 *
 * @param request - The request to mark.
 * @param discussedBy - User initiating discussion.
 * @param now - Current ISO timestamp.
 * @param note - Discussion context.
 * @returns Updated {@link PurchaseRequest} with status `discussed`.
 */
export function markForDiscussion(
  request: PurchaseRequest,
  discussedBy: UserId,
  now: ISODateString,
  note: string = '',
): PurchaseRequest {
  return resolveRequest(request, 'discussed', discussedBy, now, note);
}

// ---------------------------------------------------------------------------
// Request History & Filtering
// ---------------------------------------------------------------------------

/**
 * Filter requests by status.
 *
 * @param requests - Full request history.
 * @param status - Status to filter by.
 * @returns Filtered requests.
 */
export function filterByStatus(
  requests: readonly PurchaseRequest[],
  status: ApprovalStatus,
): PurchaseRequest[] {
  return requests.filter((r) => r.status === status);
}

/**
 * Filter requests by household.
 *
 * @param requests - Full request history.
 * @param householdId - Household to filter by.
 * @returns Filtered requests.
 */
export function filterByHousehold(
  requests: readonly PurchaseRequest[],
  householdId: HouseholdId,
): PurchaseRequest[] {
  return requests.filter((r) => r.householdId === householdId);
}

/**
 * Get pending requests for a household.
 *
 * @param requests - Full request history.
 * @param householdId - Household to filter by.
 * @returns Pending requests for the given household.
 */
export function getPendingRequests(
  requests: readonly PurchaseRequest[],
  householdId: HouseholdId,
): PurchaseRequest[] {
  return requests.filter((r) => r.householdId === householdId && r.status === 'pending');
}

/**
 * Compute the total value of pending requests for a household (in cents).
 *
 * @param requests - Full request history.
 * @param householdId - Household to total.
 * @returns Total pending amount in cents.
 */
export function totalPendingAmount(
  requests: readonly PurchaseRequest[],
  householdId: HouseholdId,
): number {
  return getPendingRequests(requests, householdId).reduce((sum, r) => sum + r.amountCents, 0);
}
