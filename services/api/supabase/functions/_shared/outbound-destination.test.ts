// SPDX-License-Identifier: BUSL-1.1

import {
  createDirectOutboundTransport,
  directOutboundTransport,
  OutboundDestinationError,
  validateOutboundDestination,
} from './outbound-destination.ts';
import { createWebhookEvent, deliverWebhook, type WebhookEndpoint } from './webhook.ts';
import type { Logger } from './logger.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message = 'Values are not equal'): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function assertDestinationRejected(url: string): Promise<void> {
  try {
    await validateOutboundDestination(url);
  } catch (error) {
    assert(
      error instanceof OutboundDestinationError,
      `Expected OutboundDestinationError for ${url}`,
    );
    return;
  }
  throw new Error(`Expected destination rejection for ${url}`);
}

const endpoint: WebhookEndpoint = {
  id: 'webhook-test-id',
  url: 'https://hooks.example.com/events',
  secret: 'test-webhook-secret',
  events: ['transaction.created'],
  is_active: true,
};

const ipEndpoint: WebhookEndpoint = {
  ...endpoint,
  url: 'https://93.184.216.34/events',
};

const event = createWebhookEvent('transaction.created', 'household-id', 'entity-id', {
  changed: true,
});

const logger: Logger = {
  requestId: 'request-id',
  setUserId: () => undefined,
  elapsed: () => 0,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

Deno.test('outbound destination: rejects every DNS hostname', async () => {
  for (const url of [
    'https://hooks.example.com/events',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://localhost/hook',
  ]) {
    await assertDestinationRejected(url);
  }
});

Deno.test('outbound destination: allows a globally routable IPv4 literal', async () => {
  const destination = await validateOutboundDestination('https://93.184.216.34/hook');

  assertEquals(destination.hostname, '93.184.216.34');
});

Deno.test('outbound destination: rejects prohibited schemes', async () => {
  for (const url of [
    'http://hooks.example.com/events',
    'ftp://hooks.example.com/events',
    'file:///etc/passwd',
  ]) {
    await assertDestinationRejected(url);
  }
});

Deno.test(
  'outbound destination: rejects loopback textual variants and host confusion',
  async () => {
    for (const url of [
      'https://127.0.0.1/hook',
      'https://2130706433/hook',
      'https://0177.0.0.1/hook',
      'https://0x7f000001/hook',
      'https://127.1/hook',
      'https://localhost./hook',
      'https://api.localhost./hook',
      ['https://user', '@hooks.example.com/hook'].join(''),
      ['https://user', ':', 'password', '@hooks.example.com/hook'].join(''),
    ]) {
      await assertDestinationRejected(url);
    }
  },
);

Deno.test(
  'outbound destination: rejects private, link-local, metadata, and reserved IPv4',
  async () => {
    for (const address of [
      '0.0.0.0',
      '10.0.0.1',
      '100.100.100.200',
      '127.0.0.1',
      '168.63.129.16',
      '169.254.169.254',
      '172.16.0.1',
      '192.0.2.1',
      '192.168.1.1',
      '198.18.0.1',
      '224.0.0.1',
      '240.0.0.1',
    ]) {
      await assertDestinationRejected(`https://${address}/hook`);
    }
  },
);

Deno.test(
  'outbound destination: rejects loopback, private, link-local, mapped, and reserved IPv6',
  async () => {
    for (const address of [
      '::',
      '::1',
      '::ffff:127.0.0.1',
      '2001:db8::1',
      'fc00::1',
      'fd00:ec2::254',
      'fe80::1',
      'ff02::1',
    ]) {
      await assertDestinationRejected(`https://[${address}]/hook`);
    }
  },
);

Deno.test('outbound destination: rejects malformed URLs', async () => {
  await assertDestinationRejected('not a URL');
});

Deno.test(
  'default production transport rejects a DNS hostname before any network operation',
  async () => {
    try {
      await directOutboundTransport.send('https://rebind.attacker.example/hook', {
        method: 'POST',
      });
    } catch (error) {
      assert(error instanceof OutboundDestinationError, 'Expected policy rejection before fetch');
      return;
    }
    throw new Error('Expected the production direct transport to reject a DNS hostname');
  },
);

Deno.test('direct transport never passes a DNS hostname to injected fetch', async () => {
  let fetchCalls = 0;
  const transport = createDirectOutboundTransport({
    fetch: () => {
      fetchCalls += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  try {
    await transport.send('https://rebind.attacker.example/hook', { method: 'POST' });
  } catch (error) {
    assert(error instanceof OutboundDestinationError, 'Expected DNS hostname rejection');
  }

  assertEquals(fetchCalls, 0);
});

Deno.test(
  'webhook delivery: disables redirects and treats redirect responses as failures',
  async () => {
    let redirectMode: RequestRedirect | undefined;
    const transport = createDirectOutboundTransport({
      fetch: (_input, init) => {
        redirectMode = init?.redirect;
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: 'https://127.0.0.1/internal' },
          }),
        );
      },
    });

    const result = await deliverWebhook(ipEndpoint, event, logger, transport);

    assertEquals(redirectMode, 'manual');
    assertEquals(result.success, false);
    assertEquals(result.status_code, 302);
    assertEquals(result.error, 'HTTP 302');
  },
);

Deno.test(
  'webhook delivery: validation failure prevents fetch and returns a safe error',
  async () => {
    let fetchCalls = 0;
    const transport = createDirectOutboundTransport({
      fetch: () => {
        fetchCalls += 1;
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    const result = await deliverWebhook(endpoint, event, logger, transport);

    assertEquals(fetchCalls, 0);
    assertEquals(result.success, false);
    assertEquals(result.status_code, undefined);
    assertEquals(result.error, 'Webhook destination rejected');
  },
);

Deno.test('webhook delivery: deadline settles when direct fetch ignores abort', async () => {
  const fetchState: { signal: AbortSignal | null } = { signal: null };
  const transport = createDirectOutboundTransport({
    fetch: (_input, init) => {
      fetchState.signal = init?.signal ?? null;
      return new Promise<Response>(() => undefined);
    },
  });

  const result = await deliverWebhook(ipEndpoint, event, logger, transport, 5);

  assertEquals(result.success, false);
  assertEquals(result.status_code, undefined);
  assertEquals(result.error, 'Timeout after 5ms');
  const fetchSignal = fetchState.signal;
  assert(fetchSignal !== null && fetchSignal.aborted, 'Expected timeout to abort fetch signal');
});

Deno.test(
  'webhook delivery: deadline settles when an injected transport send never resolves',
  async () => {
    const sendState: { signal: AbortSignal | null } = { signal: null };
    const transport = {
      send: (_url: string, init: RequestInit) => {
        sendState.signal = init.signal ?? null;
        return new Promise<Response>(() => undefined);
      },
    };

    const result = await deliverWebhook(endpoint, event, logger, transport, 5);

    assertEquals(result.success, false);
    assertEquals(result.error, 'Timeout after 5ms');
    const sendSignal = sendState.signal;
    assert(sendSignal !== null && sendSignal.aborted, 'Expected timeout to abort transport signal');
  },
);
