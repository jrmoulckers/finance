# On-device receipt scanning (#2388)

Turns a receipt photo into a reviewable transaction draft **entirely on
device**. No receipt image or recognised text ever leaves the phone.

## Pipeline

```
CameraX capture ──▶ ML Kit Text Recognition v2 ──▶ shared ReceiptTextParser ──▶ ReceiptDraftMapper ──▶ review UI
   (interface)            (on-device OCR)              (KMP, packages/core)        (tax + payment hint)     (corrections)
```

| Stage   | Type                                                     | Notes                                                              |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Capture | `ReceiptImageCapture`                                    | Interface; CameraX impl is device-only (see _Needs human action_). |
| OCR     | `ReceiptTextRecognizer` → `AndroidReceiptTextRecognizer` | ML Kit Text Recognition v2, on device.                             |
| Parse   | `parseReceiptText` (shared KMP)                          | merchant, date, total, currency, line items.                       |
| Map     | `ReceiptDraftMapper`                                     | Adds **tax** + **payment hint** and per-field confidence.          |
| Review  | `ReceiptScanViewModel` + `ReceiptScanScreen`             | Correction UI for low-confidence fields.                           |

Everything except the CameraX capture is pure Kotlin and unit-tested on the JVM
(`ReceiptDraftMapperTest`, `ReceiptScanViewModelTest`).

## Privacy

- **No upload.** OCR and parsing run locally; there is no network call.
- **Opt-in image retention.** `ReceiptImageRetentionStore` defaults to
  `NoOpReceiptImageRetentionStore`, which discards every frame. The captured
  image is persisted only when the user enables the _Keep receipt image_ switch.

## Low-confidence corrections

`ReceiptDraftMapper` assigns each field a confidence in `[0,1]`. Fields below
`DEFAULT_LOW_CONFIDENCE_THRESHOLD` (0.6) or with no value are flagged with
`needsReview`, highlighted as errors in `ReceiptScanScreen`, and editable inline.
A user correction sets confidence to `1.0` and clears the flag.

## Fallback / manual entry

The flow degrades gracefully to manual transaction entry when any of these hold:

| Condition                  | Behaviour                                                    |
| -------------------------- | ------------------------------------------------------------ |
| No camera hardware         | `capture.isAvailable == false` → `ManualFallback` phase.     |
| Camera permission denied   | `ReceiptCaptureOutcome.PermissionDenied` → `ManualFallback`. |
| ML Kit unavailable         | `recognizer.isAvailable == false` → `ManualFallback`.        |
| OCR returns nothing usable | Empty/low-confidence draft → all fields flagged for review.  |

In every fallback the user can tap **Enter manually instead**, which routes to
the standard transaction-create screen. The camera is declared
`android:required="false"` so the app still installs on camera-less devices.

## Needs human action

The CameraX capture implementation requires a device/emulator and Android
Studio, so it is left as a marked interface seam:

- `ReceiptImageCapture` is bound to `UnavailableReceiptImageCapture` in
  `AppModule` (see the `TODO(human)` there). Until a CameraX-backed
  implementation is supplied, `startScan()` routes to manual entry.
- `AndroidReceiptTextRecognizer` is wired and compiles against ML Kit, but its
  end-to-end behaviour needs on-device verification.
