// SPDX-License-Identifier: BUSL-1.1

import type {
  VoiceRecognitionCallbacks,
  VoiceRecognitionController,
  VoiceRecognitionError,
  VoiceRecognitionOptions,
  VoiceState,
} from './types';

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function emitState(callbacks: VoiceRecognitionCallbacks, state: VoiceState): void {
  callbacks.onStateChange?.(state);
}

function toRecognitionError(code: string): VoiceRecognitionError {
  switch (code) {
    case 'aborted':
      return { code: 'aborted', message: 'Voice capture was cancelled.', recoverable: true };
    case 'audio-capture':
      return {
        code: 'audio-capture',
        message: 'No microphone was available for voice capture.',
        recoverable: false,
      };
    case 'language-not-supported':
      return {
        code: 'language-not-supported',
        message: 'The selected speech recognition language is not supported.',
        recoverable: false,
      };
    case 'network':
      return {
        code: 'network',
        message: 'Speech recognition failed because the browser service was unavailable.',
        recoverable: true,
      };
    case 'no-speech':
      return {
        code: 'no-speech',
        message: 'No speech was detected. Try speaking a little closer to the mic.',
        recoverable: true,
      };
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code: 'not-allowed',
        message: 'Microphone access is blocked. Allow mic access to use voice entry.',
        recoverable: false,
      };
    default:
      return {
        code: 'unknown',
        message: 'Voice recognition failed unexpectedly.',
        recoverable: true,
      };
  }
}

export function isVoiceRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export function createVoiceRecognition(
  callbacks: VoiceRecognitionCallbacks,
  options: VoiceRecognitionOptions = {},
): VoiceRecognitionController {
  const RecognitionConstructor = getRecognitionConstructor();
  if (!RecognitionConstructor) {
    emitState(callbacks, 'unsupported');
    return {
      supported: false,
      start: () => false,
      stop: () => {},
      abort: () => {},
      updateLanguage: () => {},
      dispose: () => {},
    };
  }

  const recognition = new RecognitionConstructor();
  recognition.continuous = options.continuous ?? true;
  recognition.interimResults = options.interimResults ?? true;
  recognition.lang = options.language ?? 'en-US';
  recognition.maxAlternatives = 1;

  let isStopping = false;
  let disposed = false;

  recognition.onstart = () => {
    emitState(callbacks, 'listening');
  };

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    let confidence = 0;

    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternative = result[0];
      if (!alternative) {
        continue;
      }

      confidence = Math.max(confidence, alternative.confidence ?? 0);
      if (result.isFinal) {
        finalTranscript += `${alternative.transcript} `;
      } else {
        interimTranscript += `${alternative.transcript} `;
      }
    }

    callbacks.onTranscript?.({
      finalTranscript: finalTranscript.trim(),
      interimTranscript: interimTranscript.trim(),
      confidence,
      isFinal: interimTranscript.trim().length === 0,
    });
  };

  recognition.onerror = (event) => {
    const error = toRecognitionError(event.error);
    emitState(callbacks, 'error');
    callbacks.onError?.(error);
  };

  recognition.onend = () => {
    if (disposed) {
      return;
    }

    emitState(callbacks, isStopping ? 'idle' : 'processing');
    if (!isStopping) {
      emitState(callbacks, 'idle');
    }
    isStopping = false;
  };

  return {
    supported: true,
    start: () => {
      if (disposed) {
        return false;
      }

      try {
        isStopping = false;
        emitState(callbacks, 'starting');
        recognition.start();
        return true;
      } catch {
        return false;
      }
    },
    stop: () => {
      if (disposed) {
        return;
      }

      isStopping = true;
      emitState(callbacks, 'processing');
      recognition.stop();
    },
    abort: () => {
      if (disposed) {
        return;
      }

      isStopping = true;
      recognition.abort();
      emitState(callbacks, 'idle');
    },
    updateLanguage: (language: string) => {
      recognition.lang = language;
    },
    dispose: () => {
      disposed = true;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
    },
  };
}
