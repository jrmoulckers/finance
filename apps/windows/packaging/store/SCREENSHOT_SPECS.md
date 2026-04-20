# Microsoft Store Screenshot & Asset Specifications

## Required Store Assets

All assets must be PNG format with transparent or brand-color backgrounds.

### App Icons

| Asset                 | Size (px)  | Notes                       |
| --------------------- | ---------- | --------------------------- |
| StoreLogo.png         | 50 × 50    | Store listing icon          |
| Square44x44Logo.png   | 44 × 44    | Taskbar, Start menu (small) |
| Square71x71Logo.png   | 71 × 71    | Start menu (medium-small)   |
| Square150x150Logo.png | 150 × 150  | Start menu tile (medium)    |
| Square310x310Logo.png | 310 × 310  | Start menu tile (large)     |
| Wide310x150Logo.png   | 310 × 150  | Start menu tile (wide)      |
| SplashScreen.png      | 620 × 300  | App splash screen           |
| finance.ico           | Multi-size | Windows EXE icon (16–256px) |

### Icon Design Guidelines

- Use the Finance app logo (dollar sign in blue circle)
- Background: `#2563EB` (Blue 600 from design tokens)
- Icon: White foreground on blue background
- Leave 20% padding inside the icon boundary
- ICO file must contain: 16×16, 32×32, 48×48, 64×64, 128×128, 256×256

## Store Listing Screenshots

Microsoft Store requires 1-10 screenshots. Recommended: 5 screenshots.

### Screenshot Specifications

| Property      | Value              |
| ------------- | ------------------ |
| Format        | PNG                |
| Resolution    | 1366 × 768 minimum |
| Recommended   | 1920 × 1080        |
| Max file size | 2 MB each          |
| Quantity      | 5 recommended      |

### Recommended Screenshots

1. **Dashboard** — Full app with sidebar + dashboard showing net worth, spending, budget health
2. **Accounts** — Master-detail account view with transaction history
3. **Transactions** — Transaction table with search and filter chips active
4. **Budgets** — Budget grid with progress rings showing various health states
5. **Settings** — Settings screen showing Windows Hello and appearance options

### Screenshot Capture Guidelines

- Use 1920×1080 window size
- Light mode for primary screenshots
- Include one dark mode screenshot
- No personal/real financial data — use sample data
- Ensure all text is readable at Store thumbnail size
- Include the sidebar navigation in all screenshots

## Promotional Assets (Optional but Recommended)

### Hero Image (for featured placement)

| Property | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Size     | 1920 × 1080                                                |
| Format   | PNG                                                        |
| Content  | App screenshot with overlay text highlighting key features |

### Promotional Tile

| Property | Value                                  |
| -------- | -------------------------------------- |
| Size     | 1080 × 1080                            |
| Format   | PNG                                    |
| Content  | App logo + tagline on brand background |

## Brand Colors (from design tokens)

| Token       | Hex       | Usage                     |
| ----------- | --------- | ------------------------- |
| Blue 600    | `#2563EB` | Primary / icon background |
| Blue 100    | `#DBEAFE` | Light accent              |
| Neutral 900 | `#111827` | Dark text                 |
| Neutral 0   | `#FFFFFF` | Light background          |
| Red 600     | `#DC2626` | Error / budget exceeded   |
| Green 600   | `#16A34A` | Success / income          |
| Amber 600   | `#D97706` | Warning / budget warning  |

## Asset Generation

Assets should be generated from the SVG source in `packages/design-tokens/`.
Use the following tools:

- **Figma** or **Inkscape** for icon design
- **ImageMagick** for ICO generation: `magick convert icon-256.png icon-128.png icon-64.png icon-48.png icon-32.png icon-16.png finance.ico`
- **Screenshots**: Run the app with `./gradlew :apps:windows:run` and capture with Win+Shift+S

## Human Actions Required

- [ ] Design app icons at all required sizes
- [ ] Generate finance.ico multi-resolution icon
- [ ] Capture 5 screenshots at 1920×1080
- [ ] Create hero image for featured placement
- [ ] Upload all assets to Microsoft Partner Center
