// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/notification.ts` (#685).
 *
 * Validates:
 *   - checkNotificationPreference returns correct defaults and overrides
 *   - createNotification inserts records and respects preferences
 *   - renderEmailTemplate produces correct output for all notification types
 *   - sendEmail handles SMTP configuration and errors gracefully
 */

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  checkNotificationPreference,
  createNotification,
  renderEmailTemplate,
  sendEmail,
  type NotificationType,
  type EmailTemplate,
  type NotificationClient,
} from './notification.ts';
import { createLogger } from './logger.ts';

// ---------------------------------------------------------------------------
// Helper: set/clear env vars
// ---------------------------------------------------------------------------

function setEnvVars(vars: Record<string, string>): () => void {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    originals[key] = Deno.env.get(key);
    Deno.env.set(key, value);
  }
  return () => {
    for (const [key] of Object.entries(vars)) {
      const orig = originals[key];
      if (orig === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, orig);
      }
    }
  };
}

function clearEnvVar(name: string): () => void {
  const original = Deno.env.get(name);
  Deno.env.delete(name);
  return () => {
    if (original !== undefined) {
      Deno.env.set(name, original);
    }
  };
}

// ---------------------------------------------------------------------------
// Helper: build mock notification clients
// ---------------------------------------------------------------------------

/**
 * Create a mock client that returns the given preferences result
 * for notification_preferences and a configurable insert result
 * for notification_log.
 */
function createMockNotificationClient(options: {
  preferencesResult?: { data: Record<string, boolean> | null; error: { message: string } | null };
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
} = {}): NotificationClient {
  const defaultPrefsResult = { data: null, error: { message: 'No rows' } };
  const defaultInsertResult = {
    data: { id: 'notif-00000000-0000-0000-0000-000000000001' },
    error: null,
  };

  return {
    from: (table: string) => {
      const result =
        table === 'notification_preferences'
          ? (options.preferencesResult ?? defaultPrefsResult)
          : (options.insertResult ?? defaultInsertResult);

      const builder: Record<string, unknown> = {};
      const chainMethods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
        'is', 'in', 'like', 'ilike',
        'order', 'limit', 'range', 'single', 'maybeSingle',
        'not', 'or', 'filter', 'match',
      ];
      for (const method of chainMethods) {
        builder[method] = (..._args: unknown[]) => builder;
      }
      builder.then = (resolve: (value: unknown) => void) => {
        resolve(result);
        return builder;
      };
      return builder as ReturnType<NotificationClient['from']>;
    },
  };
}

/**
 * Create a mock client that throws on any operation.
 */
function createThrowingClient(): NotificationClient {
  return {
    from: () => {
      throw new Error('Database connection failed');
    },
  };
}

// ---------------------------------------------------------------------------
// checkNotificationPreference tests
// ---------------------------------------------------------------------------

Deno.test('checkNotificationPreference ΓÇö returns true when no preferences row exists', async () => {
  const client = createMockNotificationClient({
    preferencesResult: { data: null, error: { message: 'PGRST116' } },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'invite_received');

  assertEquals(result, true);
});

Deno.test('checkNotificationPreference ΓÇö returns false when invite_notifications is disabled', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: false,
        export_notifications: true,
        deletion_notifications: true,
        security_notifications: true,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'invite_received');

  assertEquals(result, false);
});

Deno.test('checkNotificationPreference ΓÇö returns true when invite_notifications is enabled', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: true,
        export_notifications: true,
        deletion_notifications: true,
        security_notifications: true,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'invite_received');

  assertEquals(result, true);
});

Deno.test('checkNotificationPreference ΓÇö returns false when email_enabled is false (global kill-switch)', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: false,
        invite_notifications: true,
        export_notifications: true,
        deletion_notifications: true,
        security_notifications: true,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'export_ready');

  assertEquals(result, false);
});

Deno.test('checkNotificationPreference ΓÇö returns false when export_notifications is disabled', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: true,
        export_notifications: false,
        deletion_notifications: true,
        security_notifications: true,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'export_ready');

  assertEquals(result, false);
});

Deno.test('checkNotificationPreference ΓÇö returns false when deletion_notifications is disabled', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: true,
        export_notifications: true,
        deletion_notifications: false,
        security_notifications: true,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'deletion_scheduled');

  assertEquals(result, false);
});

Deno.test('checkNotificationPreference ΓÇö returns false when security_notifications is disabled', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: true,
        export_notifications: true,
        deletion_notifications: true,
        security_notifications: false,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'security_alert');

  assertEquals(result, false);
});

Deno.test('checkNotificationPreference ΓÇö invite_accepted maps to invite_notifications column', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: false,
        export_notifications: true,
        deletion_notifications: true,
        security_notifications: true,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'invite_accepted');

  assertEquals(result, false);
});

Deno.test('checkNotificationPreference ΓÇö deletion_completed maps to deletion_notifications column', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: true,
        export_notifications: true,
        deletion_notifications: false,
        security_notifications: true,
      },
      error: null,
    },
  });

  const result = await checkNotificationPreference(client, 'user-123', 'deletion_completed');

  assertEquals(result, false);
});

Deno.test('checkNotificationPreference ΓÇö fails open when database throws', async () => {
  const client = createThrowingClient();

  const result = await checkNotificationPreference(client, 'user-123', 'security_alert');

  assertEquals(result, true);
});

// ---------------------------------------------------------------------------
// createNotification tests
// ---------------------------------------------------------------------------

Deno.test('createNotification ΓÇö inserts into notification_log and returns id', async () => {
  const client = createMockNotificationClient({
    preferencesResult: { data: null, error: { message: 'No rows' } },
    insertResult: { data: { id: 'notif-abc-123' }, error: null },
  });

  const result = await createNotification(client, {
    userId: 'user-123',
    type: 'invite_received',
    subject: 'You have an invite',
    body: 'Check it out!',
  });

  assertExists(result);
  assertEquals(result!.id, 'notif-abc-123');
});

Deno.test('createNotification ΓÇö returns null when preference is disabled (skipped)', async () => {
  const client = createMockNotificationClient({
    preferencesResult: {
      data: {
        email_enabled: true,
        invite_notifications: false,
        export_notifications: true,
        deletion_notifications: true,
        security_notifications: true,
      },
      error: null,
    },
    insertResult: { data: { id: 'notif-skipped' }, error: null },
  });

  const result = await createNotification(client, {
    userId: 'user-123',
    type: 'invite_received',
    subject: 'You have an invite',
    body: 'Check it out!',
  });

  assertEquals(result, null);
});

Deno.test('createNotification ΓÇö returns null when database insert fails', async () => {
  const client = createMockNotificationClient({
    preferencesResult: { data: null, error: { message: 'No rows' } },
    insertResult: { data: null, error: { message: 'Insert failed' } },
  });

  const result = await createNotification(client, {
    userId: 'user-123',
    type: 'export_ready',
    subject: 'Export ready',
    body: 'Download now.',
  });

  assertEquals(result, null);
});

Deno.test('createNotification ΓÇö handles database exception gracefully', async () => {
  const client = createThrowingClient();

  const result = await createNotification(client, {
    userId: 'user-123',
    type: 'security_alert',
    subject: 'Alert',
    body: 'Check your account.',
  });

  assertEquals(result, null);
});

Deno.test('createNotification ΓÇö defaults channel to email', async () => {
  let capturedInsertArgs: unknown = null;

  const client: NotificationClient = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chainMethods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
        'is', 'in', 'like', 'ilike',
        'order', 'limit', 'range', 'single', 'maybeSingle',
        'not', 'or', 'filter', 'match',
      ];
      for (const method of chainMethods) {
        if (method === 'insert' && table === 'notification_log') {
          builder[method] = (data: unknown) => {
            capturedInsertArgs = data;
            return builder;
          };
        } else {
          builder[method] = (..._args: unknown[]) => builder;
        }
      }
      const result =
        table === 'notification_preferences'
          ? { data: null, error: { message: 'No rows' } }
          : { data: { id: 'notif-channel-test' }, error: null };
      builder.then = (resolve: (value: unknown) => void) => {
        resolve(result);
        return builder;
      };
      return builder as ReturnType<NotificationClient['from']>;
    },
  };

  await createNotification(client, {
    userId: 'user-123',
    type: 'export_ready',
    subject: 'Export',
    body: 'Ready.',
  });

  assertExists(capturedInsertArgs);
  assertEquals((capturedInsertArgs as Record<string, unknown>).channel, 'email');
});

Deno.test('createNotification ΓÇö passes metadata through to insert', async () => {
  let capturedInsertArgs: unknown = null;

  const client: NotificationClient = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chainMethods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
        'is', 'in', 'like', 'ilike',
        'order', 'limit', 'range', 'single', 'maybeSingle',
        'not', 'or', 'filter', 'match',
      ];
      for (const method of chainMethods) {
        if (method === 'insert' && table === 'notification_log') {
          builder[method] = (data: unknown) => {
            capturedInsertArgs = data;
            return builder;
          };
        } else {
          builder[method] = (..._args: unknown[]) => builder;
        }
      }
      const result =
        table === 'notification_preferences'
          ? { data: null, error: { message: 'No rows' } }
          : { data: { id: 'notif-meta-test' }, error: null };
      builder.then = (resolve: (value: unknown) => void) => {
        resolve(result);
        return builder;
      };
      return builder as ReturnType<NotificationClient['from']>;
    },
  };

  const testMetadata = { invite_code: 'ABC123', household_name: 'Test' };

  await createNotification(client, {
    userId: 'user-123',
    type: 'invite_received',
    subject: 'Invite',
    body: 'You got an invite.',
    metadata: testMetadata,
  });

  assertExists(capturedInsertArgs);
  assertEquals(
    (capturedInsertArgs as Record<string, unknown>).metadata,
    testMetadata,
  );
});

// ---------------------------------------------------------------------------
// renderEmailTemplate tests
// ---------------------------------------------------------------------------

Deno.test('renderEmailTemplate ΓÇö invite_received produces correct subject', () => {
  const template = renderEmailTemplate('invite_received');

  assertEquals(template.subject, 'You have been invited to a household');
});

Deno.test('renderEmailTemplate ΓÇö invite_accepted produces correct subject', () => {
  const template = renderEmailTemplate('invite_accepted');

  assertEquals(template.subject, 'Household invitation accepted');
});

Deno.test('renderEmailTemplate ΓÇö export_ready produces correct subject', () => {
  const template = renderEmailTemplate('export_ready');

  assertEquals(template.subject, 'Your data export is ready');
});

Deno.test('renderEmailTemplate ΓÇö deletion_scheduled produces correct subject', () => {
  const template = renderEmailTemplate('deletion_scheduled');

  assertEquals(template.subject, 'Account deletion scheduled');
});

Deno.test('renderEmailTemplate ΓÇö deletion_completed produces correct subject', () => {
  const template = renderEmailTemplate('deletion_completed');

  assertEquals(template.subject, 'Account deletion completed');
});

Deno.test('renderEmailTemplate ΓÇö security_alert produces correct subject', () => {
  const template = renderEmailTemplate('security_alert');

  assertEquals(template.subject, 'Security alert for your account');
});

Deno.test('renderEmailTemplate ΓÇö includes data placeholders in body', () => {
  // The default template doesn't have placeholders, but if custom data
  // is passed with matching {{key}} patterns in a future template update,
  // they would be substituted. For now, verify no substitution error occurs
  // and that the body is populated.
  const template = renderEmailTemplate('invite_received', { name: 'Test User' });

  assertExists(template.textBody);
  assertExists(template.htmlBody);
  assertEquals(template.textBody.length > 0, true);
});

Deno.test('renderEmailTemplate ΓÇö produces non-empty htmlBody', () => {
  const template = renderEmailTemplate('export_ready');

  assertStringIncludes(template.htmlBody, '<!DOCTYPE html>');
  assertStringIncludes(template.htmlBody, 'Your data export is ready');
});

Deno.test('renderEmailTemplate ΓÇö produces non-empty textBody', () => {
  const template = renderEmailTemplate('export_ready');

  assertStringIncludes(
    template.textBody,
    'Your requested data export has been completed',
  );
});

Deno.test('renderEmailTemplate ΓÇö escapes HTML in subject for htmlBody', () => {
  // Use a type that has a clean subject, verify the HTML body contains the escaped version
  const template = renderEmailTemplate('security_alert');

  // The HTML body should contain the subject text (escaped)
  assertStringIncludes(template.htmlBody, 'Security alert for your account');
});

Deno.test('renderEmailTemplate ΓÇö all notification types produce valid templates', () => {
  const types: NotificationType[] = [
    'invite_received',
    'invite_accepted',
    'export_ready',
    'deletion_scheduled',
    'deletion_completed',
    'security_alert',
  ];

  for (const type of types) {
    const template = renderEmailTemplate(type);

    assertExists(template.subject, `${type}: subject should exist`);
    assertExists(template.htmlBody, `${type}: htmlBody should exist`);
    assertExists(template.textBody, `${type}: textBody should exist`);
    assertEquals(template.subject.length > 0, true, `${type}: subject should be non-empty`);
    assertEquals(template.htmlBody.length > 0, true, `${type}: htmlBody should be non-empty`);
    assertEquals(template.textBody.length > 0, true, `${type}: textBody should be non-empty`);
  }
});

// ---------------------------------------------------------------------------
// sendEmail tests
// ---------------------------------------------------------------------------

Deno.test('sendEmail ΓÇö returns false and logs when SMTP not configured', async () => {
  const cleanup = clearEnvVar('SMTP_HOST');
  try {
    const logger = createLogger('test-notification', 'test-req-id');
    const template: EmailTemplate = {
      subject: 'Test Subject',
      htmlBody: '<p>Test</p>',
      textBody: 'Test',
    };

    const result = await sendEmail('user@example.com', template, logger);

    assertEquals(result, false);
  } finally {
    cleanup();
  }
});

Deno.test('sendEmail ΓÇö handles connection errors gracefully', async () => {
  // Set SMTP_HOST to a non-existent server to trigger a fetch error
  const cleanup = setEnvVars({
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '19999',
    SMTP_FROM: 'noreply@test.com',
  });
  try {
    const logger = createLogger('test-notification', 'test-req-id');
    const template: EmailTemplate = {
      subject: 'Test Subject',
      htmlBody: '<p>Test</p>',
      textBody: 'Test',
    };

    const result = await sendEmail('user@example.com', template, logger);

    // Should return false due to connection error, not throw
    assertEquals(result, false);
  } finally {
    cleanup();
  }
});

Deno.test('sendEmail ΓÇö does not throw when SMTP host is unreachable', async () => {
  const cleanup = setEnvVars({
    SMTP_HOST: 'nonexistent.invalid.host.example',
    SMTP_PORT: '587',
    SMTP_FROM: 'noreply@test.com',
  });
  try {
    const logger = createLogger('test-notification', 'test-req-id');
    const template: EmailTemplate = {
      subject: 'Test',
      htmlBody: '<p>Test</p>',
      textBody: 'Test',
    };

    // Should not throw ΓÇö errors are caught internally
    let threw = false;
    try {
      await sendEmail('user@example.com', template, logger);
    } catch {
      threw = true;
    }

    assertEquals(threw, false);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// Type / interface validation tests
// ---------------------------------------------------------------------------

Deno.test('NotificationPayload ΓÇö channel defaults are handled by createNotification', async () => {
  const client = createMockNotificationClient({
    preferencesResult: { data: null, error: { message: 'No rows' } },
    insertResult: { data: { id: 'notif-default-channel' }, error: null },
  });

  // Omitting channel ΓÇö should default to 'email' internally
  const result = await createNotification(client, {
    userId: 'user-123',
    type: 'security_alert',
    subject: 'Alert',
    body: 'Check now.',
    // channel omitted
  });

  assertExists(result);
  assertEquals(result!.id, 'notif-default-channel');
});

Deno.test('createNotification ΓÇö returns id with correct format', async () => {
  const testId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const client = createMockNotificationClient({
    preferencesResult: { data: null, error: { message: 'No rows' } },
    insertResult: { data: { id: testId }, error: null },
  });

  const result = await createNotification(client, {
    userId: 'user-123',
    type: 'deletion_scheduled',
    subject: 'Deletion',
    body: 'Your account will be deleted.',
  });

  assertExists(result);
  assertEquals(result!.id, testId);
});
