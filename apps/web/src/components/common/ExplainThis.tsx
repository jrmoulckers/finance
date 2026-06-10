import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import {
  getContextualTip,
  getGlossaryEntry,
  type ContextualTipKey,
  type EducationEntry,
  type GlossaryKey,
} from '../../lib/education';
import { AppIcon } from '../icons';

import './explain-this.css';

export type ExplainThisProps =
  | {
      glossaryKey: GlossaryKey;
      tipKey?: never;
      content?: never;
      buttonLabel?: string;
      className?: string;
    }
  | {
      glossaryKey?: never;
      tipKey: ContextualTipKey;
      content?: never;
      buttonLabel?: string;
      className?: string;
    }
  | {
      glossaryKey?: never;
      tipKey?: never;
      content: EducationEntry;
      buttonLabel?: string;
      className?: string;
    };

type InteractionMode = 'hover' | 'manual' | null;

export function ExplainThis(props: ExplainThisProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const titleId = useId();
  const definitionId = useId();

  const entry = useMemo(() => {
    if ('glossaryKey' in props && props.glossaryKey) {
      return getGlossaryEntry(props.glossaryKey);
    }

    if ('tipKey' in props && props.tipKey) {
      return getContextualTip(props.tipKey);
    }

    return props.content;
  }, [props]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
    setInteractionMode(null);
  }, []);

  const openManual = useCallback(() => {
    setIsOpen(true);
    setInteractionMode('manual');
  }, []);

  const handleTriggerClick = useCallback(() => {
    if (isOpen && interactionMode === 'manual') {
      closePopover();
      return;
    }

    openManual();
  }, [closePopover, interactionMode, isOpen, openManual]);

  const handleMouseEnter = useCallback(() => {
    if (interactionMode === 'manual') {
      return;
    }

    setIsOpen(true);
    setInteractionMode('hover');
  }, [interactionMode]);

  const handleMouseLeave = useCallback(() => {
    if (interactionMode === 'hover') {
      closePopover();
    }
  }, [closePopover, interactionMode]);

  useFocusTrap(popoverRef, {
    active: isOpen && interactionMode === 'manual',
    restoreFocus: true,
    initialFocusRef: closeButtonRef,
  });

  useEffect(() => {
    if (!isOpen || interactionMode !== 'manual') {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) {
        return;
      }

      closePopover();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePopover();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closePopover, interactionMode, isOpen]);

  const buttonAriaLabel = props.buttonLabel ?? `Explain ${entry.term}`;
  const wrapperClassName = ['explain-this', props.className].filter(Boolean).join(' ');

  return (
    <span
      ref={wrapperRef}
      className={wrapperClassName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className="explain-this__trigger"
        aria-label={buttonAriaLabel}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? popoverId : undefined}
        onClick={handleTriggerClick}
      >
        <AppIcon name="info" size={14} />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          className="explain-this__popover"
          role="tooltip"
          aria-labelledby={titleId}
          aria-describedby={definitionId}
        >
          <div className="explain-this__header">
            <h3 id={titleId} className="explain-this__term">
              {entry.term}
            </h3>
            <button
              ref={closeButtonRef}
              type="button"
              className="explain-this__close"
              aria-label={`Close explanation for ${entry.term}`}
              onClick={closePopover}
            >
              <AppIcon name="x" size={14} />
            </button>
          </div>

          <p id={definitionId} className="explain-this__definition">
            {entry.definition}
          </p>

          <div className="explain-this__section">
            <span className="explain-this__section-label">Example</span>
            <p>{entry.example}</p>
          </div>

          <div className="explain-this__section explain-this__section--accent">
            <span className="explain-this__section-label">Why it matters</span>
            <p>{entry.whyItMatters}</p>
          </div>
        </div>
      )}
    </span>
  );
}

export default ExplainThis;
