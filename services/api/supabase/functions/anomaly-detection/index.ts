// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): SPECULATIVE — Not wired to any client. Has tests but no UI
// integration. Post-alpha feature for unusual transaction detection. Exclude
// from alpha deployment. (#1390)

/**
 * Anomaly Detection Edge Function (#323)
 *
 * Server-side detection of unusual transactions based on configurable
 * rules. Provides CRUD for anomaly rules and alert management.
 *
 * Endpoints:
 *   POST ?action=detect       — Run detection on a specific transaction
 *   POST ?action=create_rule  — Create a new detection rule
 *   GET  ?action=rules        — List detection rules for a household
 *   GET  ?action=alerts       — List anomaly alerts for a household
 *   PUT  ?action=review       — Update alert status (review/dismiss/confirm)
 *   PUT  ?action=update_rule  — Update an existing rule
 *   DELETE                    — Soft-delete a rule
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Household membership required for all operations
 *   - Rule management requires owner/admin role
 *   - Alert summaries NEVER contain raw financial data
 *   - Detection results reference transaction IDs only
 *   - Rate limited: 30 requests per user per minute
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
  createdResponse,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  noContentResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const VALID_RULE_TYPES = [
  'amount_threshold',
  'std_deviation',
  'duplicate_detection',
  'unusual_category',
  'frequency_spike',
  'time_of_day',
] as const;

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const VALID_ALERT_STATUSES = ['pending', 'reviewed', 'dismissed', 'confirmed'] as const;

interface CreateRuleRequest {
  household_id: string;
  name: string;
  description?: string;
  rule_type: string;
  config: Record<string, unknown>;
  severity?: string;
}

interface ReviewAlertRequest {
  alert_id: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRuleConfig(ruleType: string, config: Record<string, unknown>): string | null {
  switch (ruleType) {
    case 'amount_threshold':
      if (typeof config.threshold_cents !== 'number' || config.threshold_cents <= 0) {
        return 'amount_threshold requires positive threshold_cents';
      }
      break;
    case 'std_deviation':
      if (typeof config.multiplier !== 'number' || config.multiplier <= 0) {
        return 'std_deviation requires positive multiplier';
      }
      if (typeof config.lookback_days !== 'number' || config.lookback_days < 7) {
        return 'std_deviation requires lookback_days >= 7';
      }
      break;
    case 'duplicate_detection':
      if (typeof config.time_window_hours !== 'number' || config.time_window_hours <= 0) {
        return 'duplicate_detection requires positive time_window_hours';
      }
      break;
    case 'frequency_spike':
      if (typeof config.multiplier !== 'number' || config.multiplier <= 0) {
        return 'frequency_spike requires positive multiplier';
      }
      if (typeof config.lookback_days !== 'number' || config.lookback_days < 7) {
        return 'frequency_spike requires lookback_days >= 7';
      }
      break;
    case 'time_of_day':
      if (
        typeof config.start_hour !== 'number' ||
        config.start_hour < 0 ||
        config.start_hour > 23
      ) {
        return 'time_of_day requires start_hour between 0 and 23';
      }
      if (typeof config.end_hour !== 'number' || config.end_hour < 0 || config.end_hour > 23) {
        return 'time_of_day requires end_hour between 0 and 23';
      }
      break;
    default:
      break;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('anomaly-detection');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('anomaly-detection', req);
  if (envError) return envError;

  try {
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    // Rate limiting
    const rateLimitResult = await checkRateLimit(
      supabase,
      user.id,
      RATE_LIMITS['anomaly-detection'],
    );
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['anomaly-detection']);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // -----------------------------------------------------------------------
    // POST ?action=detect — Run anomaly detection on a transaction
    // -----------------------------------------------------------------------
    if (req.method === 'POST' && action === 'detect') {
      const body = await req.json();
      const { transaction_id } = body;

      if (!transaction_id) {
        return errorResponse(req, 'transaction_id is required');
      }

      // Verify the transaction belongs to user's household
      const { data: txn, error: txnError } = await supabase
        .from('transactions')
        .select('id, household_id')
        .eq('id', transaction_id)
        .is('deleted_at', null)
        .single();

      if (txnError || !txn) {
        return errorResponse(req, 'Transaction not found', 404);
      }

      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', txn.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (!membership) {
        return errorResponse(req, 'Household access denied', 403);
      }

      // Run detection
      const { data, error } = await supabase.rpc('detect_transaction_anomalies', {
        p_transaction_id: transaction_id,
      });

      if (error) {
        logger.error('Detection failed', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      // Store alerts if any were triggered
      const result = data as {
        alerts: Array<{ rule_id: string; alert_type: string; severity: string; summary: string }>;
      };
      if (result.alerts && result.alerts.length > 0) {
        for (const alert of result.alerts) {
          await supabase.from('anomaly_alerts').insert({
            household_id: txn.household_id,
            rule_id: alert.rule_id,
            transaction_id,
            alert_type: alert.alert_type,
            severity: alert.severity,
            summary: alert.summary,
          });
        }
      }

      logger.info('Anomaly detection completed', {
        transactionId: transaction_id,
        alertsTriggered: result.alerts?.length ?? 0,
        httpStatus: 200,
      });

      return jsonResponse(req, { detection: data });
    }

    // -----------------------------------------------------------------------
    // POST ?action=create_rule — Create a detection rule
    // -----------------------------------------------------------------------
    if (req.method === 'POST' && action === 'create_rule') {
      const body = (await req.json()) as CreateRuleRequest;

      if (!body.household_id) return errorResponse(req, 'household_id is required');
      if (!body.name) return errorResponse(req, 'name is required');
      if (!body.rule_type || !(VALID_RULE_TYPES as readonly string[]).includes(body.rule_type)) {
        return errorResponse(req, `rule_type must be one of: ${VALID_RULE_TYPES.join(', ')}`);
      }
      if (!body.config || typeof body.config !== 'object') {
        return errorResponse(req, 'config is required and must be an object');
      }
      if (body.severity && !(VALID_SEVERITIES as readonly string[]).includes(body.severity)) {
        return errorResponse(req, `severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
      }

      // Validate rule-specific config
      const configError = validateRuleConfig(body.rule_type, body.config);
      if (configError) return errorResponse(req, configError);

      // Verify household membership (owner/admin)
      const { data: membership } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', body.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (!membership) {
        return errorResponse(req, 'Only household owners and admins can manage rules', 403);
      }

      const { data: rule, error: insertError } = await supabase
        .from('anomaly_rules')
        .insert({
          household_id: body.household_id,
          owner_id: user.id,
          name: body.name,
          description: body.description ?? null,
          rule_type: body.rule_type,
          config: body.config,
          severity: body.severity ?? 'medium',
        })
        .select('id, name, rule_type, config, severity, is_active, created_at')
        .single();

      if (insertError) {
        logger.error('Failed to create rule', { errorMessage: insertError.message });
        return internalErrorResponse(req);
      }

      logger.info('Anomaly rule created', { ruleId: rule.id, httpStatus: 201 });
      return createdResponse(req, rule);
    }

    // -----------------------------------------------------------------------
    // GET ?action=rules — List detection rules
    // -----------------------------------------------------------------------
    if (req.method === 'GET' && action === 'rules') {
      const householdId = url.searchParams.get('household_id');
      if (!householdId) return errorResponse(req, 'household_id is required');

      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', householdId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (!membership) return errorResponse(req, 'Household access denied', 403);

      const { data: rules, error } = await supabase
        .from('anomaly_rules')
        .select(
          'id, name, description, rule_type, config, severity, is_active, created_at, updated_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to list rules', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { rules: rules ?? [] });
    }

    // -----------------------------------------------------------------------
    // GET ?action=alerts — List anomaly alerts
    // -----------------------------------------------------------------------
    if (req.method === 'GET' && action === 'alerts') {
      const householdId = url.searchParams.get('household_id');
      if (!householdId) return errorResponse(req, 'household_id is required');

      const status = url.searchParams.get('status');
      const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50);

      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', householdId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (!membership) return errorResponse(req, 'Household access denied', 403);

      let query = supabase
        .from('anomaly_alerts')
        .select(
          'id, rule_id, transaction_id, alert_type, severity, summary, status, reviewed_at, created_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status && (VALID_ALERT_STATUSES as readonly string[]).includes(status)) {
        query = query.eq('status', status);
      }

      const { data: alerts, error } = await query;

      if (error) {
        logger.error('Failed to list alerts', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { alerts: alerts ?? [] });
    }

    // -----------------------------------------------------------------------
    // PUT ?action=review — Review an alert
    // -----------------------------------------------------------------------
    if (req.method === 'PUT' && action === 'review') {
      const body = (await req.json()) as ReviewAlertRequest;

      if (!body.alert_id) return errorResponse(req, 'alert_id is required');
      if (!body.status || !(VALID_ALERT_STATUSES as readonly string[]).includes(body.status)) {
        return errorResponse(req, `status must be one of: ${VALID_ALERT_STATUSES.join(', ')}`);
      }

      const { data: alert, error: fetchError } = await supabase
        .from('anomaly_alerts')
        .select('id, household_id')
        .eq('id', body.alert_id)
        .is('deleted_at', null)
        .single();

      if (fetchError || !alert) return errorResponse(req, 'Alert not found', 404);

      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', alert.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (!membership) return errorResponse(req, 'Household access denied', 403);

      const { data: updated, error: updateError } = await supabase
        .from('anomaly_alerts')
        .update({
          status: body.status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', body.alert_id)
        .select('id, status, reviewed_at')
        .single();

      if (updateError) {
        logger.error('Failed to update alert', { errorMessage: updateError.message });
        return internalErrorResponse(req);
      }

      logger.info('Alert reviewed', {
        alertId: body.alert_id,
        status: body.status,
        httpStatus: 200,
      });
      return jsonResponse(req, updated);
    }

    // -----------------------------------------------------------------------
    // DELETE — Soft-delete a rule
    // -----------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const ruleId = url.searchParams.get('id');
      if (!ruleId) return errorResponse(req, 'id query parameter is required');

      const { data: rule, error: fetchError } = await supabase
        .from('anomaly_rules')
        .select('id, household_id')
        .eq('id', ruleId)
        .is('deleted_at', null)
        .single();

      if (fetchError || !rule) return errorResponse(req, 'Rule not found', 404);

      const { data: membership } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', rule.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (!membership)
        return errorResponse(req, 'Only household owners and admins can manage rules', 403);

      const { error: deleteError } = await supabase
        .from('anomaly_rules')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', ruleId);

      if (deleteError) {
        logger.error('Failed to soft-delete rule', { errorMessage: deleteError.message });
        return internalErrorResponse(req);
      }

      logger.info('Rule soft-deleted', { ruleId, httpStatus: 204 });
      return noContentResponse(req);
    }

    return methodNotAllowedResponse(req);
  } catch (err) {
    logger.error('Anomaly detection error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
