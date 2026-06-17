// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useMemo, useState } from 'react';

import type {
  TripEntry as MileageTripRecord,
  TripEntryDraft,
  TripPurpose,
} from '../../lib/mileage';
import '../forms/forms.css';
import './mileage.css';

const PURPOSE_OPTIONS: Array<{ value: TripPurpose; label: string }> = [
  { value: 'business', label: 'Business' },
  { value: 'medical', label: 'Medical' },
  { value: 'charity', label: 'Charity' },
  { value: 'moving', label: 'Moving' },
  { value: 'personal', label: 'Personal' },
];

function formatNumberInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface TripEntryProps {
  trip?: MileageTripRecord | null;
  onSubmit: (trip: TripEntryDraft) => void | Promise<void>;
  onCancel?: () => void;
}

export function TripEntry({ trip = null, onSubmit, onCancel }: TripEntryProps) {
  const [date, setDate] = useState('');
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [purpose, setPurpose] = useState<TripPurpose>('business');
  const [notes, setNotes] = useState('');
  const [businessUsePercent, setBusinessUsePercent] = useState('100');
  const [miles, setMiles] = useState('');
  const [odometerStart, setOdometerStart] = useState('');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [useOdometer, setUseOdometer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = trip !== null;

  useEffect(() => {
    setDate(trip?.date ?? new Date().toISOString().slice(0, 10));
    setStartLocation(trip?.startLocation ?? '');
    setEndLocation(trip?.endLocation ?? '');
    setPurpose(trip?.purpose ?? 'business');
    setNotes(trip?.notes ?? '');
    setBusinessUsePercent(String(trip?.businessUsePercent ?? 100));
    setMiles(formatNumberInput(trip?.miles));
    setOdometerStart(formatNumberInput(trip?.odometerStart));
    setOdometerEnd(formatNumberInput(trip?.odometerEnd));
    setUseOdometer(Boolean(trip?.odometerStart !== null || trip?.odometerEnd !== null));
    setError(null);
  }, [trip]);

  const tripPreview = useMemo(() => {
    const directMiles = parseOptionalNumber(miles);
    const start = parseOptionalNumber(odometerStart);
    const end = parseOptionalNumber(odometerEnd);

    if (!useOdometer && directMiles !== null && directMiles >= 0) {
      return `${directMiles.toFixed(1)} miles logged`;
    }

    if (useOdometer && start !== null && end !== null && end >= start) {
      return `${(end - start).toFixed(1)} miles from odometer`;
    }

    return 'Enter miles directly or use odometer readings.';
  }, [miles, odometerEnd, odometerStart, useOdometer]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await onSubmit({
        date,
        startLocation,
        endLocation,
        miles: useOdometer ? null : parseOptionalNumber(miles),
        odometerStart: useOdometer ? parseOptionalNumber(odometerStart) : null,
        odometerEnd: useOdometer ? parseOptionalNumber(odometerEnd) : null,
        purpose,
        notes,
        businessUsePercent: purpose === 'business' ? Number.parseInt(businessUsePercent, 10) : 100,
      });

      if (!isEditing) {
        setStartLocation('');
        setEndLocation('');
        setNotes('');
        setMiles('');
        setOdometerStart('');
        setOdometerEnd('');
        setPurpose('business');
        setBusinessUsePercent('100');
        setUseOdometer(false);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save trip.');
    }
  }

  return (
    <form className="mileage-card" onSubmit={handleSubmit}>
      <div className="mileage-card__header">
        <div>
          <h3 className="mileage-card__title">{isEditing ? 'Edit trip' : 'Log a trip'}</h3>
          <p className="mileage-card__description">
            Manual mileage tracking only — no GPS required.
          </p>
        </div>
      </div>

      <div className="trip-entry__mode-toggle" role="radiogroup" aria-label="Mileage entry mode">
        <label className="form-checkbox-row">
          <input
            type="radio"
            name="trip-entry-mode"
            checked={!useOdometer}
            onChange={() => setUseOdometer(false)}
          />
          Enter miles
        </label>
        <label className="form-checkbox-row">
          <input
            type="radio"
            name="trip-entry-mode"
            checked={useOdometer}
            onChange={() => setUseOdometer(true)}
          />
          Use odometer
        </label>
      </div>

      <div className="trip-entry__grid">
        <div className="form-group">
          <label className="form-group__label form-group__label--required" htmlFor="trip-date">
            Date
          </label>
          <input
            id="trip-date"
            className="form-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-group__label form-group__label--required" htmlFor="trip-purpose">
            Purpose
          </label>
          <select
            id="trip-purpose"
            className="form-select"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value as TripPurpose)}
          >
            {PURPOSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-group__label form-group__label--required" htmlFor="trip-start">
            Start location
          </label>
          <input
            id="trip-start"
            className="form-input"
            type="text"
            value={startLocation}
            onChange={(event) => setStartLocation(event.target.value)}
            placeholder="Home office"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-group__label form-group__label--required" htmlFor="trip-end">
            End location
          </label>
          <input
            id="trip-end"
            className="form-input"
            type="text"
            value={endLocation}
            onChange={(event) => setEndLocation(event.target.value)}
            placeholder="Client site"
            required
          />
        </div>
        {!useOdometer ? (
          <div className="form-group">
            <label className="form-group__label form-group__label--required" htmlFor="trip-miles">
              Miles
            </label>
            <input
              id="trip-miles"
              className="form-input"
              type="number"
              min="0"
              step="0.1"
              value={miles}
              onChange={(event) => setMiles(event.target.value)}
              placeholder="18.5"
              required={!useOdometer}
            />
          </div>
        ) : (
          <>
            <div className="form-group">
              <label
                className="form-group__label form-group__label--required"
                htmlFor="trip-odo-start"
              >
                Starting odometer
              </label>
              <input
                id="trip-odo-start"
                className="form-input"
                type="number"
                min="0"
                step="0.1"
                value={odometerStart}
                onChange={(event) => setOdometerStart(event.target.value)}
                required={useOdometer}
              />
            </div>
            <div className="form-group">
              <label
                className="form-group__label form-group__label--required"
                htmlFor="trip-odo-end"
              >
                Ending odometer
              </label>
              <input
                id="trip-odo-end"
                className="form-input"
                type="number"
                min="0"
                step="0.1"
                value={odometerEnd}
                onChange={(event) => setOdometerEnd(event.target.value)}
                required={useOdometer}
              />
            </div>
          </>
        )}
        {purpose === 'business' ? (
          <div className="form-group">
            <label className="form-group__label" htmlFor="trip-business-percent">
              Business use %
            </label>
            <input
              id="trip-business-percent"
              className="form-input"
              type="number"
              min="0"
              max="100"
              step="1"
              value={businessUsePercent}
              onChange={(event) => setBusinessUsePercent(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      <div className="form-group">
        <label className="form-group__label" htmlFor="trip-notes">
          Notes
        </label>
        <textarea
          id="trip-notes"
          className="form-textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Client meeting, donation drop-off, follow-up visit"
        />
      </div>

      <div className="trip-entry__preview" aria-live="polite">
        <strong>Preview:</strong> {tripPreview}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="trip-entry__actions">
        <button type="submit" className="add-button">
          {isEditing ? 'Save trip' : 'Add trip'}
        </button>
        {isEditing && onCancel ? (
          <button type="button" className="icon-button" onClick={onCancel}>
            Cancel edit
          </button>
        ) : null}
      </div>
    </form>
  );
}
