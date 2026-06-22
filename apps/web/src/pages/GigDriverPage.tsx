// SPDX-License-Identifier: BUSL-1.1

/**
 * GigDriverPage — gig-driver economics dashboard.
 *
 * Surfaces two beta features over local data only (no remote sources):
 *   - #2135 take-home pay after expenses and estimated taxes
 *   - #2139 vehicle cost-per-mile and odometer-milestone maintenance
 *
 * Income comes from local INCOME transactions, deductions from tagged business
 * expenses, and miles from locally-logged mileage trips. Everything is computed
 * client-side in integer cents.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { MileageDashboard } from '../components/mileage';
import { TakeHomeSummary } from '../components/mileage/TakeHomeSummary';
import { VehicleCostSummaryCard } from '../components/mileage/VehicleCostSummaryCard';
import { useTransactions } from '../hooks/useTransactions';
import { formatCurrency } from '../lib/currency';
import {
  MILEAGE_TRIPS_CHANGED_EVENT,
  generateTaxReadyExpenseReport,
  loadMileageTrips,
  type ExpenseTransactionInput,
  type TripEntry as MileageTrip,
} from '../lib/mileage';
import {
  aggregateProfitability,
  computeGigTakeHome,
  DEFAULT_INCOME_TAX_RESERVE_RATE,
  type DeductionMethod,
  type ProfitabilityGranularity,
  type ShiftRecord,
} from '../lib/gig-take-home';
import {
  classifyVehicleExpense,
  computeMaintenanceReminders,
  DEFAULT_MAINTENANCE_INTERVALS_MILES,
  summarizeVehicleCosts,
  type MaintenanceInterval,
  type VehicleExpenseEntry,
} from '../lib/vehicle-cost-per-mile';

import './GigDriverPage.css';

function parsePercentToRate(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INCOME_TAX_RESERVE_RATE;
  }
  return Math.min(1, Math.max(0, parsed / 100));
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function milestoneIntervals(odometer: number): MaintenanceInterval[] {
  if (odometer <= 0) {
    return [];
  }
  const definitions: Array<{ id: string; label: string; intervalMiles: number }> = [
    {
      id: 'oil',
      label: 'Oil change',
      intervalMiles: DEFAULT_MAINTENANCE_INTERVALS_MILES.oilChange,
    },
    {
      id: 'rotation',
      label: 'Tire rotation',
      intervalMiles: DEFAULT_MAINTENANCE_INTERVALS_MILES.tireRotation,
    },
    {
      id: 'brakes',
      label: 'Brake inspection',
      intervalMiles: DEFAULT_MAINTENANCE_INTERVALS_MILES.brakeInspection,
    },
  ];

  return definitions.map((definition) => ({
    ...definition,
    lastServiceOdometer: Math.floor(odometer / definition.intervalMiles) * definition.intervalMiles,
  }));
}

export function GigDriverPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reserveRatePercent, setReserveRatePercent] = useState('15');
  const [deductionMethod, setDeductionMethod] = useState<DeductionMethod>('standard-mileage');
  const [granularity, setGranularity] = useState<ProfitabilityGranularity>('week');
  const [odometerInput, setOdometerInput] = useState('');
  const [trips, setTrips] = useState<MileageTrip[]>(() => loadMileageTrips());

  useEffect(() => {
    const refreshTrips = () => setTrips(loadMileageTrips());
    refreshTrips();
    window.addEventListener(MILEAGE_TRIPS_CHANGED_EVENT, refreshTrips);
    return () => window.removeEventListener(MILEAGE_TRIPS_CHANGED_EVENT, refreshTrips);
  }, []);

  const transactionFilters = useMemo(
    () => ({ startDate: startDate || undefined, endDate: endDate || undefined }),
    [endDate, startDate],
  );
  const { transactions, loading, error, refresh } = useTransactions(transactionFilters);

  const txInputs = useMemo<ExpenseTransactionInput[]>(
    () =>
      transactions.map((tx) => ({
        id: tx.id,
        date: tx.date,
        payee: tx.payee,
        note: tx.note,
        amountCents: tx.amount.amount,
        type: tx.type,
        tags: tx.tags,
        customFields: tx.customFields,
        categoryName: null,
      })),
    [transactions],
  );

  const report = useMemo(
    () =>
      generateTaxReadyExpenseReport({
        trips,
        transactions: txInputs,
        startDate: startDate || null,
        endDate: endDate || null,
      }),
    [endDate, startDate, trips, txInputs],
  );

  const reserveRate = useMemo(() => parsePercentToRate(reserveRatePercent), [reserveRatePercent]);

  const grossPayoutsCents = useMemo(
    () =>
      transactions.reduce(
        (sum, tx) => (tx.type === 'INCOME' ? sum + Math.abs(tx.amount.amount) : sum),
        0,
      ),
    [transactions],
  );

  const vehicleExpenses = useMemo<VehicleExpenseEntry[]>(
    () =>
      txInputs
        .map((input) => classifyVehicleExpense(input))
        .filter((entry): entry is VehicleExpenseEntry => entry !== null),
    [txInputs],
  );

  const businessMileageEntries = useMemo(
    () => report.mileageEntries.filter((entry) => entry.purpose === 'business'),
    [report.mileageEntries],
  );

  const businessMiles = useMemo(
    () => Math.round(businessMileageEntries.reduce((sum, entry) => sum + entry.miles, 0) * 10) / 10,
    [businessMileageEntries],
  );

  const activeShifts = useMemo(
    () => new Set(businessMileageEntries.map((entry) => entry.date)).size,
    [businessMileageEntries],
  );

  const vehicleSummary = useMemo(
    () =>
      summarizeVehicleCosts({
        expenses: vehicleExpenses,
        milesDriven: businessMiles,
        activeShifts,
        startDate: startDate || null,
        endDate: endDate || null,
      }),
    [activeShifts, businessMiles, endDate, startDate, vehicleExpenses],
  );

  const takeHome = useMemo(
    () =>
      computeGigTakeHome({
        grossPayoutsCents,
        operatingCostsCents: vehicleSummary.totalCostCents,
        mileageDeductionCents: report.totalMileageDeductionCents,
        otherDeductionsCents: report.totalExpenseDeductionCents,
        config: { incomeTaxReserveRate: reserveRate, deductionMethod },
      }),
    [
      deductionMethod,
      grossPayoutsCents,
      report.totalExpenseDeductionCents,
      report.totalMileageDeductionCents,
      reserveRate,
      vehicleSummary.totalCostCents,
    ],
  );

  const shifts = useMemo<ShiftRecord[]>(() => {
    interface MutableShift {
      id: string;
      date: string;
      grossCents: number;
      operatingCostsCents: number;
      mileageDeductionCents: number;
      otherDeductionsCents: number;
      miles: number;
    }

    const byDate = new Map<string, MutableShift>();
    const ensure = (date: string): MutableShift => {
      const existing = byDate.get(date);
      if (existing) {
        return existing;
      }
      const created: MutableShift = {
        id: date,
        date,
        grossCents: 0,
        operatingCostsCents: 0,
        mileageDeductionCents: 0,
        otherDeductionsCents: 0,
        miles: 0,
      };
      byDate.set(date, created);
      return created;
    };

    for (const tx of transactions) {
      if (tx.type === 'INCOME') {
        const shift = ensure(tx.date);
        shift.grossCents += Math.abs(tx.amount.amount);
      }
    }
    for (const expense of vehicleExpenses) {
      const shift = ensure(expense.date);
      shift.operatingCostsCents += expense.amountCents;
    }
    for (const entry of businessMileageEntries) {
      const shift = ensure(entry.date);
      shift.mileageDeductionCents += entry.deductionCents;
      shift.miles += entry.miles;
    }

    return [...byDate.values()];
  }, [businessMileageEntries, transactions, vehicleExpenses]);

  const profitability = useMemo(
    () =>
      aggregateProfitability(shifts, granularity, {
        incomeTaxReserveRate: reserveRate,
        deductionMethod,
        applySelfEmploymentFloor: false,
      }),
    [deductionMethod, granularity, reserveRate, shifts],
  );

  const derivedOdometer = useMemo(() => {
    const readings = trips
      .map((trip) => trip.odometerEnd)
      .filter((value): value is number => typeof value === 'number');
    return readings.length > 0 ? Math.max(...readings) : 0;
  }, [trips]);

  const effectiveOdometer = parseOptionalNumber(odometerInput) ?? derivedOdometer;

  const maintenanceReminders = useMemo(
    () => computeMaintenanceReminders(milestoneIntervals(effectiveOdometer), effectiveOdometer),
    [effectiveOdometer],
  );

  const handleRetry = useCallback(() => refresh(), [refresh]);

  if (loading) {
    return <LoadingSpinner label="Loading gig-driver economics" />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={handleRetry} />;
  }

  const hasData = transactions.length > 0 || trips.length > 0;

  return (
    <main className="gig-driver" aria-labelledby="gig-driver-title">
      <header className="gig-driver__header">
        <p className="gig-driver__eyebrow">Gig &amp; rideshare</p>
        <h1 id="gig-driver-title" className="gig-driver__title">
          Gig Driver Economics
        </h1>
        <p className="gig-driver__description">
          Estimate take-home pay after operating costs and taxes, and track what your vehicle really
          costs per mile. Figures are estimates for planning — not tax advice.
        </p>
      </header>

      <section className="gig-driver__controls" aria-labelledby="gig-driver-controls-title">
        <h2 id="gig-driver-controls-title" className="gig-driver__section-title">
          Assumptions
        </h2>
        <div className="gig-driver__controls-grid">
          <div className="gig-driver__field">
            <label className="gig-driver__label" htmlFor="gig-start-date">
              Start date
            </label>
            <input
              id="gig-start-date"
              className="gig-driver__input"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="gig-driver__field">
            <label className="gig-driver__label" htmlFor="gig-end-date">
              End date
            </label>
            <input
              id="gig-end-date"
              className="gig-driver__input"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="gig-driver__field">
            <label className="gig-driver__label" htmlFor="gig-reserve-rate">
              Income-tax reserve %
            </label>
            <input
              id="gig-reserve-rate"
              className="gig-driver__input"
              type="number"
              min="0"
              max="100"
              step="1"
              inputMode="decimal"
              value={reserveRatePercent}
              onChange={(event) => setReserveRatePercent(event.target.value)}
              aria-describedby="gig-reserve-rate-hint"
            />
            <span id="gig-reserve-rate-hint" className="gig-driver__hint">
              Set-aside for income tax on top of self-employment tax.
            </span>
          </div>
          <div className="gig-driver__field">
            <label className="gig-driver__label" htmlFor="gig-deduction-method">
              Deduction method
            </label>
            <select
              id="gig-deduction-method"
              className="gig-driver__input"
              value={deductionMethod}
              onChange={(event) => setDeductionMethod(event.target.value as DeductionMethod)}
            >
              <option value="standard-mileage">Standard mileage</option>
              <option value="actual-expenses">Actual expenses</option>
            </select>
          </div>
          <div className="gig-driver__field">
            <label className="gig-driver__label" htmlFor="gig-granularity">
              Profitability view
            </label>
            <select
              id="gig-granularity"
              className="gig-driver__input"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as ProfitabilityGranularity)}
            >
              <option value="day">By day</option>
              <option value="week">By week</option>
              <option value="shift">By shift</option>
            </select>
          </div>
          <div className="gig-driver__field">
            <label className="gig-driver__label" htmlFor="gig-odometer">
              Current odometer
            </label>
            <input
              id="gig-odometer"
              className="gig-driver__input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder={derivedOdometer > 0 ? String(derivedOdometer) : 'e.g. 64000'}
              value={odometerInput}
              onChange={(event) => setOdometerInput(event.target.value)}
            />
          </div>
        </div>
      </section>

      {hasData ? (
        <>
          <TakeHomeSummary result={takeHome} periods={profitability} />
          <VehicleCostSummaryCard summary={vehicleSummary} reminders={maintenanceReminders} />
          <MileageDashboard report={report} />
          <p className="gig-driver__footnote" role="note">
            Gross payouts: {formatCurrency(grossPayoutsCents)} · Mileage deduction:{' '}
            {formatCurrency(report.totalMileageDeductionCents)} · Operating costs:{' '}
            {formatCurrency(vehicleSummary.totalCostCents)}. Tag vehicle expenses with
            “vehicle-expense” and log trips to refine these estimates.
          </p>
        </>
      ) : (
        <EmptyState
          title="No gig activity yet"
          description="Add income transactions, tag vehicle expenses, and log mileage trips to see take-home pay and cost-per-mile estimates."
        />
      )}
    </main>
  );
}

export default GigDriverPage;
