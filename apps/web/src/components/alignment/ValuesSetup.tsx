// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import type { IconName } from '../icons';
import { AppIcon } from '../icons';
import { SortableList } from '../common/SortableList';
import {
  ALIGNMENT_PRIORITY_LIMIT,
  ALIGNMENT_VALUE_MAP,
  type UserValuePreference,
} from '../../lib/alignment';
import './alignment.css';

export interface ValuesSetupProps {
  preferences: readonly UserValuePreference[];
  onChange: (preferences: UserValuePreference[]) => void;
  onReset?: () => void;
}

function movePreference(
  preferences: readonly UserValuePreference[],
  fromIndex: number,
  toIndex: number,
): UserValuePreference[] {
  const next = [...preferences];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export const ValuesSetup: React.FC<ValuesSetupProps> = ({ preferences, onChange, onReset }) => {
  const topValueIds = new Set(
    preferences.slice(0, ALIGNMENT_PRIORITY_LIMIT).map((value) => value.valueId),
  );

  return (
    <article className="alignment-card alignment-card--setup">
      <div className="alignment-card__header alignment-values-setup__header">
        <div>
          <p className="alignment-card__eyebrow">Step 1 · Choose your priorities</p>
          <h3>What matters most right now?</h3>
          <p className="alignment-card__description">
            Drag to reorder your values. The first five shape the target mix, and the slider sets
            how strongly each one should count.
          </p>
        </div>
        {onReset ? (
          <button
            type="button"
            className="alignment-values-setup__reset"
            onClick={onReset}
            aria-label="Reset value priorities"
          >
            Reset
          </button>
        ) : null}
      </div>

      <SortableList
        items={preferences}
        getItemId={(preference) => preference.valueId}
        getItemLabel={(preference) =>
          ALIGNMENT_VALUE_MAP.get(preference.valueId)?.label ?? preference.valueId
        }
        onReorder={(fromIndex, toIndex) =>
          onChange(movePreference(preferences, fromIndex, toIndex))
        }
        ariaLabel="Financial value priorities"
        renderItem={(preference, { itemProps, dragHandleProps, isDragging }) => {
          const value = ALIGNMENT_VALUE_MAP.get(preference.valueId);
          if (!value) {
            return null;
          }

          const rank = preferences.findIndex((item) => item.valueId === preference.valueId) + 1;
          const isPriority = topValueIds.has(preference.valueId);

          return (
            <div
              {...itemProps}
              className={`${itemProps.className} alignment-values-setup__item${isPriority ? ' alignment-values-setup__item--priority' : ''}${isDragging ? ' alignment-values-setup__item--dragging' : ''}`}
            >
              <div className="alignment-values-setup__item-top">
                <button
                  {...dragHandleProps}
                  className={`${dragHandleProps.className} alignment-values-setup__handle`}
                >
                  ⋮⋮
                </button>
                <div className="alignment-values-setup__value-meta">
                  <span className="alignment-values-setup__icon" aria-hidden="true">
                    <AppIcon name={value.iconName as IconName} size={18} />
                  </span>
                  <div>
                    <div className="alignment-values-setup__value-heading">
                      <strong>{value.label}</strong>
                      <span className="alignment-values-setup__pill">
                        {isPriority
                          ? `Priority #${rank}`
                          : `Backup #${rank - ALIGNMENT_PRIORITY_LIMIT}`}
                      </span>
                    </div>
                    <p>{value.description}</p>
                  </div>
                </div>
              </div>
              <label className="alignment-values-setup__slider">
                <span>Importance</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={preference.weight}
                  onChange={(event) => {
                    const nextWeight = Number(event.currentTarget.value);
                    onChange(
                      preferences.map((item) =>
                        item.valueId === preference.valueId
                          ? { ...item, weight: nextWeight }
                          : item,
                      ),
                    );
                  }}
                  aria-label={`${value.label} importance`}
                />
                <strong>{preference.weight}/10</strong>
              </label>
            </div>
          );
        }}
      />

      <p className="alignment-values-setup__footnote">
        Stored only on this device. Update priorities anytime as your goals change.
      </p>
    </article>
  );
};
