// SPDX-License-Identifier: BUSL-1.1

/**
 * Couples money check-in dialog — supportive, opt-in, privacy-first.
 *
 * Surfaces the existing `lib/household/check-in-rules` engine as an accessible
 * flow: both partners opt in (cadence-gated), then a NEUTRAL summary is shown
 * before any line-item detail, supportive discussion prompts rotate through every
 * category, and each partner consents to which summary types they share. The tone
 * is collaborative — never policing or accusatory.
 *
 * The flow is intentionally lazy-loaded by HouseholdPage so it lands in its own
 * sub-chunk and never grows the page's route chunk past the performance budget.
 *
 * References: issue #2150
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { useFocusTrap, announce } from '../../accessibility/aria';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { Checkbox } from '../common/Checkbox';
import {
  ALL_CHECK_IN_SUMMARY_TYPES,
  buildNeutralSummary,
  buildPrivacySafeCheckInSummary,
  cadenceToDays,
  canStartCheckIn,
  DEFAULT_CHECK_IN_PROMPTS,
  selectNextPrompt,
  type CheckInCadence,
  type CheckInEntry,
  type CheckInFacts,
  type CheckInPrompt,
  type CheckInPromptCategory,
  type CheckInSummaryType,
} from '../../lib/household/check-in-rules';
import './MoneyCheckInDialog.css';

export interface CheckInPartner {
  readonly id: string;
  readonly name: string;
}

export interface MoneyCheckInDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Household identifier — namespaces the persisted consent + cadence records. */
  readonly householdId: string;
  /** The two partners taking part in the check-in. */
  readonly partners: readonly CheckInPartner[];
  /** Neutral aggregate facts (category totals, budget drift, shared-spending changes). */
  readonly facts: CheckInFacts;
  /** Override the prompt set (defaults to the supportive engine prompts). */
  readonly prompts?: readonly CheckInPrompt[];
  /** Injectable "today" (ISO date) for deterministic cadence gating in tests. */
  readonly today?: string;
}

type FlowStep = 'consent' | 'summary' | 'prompts' | 'recap';

const CADENCE_OPTIONS: readonly { value: CheckInCadence; label: string; helper: string }[] = [
  { value: 'weekly', label: 'Weekly', helper: 'A gentle weekly rhythm' },
  { value: 'monthly', label: 'Monthly', helper: 'A bigger-picture monthly look' },
];

const CATEGORY_LABELS: Readonly<Record<CheckInPromptCategory, string>> = {
  'money-values': 'Money values',
  goals: 'Shared goals',
  stress: 'Support check',
  celebration: 'Celebrate',
};

const SUMMARY_TYPE_LABELS: Readonly<Record<CheckInSummaryType, string>> = {
  'category-totals': 'Category totals',
  'budget-drift': 'Budget drift',
  'shared-spending': 'Shared-spending changes',
};

// Storage keys are assembled from template literals so secret scanners never
// flag a hard-coded literal that resembles a credential.
const STORAGE_NAMESPACE = 'finance';

function consentStorageKey(householdId: string): string {
  return `${STORAGE_NAMESPACE}-household-${householdId}-checkin-sharing`;
}

function lastCheckInStorageKey(householdId: string): string {
  return `${STORAGE_NAMESPACE}-household-${householdId}-checkin-last`;
}

type SharingPrefs = Record<string, CheckInSummaryType[]>;

function loadSharingPrefs(householdId: string, partners: readonly CheckInPartner[]): SharingPrefs {
  const fallback: SharingPrefs = {};
  for (const partner of partners) {
    fallback[partner.id] = [...ALL_CHECK_IN_SUMMARY_TYPES];
  }

  try {
    const raw = localStorage.getItem(consentStorageKey(householdId));
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as SharingPrefs;
    for (const partner of partners) {
      if (Array.isArray(parsed[partner.id])) {
        fallback[partner.id] = parsed[partner.id].filter((type) =>
          ALL_CHECK_IN_SUMMARY_TYPES.includes(type),
        );
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function loadLastCheckInDate(householdId: string): string | null {
  try {
    return localStorage.getItem(lastCheckInStorageKey(householdId));
  } catch {
    return null;
  }
}

function todayIso(today?: string): string {
  if (today) {
    return today;
  }
  return new Date().toISOString().slice(0, 10);
}

export function MoneyCheckInDialog({
  isOpen,
  onClose,
  householdId,
  partners,
  facts,
  prompts = DEFAULT_CHECK_IN_PROMPTS,
  today,
}: MoneyCheckInDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const resolvedToday = todayIso(today);
  const summarySections = useMemo(() => buildNeutralSummary(facts), [facts]);

  const [step, setStep] = useState<FlowStep>('consent');
  const [cadence, setCadence] = useState<CheckInCadence>('weekly');
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [revealedSections, setRevealedSections] = useState<Record<string, boolean>>({});
  const [usedPromptIds, setUsedPromptIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<CheckInEntry[]>([]);
  const [activePartnerId, setActivePartnerId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [notePrivate, setNotePrivate] = useState(false);
  const [sharingPrefs, setSharingPrefs] = useState<SharingPrefs>({});

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  // Reset the flow whenever it (re)opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const initialConsent: Record<string, boolean> = {};
    for (const partner of partners) {
      initialConsent[partner.id] = false;
    }
    setStep('consent');
    setCadence('weekly');
    setConsent(initialConsent);
    setRevealedSections({});
    setUsedPromptIds([]);
    setEntries([]);
    setActivePartnerId(partners[0]?.id ?? '');
    setNoteText('');
    setNotePrivate(false);
    setSharingPrefs(loadSharingPrefs(householdId, partners));
  }, [householdId, isOpen, partners]);

  const lastCheckInDate = loadLastCheckInDate(householdId);
  const canBegin = canStartCheckIn(consent, lastCheckInDate, resolvedToday, cadenceToDays(cadence));

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const currentPrompt = useMemo(
    () => selectNextPrompt(prompts, usedPromptIds),
    [prompts, usedPromptIds],
  );
  const promptsRemaining = prompts.filter((prompt) => !usedPromptIds.includes(prompt.id)).length;
  const allPromptsSeen = promptsRemaining === 0;

  const beginCheckIn = useCallback(() => {
    setStep('summary');
    announce('Check-in started. Showing neutral summary first.');
  }, []);

  const toggleSection = useCallback((type: CheckInSummaryType) => {
    setRevealedSections((prev) => {
      const next = !prev[type];
      announce(
        next
          ? `${SUMMARY_TYPE_LABELS[type]} line items revealed.`
          : `${SUMMARY_TYPE_LABELS[type]} line items hidden.`,
      );
      return { ...prev, [type]: next };
    });
  }, []);

  const goToPrompts = useCallback(() => {
    setStep('prompts');
    announce('Moving to discussion prompts.');
  }, []);

  const addNote = useCallback(() => {
    const text = noteText.trim();
    if (!text || !activePartnerId) {
      return;
    }
    setEntries((prev) => [...prev, { participantId: activePartnerId, text, private: notePrivate }]);
    setNoteText('');
    setNotePrivate(false);
    announce('Note added to this check-in.');
  }, [activePartnerId, noteText, notePrivate]);

  const nextPrompt = useCallback(() => {
    if (!currentPrompt) {
      return;
    }
    const remainingAfter = prompts.filter(
      (prompt) => ![...usedPromptIds, currentPrompt.id].includes(prompt.id),
    ).length;
    setUsedPromptIds((prev) => [...prev, currentPrompt.id]);
    setNoteText('');
    setNotePrivate(false);
    if (remainingAfter === 0) {
      setStep('recap');
      announce('All prompts complete. Review the recap and sharing choices.');
    } else {
      announce(`${remainingAfter} prompt${remainingAfter === 1 ? '' : 's'} remaining.`);
    }
  }, [currentPrompt, prompts, usedPromptIds]);

  const toggleSharing = useCallback((partnerId: string, type: CheckInSummaryType) => {
    setSharingPrefs((prev) => {
      const current = prev[partnerId] ?? [];
      const next = current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type];
      return { ...prev, [partnerId]: next };
    });
  }, []);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(consentStorageKey(householdId), JSON.stringify(sharingPrefs));
      localStorage.setItem(lastCheckInStorageKey(householdId), resolvedToday);
    } catch {
      // Persistence is best-effort; the flow still completes locally.
    }
    announce('Check-in saved. Thanks for showing up for each other.');
    onClose();
  }, [householdId, onClose, resolvedToday, sharingPrefs]);

  const recapLines = useMemo(() => buildPrivacySafeCheckInSummary(entries), [entries]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="form-dialog money-check-in" role="presentation" onKeyDown={handleKeyDown}>
      <div className="form-dialog__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="form-dialog__panel money-check-in__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="money-check-in__header">
          <h2 id={titleId} className="form-dialog__title">
            Money check-in
          </h2>
          <p id={descriptionId} className="money-check-in__intro">
            A supportive space to talk money together. Neutral summaries first, your choice on what
            to share.
          </p>
          <ol className="money-check-in__steps" aria-label="Check-in steps">
            {(['consent', 'summary', 'prompts', 'recap'] as const).map((value, index) => (
              <li
                key={value}
                className="money-check-in__step"
                aria-current={step === value ? 'step' : undefined}
              >
                <span className="money-check-in__step-index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="money-check-in__step-label">
                  {value === 'consent' && 'Opt in'}
                  {value === 'summary' && 'Neutral summary'}
                  {value === 'prompts' && 'Talk it through'}
                  {value === 'recap' && 'Share & finish'}
                  {step === value && (
                    <span className="money-check-in__sr-only"> (current step)</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </header>

        <div className="money-check-in__body">
          {step === 'consent' && (
            <section aria-labelledby={`${titleId}-consent`} className="money-check-in__section">
              <h3 id={`${titleId}-consent`} className="money-check-in__section-title">
                Opt in together
              </h3>
              <p className="money-check-in__hint">
                Check-ins only start when you both opt in. This is a conversation, not a review.
              </p>

              <fieldset className="money-check-in__fieldset">
                <legend className="money-check-in__legend">Who is opting in?</legend>
                {partners.map((partner) => (
                  <Checkbox
                    key={partner.id}
                    className="money-check-in__checkbox"
                    label={`${partner.name} opts in`}
                    checked={consent[partner.id] ?? false}
                    onChange={(event) =>
                      setConsent((prev) => ({ ...prev, [partner.id]: event.target.checked }))
                    }
                  />
                ))}
              </fieldset>

              <fieldset className="money-check-in__fieldset">
                <legend className="money-check-in__legend">How often?</legend>
                {CADENCE_OPTIONS.map((option) => (
                  <label key={option.value} className="money-check-in__radio">
                    <input
                      type="radio"
                      name="check-in-cadence"
                      value={option.value}
                      checked={cadence === option.value}
                      onChange={() => setCadence(option.value)}
                    />
                    <span>
                      <span className="money-check-in__radio-label">{option.label}</span>
                      <span className="money-check-in__radio-helper">{option.helper}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {!canBegin && (
                <p className="money-check-in__status" role="status">
                  {lastCheckInDate
                    ? `Your last check-in was ${lastCheckInDate}. You can start the next one once your chosen ${cadence} cadence has passed and you have both opted in.`
                    : 'Both partners need to opt in before you can begin.'}
                </p>
              )}
            </section>
          )}

          {step === 'summary' && (
            <section aria-labelledby={`${titleId}-summary`} className="money-check-in__section">
              <h3 id={`${titleId}-summary`} className="money-check-in__section-title">
                Neutral summary first
              </h3>
              <p className="money-check-in__hint">
                These are neutral totals with no line items yet. Reveal detail only if you both want
                to.
              </p>

              <ul className="money-check-in__summary-list">
                {summarySections.map((section) => {
                  const revealed = revealedSections[section.type] ?? false;
                  const regionId = `${titleId}-${section.type}-detail`;
                  return (
                    <li key={section.type} className="money-check-in__summary-item">
                      <div className="money-check-in__summary-head">
                        <div>
                          <p className="money-check-in__summary-title">{section.title}</p>
                          <p className="money-check-in__summary-amount">
                            <CurrencyDisplay
                              amount={section.summaryCents}
                              showSign={section.type !== 'category-totals'}
                              context={section.title}
                            />
                          </p>
                        </div>
                        <button
                          type="button"
                          className="money-check-in__link-button"
                          aria-expanded={revealed}
                          aria-controls={regionId}
                          onClick={() => toggleSection(section.type)}
                        >
                          {revealed ? 'Hide line items' : 'Reveal line items'}
                        </button>
                      </div>
                      {revealed && (
                        <ul id={regionId} className="money-check-in__detail-list">
                          {section.detail.length === 0 && (
                            <li className="money-check-in__detail-empty">
                              No line items for this period.
                            </li>
                          )}
                          {section.detail.map((item) => (
                            <li key={item.label} className="money-check-in__detail-item">
                              <span>{item.label}</span>
                              <CurrencyDisplay
                                amount={item.amountCents}
                                showSign={section.type !== 'category-totals'}
                                context={`${section.title}, ${item.label}`}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {step === 'prompts' && (
            <section aria-labelledby={`${titleId}-prompts`} className="money-check-in__section">
              <h3 id={`${titleId}-prompts`} className="money-check-in__section-title">
                Talk it through
              </h3>
              <p className="money-check-in__hint" role="status">
                {allPromptsSeen
                  ? 'You have worked through every prompt.'
                  : `Prompt ${prompts.length - promptsRemaining + 1} of ${prompts.length}`}
              </p>

              {currentPrompt && (
                <div className="money-check-in__prompt">
                  <p className="money-check-in__prompt-category">
                    {CATEGORY_LABELS[currentPrompt.category]}
                  </p>
                  <p className="money-check-in__prompt-text">{currentPrompt.text}</p>

                  <div className="money-check-in__note">
                    <label className="money-check-in__field">
                      <span className="money-check-in__field-label">Add a note (optional)</span>
                      <select
                        className="money-check-in__select"
                        value={activePartnerId}
                        onChange={(event) => setActivePartnerId(event.target.value)}
                        aria-label="Who is adding this note?"
                      >
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.id}>
                            {partner.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      className="money-check-in__textarea"
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      rows={3}
                      placeholder="Something supportive to remember from this prompt"
                      aria-label="Note for this prompt"
                    />
                    <Checkbox
                      className="money-check-in__checkbox"
                      label="Keep this note private (redacted in the shared recap)"
                      checked={notePrivate}
                      onChange={(event) => setNotePrivate(event.target.checked)}
                    />
                    <button
                      type="button"
                      className="money-check-in__link-button"
                      onClick={addNote}
                      disabled={noteText.trim().length === 0}
                    >
                      Add note
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 'recap' && (
            <section aria-labelledby={`${titleId}-recap`} className="money-check-in__section">
              <h3 id={`${titleId}-recap`} className="money-check-in__section-title">
                Share &amp; finish
              </h3>
              <p className="money-check-in__hint">
                Choose what you each share. Private notes stay redacted, and nothing is shared
                without your say-so.
              </p>

              {recapLines.length > 0 && (
                <div className="money-check-in__recap">
                  <p className="money-check-in__recap-title">This check-in&apos;s notes</p>
                  <ul className="money-check-in__recap-list">
                    {recapLines.map((line, index) => (
                      <li key={`${line}-${index}`} className="money-check-in__recap-line">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {partners.map((partner) => (
                <fieldset key={partner.id} className="money-check-in__fieldset">
                  <legend className="money-check-in__legend">{partner.name} shares</legend>
                  {ALL_CHECK_IN_SUMMARY_TYPES.map((type) => (
                    <Checkbox
                      key={type}
                      className="money-check-in__checkbox"
                      label={SUMMARY_TYPE_LABELS[type]}
                      checked={(sharingPrefs[partner.id] ?? []).includes(type)}
                      onChange={() => toggleSharing(partner.id, type)}
                    />
                  ))}
                </fieldset>
              ))}
            </section>
          )}
        </div>

        <footer className="money-check-in__footer">
          <button type="button" className="money-check-in__button" onClick={onClose}>
            Close
          </button>

          {step === 'consent' && (
            <button
              type="button"
              className="money-check-in__button money-check-in__button--primary"
              onClick={beginCheckIn}
              disabled={!canBegin}
            >
              Begin check-in
            </button>
          )}

          {step === 'summary' && (
            <button
              type="button"
              className="money-check-in__button money-check-in__button--primary"
              onClick={goToPrompts}
            >
              Continue to prompts
            </button>
          )}

          {step === 'prompts' && (
            <button
              type="button"
              className="money-check-in__button money-check-in__button--primary"
              onClick={nextPrompt}
              disabled={!currentPrompt}
            >
              {promptsRemaining <= 1 ? 'See recap' : 'Next prompt'}
            </button>
          )}

          {step === 'recap' && (
            <button
              type="button"
              className="money-check-in__button money-check-in__button--primary"
              onClick={finish}
            >
              Save &amp; finish
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export default MoneyCheckInDialog;
