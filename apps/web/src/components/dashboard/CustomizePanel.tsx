// SPDX-License-Identifier: BUSL-1.1

/**
 * Dashboard customization panel component.
 *
 * Allows users to toggle widget visibility, reorder widgets, and reset
 * to defaults. Rendered as a dialog with focus trapping and keyboard support.
 *
 * References: issue #315
 * @module components/dashboard/CustomizePanel
 */

import { useCallback, useRef, useState, type DragEvent, type FC, type KeyboardEvent } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { WIDGET_DEFINITION_MAP, type WidgetConfig, type WidgetId } from './widget-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CustomizePanelProps {
  /** Whether the customization panel is open. */
  isOpen: boolean;
  /** All widget configurations, in display order. */
  widgets: readonly WidgetConfig[];
  /** Toggle a widget's visibility. */
  onToggle: (id: WidgetId) => void;
  /** Move a widget up or down. */
  onMove: (id: WidgetId, direction: 'up' | 'down') => void;
  /** Move a widget to an arbitrary index (drag-and-drop reordering). */
  onReorder: (id: WidgetId, targetIndex: number) => void;
  /** Reset all widgets to default layout. */
  onReset: () => void;
  /** Close the customization panel. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CustomizePanel: FC<CustomizePanelProps> = ({
  isOpen,
  widgets,
  onToggle,
  onMove,
  onReorder,
  onReset,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);
  const [dragOverId, setDragOverId] = useState<WidgetId | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const announceReorder = useCallback((label: string, position: number, total: number) => {
    setStatusMessage(`${label} moved to position ${position} of ${total}.`);
  }, []);

  const handleMove = useCallback(
    (id: WidgetId, direction: 'up' | 'down', index: number, label: string) => {
      onMove(id, direction);
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      announceReorder(label, newIndex + 1, widgets.length);
    },
    [onMove, announceReorder, widgets.length],
  );

  const handleDragStart = useCallback((e: DragEvent<HTMLLIElement>, id: WidgetId) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires drag data to be set for the drag to initiate.
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragEnter = useCallback(
    (id: WidgetId) => {
      if (draggingId !== null && id !== draggingId) {
        setDragOverId(id);
      }
    },
    [draggingId],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLLIElement>) => {
    // Calling preventDefault marks this element as a valid drop target.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLLIElement>, targetId: WidgetId, targetIndex: number) => {
      e.preventDefault();
      if (draggingId !== null && draggingId !== targetId) {
        onReorder(draggingId, targetIndex);
        const def = WIDGET_DEFINITION_MAP.get(draggingId);
        announceReorder(def?.label ?? 'Widget', targetIndex + 1, widgets.length);
      }
      setDraggingId(null);
      setDragOverId(null);
    },
    [draggingId, onReorder, announceReorder, widgets.length],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="form-dialog" role="presentation" onKeyDown={handleKeyDown}>
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="form-dialog__panel customize-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-panel-title"
      >
        <h2 id="customize-panel-title" className="form-dialog__title">
          Customize Dashboard
        </h2>
        <p className="customize-panel__description">
          Toggle widgets on or off, then drag the handles — or use the arrow buttons — to reorder
          them.
        </p>

        <ul className="customize-panel__list" role="list">
          {widgets.map((widget, index) => {
            const def = WIDGET_DEFINITION_MAP.get(widget.id);
            if (!def) return null;

            const isDragging = draggingId === widget.id;
            const isDragOver = dragOverId === widget.id && draggingId !== widget.id;
            const itemClass = [
              'customize-panel__item',
              isDragging ? 'customize-panel__item--dragging' : '',
              isDragOver ? 'customize-panel__item--drag-over' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <li
                key={widget.id}
                className={itemClass}
                role="listitem"
                draggable
                onDragStart={(e) => handleDragStart(e, widget.id)}
                onDragEnter={() => handleDragEnter(widget.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, widget.id, index)}
                onDragEnd={handleDragEnd}
              >
                <span
                  className="customize-panel__drag-handle"
                  aria-hidden="true"
                  title="Drag to reorder"
                >
                  ⠿
                </span>
                <label className="customize-panel__toggle">
                  <input
                    type="checkbox"
                    checked={widget.visible}
                    onChange={() => onToggle(widget.id)}
                    aria-label={`Show ${def.label} widget`}
                  />
                  <span className="customize-panel__label">
                    <span className="customize-panel__name">{def.label}</span>
                    <span className="customize-panel__desc">{def.description}</span>
                  </span>
                </label>
                <div
                  className="customize-panel__reorder"
                  role="group"
                  aria-label={`Reorder ${def.label}`}
                >
                  <button
                    type="button"
                    className="customize-panel__move-btn"
                    onClick={() => handleMove(widget.id, 'up', index, def.label)}
                    disabled={index === 0}
                    aria-label={`Move ${def.label} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="customize-panel__move-btn"
                    onClick={() => handleMove(widget.id, 'down', index, def.label)}
                    disabled={index === widgets.length - 1}
                    aria-label={`Move ${def.label} down`}
                  >
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </div>

        <div className="form-actions">
          <button type="button" className="form-button form-button--secondary" onClick={onReset}>
            Reset to Defaults
          </button>
          <button type="button" className="form-button form-button--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
