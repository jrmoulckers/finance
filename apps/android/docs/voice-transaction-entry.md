# Google Assistant voice transaction entry (#2383)

Lets an Android commuter speak a short phrase and land in a **prefilled,
reviewable** transaction draft. Utterance parsing runs **entirely on device**
and works fully offline, so a draft is always created even when the Assistant
handoff cannot complete.

## Pipeline

```
Assistant / SpeechRecognizer ──▶ VoiceEntityExtractor ──▶ LocalUtteranceParser ──▶ VoiceTransactionViewModel ──▶ VoiceTransactionScreen
   (transcript, device-only)         (interface)            (rules, deterministic)     (prompts + offline draft)      (review + confirm)
```

| Stage   | Type                                                     | Notes                                                                      |
| ------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Capture | Assistant App Action / `SpeechRecognizer`                | Device-only transcript source (see _Needs human action_).                  |
| Extract | `VoiceEntityExtractor` → `RuleBasedVoiceEntityExtractor` | Decoupling seam; an ML Kit entity-extraction impl drops in here unchanged. |
| Parse   | `LocalUtteranceParser` (`UtteranceParser`)               | Maps entities to amount, merchant, category, account, note. Deterministic. |
| Drive   | `VoiceTransactionViewModel`                              | Native prompts for missing/ambiguous fields; offline drafting.             |
| Review  | `VoiceTransactionScreen`                                 | Explicit confirmation before any save.                                     |

Everything except the speech capture is pure Kotlin and unit-tested on the JVM
(`LocalUtteranceParserTest`, `VoiceTransactionInstrumentationTest`,
`VoiceTransactionViewModelTest`).

## Field capture

| Field    | Example phrasing                                      | Required |
| -------- | ----------------------------------------------------- | -------- |
| Amount   | "$4.50", "12 dollars", "four dollars", "twelve bucks" | yes      |
| Merchant | "at Starbucks", "from Chevron"                        | yes      |
| Category | inferred ("coffee" → Dining)                          | no       |
| Account  | "with cash", "on my visa"                             | no       |
| Note     | "note client lunch"                                   | no       |

Required fields that are absent, and any field with more than one plausible
value, are surfaced as **native prompts** — there are **no silent defaults**.

## Confirmation flow

1. Transcript is parsed into a `VoiceParseResult`.
2. Missing required fields → prompt (free entry). Ambiguous fields → prompt with
   candidate chips.
3. Once every prompt is resolved, the user sees the full draft and must tap
   **Save** to confirm. Nothing is written before that explicit confirmation.

## Offline-safe drafting

`VoiceTransactionViewModel.onAssistantHandoffUnavailable(utterance)` parses the
phrase locally and stashes the draft in a `VoiceDraftStore` so it can be
reviewed later. Parsing and drafting never touch the network or the Assistant
service.

## Privacy — speech transcription & parsing boundaries

- **On-device parsing.** `RuleBasedVoiceEntityExtractor` and
  `LocalUtteranceParser` perform no network I/O. Mapping a transcript to fields
  never leaves the phone.
- **Transcription boundary.** When the system Google Assistant or
  `SpeechRecognizer` performs speech-to-text, audio may be processed by Google
  per the platform's own privacy policy. That boundary is **outside this app**;
  we only ever receive the resulting text. The in-app microphone path should
  prefer an on-device recognizer where available.
- **No content logging.** Timber logs only field _names_, stage transitions, and
  counts — never the transcript, amounts, merchant, account, or note.
- **Privacy-safe metrics.** `VoiceTransactionInstrumentation` records success,
  cancellation, and correction outcomes as anonymous counts gated by analytics
  consent. No transaction content is ever recorded.
- **Drafts.** Offline drafts live in memory by default; a durable store must be
  encrypted (see _Needs human action_).

## Needs human action

The following require a physical device / emulator and Android Studio and are
intentionally left as `// TODO(human)` markers:

1. **App Actions / Assistant wiring.** Add `shortcuts.xml` with a
   `GET_TRANSACTION`-style custom intent (or BII), register the capability, and
   route the resulting transcript into
   `VoiceTransactionViewModel.onUtteranceReceived(...)`. Requires an Assistant
   test device and Play Console App Actions review.
2. **In-app `SpeechRecognizer` capture.** Wire the microphone button to an
   on-device `SpeechRecognizer`, requesting `RECORD_AUDIO` at point of use.
3. **Durable, encrypted draft store.** Replace `InMemoryVoiceDraftStore` with a
   SQLCipher-backed implementation so offline drafts survive process death.

See the `// TODO(human)` markers in `VoiceAssistantEntryPoint.kt` and
`VoiceDraftStore.kt`.
