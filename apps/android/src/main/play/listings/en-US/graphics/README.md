# Play Store Graphics Requirements

All graphics must be provided before store submission. This file documents
the required assets and their specifications.

## Required Assets

### Feature Graphic (Required)

- **Size:** 1024 × 500 px
- **Format:** PNG or JPEG, no alpha
- **File:** `feature-graphic.png`
- **Notes:** Displayed at the top of the store listing. Should showcase
  the Finance app dashboard with Material You theming.

### App Icon (High-res)

- **Size:** 512 × 512 px
- **Format:** PNG, 32-bit with alpha
- **File:** `icon.png`
- **Notes:** Must match the adaptive icon in `res/mipmap-*`. Use the
  finance brand icon on a clean background.

### Phone Screenshots (2–8 required)

- **Size:** 16:9 or 9:16 aspect ratio, min 320 px, max 3840 px per side
- **Format:** PNG or JPEG, no alpha
- **Files:** `phone-screenshots/1.png` through `phone-screenshots/8.png`
- **Recommended shots:**
  1. Dashboard with net worth and budget health
  2. Transaction list with search and filters
  3. Budget progress rings (healthy + warning states)
  4. Account management overview
  5. Spending insights / analytics
  6. Settings with theme selection
  7. Goal tracking progress
  8. Dark mode showcase

### 7-inch Tablet Screenshots (Optional but recommended)

- **Size:** Same aspect ratio requirements as phone
- **Files:** `tablet-screenshots/7-inch/1.png` through `…/8.png`

### 10-inch Tablet Screenshots (Optional but recommended)

- **Files:** `tablet-screenshots/10-inch/1.png` through `…/8.png`

## Generation Process

Screenshots can be generated using Paparazzi snapshot tests:

```bash
./gradlew :apps:android:recordPaparazziDebug
```

Feature graphic and icon should be produced by the design team
using the brand assets in `packages/design-tokens/`.

## Localization

Graphics should be duplicated for each supported locale:

- `en-US/graphics/` (English)
- `es-ES/graphics/` (Spanish)
- `fr-FR/graphics/` (French)

Text overlays on screenshots should be translated per locale.
