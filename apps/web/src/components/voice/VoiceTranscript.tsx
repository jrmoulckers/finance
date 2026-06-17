// SPDX-License-Identifier: BUSL-1.1

import type {
  ParsedVoiceTransaction,
  TranscriptHighlight,
  VoiceState,
} from '../../lib/voice/types';

export interface VoiceTranscriptProps {
  readonly finalTranscript: string;
  readonly interimTranscript: string;
  readonly parsedTransaction: ParsedVoiceTransaction | null;
  readonly state: VoiceState;
  readonly errorMessage?: string | null;
}

interface HighlightSegment {
  readonly text: string;
  readonly field?: TranscriptHighlight['field'];
}

function buildSegments(
  text: string,
  highlights: readonly TranscriptHighlight[],
): HighlightSegment[] {
  if (!text || highlights.length === 0) {
    return [{ text }];
  }

  const ranges: Array<{ start: number; end: number; field: TranscriptHighlight['field'] }> = [];
  const lowerText = text.toLowerCase();

  for (const highlight of highlights) {
    const needle = highlight.text.trim().toLowerCase();
    if (!needle) {
      continue;
    }

    const start = lowerText.indexOf(needle);
    if (start === -1) {
      continue;
    }

    const end = start + needle.length;
    const overlaps = ranges.some((range) => !(end <= range.start || start >= range.end));
    if (!overlaps) {
      ranges.push({ start, end, field: highlight.field });
    }
  }

  if (ranges.length === 0) {
    return [{ text }];
  }

  ranges.sort((left, right) => left.start - right.start);
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start) });
    }
    segments.push({ text: text.slice(range.start, range.end), field: range.field });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments;
}

function renderFieldPill(label: string, value: string | null | undefined, field: string) {
  if (!value) {
    return null;
  }

  return (
    <span key={field} className={`voice-transcript__pill voice-transcript__pill--${field}`}>
      <strong>{label}:</strong> {value}
    </span>
  );
}

export function VoiceTranscript({
  finalTranscript,
  interimTranscript,
  parsedTransaction,
  state,
  errorMessage,
}: VoiceTranscriptProps) {
  const combinedTranscript = [finalTranscript, interimTranscript].filter(Boolean).join(' ').trim();
  const segments = buildSegments(combinedTranscript, parsedTransaction?.highlights ?? []);

  return (
    <section className="voice-transcript" aria-label="Voice transcript and parsed fields">
      <div className="voice-transcript__surface" aria-live="polite">
        {combinedTranscript ? (
          <p className="voice-transcript__text">
            {segments.map((segment, index) =>
              segment.field ? (
                <mark
                  key={`${segment.field}-${index}`}
                  className={`voice-transcript__mark voice-transcript__mark--${segment.field}`}
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={`plain-${index}`}>{segment.text}</span>
              ),
            )}
          </p>
        ) : (
          <p className="voice-transcript__placeholder">
            {state === 'listening'
              ? 'Listening… try “Spent $45 at Whole Foods on groceries”.'
              : 'Tap the mic and say a transaction naturally.'}
          </p>
        )}
        {interimTranscript && <p className="voice-transcript__interim">{interimTranscript}</p>}
        {errorMessage && (
          <p className="voice-transcript__error" role="alert">
            {errorMessage}
          </p>
        )}
      </div>

      {parsedTransaction && combinedTranscript && (
        <div className="voice-transcript__pills" aria-label="Parsed transaction fields">
          {renderFieldPill(
            'Amount',
            parsedTransaction.amountCents != null
              ? `$${(parsedTransaction.amountCents / 100).toFixed(2)}`
              : null,
            'amount',
          )}
          {renderFieldPill('Payee', parsedTransaction.payee, 'payee')}
          {renderFieldPill('Category', parsedTransaction.category, 'category')}
          {renderFieldPill('Date', parsedTransaction.date, 'date')}
          {renderFieldPill('Transfer', parsedTransaction.transferAccount, 'account')}
          {renderFieldPill('Split with', parsedTransaction.splitWith, 'counterparty')}
        </div>
      )}
    </section>
  );
}
