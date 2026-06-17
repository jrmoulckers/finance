// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  extractTablesFromSql,
  notifyDataChange,
  resetCrossTabSyncForTesting,
  subscribeToDataChanges,
  subscribeToIncomingCrossTabChanges,
} from './crossTab';

class BroadcastChannelMock {
  static instances: BroadcastChannelMock[] = [];
  name: string;
  listeners = new Set<(event: MessageEvent) => void>();

  constructor(name: string) {
    this.name = name;
    BroadcastChannelMock.instances.push(this);
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }

  postMessage(_data: unknown): void {
    // No-op for local tests.
  }

  close(): void {
    this.listeners.clear();
  }

  emit(data: unknown): void {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

describe('crossTab sync utilities', () => {
  beforeEach(() => {
    BroadcastChannelMock.instances = [];
    resetCrossTabSyncForTesting();
    Object.defineProperty(window, 'BroadcastChannel', {
      configurable: true,
      writable: true,
      value: BroadcastChannelMock,
    });
  });

  afterEach(() => {
    resetCrossTabSyncForTesting();
  });

  it('extracts referenced tables from SQL queries', () => {
    expect(
      extractTablesFromSql(
        'SELECT * FROM "transaction" t JOIN account a ON a.id = t.account_id WHERE t.deleted_at IS NULL',
      ),
    ).toEqual(['transaction', 'account']);
  });

  it('notifies local subscribers immediately', () => {
    const events: string[] = [];
    const unsubscribe = subscribeToDataChanges((event) => {
      events.push(`${event.source}:${event.tables.join(',')}`);
    });

    notifyDataChange(['transaction', 'account']);
    unsubscribe();

    expect(events).toEqual(['local:transaction,account']);
  });

  it('surfaces incoming cross-tab broadcasts', () => {
    const events: string[] = [];
    const unsubscribe = subscribeToIncomingCrossTabChanges((event) => {
      events.push(`${event.source}:${event.tables.join(',')}`);
    });

    const channel = BroadcastChannelMock.instances[0];
    channel.emit({
      type: 'data_change',
      origin: 'remote-tab',
      tables: ['budget'],
      timestamp: Date.now(),
    });
    unsubscribe();

    expect(events).toEqual(['cross-tab:budget']);
  });
});
