// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_DEPTH,
  DEFAULT_TTL_MS,
  _resetIdCounter,
  clearHistory,
  createAction,
  createUndoEngine,
  expireActions,
  getLastActionDescription,
  getRedoActionDescription,
  pushAction,
  redo,
  undo,
} from './undo-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetIdCounter();
});

function makeAction(desc: string, prev: string = 'old', next: string = 'new') {
  return createAction('transaction_edit', desc, prev, next);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createUndoEngine', () => {
  it('creates empty engine with default depth', () => {
    const engine = createUndoEngine();
    expect(engine.undoStack).toEqual([]);
    expect(engine.redoStack).toEqual([]);
    expect(engine.maxDepth).toBe(DEFAULT_MAX_DEPTH);
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(false);
  });

  it('accepts custom depth', () => {
    const engine = createUndoEngine(10);
    expect(engine.maxDepth).toBe(10);
  });

  it('clamps depth to at least 1', () => {
    const engine = createUndoEngine(0);
    expect(engine.maxDepth).toBe(1);
  });
});

describe('createAction', () => {
  it('creates an action with all fields', () => {
    const action = createAction('transaction_edit', 'Edit amount', 100, 200);
    expect(action.type).toBe('transaction_edit');
    expect(action.description).toBe('Edit amount');
    expect(action.previousState).toBe(100);
    expect(action.nextState).toBe(200);
    expect(action.ttlMs).toBe(DEFAULT_TTL_MS);
    expect(action.id).toMatch(/^undo-/);
    expect(action.timestamp).toBeDefined();
  });

  it('accepts custom TTL', () => {
    const action = createAction('category_change', 'Change cat', 'a', 'b', 5000);
    expect(action.ttlMs).toBe(5000);
  });
});

describe('pushAction', () => {
  it('adds action to undo stack', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('first'));
    expect(engine.undoStack).toHaveLength(1);
    expect(engine.canUndo).toBe(true);
  });

  it('clears redo stack on push', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('first'));
    const { state: afterUndo } = undo(engine);
    expect(afterUndo.canRedo).toBe(true);
    const afterPush = pushAction(afterUndo, makeAction('second'));
    expect(afterPush.redoStack).toEqual([]);
    expect(afterPush.canRedo).toBe(false);
  });

  it('trims oldest actions when exceeding max depth', () => {
    let engine = createUndoEngine(3);
    for (let i = 0; i < 5; i++) {
      engine = pushAction(engine, makeAction(`action-${i}`));
    }
    expect(engine.undoStack).toHaveLength(3);
    expect(engine.undoStack[0].description).toBe('action-2');
  });
});

describe('undo', () => {
  it('undoes the most recent action', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('first'));
    engine = pushAction(engine, makeAction('second'));
    const { state, action } = undo(engine);
    expect(action?.description).toBe('second');
    expect(state.undoStack).toHaveLength(1);
    expect(state.redoStack).toHaveLength(1);
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(true);
  });

  it('returns null when nothing to undo', () => {
    const engine = createUndoEngine();
    const { state, action } = undo(engine);
    expect(action).toBeNull();
    expect(state).toBe(engine);
  });
});

describe('redo', () => {
  it('redoes the most recently undone action', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('first'));
    const { state: afterUndo } = undo(engine);
    const { state: afterRedo, action } = redo(afterUndo);
    expect(action?.description).toBe('first');
    expect(afterRedo.undoStack).toHaveLength(1);
    expect(afterRedo.redoStack).toEqual([]);
    expect(afterRedo.canUndo).toBe(true);
    expect(afterRedo.canRedo).toBe(false);
  });

  it('returns null when nothing to redo', () => {
    const engine = createUndoEngine();
    const { state, action } = redo(engine);
    expect(action).toBeNull();
    expect(state).toBe(engine);
  });
});

describe('undo/redo sequence', () => {
  it('supports multiple undo/redo cycles', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('a'));
    engine = pushAction(engine, makeAction('b'));
    engine = pushAction(engine, makeAction('c'));

    // Undo c, b
    const { state: s1 } = undo(engine);
    const { state: s2 } = undo(s1);
    expect(s2.undoStack).toHaveLength(1);
    expect(s2.redoStack).toHaveLength(2);

    // Redo b
    const { state: s3 } = redo(s2);
    expect(s3.undoStack).toHaveLength(2);
    expect(s3.redoStack).toHaveLength(1);
  });
});

describe('expireActions', () => {
  it('removes expired actions from undo stack', () => {
    let engine = createUndoEngine();
    const oldAction = createAction('transaction_edit', 'old', 'a', 'b', 1000);
    // Manually set timestamp to the past
    const expired = { ...oldAction, timestamp: new Date(Date.now() - 2000).toISOString() };
    engine = pushAction(engine, expired);
    engine = pushAction(engine, makeAction('recent'));

    const result = expireActions(engine);
    expect(result.undoStack).toHaveLength(1);
    expect(result.undoStack[0].description).toBe('recent');
  });

  it('removes expired actions from redo stack', () => {
    let engine = createUndoEngine();
    const expired = {
      ...createAction('transaction_edit', 'old', 'a', 'b', 1000),
      timestamp: new Date(Date.now() - 2000).toISOString(),
    };
    engine = pushAction(engine, expired);
    const { state } = undo(engine);
    const result = expireActions(state);
    expect(result.redoStack).toHaveLength(0);
    expect(result.canRedo).toBe(false);
  });

  it('keeps non-expired actions', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('recent'));
    const result = expireActions(engine);
    expect(result.undoStack).toHaveLength(1);
  });
});

describe('clearHistory', () => {
  it('clears all stacks', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('a'));
    engine = pushAction(engine, makeAction('b'));
    const cleared = clearHistory(engine);
    expect(cleared.undoStack).toEqual([]);
    expect(cleared.redoStack).toEqual([]);
    expect(cleared.canUndo).toBe(false);
    expect(cleared.canRedo).toBe(false);
    expect(cleared.maxDepth).toBe(engine.maxDepth);
  });
});

describe('getLastActionDescription', () => {
  it('returns last action description', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('first'));
    engine = pushAction(engine, makeAction('second'));
    expect(getLastActionDescription(engine)).toBe('second');
  });

  it('returns null when empty', () => {
    expect(getLastActionDescription(createUndoEngine())).toBeNull();
  });
});

describe('getRedoActionDescription', () => {
  it('returns redo action description', () => {
    let engine = createUndoEngine();
    engine = pushAction(engine, makeAction('first'));
    const { state } = undo(engine);
    expect(getRedoActionDescription(state)).toBe('first');
  });

  it('returns null when empty', () => {
    expect(getRedoActionDescription(createUndoEngine())).toBeNull();
  });
});
