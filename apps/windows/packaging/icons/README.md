# Icons Directory

This directory should contain the application icons in all required sizes.

## Required Files

- `finance.ico` — Multi-resolution Windows icon (16, 32, 48, 64, 128, 256px)

## Generation

See `../store/SCREENSHOT_SPECS.md` for detailed specifications.

Generate from SVG source:

```bash
magick convert icon-256.png icon-128.png icon-64.png icon-48.png icon-32.png icon-16.png finance.ico
```
