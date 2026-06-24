// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppIcon, type IconName } from '../icons';
import { formatCurrency } from '../../lib/currency';
import {
  addLegToWorkShift,
  buildLegDraftFromPresets,
  buildShiftMileageAuditCsv,
  computeActiveDurationMs,
  deleteWorkShift,
  endShift,
  findInProgressShift,
  generateShiftMileageAuditReport,
  getRoutePresetKindLabel,
  getShiftStatusLabel,
  loadRoutePresets,
  loadWorkShifts,
  MILEAGE_SHIFTS_CHANGED_EVENT,
  pauseShift,
  resumeShift,
  startWorkShift,
} from '../../lib/mileage';
import type { RoutePreset, ShiftStatus, WorkShift } from '../../lib/mileage';
import './mileage.css';

const PLATFORM_OPTIONS = [
  'DoorDash',
  'UberEats',
  'Grubhub',
  'Instacart',
  'Amazon Flex',
  'Lyft',
  'Spark',
] as const;

const STATUS_ICONS: Record<ShiftStatus, IconName> = {
  active: 'lightning',
  paused: 'circle',
  ended: 'check-circle',
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function downloadCsv(filename: string, csv: string): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ShiftTracker() {
  const [shifts, setShifts] = useState<WorkShift[]>(() => loadWorkShifts());
  const [presets, setPresets] = useState<RoutePreset[]>(() => loadRoutePresets());
  const [now, setNow] = useState(() => new Date().toISOString());
  const [platform, setPlatform] = useState<string>(PLATFORM_OPTIONS[0]);
  const [fromPresetId, setFromPresetId] = useState<string | null>(null);
  const [toPresetId, setToPresetId] = useState<string | null>(null);
  const [legMiles, setLegMiles] = useState('');
  const [legError, setLegError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refresh from storage whenever any shift/preset data changes.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sync = () => {
      setShifts(loadWorkShifts());
      setPresets(loadRoutePresets());
    };

    window.addEventListener(MILEAGE_SHIFTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(MILEAGE_SHIFTS_CHANGED_EVENT, sync);
  }, []);

  const inProgressShift = useMemo(() => findInProgressShift(shifts), [shifts]);

  // Tick the live timer once a second only while a shift is actively running.
  useEffect(() => {
    if (inProgressShift?.status !== 'active') {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    tickRef.current = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [inProgressShift?.status, inProgressShift?.id]);

  const auditReport = useMemo(() => generateShiftMileageAuditReport({ shifts }), [shifts]);

  const activeSummary = useMemo(() => {
    if (!inProgressShift) {
      return null;
    }

    const miles = inProgressShift.legs.reduce((total, leg) => total + leg.miles, 0);
    const matching = auditReport.shifts.find((entry) => entry.shiftId === inProgressShift.id);
    return {
      miles: Math.round(miles * 10) / 10,
      legCount: inProgressShift.legs.length,
      deductionCents: matching?.deductionCents ?? 0,
      durationMs: computeActiveDurationMs(inProgressShift, now),
    };
  }, [auditReport.shifts, inProgressShift, now]);

  const handleStart = useCallback(() => {
    const created = startWorkShift({ platform });
    setStatusMessage(`Started ${created.platform} shift.`);
  }, [platform]);

  const handlePauseResume = useCallback(() => {
    if (!inProgressShift) {
      return;
    }

    if (inProgressShift.status === 'active') {
      pauseShift(inProgressShift.id);
      setStatusMessage('Shift paused. The timer is on hold.');
    } else {
      resumeShift(inProgressShift.id);
      setStatusMessage('Shift resumed.');
    }
  }, [inProgressShift]);

  const handleEnd = useCallback(() => {
    if (!inProgressShift) {
      return;
    }

    endShift(inProgressShift.id);
    setStatusMessage('Shift ended and saved to your audit trail.');
  }, [inProgressShift]);

  const handleLogLeg = useCallback(() => {
    if (!inProgressShift) {
      return;
    }

    setLegError(null);
    const fromPreset = presets.find((preset) => preset.id === fromPresetId) ?? null;
    const toPreset = presets.find((preset) => preset.id === toPresetId) ?? null;
    const miles = Number.parseFloat(legMiles);

    if (!fromPreset || !toPreset) {
      setLegError('Pick a start and end preset to log a leg.');
      return;
    }

    if (!Number.isFinite(miles) || miles <= 0) {
      setLegError('Enter the miles for this leg.');
      return;
    }

    try {
      const draft = buildLegDraftFromPresets({
        startPreset: fromPreset,
        endPreset: toPreset,
        miles,
      });
      addLegToWorkShift(inProgressShift.id, draft);
      setLegMiles('');
      setStatusMessage(
        `Logged ${miles.toFixed(1)} miles from ${fromPreset.label} to ${toPreset.label}.`,
      );
    } catch (error) {
      setLegError(error instanceof Error ? error.message : 'Unable to log this leg.');
    }
  }, [fromPresetId, inProgressShift, legMiles, presets, toPresetId]);

  const handleDelete = useCallback((shiftId: string) => {
    deleteWorkShift(shiftId);
    setStatusMessage('Removed shift.');
  }, []);

  const handleExport = useCallback(() => {
    if (auditReport.legs.length === 0) {
      setStatusMessage('No shift mileage to export yet.');
      return;
    }

    const csv = buildShiftMileageAuditCsv(auditReport);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`mileage-shift-audit-${stamp}.csv`, csv);
    setStatusMessage('Exported IRS audit trail as CSV.');
  }, [auditReport]);

  const renderPresetGroup = (
    legend: string,
    selectedId: string | null,
    onSelect: (id: string) => void,
  ) => (
    <div className="shift-presets" role="group" aria-label={legend}>
      <span className="shift-presets__legend">{legend}</span>
      <div className="shift-presets__buttons">
        {presets.map((preset) => {
          const selected = preset.id === selectedId;
          return (
            <button
              key={`${legend}-${preset.id}`}
              type="button"
              className="shift-preset-button"
              aria-pressed={selected}
              aria-label={`${legend} ${preset.label} (${getRoutePresetKindLabel(preset.kind)})`}
              onClick={() => onSelect(preset.id)}
            >
              <AppIcon name="map-pin" size={14} />
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className="mileage-card" aria-labelledby="shift-tracker-title">
      <div className="mileage-card__header">
        <div>
          <h3 id="shift-tracker-title" className="mileage-card__title">
            Work shift tracker
          </h3>
          <p className="mileage-card__description">
            Start a shift, tap a route preset, and log miles between deliveries in seconds.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={handleExport}
          aria-label="Export IRS audit trail as CSV"
        >
          <AppIcon name="download" size={16} />
          Export audit
        </button>
      </div>

      {/* Status announcements for assistive tech (no color-only meaning). */}
      <p className="shift-tracker__sr-status" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {inProgressShift && activeSummary ? (
        <div className="shift-active">
          <div className="shift-active__header">
            <span
              className={`mileage-status shift-status shift-status--${inProgressShift.status}`}
              data-status={inProgressShift.status}
            >
              <AppIcon name={STATUS_ICONS[inProgressShift.status]} size={14} />
              {getShiftStatusLabel(inProgressShift.status)}
            </span>
            <span className="shift-active__platform">{inProgressShift.platform}</span>
          </div>

          <div className="shift-active__metrics">
            <div className="shift-metric">
              <span className="shift-metric__label">Shift time</span>
              <output className="shift-metric__value" aria-live="off">
                <span
                  role="timer"
                  aria-label={`Active shift time ${formatDuration(activeSummary.durationMs)}`}
                >
                  {formatDuration(activeSummary.durationMs)}
                </span>
              </output>
            </div>
            <div className="shift-metric" aria-live="polite">
              <span className="shift-metric__label">Miles logged</span>
              <span className="shift-metric__value">{activeSummary.miles.toFixed(1)}</span>
            </div>
            <div className="shift-metric" aria-live="polite">
              <span className="shift-metric__label">IRS deduction</span>
              <span className="shift-metric__value">
                {formatCurrency(activeSummary.deductionCents)}
              </span>
            </div>
            <div className="shift-metric">
              <span className="shift-metric__label">Legs</span>
              <span className="shift-metric__value">{activeSummary.legCount}</span>
            </div>
          </div>

          <div className="shift-active__controls">
            <button type="button" className="icon-button" onClick={handlePauseResume}>
              <AppIcon
                name={inProgressShift.status === 'active' ? 'circle' : 'lightning'}
                size={16}
              />
              {inProgressShift.status === 'active' ? 'Pause shift' : 'Resume shift'}
            </button>
            <button type="button" className="add-button" onClick={handleEnd}>
              <AppIcon name="check-circle" size={16} />
              End shift
            </button>
          </div>

          <div className="shift-quick-log">
            <h4 className="shift-quick-log__title">Log a leg</h4>
            {renderPresetGroup('From', fromPresetId, setFromPresetId)}
            {renderPresetGroup('To', toPresetId, setToPresetId)}
            <div className="shift-quick-log__entry">
              <div className="form-group">
                <label className="form-group__label" htmlFor="shift-leg-miles">
                  Miles
                </label>
                <input
                  id="shift-leg-miles"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={legMiles}
                  onChange={(event) => setLegMiles(event.target.value)}
                  placeholder="3.2"
                />
              </div>
              <button type="button" className="add-button" onClick={handleLogLeg}>
                <AppIcon name="plane" size={16} />
                Log leg
              </button>
            </div>
            {legError ? (
              <p className="form-error" role="alert">
                {legError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="shift-start">
          <div className="form-group">
            <label className="form-group__label" htmlFor="shift-platform">
              Platform
            </label>
            <input
              id="shift-platform"
              className="form-input"
              list="shift-platform-options"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              placeholder="DoorDash"
            />
            <datalist id="shift-platform-options">
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <button type="button" className="add-button" onClick={handleStart}>
            <AppIcon name="lightning" size={16} />
            Start shift
          </button>
        </div>
      )}

      {auditReport.byPlatform.length > 0 ? (
        <div className="shift-summary" aria-label="Shift totals by platform">
          <h4 className="shift-quick-log__title">Totals by platform</h4>
          <div className="mileage-list" role="list">
            {auditReport.byPlatform.map((entry) => (
              <div key={entry.platform} className="mileage-list__item" role="listitem">
                <div className="mileage-list__meta">
                  <span className="mileage-list__label">{entry.platform}</span>
                  <span className="mileage-list__caption">
                    {entry.shiftCount} shift(s) · {entry.legCount} leg(s)
                  </span>
                </div>
                <div className="mileage-list__meta shift-summary__amount">
                  <span className="mileage-list__label">{entry.miles.toFixed(1)} mi</span>
                  <span className="mileage-list__caption">
                    {formatCurrency(entry.deductionCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {auditReport.shifts.length > 0 ? (
        <div className="shift-summary" aria-label="Recent shifts">
          <h4 className="shift-quick-log__title">Recent shifts</h4>
          <div className="mileage-list" role="list">
            {auditReport.shifts.map((entry) => (
              <div key={entry.shiftId} className="mileage-list__item" role="listitem">
                <div className="mileage-list__meta">
                  <span className="mileage-list__label">
                    {entry.platform} · {entry.date}
                  </span>
                  <span className="mileage-list__caption">
                    {getShiftStatusLabel(entry.status)} · {entry.legCount} leg(s)
                  </span>
                </div>
                <div className="mileage-list__meta shift-summary__amount">
                  <span className="mileage-list__label">{entry.miles.toFixed(1)} mi</span>
                  <span className="mileage-list__caption">
                    {formatCurrency(entry.deductionCents)}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${entry.platform} shift from ${entry.date}`}
                  onClick={() => handleDelete(entry.shiftId)}
                >
                  <AppIcon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
