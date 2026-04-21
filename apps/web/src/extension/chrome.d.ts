// SPDX-License-Identifier: BUSL-1.1

/**
 * Minimal Chrome extension API type declarations.
 *
 * This avoids pulling in the full `@types/chrome` package for the small
 * subset of APIs used by the receipt-capture popup / content scripts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace chrome {
  namespace action {
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function sendMessage(tabId: number, message: any): Promise<any>;
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[]): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
    }
    const local: StorageArea;
    const onChanged: {
      addListener(
        callback: (
          changes: Record<string, { oldValue?: any; newValue?: any }>,
          areaName: string,
        ) => void,
      ): void;
    };
  }

  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
    }
    function getURL(path: string): string;
    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: any) => void,
        ) => void,
      ): void;
    };
  }
}
