// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDatabase } from '../../db/DatabaseProvider';
import { useAccounts, useBudgets, useCategories, useGoals } from '../../hooks';
import { executeFinancialQuery } from '../../lib/ai/executor';
import { formatFinancialQueryResponse } from '../../lib/ai/formatter';
import { parseFinancialQuery } from '../../lib/ai/parser';
import {
  QUICK_QUERY_CHIPS,
  QUERY_SUGGESTION_GROUPS,
  type FormattedFinancialResponse,
} from '../../lib/ai/types';
import '../forms/forms.css';
import './query-engine.css';

interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly response?: FormattedFinancialResponse;
}

const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  id: 'assistant-welcome',
  role: 'assistant',
  text: 'Ask about spending, income, budgets, goals, transactions, or monthly trends. Everything runs locally against your SQLite data.',
};

function createAssistantFallback(): FormattedFinancialResponse {
  return {
    title: 'Try one of these local finance questions',
    summary:
      'I can answer questions about spending, income, categories, transactions, budgets, goals, and trends using your on-device data.',
    highlights: QUERY_SUGGESTION_GROUPS.slice(0, 3).map((group) => ({
      label: group.label,
      value: group.examples[0],
    })),
    details: QUERY_SUGGESTION_GROUPS.flatMap((group) => group.examples.slice(0, 1)),
  };
}

export const QueryEngine: React.FC = () => {
  const db = useDatabase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_ASSISTANT_MESSAGE]);

  const { categories, loading: categoriesLoading } = useCategories();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { budgets, loading: budgetsLoading } = useBudgets();
  const { goals, loading: goalsLoading } = useGoals();

  const autocompleteOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...QUERY_SUGGESTION_GROUPS.flatMap((group) => group.examples),
          ...categories.map((category) => `How much did I spend on ${category.name} this month?`),
          ...accounts.map((account) => `What did I spend from ${account.name} this month?`),
          ...goals.map((goal) => `How is my ${goal.name} goal doing?`),
          ...budgets.map((budget) => `How is my ${budget.name} budget this month?`),
        ]),
      ),
    [accounts, budgets, categories, goals],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isOpen]);

  const appendAssistantMessage = useCallback(
    (text: string, response?: FormattedFinancialResponse) => {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: 'assistant',
          text,
          response,
        },
      ]);
    },
    [],
  );

  const runQuery = useCallback(
    (queryText: string) => {
      const trimmedQuery = queryText.trim();
      if (!trimmedQuery || isRunning) {
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `user-${crypto.randomUUID()}`,
          role: 'user',
          text: trimmedQuery,
        },
      ]);
      setInputValue('');
      setIsRunning(true);

      try {
        const parsed = parseFinancialQuery(trimmedQuery, {
          knownCategories: categories.map((category) => category.name),
          knownAccounts: accounts.map((account) => account.name),
          knownBudgets: budgets.map((budget) => budget.name),
          knownGoals: goals.map((goal) => goal.name),
        });

        if (parsed.confidence < 0.3) {
          appendAssistantMessage(
            'I need a little more detail to answer that precisely.',
            createAssistantFallback(),
          );
          return;
        }

        const executionResult = executeFinancialQuery(db, parsed);
        const formatted = formatFinancialQueryResponse(executionResult);
        appendAssistantMessage(formatted.summary, formatted);
      } catch (error) {
        appendAssistantMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while querying your local financial data.',
          {
            title: 'Query failed',
            summary: 'I hit a problem while reading your local data. Please try a different query.',
            highlights: [],
            details: [
              error instanceof Error ? error.message : 'Unknown local query error',
              'Tip: try using a simpler category, account, or date range.',
            ],
            tone: 'warning',
          },
        );
      } finally {
        setIsRunning(false);
      }
    },
    [accounts, appendAssistantMessage, budgets, categories, db, goals, isRunning],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      runQuery(inputValue);
    },
    [inputValue, runQuery],
  );

  const dataLoading = categoriesLoading || accountsLoading || budgetsLoading || goalsLoading;

  return (
    <>
      <button
        type="button"
        className="ai-query-engine__fab"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label="Ask finance AI"
      >
        Ask finance AI
      </button>

      {isOpen ? (
        <div
          className="form-dialog ai-query-engine__dialog"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <div className="form-dialog__backdrop" />
          <section
            className="form-dialog__panel ai-query-engine__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-query-engine-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ai-query-engine__header">
              <div>
                <p className="ai-query-engine__eyebrow">Local-first finance assistant</p>
                <h2
                  id="ai-query-engine-title"
                  className="form-dialog__title ai-query-engine__title"
                >
                  AI Natural Language Query Engine
                </h2>
                <p className="ai-query-engine__meta">
                  Rule-based parser • SQLite execution • No external API calls
                </p>
              </div>
              <button
                type="button"
                className="form-button form-button--secondary ai-query-engine__close"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </header>

            {dataLoading ? (
              <p className="ai-query-engine__loading">
                Loading your local categories, accounts, budgets, and goals…
              </p>
            ) : null}

            <div
              className="ai-query-engine__messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`ai-query-engine__message ai-query-engine__message--${message.role}`}
                >
                  <p className="ai-query-engine__bubble">{message.text}</p>
                  {message.response ? (
                    <div
                      className={`ai-query-engine__card ai-query-engine__card--${message.response.tone ?? 'neutral'}`}
                    >
                      <h3 className="ai-query-engine__card-title">{message.response.title}</h3>
                      <p className="ai-query-engine__card-summary">{message.response.summary}</p>
                      {message.response.highlights.length > 0 ? (
                        <dl className="ai-query-engine__highlights">
                          {message.response.highlights.map((highlight) => (
                            <div
                              key={`${message.id}-${highlight.label}`}
                              className="ai-query-engine__highlight"
                            >
                              <dt>{highlight.label}</dt>
                              <dd>{highlight.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {message.response.details.length > 0 ? (
                        <ul className="ai-query-engine__details">
                          {message.response.details.map((detail) => (
                            <li key={`${message.id}-${detail}`}>{detail}</li>
                          ))}
                        </ul>
                      ) : null}
                      {message.response.emptyState ? (
                        <p className="ai-query-engine__empty-hint">{message.response.emptyState}</p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}

              {isRunning ? <p className="ai-query-engine__thinking">Thinking locally…</p> : null}
            </div>

            <section className="ai-query-engine__chips" aria-label="Suggested financial questions">
              {QUICK_QUERY_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="ai-query-engine__chip"
                  onClick={() => runQuery(chip)}
                  disabled={isRunning}
                >
                  {chip}
                </button>
              ))}
            </section>

            <form className="ai-query-engine__composer" onSubmit={handleSubmit}>
              <label htmlFor="ai-query-engine-input" className="sr-only">
                Ask a question about your finances
              </label>
              <input
                id="ai-query-engine-input"
                ref={inputRef}
                list="ai-query-engine-suggestions"
                className="form-group__input ai-query-engine__input"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Ask about spending, income, budgets, goals, or trends"
                autoComplete="off"
                disabled={isRunning}
              />
              <datalist id="ai-query-engine-suggestions">
                {autocompleteOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <div className="ai-query-engine__composer-actions">
                <button
                  type="submit"
                  className="form-button form-button--primary"
                  disabled={isRunning || inputValue.trim().length === 0}
                >
                  {isRunning ? 'Querying…' : 'Ask'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
};

export default QueryEngine;
