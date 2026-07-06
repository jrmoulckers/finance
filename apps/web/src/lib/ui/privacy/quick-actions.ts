// SPDX-License-Identifier: BUSL-1.1

/** Platform quick-action registration descriptor for privacy-mode toggles. */
export interface PrivacyQuickActionDescriptor {
  readonly platform:
    'ios-control-center' | 'android-quick-settings' | 'web-shortcut' | 'windows-secondary-tile';
  readonly title: string;
  readonly description: string;
  readonly action: 'toggle-privacy-mode';
}

/** Shared descriptors consumed by platform-specific quick-settings adapters. */
export const PRIVACY_QUICK_ACTIONS: readonly PrivacyQuickActionDescriptor[] = [
  {
    platform: 'ios-control-center',
    title: 'Finance Privacy',
    description: 'Hide exact amounts from Control Center where supported.',
    action: 'toggle-privacy-mode',
  },
  {
    platform: 'android-quick-settings',
    title: 'Finance Privacy',
    description: 'Android Quick Settings tile toggles public privacy mode.',
    action: 'toggle-privacy-mode',
  },
  {
    platform: 'web-shortcut',
    title: 'Privacy mode',
    description: 'Header shortcut and keyboard shortcut toggle public privacy mode.',
    action: 'toggle-privacy-mode',
  },
  {
    platform: 'windows-secondary-tile',
    title: 'Finance Privacy',
    description: 'Windows secondary tile or Action Center entry toggles public privacy mode.',
    action: 'toggle-privacy-mode',
  },
];
