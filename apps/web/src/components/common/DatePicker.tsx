// SPDX-License-Identifier: BUSL-1.1

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { formatDate } from '../../utils/formatDate';

import './date-picker.css';

const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const INVALID_DATE_MESSAGE = 'Enter a date in MM/DD/YYYY.';

export interface DatePickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  value?: string | null;
  onChange: (value: string) => void;
}

function createDate(year: number, monthIndex: number, day: number): Date | null {
  const nextDate = new Date(year, monthIndex, day);

  if (
    nextDate.getFullYear() !== year ||
    nextDate.getMonth() !== monthIndex ||
    nextDate.getDate() !== day
  ) {
    return null;
  }

  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  return createDate(Number(yearText), Number(monthText) - 1, Number(dayText));
}

function parseDisplayDate(value: string): Date | null {
  const match = DISPLAY_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, monthText, dayText, yearText] = match;
  return createDate(Number(yearText), Number(monthText) - 1, Number(dayText));
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatInputDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

function getToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getMonthDate(date: Date, day: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), day);
}

function moveMonthPreservingDay(date: Date, monthOffset: number, yearOffset = 0): Date {
  const targetMonth = new Date(date.getFullYear() + yearOffset, date.getMonth() + monthOffset, 1);
  const clampedDay = Math.min(date.getDate(), endOfMonth(targetMonth).getDate());
  return getMonthDate(targetMonth, clampedDay);
}

function formatLooseInput(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function buildCalendarDays(visibleMonth: Date): Date[] {
  const firstDayOfMonth = startOfMonth(visibleMonth);
  const gridStart = addDays(firstDayOfMonth, -firstDayOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function isSameDate(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) return false;
  return formatIsoDate(left) === formatIsoDate(right);
}

function isDateSelectable(isoDate: string, min?: string, max?: string): boolean {
  if (min && isoDate < min) return false;
  if (max && isoDate > max) return false;
  return true;
}

function getRangeValidationMessage(isoDate: string, min?: string, max?: string): string | null {
  if (min && isoDate < min) {
    const minDate = parseIsoDate(min);
    return minDate ? `Date must be on or after ${formatInputDate(minDate)}.` : 'Date is too early.';
  }

  if (max && isoDate > max) {
    const maxDate = parseIsoDate(max);
    return maxDate ? `Date must be on or before ${formatInputDate(maxDate)}.` : 'Date is too late.';
  }

  return null;
}

function clampDateToRange(date: Date, minDate: Date | null, maxDate: Date | null): Date {
  if (minDate && date < minDate) return minDate;
  if (maxDate && date > maxDate) return maxDate;
  return date;
}

function joinClassNames(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export function DatePicker({
  value,
  onChange,
  className,
  placeholder = 'MM/DD/YYYY',
  autoComplete = 'off',
  disabled,
  min,
  max,
  onBlur,
  onFocus,
  onKeyDown,
  ...inputProps
}: DatePickerProps) {
  const normalizedValue = value ?? '';
  const generatedInputId = useId();
  const inputId = inputProps.id ?? generatedInputId;
  const panelId = useId();
  const monthLabelId = useId();
  const validationMessageId = useId();
  const monthSelectId = useId();
  const yearSelectId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusHighlightedDayRef = useRef(false);
  const selectedDate = useMemo(() => parseIsoDate(normalizedValue), [normalizedValue]);
  const minValue = typeof min === 'string' ? min : undefined;
  const maxValue = typeof max === 'string' ? max : undefined;
  const minDate = useMemo(() => parseIsoDate(minValue), [minValue]);
  const maxDate = useMemo(() => parseIsoDate(maxValue), [maxValue]);
  const today = useMemo(() => getToday(), []);
  const todayIso = formatIsoDate(today);
  const [inputText, setInputText] = useState(() =>
    selectedDate === null ? '' : formatInputDate(selectedDate),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? today));
  const [highlightedIsoDate, setHighlightedIsoDate] = useState(() =>
    selectedDate
      ? formatIsoDate(selectedDate)
      : formatIsoDate(clampDateToRange(today, minDate, maxDate)),
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const externalAriaDescribedBy = inputProps['aria-describedby'];
  const externalAriaInvalid = inputProps['aria-invalid'];
  const describedBy = [externalAriaDescribedBy, validationMessage ? validationMessageId : null]
    .filter(Boolean)
    .join(' ');
  const effectiveAriaInvalid = Boolean(externalAriaInvalid) || Boolean(validationMessage);
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthTitle = formatDate(visibleMonth, { month: 'long', year: 'numeric' });
  const canClear = !disabled && Boolean(normalizedValue || inputText);
  const canSelectToday = isDateSelectable(todayIso, minValue, maxValue);
  const yearOptions = useMemo(() => {
    const currentYear = visibleMonth.getFullYear();
    const startYear = minDate?.getFullYear() ?? currentYear - 10;
    const endYear = maxDate?.getFullYear() ?? currentYear + 10;
    const years: number[] = [];

    for (let year = startYear; year <= endYear; year += 1) {
      years.push(year);
    }

    return years;
  }, [maxDate, minDate, visibleMonth]);

  useEffect(() => {
    if (selectedDate === null) {
      if (!normalizedValue) {
        setInputText('');
        if (!isOpen) {
          setVisibleMonth(startOfMonth(clampDateToRange(today, minDate, maxDate)));
        }
      }
    } else {
      setInputText(formatInputDate(selectedDate));
      if (!isOpen) {
        setVisibleMonth(startOfMonth(selectedDate));
      }
      setHighlightedIsoDate(formatIsoDate(selectedDate));
    }

    setValidationMessage(null);
  }, [isOpen, maxDate, minDate, normalizedValue, selectedDate, today]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !focusHighlightedDayRef.current) return;

    const targetButton = dayButtonRefs.current[highlightedIsoDate];
    if (targetButton) {
      targetButton.focus();
      focusHighlightedDayRef.current = false;
    }
  }, [highlightedIsoDate, isOpen, visibleMonth]);

  const setMonthAndHighlight = (nextDate: Date, shouldFocusGrid = false) => {
    const clampedDate = clampDateToRange(nextDate, minDate, maxDate);
    focusHighlightedDayRef.current = shouldFocusGrid;
    setVisibleMonth(startOfMonth(clampedDate));
    setHighlightedIsoDate(formatIsoDate(clampedDate));
  };

  const closeCalendar = (restoreInputFocus = false) => {
    setIsOpen(false);
    if (restoreInputFocus) {
      inputRef.current?.focus();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const openCalendar = (shouldFocusGrid = true) => {
    const parsedInputDate = parseDisplayDate(inputText);
    const referenceDate = clampDateToRange(
      selectedDate ?? parsedInputDate ?? today,
      minDate,
      maxDate,
    );
    focusHighlightedDayRef.current = shouldFocusGrid;
    setVisibleMonth(startOfMonth(referenceDate));
    setHighlightedIsoDate(formatIsoDate(referenceDate));
    setIsOpen(true);
  };

  const commitDateValue = (rawValue: string): boolean => {
    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
      setValidationMessage(null);
      setInputText('');
      if (normalizedValue) {
        onChange('');
      }
      return true;
    }

    const parsedDate = ISO_DATE_PATTERN.test(trimmedValue)
      ? parseIsoDate(trimmedValue)
      : parseDisplayDate(trimmedValue);

    if (parsedDate === null) {
      setValidationMessage(INVALID_DATE_MESSAGE);
      return false;
    }

    const isoDate = formatIsoDate(parsedDate);
    const rangeMessage = getRangeValidationMessage(isoDate, minValue, maxValue);
    if (rangeMessage) {
      setValidationMessage(rangeMessage);
      return false;
    }

    const nextDisplayValue = formatInputDate(parsedDate);
    setValidationMessage(null);
    setInputText(nextDisplayValue);
    setVisibleMonth(startOfMonth(parsedDate));
    setHighlightedIsoDate(isoDate);
    if (isoDate !== normalizedValue) {
      onChange(isoDate);
    }
    return true;
  };

  const handleSelectDate = (date: Date) => {
    const isoDate = formatIsoDate(date);
    if (!isDateSelectable(isoDate, minValue, maxValue)) return;

    setInputText(formatInputDate(date));
    setValidationMessage(null);
    setHighlightedIsoDate(isoDate);
    setVisibleMonth(startOfMonth(date));
    if (isoDate !== normalizedValue) {
      onChange(isoDate);
    }
    closeCalendar(true);
  };

  const handleInputChange = (nextRawValue: string) => {
    if (!nextRawValue) {
      setInputText('');
      setValidationMessage(null);
      if (normalizedValue) {
        onChange('');
      }
      return;
    }

    if (ISO_DATE_PATTERN.test(nextRawValue.trim())) {
      void commitDateValue(nextRawValue);
      return;
    }

    const nextDisplayValue = formatLooseInput(nextRawValue);
    setInputText(nextDisplayValue);
    setValidationMessage(null);

    if (nextDisplayValue.length === 10) {
      void commitDateValue(nextDisplayValue);
    }
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openCalendar(true);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void commitDateValue(inputText);
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeCalendar(true);
    }
  };

  const handleCalendarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentDate =
      parseIsoDate(highlightedIsoDate) ?? clampDateToRange(today, minDate, maxDate);

    if (event.key === 'Escape') {
      event.preventDefault();
      closeCalendar(true);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelectDate(currentDate);
      return;
    }

    let nextDate: Date | null = null;

    switch (event.key) {
      case 'ArrowLeft':
        nextDate = addDays(currentDate, -1);
        break;
      case 'ArrowRight':
        nextDate = addDays(currentDate, 1);
        break;
      case 'ArrowUp':
        nextDate = addDays(currentDate, -7);
        break;
      case 'ArrowDown':
        nextDate = addDays(currentDate, 7);
        break;
      case 'Home':
        nextDate = addDays(currentDate, -currentDate.getDay());
        break;
      case 'End':
        nextDate = addDays(currentDate, 6 - currentDate.getDay());
        break;
      case 'PageUp':
        nextDate = moveMonthPreservingDay(currentDate, -1, event.shiftKey ? -1 : 0);
        break;
      case 'PageDown':
        nextDate = moveMonthPreservingDay(currentDate, 1, event.shiftKey ? 1 : 0);
        break;
      default:
        return;
    }

    event.preventDefault();
    setMonthAndHighlight(nextDate, true);
  };

  return (
    <div
      className={joinClassNames('date-picker', disabled && 'date-picker--disabled')}
      ref={wrapperRef}
    >
      <div className="date-picker__control">
        <input
          {...inputProps}
          ref={inputRef}
          id={inputId}
          name={inputProps.name}
          type="text"
          className={joinClassNames('date-picker__input', className)}
          value={inputText}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode="numeric"
          pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
          disabled={disabled}
          min={min}
          max={max}
          aria-invalid={effectiveAriaInvalid || undefined}
          aria-describedby={describedBy || undefined}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          onFocus={onFocus}
          onBlur={(event) => {
            void commitDateValue(inputText);
            onBlur?.(event);
          }}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />

        <div className="date-picker__action-group">
          {canClear && (
            <button
              type="button"
              className="date-picker__icon-button"
              aria-label="Clear date"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValidationMessage(null);
                setInputText('');
                if (normalizedValue) {
                  onChange('');
                }
                closeCalendar(true);
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            className="date-picker__icon-button"
            aria-label={isOpen ? 'Close calendar' : 'Open calendar'}
            aria-expanded={isOpen}
            aria-controls={isOpen ? panelId : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (isOpen) {
                closeCalendar(true);
              } else {
                openCalendar(true);
              }
            }}
            disabled={disabled}
          >
            <CalendarDays size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {validationMessage && (
        <p id={validationMessageId} className="date-picker__message form-error" role="alert">
          {validationMessage}
        </p>
      )}

      {isOpen && (
        <div
          id={panelId}
          className="date-picker__panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={monthLabelId}
          onKeyDown={handleCalendarKeyDown}
        >
          <div className="date-picker__header">
            <div className="date-picker__title-group">
              <p id={monthLabelId} className="date-picker__title">
                {monthTitle}
              </p>
              <div className="date-picker__select-group">
                <label htmlFor={monthSelectId} className="sr-only">
                  Select month
                </label>
                <select
                  id={monthSelectId}
                  className="date-picker__select"
                  value={visibleMonth.getMonth()}
                  onChange={(event) => {
                    const nextMonth = Number(event.target.value);
                    setMonthAndHighlight(
                      getMonthDate(new Date(visibleMonth.getFullYear(), nextMonth, 1), 1),
                    );
                  }}
                >
                  {MONTH_LABELS.map((label, monthIndex) => (
                    <option key={label} value={monthIndex}>
                      {label}
                    </option>
                  ))}
                </select>

                <label htmlFor={yearSelectId} className="sr-only">
                  Select year
                </label>
                <select
                  id={yearSelectId}
                  className="date-picker__select"
                  value={visibleMonth.getFullYear()}
                  onChange={(event) => {
                    const nextYear = Number(event.target.value);
                    setMonthAndHighlight(new Date(nextYear, visibleMonth.getMonth(), 1));
                  }}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="date-picker__nav-group">
              <button
                type="button"
                className="date-picker__icon-button"
                aria-label="Previous month"
                onClick={() => setMonthAndHighlight(addMonths(visibleMonth, -1), true)}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="date-picker__icon-button"
                aria-label="Next month"
                onClick={() => setMonthAndHighlight(addMonths(visibleMonth, 1), true)}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="date-picker__weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((weekday) => (
              <span key={weekday} className="date-picker__weekday">
                {weekday}
              </span>
            ))}
          </div>

          <div className="date-picker__grid" aria-labelledby={monthLabelId}>
            {calendarDays.map((calendarDate) => {
              const isoDate = formatIsoDate(calendarDate);
              const isSelected = isSameDate(calendarDate, selectedDate);
              const isTodayDate = isSameDate(calendarDate, today);
              const isOutsideMonth = calendarDate.getMonth() !== visibleMonth.getMonth();
              const isHighlighted = highlightedIsoDate === isoDate;
              const isDisabled = !isDateSelectable(isoDate, minValue, maxValue);

              return (
                <button
                  key={isoDate}
                  ref={(node) => {
                    dayButtonRefs.current[isoDate] = node;
                  }}
                  type="button"
                  className={joinClassNames(
                    'date-picker__day',
                    isSelected && 'date-picker__day--selected',
                    isTodayDate && 'date-picker__day--today',
                    isOutsideMonth && 'date-picker__day--outside-month',
                    isHighlighted && 'date-picker__day--highlighted',
                  )}
                  aria-pressed={isSelected}
                  aria-current={isTodayDate ? 'date' : undefined}
                  aria-label={formatDate(calendarDate)}
                  disabled={isDisabled}
                  tabIndex={isHighlighted && !isDisabled ? 0 : -1}
                  onFocus={() => setHighlightedIsoDate(isoDate)}
                  onClick={() => handleSelectDate(calendarDate)}
                >
                  {calendarDate.getDate()}
                </button>
              );
            })}
          </div>

          <div className="date-picker__footer">
            <button
              type="button"
              className="date-picker__footer-button"
              onClick={() => handleSelectDate(today)}
              disabled={!canSelectToday}
            >
              Today
            </button>
            <button
              type="button"
              className="date-picker__footer-button"
              onClick={() => {
                setValidationMessage(null);
                setInputText('');
                if (normalizedValue) {
                  onChange('');
                }
                closeCalendar(true);
              }}
              disabled={!canClear}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DatePicker;
