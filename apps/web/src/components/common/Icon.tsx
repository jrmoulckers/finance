// SPDX-License-Identifier: BUSL-1.1

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type SVGProps,
} from 'react';
import * as lucideReact from 'lucide-react';
import type { LucideProps } from 'lucide-react';

import { useIconPack, normalizeIconPackId, type WebIconPackId } from '../../hooks/useIconPack';
import {
  FLUENT_FILLED,
  FLUENT_FILLED_MAPPING,
  FLUENT_REGULAR,
  FLUENT_REGULAR_MAPPING,
  LUCIDE_MAPPING,
  MATERIAL_SYMBOLS_OUTLINED,
  MATERIAL_SYMBOLS_OUTLINED_MAPPING,
  MATERIAL_SYMBOLS_ROUNDED,
  MATERIAL_SYMBOLS_ROUNDED_MAPPING,
  MATERIAL_SYMBOLS_SHARP,
  MATERIAL_SYMBOLS_SHARP_MAPPING,
  STANDARD_LUCIDE,
  type IconMapping,
  type IconToken,
} from '../../icons/tokens';

export interface IconProps {
  name: IconToken;
  size?: number;
  className?: string;
  ariaLabel?: string;
  packId?: WebIconPackId;
}

type LucideIconComponent = ComponentType<LucideProps>;
type FluentIconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type FluentIconModule = Record<string, FluentIconComponent | undefined>;

const lucideLookupCache = new Map<string, LucideIconComponent | undefined>();
let fluentModuleCache: FluentIconModule | null = null;
let fluentModulePromise: Promise<FluentIconModule> | null = null;

function toPascalCase(iconName: string): string {
  return iconName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function resolveLucideIcon(iconName: string): LucideIconComponent | undefined {
  if (!lucideLookupCache.has(iconName)) {
    lucideLookupCache.set(
      iconName,
      lucideReact[toPascalCase(iconName) as keyof typeof lucideReact] as LucideIconComponent,
    );
  }
  return lucideLookupCache.get(iconName);
}

function loadFluentIcons(): Promise<FluentIconModule> {
  if (fluentModuleCache) return Promise.resolve(fluentModuleCache);
  fluentModulePromise ??= import('@fluentui/react-icons')
    .then((module) => module as unknown as FluentIconModule)
    .catch(() => ({}) as FluentIconModule)
    .then((module) => {
      fluentModuleCache = module;
      return fluentModuleCache;
    });
  return fluentModulePromise;
}

function useFluentModule(enabled: boolean): FluentIconModule | null {
  const [module, setModule] = useState<FluentIconModule | null>(fluentModuleCache);

  useEffect(() => {
    if (!enabled || module) return;
    let active = true;
    void loadFluentIcons().then((loadedModule) => {
      if (active) setModule(loadedModule);
    });
    return () => {
      active = false;
    };
  }, [enabled, module]);

  return module;
}

function getMaterialFamily(packId: WebIconPackId): string {
  switch (packId) {
    case MATERIAL_SYMBOLS_ROUNDED:
      return 'material-symbols-rounded';
    case MATERIAL_SYMBOLS_SHARP:
      return 'material-symbols-sharp';
    case MATERIAL_SYMBOLS_OUTLINED:
    default:
      return 'material-symbols-outlined';
  }
}

function getPackMapping(packId: WebIconPackId): IconMapping {
  switch (packId) {
    case MATERIAL_SYMBOLS_OUTLINED:
      return MATERIAL_SYMBOLS_OUTLINED_MAPPING;
    case MATERIAL_SYMBOLS_ROUNDED:
      return MATERIAL_SYMBOLS_ROUNDED_MAPPING;
    case MATERIAL_SYMBOLS_SHARP:
      return MATERIAL_SYMBOLS_SHARP_MAPPING;
    case FLUENT_REGULAR:
      return FLUENT_REGULAR_MAPPING;
    case FLUENT_FILLED:
      return FLUENT_FILLED_MAPPING;
    case STANDARD_LUCIDE:
    default:
      return LUCIDE_MAPPING;
  }
}

function LucideIcon({
  name,
  size,
  className,
  ariaLabel,
  packId,
}: Required<Pick<IconProps, 'name' | 'size'>> &
  Pick<IconProps, 'className' | 'ariaLabel'> & {
    packId: WebIconPackId;
  }) {
  const iconName = LUCIDE_MAPPING[name];
  const Component = resolveLucideIcon(iconName);

  if (!Component) return null;

  return (
    <Component
      size={size}
      className={className}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
      focusable="false"
      data-icon-token={name}
      data-icon-pack={packId}
    />
  );
}

export function Icon({ name, size = 24, className, ariaLabel, packId }: IconProps) {
  const { iconPackId } = useIconPack();
  const resolvedPackId = normalizeIconPackId(packId ?? iconPackId);
  const isFluentPack = resolvedPackId === FLUENT_REGULAR || resolvedPackId === FLUENT_FILLED;
  const fluentModule = useFluentModule(isFluentPack);
  const mapping = useMemo(() => getPackMapping(resolvedPackId), [resolvedPackId]);
  const iconName = mapping[name];

  if (resolvedPackId.startsWith('material_symbols_')) {
    const materialClassName = [getMaterialFamily(resolvedPackId), className]
      .filter(Boolean)
      .join(' ');
    const style: CSSProperties = {
      fontSize: size,
      lineHeight: 1,
      width: size,
      height: size,
      fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    };

    return (
      <span
        className={materialClassName}
        style={style}
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : undefined}
        data-icon-token={name}
        data-icon-pack={resolvedPackId}
      >
        {iconName}
      </span>
    );
  }

  if (isFluentPack && fluentModule) {
    const Component = fluentModule[iconName];
    if (Component) {
      return (
        <Component
          width={size}
          height={size}
          className={className}
          aria-hidden={ariaLabel ? undefined : true}
          aria-label={ariaLabel}
          role={ariaLabel ? 'img' : undefined}
          focusable="false"
          data-icon-token={name}
          data-icon-pack={resolvedPackId}
        />
      );
    }
  }

  return (
    <LucideIcon
      name={name}
      size={size}
      className={className}
      ariaLabel={ariaLabel}
      packId={isFluentPack ? STANDARD_LUCIDE : resolvedPackId}
    />
  );
}

export default Icon;
