# Voice-input transaction-entry QA matrix

Follow-up to #2277 (issue #2504). Validates transaction entry and correction
flows across the mainstream voice tools, focusing on the two behaviours the
follow-up calls out: **activation by spoken (visible) label** and **error
correction without focus loss**.

The matrix is executable in `src/lib/a11y/dictation-entry.ts`
(`buildVoiceInputQaMatrix`, `getVoiceInputTools`) and asserted in
`src/lib/a11y/__tests__/dictation-entry.test.ts`.

## Matrix

| Tool                     | Platform                      | Activation (by spoken label) | Correction scenario                  | Expectation                                            |
| ------------------------ | ----------------------------- | ---------------------------- | ------------------------------------ | ------------------------------------------------------ |
| Windows Voice Access     | Windows 11                    | "Click Payee"                | "Correct amount to twelve dollars"   | Label activation focuses field; correction holds focus |
| macOS Voice Control      | macOS                         | "Click Amount"               | "Replace with fifteen dollars fifty" | Number overlay + label both reach the field            |
| Dragon NaturallySpeaking | Windows                       | "Click Category"             | "Select groceries"                   | Full-text control name matches visible label           |
| iOS dictation            | iOS                           | "Tap Note then dictate"      | Re-dictate note                      | Dictation appends; re-dictation corrects, keeps focus  |
| Android dictation        | Android (Gboard voice typing) | "Focus Date then speak"      | "Speak today"                        | Voice typing fills focused field; focus stays on date  |

## What is validated in code

- `buildDictationControlProps` keeps the visible label at the **start** of the
  accessible name, so every voice tool can activate a control by its on-screen
  label.
- `applyDictationCorrection` updates only the corrected field and returns
  `focusField` plus a "Focus remains on …" announcement, proving correction
  does not move or lose focus.

## Results

- All five tools are represented; each activation case resolves the field by its
  spoken label and each correction case keeps focus on the edited field (green
  in CI).

## Intentional gaps / next steps

- Automated coverage validates the label/focus contract, not the OS speech
  engines themselves. A manual pass on real hardware for each tool should record
  tool/version, pass/fail, and any focus-loss defects here and in PR notes.
