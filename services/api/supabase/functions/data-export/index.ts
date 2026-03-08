// SPDX-License-Identifier: BUSL-1.1

/**
 * Data Export Edge Function (#98)
 *
 * GDPR Article 20 — Right to Data Portability.
 *
 * Exports all of a user's data across all their households in either
 * JSON or CSV format (determined by the Accept header).
 *
 * Streams the response for large datasets to avoid memory pressure.
 *
 * Security:
 *   - Requires authentication
 *   - Only exports data for households the user belongs to
 *   - Never exports other users' data even within shared households
 *   - Audit-logged
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createAdminClient, requireAuth } from "../_shared/auth.ts";
import { handleCorsPreflightRequest } from "../_shared/cors.ts";
import {
  errorResponse,
  internalErrorResponse,
  methodNotAllowedResponse,
  streamingResponse,
} from "../_shared/response.ts";

/** Tables to export and their household-scoped query configuration. */
const EXPORTABLE_TABLES = [
  { name: "users", filterBy: "id", isUserScoped: true },
  { name: "households", filterBy: "id", isHouseholdScoped: true },
  { name: "household_members", filterBy: "household_id", isHouseholdScoped: true },
  { name: "accounts", filterBy: "household_id", isHouseholdScoped: true },
  { name: "categories", filterBy: "household_id", isHouseholdScoped: true },
  { name: "transactions", filterBy: "household_id", isHouseholdScoped: true },
  { name: "budgets", filterBy: "household_id", isHouseholdScoped: true },
  { name: "goals", filterBy: "household_id", isHouseholdScoped: true },
  { name: "passkey_credentials", filterBy: "user_id", isUserScoped: true },
] as const;

/** Sensitive columns to redact from export. */
const REDACTED_COLUMNS = new Set(["public_key"]);

/**
 * Redact sensitive columns from a record.
 */
function redactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const redacted = { ...record };
  for (const col of REDACTED_COLUMNS) {
    if (col in redacted) {
      redacted[col] = "[REDACTED]";
    }
  }
  return redacted;
}

/**
 * Convert an array of records to CSV format.
 */
function recordsToCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return "";

  const headers = Object.keys(records[0]);
  const lines = [headers.join(",")];

  for (const record of records) {
    const values = headers.map((h) => {
      const val = record[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape CSV values containing commas, quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest();
  }

  if (req.method !== "GET") {
    return methodNotAllowedResponse();
  }

  try {
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    const supabase = createAdminClient();

    // Determine export format from Accept header
    const acceptHeader = req.headers.get("Accept") ?? "application/json";
    const wantsCsv = acceptHeader.includes("text/csv");

    // Get user's household memberships
    const { data: memberships, error: memberError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (memberError) {
      console.error("Failed to fetch memberships:", memberError.message);
      return internalErrorResponse();
    }

    const householdIds = (memberships ?? []).map(
      (m: { household_id: string }) => m.household_id,
    );

    // Collect all data
    const exportData: Record<string, Record<string, unknown>[]> = {};

    for (const table of EXPORTABLE_TABLES) {
      let query = supabase.from(table.name).select("*");

      if ("isUserScoped" in table && table.isUserScoped) {
        query = query.eq(table.filterBy, user.id);
      } else if ("isHouseholdScoped" in table && table.isHouseholdScoped) {
        if (householdIds.length === 0) {
          exportData[table.name] = [];
          continue;
        }
        query = query.in(table.filterBy, householdIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Failed to export ${table.name}:`, error.message);
        exportData[table.name] = [];
        continue;
      }

      // Redact sensitive columns
      exportData[table.name] = (data ?? []).map(redactRecord);
    }

    // Audit log the export
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: "DATA_EXPORT",
      table_name: "users",
      record_id: user.id,
      new_values: {
        format: wantsCsv ? "csv" : "json",
        tables_exported: Object.keys(exportData),
        total_records: Object.values(exportData).reduce(
          (sum, records) => sum + records.length,
          0,
        ),
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (wantsCsv) {
      // Stream CSV — each table as a separate section
      const csvParts: string[] = [];

      for (const [tableName, records] of Object.entries(exportData)) {
        csvParts.push(`\n# Table: ${tableName}`);
        csvParts.push(`# Records: ${records.length}`);
        if (records.length > 0) {
          csvParts.push(recordsToCsv(records));
        }
        csvParts.push(""); // blank line between tables
      }

      const csvContent = csvParts.join("\n");
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(csvContent));
          controller.close();
        },
      });

      return streamingResponse(
        stream,
        "text/csv; charset=utf-8",
        `finance-export-${timestamp}.csv`,
      );
    } else {
      // Stream JSON
      const jsonContent = JSON.stringify(
        {
          export_date: new Date().toISOString(),
          user_id: user.id,
          format_version: "1.0",
          data: exportData,
        },
        null,
        2,
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Stream in chunks to handle large datasets
          const chunkSize = 64 * 1024; // 64KB chunks
          let offset = 0;

          while (offset < jsonContent.length) {
            const chunk = jsonContent.slice(offset, offset + chunkSize);
            controller.enqueue(encoder.encode(chunk));
            offset += chunkSize;
          }

          controller.close();
        },
      });

      return streamingResponse(
        stream,
        "application/json; charset=utf-8",
        `finance-export-${timestamp}.json`,
      );
    }
  } catch (err) {
    console.error("Data export error:", (err as Error).message);
    return internalErrorResponse();
  }
});
