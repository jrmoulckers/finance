// SPDX-License-Identifier: BUSL-1.1

import { AppIcon } from '../icons';
import type { VoiceState } from '../../lib/voice/types';

export interface VoiceButtonProps {
  readonly supported: boolean;
  readonly state: VoiceState;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

const STATE_LABELS: Record<VoiceState, string> = {
  unsupported: 'Voice unavailable',
  idle: 'Start listening',
  starting: 'Starting microphone…',
  listening: 'Stop listening',
  processing: 'Processing…',
  error: 'Try listening again',
};

export function VoiceButton({ supported, state, onStart, onStop }: VoiceButtonProps) {
  const isListening = state === 'starting' || state === 'listening';
  const isBusy = state === 'starting' || state === 'processing';

  return (
    <button
      type="button"
      className={`voice-button voice-button--${state}`}
      onClick={isListening ? onStop : onStart}
      disabled={!supported || isBusy}
      aria-pressed={state === 'listening'}
      aria-label={STATE_LABELS[state]}
    >
      <span className="voice-button__icon-wrap" aria-hidden="true">
        <AppIcon name="mic" size={18} />
        <span className="voice-button__pulse" />
      </span>
      <span className="voice-button__label">{STATE_LABELS[state]}</span>
    </button>
  );
}
