// SPDX-License-Identifier: BUSL-1.1

import { test, expect } from './fixtures';

function luminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported CSS color: ${color}`);
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

test('shared focus styles reveal hidden controls and maintain theme contrast', async ({
  authenticatedPage: page,
}, testInfo) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('main', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'feedback-fixture';
    const before = document.createElement('button');
    before.id = 'feedback-before';
    before.textContent = 'Before synthetic skip link';
    const link = document.createElement('a');
    link.id = 'feedback-skip';
    link.href = '#main-content';
    link.className = 'sr-only sr-only-focusable';
    link.textContent = 'Synthetic skip link';
    fixture.append(before, link);
    for (const surface of ['primary', 'secondary', 'elevated']) {
      const probe = document.createElement('div');
      probe.dataset.surface = surface;
      probe.style.backgroundColor = `var(--semantic-background-${surface})`;
      fixture.append(probe);
    }
    document.body.prepend(fixture);
  });
  const link = page.locator('#feedback-skip');
  await expect(link).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
  await page.locator('#feedback-before').focus();
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await expect(link).toHaveCSS('clip', 'auto');
  await expect(link).toHaveCSS('position', 'static');
  await page.keyboard.press('Shift+Tab');
  await expect(link).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');

  const evidence = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, contrast: 'no-preference' });
    for (const theme of ['light', 'dark', 'dark-oled', 'high-contrast', 'system']) {
      await page.evaluate((value) => {
        if (value === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', value);
      }, theme);
      await page.locator('#feedback-before').focus();
      await page.keyboard.press('Tab');
      const computed = await link.evaluate((element) => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas color conversion unavailable');
        const toRgb = (color: string): string => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
          if (alpha !== 255) throw new Error(`Expected opaque theme color: ${color}`);
          return `rgb(${r}, ${g}, ${b})`;
        };
        return {
          color: toRgb(style.outlineColor),
          width: parseFloat(style.outlineWidth),
          offset: parseFloat(style.outlineOffset),
          outlineStyle: style.outlineStyle,
          surfaces: Array.from(document.querySelectorAll<HTMLElement>('[data-surface]')).map(
            (probe) => ({
              name: probe.dataset.surface,
              color: toRgb(getComputedStyle(probe).backgroundColor),
            }),
          ),
        };
      });
      expect(computed.outlineStyle).toBe('solid');
      expect(computed.width).toBeGreaterThanOrEqual(2);
      expect(computed.offset).toBeGreaterThanOrEqual(2);
      const contrasts = computed.surfaces.map((surface) => {
        const ring = luminance(computed.color);
        const background = luminance(surface.color);
        const ratio = (Math.max(ring, background) + 0.05) / (Math.min(ring, background) + 0.05);
        expect(ratio, `${theme}/${colorScheme}/${surface.name}`).toBeGreaterThanOrEqual(3);
        return { ...surface, ratio };
      });
      evidence.push({ theme, colorScheme, ...computed, contrasts });
    }
  }
  await testInfo.attach('focus-contrast.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
});
