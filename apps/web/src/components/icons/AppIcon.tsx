// SPDX-License-Identifier: BUSL-1.1

import type { CSSProperties, SVGProps } from 'react';

export type IconName =
  | 'account'
  | 'alert-circle'
  | 'alert-triangle'
  | 'arrow-right'
  | 'bank'
  | 'bell'
  | 'calendar'
  | 'car'
  | 'chart-bar'
  | 'check'
  | 'check-circle'
  | 'chevron-right'
  | 'circle'
  | 'clipboard'
  | 'cloud'
  | 'database'
  | 'download'
  | 'edit'
  | 'eye'
  | 'file-text'
  | 'film'
  | 'flame'
  | 'folder'
  | 'gift'
  | 'globe'
  | 'heart-pulse'
  | 'home'
  | 'info'
  | 'laptop'
  | 'leaf'
  | 'lightning'
  | 'lock'
  | 'mail'
  | 'map-pin'
  | 'mic'
  | 'medal'
  | 'package'
  | 'plane'
  | 'refresh'
  | 'search'
  | 'settings'
  | 'shield'
  | 'shopping-cart'
  | 'sparkles'
  | 'tag'
  | 'target'
  | 'trash'
  | 'trending-down'
  | 'trending-up'
  | 'trophy'
  | 'unlock'
  | 'upload'
  | 'wallet'
  | 'x';

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'aria-hidden' | 'focusable'> {
  name: IconName;
  size?: number | string;
  label?: string;
}

const paths: Record<IconName, string[]> = {
  account: ['M20 21a8 8 0 0 0-16 0', 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  'alert-circle': ['M12 8v5', 'M12 16h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  'alert-triangle': ['m12 3 10 18H2L12 3Z', 'M12 10v4', 'M12 17h.01'],
  'arrow-right': ['M5 12h14', 'm13 6 6 6-6 6'],
  bank: [
    'M3 21h18',
    'M5 10h14',
    'M6 10v8',
    'M10 10v8',
    'M14 10v8',
    'M18 10v8',
    'M12 3 4 7h16l-8-4Z',
  ],
  bell: ['M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z', 'M14 21a2 2 0 0 1-4 0'],
  calendar: [
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
    'M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  ],
  car: [
    'M5 17h14',
    'M7 17v2',
    'M17 17v2',
    'M5 13l2-6h10l2 6',
    'M6 13h12a2 2 0 0 1 2 2v2H4v-2a2 2 0 0 1 2-2Z',
  ],
  'chart-bar': ['M4 19V9', 'M12 19V5', 'M20 19v-7', 'M3 21h18'],
  check: ['m5 12 4 4L19 6'],
  'check-circle': ['M9 12l2 2 4-4', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  'chevron-right': ['m9 18 6-6-6-6'],
  circle: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  clipboard: ['M9 4h6l1 2h3v16H5V6h3l1-2Z', 'M9 10h6', 'M9 14h6'],
  cloud: ['M17.5 19H7a5 5 0 1 1 1.5-9.8A6 6 0 0 1 20 12a3.5 3.5 0 0 1-2.5 7Z'],
  database: [
    'M21 6c0 2.2-4 4-9 4S3 8.2 3 6s4-4 9-4 9 1.8 9 4Z',
    'M21 6v6c0 2.2-4 4-9 4s-9-1.8-9-4V6',
    'M21 12v6c0 2.2-4 4-9 4s-9-1.8-9-4v-6',
  ],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  'file-text': [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z',
    'M14 2v6h6',
    'M8 13h8',
    'M8 17h8',
  ],
  film: ['M4 4h16v16H4V4Z', 'M8 4v16', 'M16 4v16', 'M4 8h4', 'M16 8h4'],
  flame: ['M12 22c4 0 7-3 7-7 0-3-2-6-6-10 .5 3-1 4.5-3 6-1.5 1.1-3 2.4-3 5a5 5 0 0 0 5 6Z'],
  folder: ['M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z'],
  gift: ['M20 12v8H4v-8', 'M4 8h16v4H4z', 'M12 8v12', 'M12 8c-2-4-6-4-6-1 0 2 3 1 6 1Z'],
  globe: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    'M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9',
    'M3 12h18',
  ],
  'heart-pulse': [
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l3-3',
    'M8 14h2l1.5-3 3 6 1.5-3h2',
  ],
  home: ['M3 11 12 3l9 8v10h-6v-6H9v6H3V11Z'],
  info: ['M12 16v-4', 'M12 8h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  laptop: ['M4 5h16v11H4V5Z', 'M2 19h20'],
  leaf: ['M20 4c-7 0-12 4-12 10 0 3 2 6 5 6 6 0 9-6 7-16Z', 'M4 20c3-5 7-8 12-10'],
  lightning: ['m13 2-9 12h7l-1 8 10-13h-7V2Z'],
  lock: ['M7 10V7a5 5 0 0 1 10 0v3', 'M5 10h14v11H5V10Z'],
  mail: ['M4 4h16v16H4V4Z', 'm4 7 8 6 8-6'],
  'map-pin': [
    'M12 21s7-5 7-12a7 7 0 1 0-14 0c0 7 7 12 7 12Z',
    'M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ],
  mic: [
    'M12 16a4 4 0 0 0 4-4V8a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z',
    'M19 11a7 7 0 0 1-14 0',
    'M12 19v3',
    'M9 22h6',
  ],
  medal: ['M12 22a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'm8 2 4 6 4-6'],
  package: ['m3 7 9 5 9-5', 'M3 7l9-5 9 5v10l-9 5-9-5V7Z', 'M12 12v10'],
  plane: ['M22 2 11 13', 'm22 2-7 20-4-9-9-4 20-7Z'],
  refresh: [
    'M21 12a9 9 0 0 1-15 6.7L3 16',
    'M3 16v5h5',
    'M3 12a9 9 0 0 1 15-6.7L21 8',
    'M21 8V3h-5',
  ],
  search: ['m21 21-4.3-4.3', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19 12h3M2 12h3M12 2v3M12 19v3'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'],
  'shopping-cart': ['M6 6h15l-2 8H8L6 3H3', 'M9 21h.01', 'M18 21h.01'],
  sparkles: ['m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z'],
  tag: ['M20 10 14 4H5v9l6 6a3 3 0 0 0 4 0l5-5a3 3 0 0 0 0-4Z', 'M8 8h.01'],
  target: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
    'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z',
    'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  ],
  trash: ['M3 6h18', 'm19 6-1 16H6L5 6', 'M9 6V3h6v3', 'M9 10v8', 'M15 10v8'],
  'trending-down': ['M22 17 13.5 8.5l-5 5L2 7', 'M17 17h5v-5'],
  'trending-up': ['m22 7-8.5 8.5-5-5L2 17', 'M17 7h5v5'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0V4Z', 'M7 6H4a3 3 0 0 0 3 3'],
  unlock: ['M7 10V7a5 5 0 0 1 9.5-2', 'M5 10h14v11H5V10Z'],
  upload: ['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14'],
  wallet: ['M3 7h17a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z', 'M3 7a3 3 0 0 1 3-3h12v3'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
};

// TODO(#2009): Migrate the remaining legacy AppIcon call sites to the token-based <Icon />.
export function AppIcon({ name, size = 16, label, style, ...svgProps }: AppIconProps) {
  const iconStyle: CSSProperties = {
    display: 'inline-block',
    verticalAlign: '-0.125em',
    flexShrink: 0,
    ...style,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={iconStyle}
      {...svgProps}
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
