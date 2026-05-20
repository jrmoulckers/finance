// SPDX-License-Identifier: BUSL-1.1

/**
 * Generic undo/redo engine.
 *
 * Manages an action stack with configurable depth, undo/redo support,
 * and automatic expiry of old actions. Designed for transaction edits,
 * category changes, and budget modifications.
 *
 * All operations are pure and immutable — inputs are never mutated.
 *
 * References: issue #1762
 */

import type { UndoAction, UndoActionType, UndoEngineState } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum undo stack depth. */
export const DEFAULT_MAX_DEPTH = 50;

/** Default TTL for undo actions (30 minutes). */
export const DEFAULT_TTL_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Engine creation
// ---------------------------------------------------------------------------

/**
 * Create a fresh undo engine state.
 *
 * @param maxDepth - Maximum number of actions in the undo stack (default 50).
 * @returns A new empty undo engine state.
 */
export function createUndoEngine<T = unknown>(
  maxDepth: number = DEFAULT_MAX_DEPTH,
): UndoEngineState<T> {
  return {
    undoStack: [],
    redoStack: [],
    maxDepth: Math.max(1, Math.round(maxDepth)),
    canUndo: false,
    canRedo: false,
  };
}

// ---------------------------------------------------------------------------
// Action creation
// ---------------------------------------------------------------------------

/**
 * Create a new undo action.
 *
 * @param type          - The type of action.
 * @param description   - Human-readable description.
 * @param previousState - State before the action.
 * @param nextState     - State after the action.
 * @param ttlMs         - Time-to-live in milliseconds (default 30 minutes).
 * @returns A new {@link UndoAction}.
 */
export function createAction<T>(
  type: UndoActionType,
  description: string,
  previousState: T,
  nextState: T,
  ttlMs: number = DEFAULT_TTL_MS,
): UndoAction<T> {
  return {
    id: generateId(),
    type,
    description,
    previousState,
    nextState,
    timestamp: new Date().toISOString(),
    ttlMs,
  };
}

// ---------------------------------------------------------------------------
// Stack operations
// ---------------------------------------------------------------------------

/**
 * Push a new action onto the undo stack.
 *
 * Clears the redo stack (new actions invalidate any undone actions).
 * Trims the undo stack if it exceeds `maxDepth`.
 *
 * @param state  - Current engine state.
 * @param action - The action to push.
 * @returns Updated engine state.
 */
export function pushAction<T>(
  state: UndoEngineState<T>,
  action: UndoAction<T>,
): UndoEngineState<T> {
  const newStack = [...state.undoStack, action];
  // Trim oldest if over max depth
  const trimmed =
    newStack.length > state.maxDepth ? newStack.slice(newStack.length - state.maxDepth) : newStack;

  return {
    ...state,
    undoStack: trimmed,
    redoStack: [],
    canUndo: trimmed.length > 0,
    canRedo: false,
  };
}

/**
 * Undo the most recent action.
 *
 * Moves the action from the undo stack to the redo stack.
 *
 * @param state - Current engine state.
 * @returns Object with updated state and the undone action (null if nothing to undo).
 */
export function undo<T>(state: UndoEngineState<T>): {
  state: UndoEngineState<T>;
  action: UndoAction<T> | null;
} {
  if (state.undoStack.length === 0) {
    return { state, action: null };
  }

  const action = state.undoStack[state.undoStack.length - 1];
  const newUndoStack = state.undoStack.slice(0, -1);
  const newRedoStack = [...state.redoStack, action];

  return {
    state: {
      ...state,
      undoStack: newUndoStack,
      redoStack: newRedoStack,
      canUndo: newUndoStack.length > 0,
      canRedo: true,
    },
    action,
  };
}

/**
 * Redo the most recently undone action.
 *
 * Moves the action from the redo stack back to the undo stack.
 *
 * @param state - Current engine state.
 * @returns Object with updated state and the redone action (null if nothing to redo).
 */
export function redo<T>(state: UndoEngineState<T>): {
  state: UndoEngineState<T>;
  action: UndoAction<T> | null;
} {
  if (state.redoStack.length === 0) {
    return { state, action: null };
  }

  const action = state.redoStack[state.redoStack.length - 1];
  const newRedoStack = state.redoStack.slice(0, -1);
  const newUndoStack = [...state.undoStack, action];

  return {
    state: {
      ...state,
      undoStack: newUndoStack,
      redoStack: newRedoStack,
      canUndo: true,
      canRedo: newRedoStack.length > 0,
    },
    action,
  };
}

/**
 * Remove expired actions from the undo stack.
 *
 * Actions whose TTL has elapsed (based on their timestamp) are removed.
 *
 * @param state - Current engine state.
 * @param now   - Current time as ISO 8601 string (default: `new Date().toISOString()`).
 * @returns Updated engine state with expired actions removed.
 */
export function expireActions<T>(
  state: UndoEngineState<T>,
  now: string = new Date().toISOString(),
): UndoEngineState<T> {
  const nowMs = new Date(now).getTime();

  const filteredUndo = state.undoStack.filter((action) => {
    const actionMs = new Date(action.timestamp).getTime();
    return nowMs - actionMs < action.ttlMs;
  });

  const filteredRedo = state.redoStack.filter((action) => {
    const actionMs = new Date(action.timestamp).getTime();
    return nowMs - actionMs < action.ttlMs;
  });

  return {
    ...state,
    undoStack: filteredUndo,
    redoStack: filteredRedo,
    canUndo: filteredUndo.length > 0,
    canRedo: filteredRedo.length > 0,
  };
}

/**
 * Clear all undo and redo history.
 *
 * @param state - Current engine state.
 * @returns Engine state with empty stacks.
 */
export function clearHistory<T>(state: UndoEngineState<T>): UndoEngineState<T> {
  return {
    ...state,
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
  };
}

/**
 * Get the most recent action description (for UI display).
 *
 * @param state - Current engine state.
 * @returns Description of the last action, or `null` if stack is empty.
 */
export function getLastActionDescription<T>(state: UndoEngineState<T>): string | null {
  if (state.undoStack.length === 0) return null;
  return state.undoStack[state.undoStack.length - 1].description;
}

/**
 * Get the description of the action that would be redone.
 *
 * @param state - Current engine state.
 * @returns Description of the next redo action, or `null` if stack is empty.
 */
export function getRedoActionDescription<T>(state: UndoEngineState<T>): string | null {
  if (state.redoStack.length === 0) return null;
  return state.redoStack[state.redoStack.length - 1].description;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Counter for generating unique action IDs within a session. */
let idCounter = 0;

/**
 * Generate a unique action identifier.
 *
 * Uses a monotonic counter combined with a timestamp for uniqueness.
 *
 * @returns A unique string ID.
 */
function generateId(): string {
  idCounter += 1;
  return `undo-${Date.now()}-${idCounter}`;
}

/**
 * Reset the internal ID counter (for testing only).
 *
 * @internal
 */
export function _resetIdCounter(): void {
  idCounter = 0;
}
