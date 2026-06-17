// SPDX-License-Identifier: BUSL-1.1

import type { ComponentType, CSSProperties } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpFromLine,
  BadgeDollarSign,
  Banknote,
  Bell,
  Calculator,
  Car,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  Check,
  ChefHat,
  CircleAlert,
  CircleCheck,
  CircleUserRound,
  CircleX,
  Clock,
  Copy,
  CreditCard,
  Download,
  Dumbbell,
  FileDown,
  FileText,
  FileUp,
  Flag,
  Fuel,
  Funnel,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  House,
  HousePlus,
  Info,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Lock,
  LockOpen,
  Palmtree,
  Pencil,
  PiggyBank,
  Plane,
  Plug,
  Plus,
  Popcorn,
  Receipt,
  ReceiptText,
  RefreshCcw,
  RefreshCw,
  Repeat,
  Save,
  Scale,
  ScanLine,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  Users,
  Utensils,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Add24Filled,
  Add24Regular,
  Airplane24Filled,
  Airplane24Regular,
  Alert24Filled,
  Alert24Regular,
  ArrowClockwise24Filled,
  ArrowClockwise24Regular,
  ArrowDownload24Filled,
  ArrowDownload24Regular,
  ArrowRepeatAll24Filled,
  ArrowRepeatAll24Regular,
  ArrowSort24Filled,
  ArrowSort24Regular,
  ArrowSwap24Filled,
  ArrowSwap24Regular,
  ArrowSync24Filled,
  ArrowSync24Regular,
  ArrowTrending24Filled,
  ArrowTrending24Regular,
  ArrowUpload24Filled,
  ArrowUpload24Regular,
  Board24Filled,
  Board24Regular,
  BuildingBank24Filled,
  BuildingBank24Regular,
  Calculator24Filled,
  Calculator24Regular,
  Checkmark24Filled,
  Checkmark24Regular,
  CheckmarkCircle24Filled,
  CheckmarkCircle24Regular,
  Clock24Filled,
  Clock24Regular,
  Copy24Filled,
  Copy24Regular,
  DataBarVertical24Filled,
  DataBarVertical24Regular,
  DataLine24Filled,
  DataLine24Regular,
  DataPie24Filled,
  DataPie24Regular,
  Delete24Filled,
  Delete24Regular,
  Dismiss24Filled,
  Dismiss24Regular,
  DismissCircle24Filled,
  DismissCircle24Regular,
  DocumentArrowDown24Filled,
  DocumentArrowDown24Regular,
  DocumentData24Filled,
  DocumentData24Regular,
  DocumentText24Filled,
  DocumentText24Regular,
  Dumbbell24Filled,
  Dumbbell24Regular,
  Edit24Filled,
  Edit24Regular,
  ErrorCircle24Filled,
  ErrorCircle24Regular,
  Filter24Filled,
  Filter24Regular,
  Flag24Filled,
  Flag24Regular,
  Food24Filled,
  Food24Regular,
  FoodApple24Filled,
  FoodApple24Regular,
  FoodPizza24Filled,
  FoodPizza24Regular,
  Gas24Filled,
  Gas24Regular,
  Gift24Filled,
  Gift24Regular,
  HatGraduation24Filled,
  HatGraduation24Regular,
  HeartPulse24Filled,
  HeartPulse24Regular,
  Home24Filled,
  Home24Regular,
  HomePerson24Filled,
  HomePerson24Regular,
  Info24Filled,
  Info24Regular,
  Lightbulb24Filled,
  Lightbulb24Regular,
  LockClosed24Filled,
  LockClosed24Regular,
  LockOpen24Filled,
  LockOpen24Regular,
  Money24Filled,
  Money24Regular,
  MoneyHand24Filled,
  MoneyHand24Regular,
  MoviesAndTv24Filled,
  MoviesAndTv24Regular,
  Payment24Filled,
  Payment24Regular,
  People24Filled,
  People24Regular,
  PersonCircle24Filled,
  PersonCircle24Regular,
  PlugConnected24Filled,
  PlugConnected24Regular,
  Receipt24Filled,
  Receipt24Regular,
  ReceiptMoney24Filled,
  ReceiptMoney24Regular,
  Save24Filled,
  Save24Regular,
  Savings24Filled,
  Savings24Regular,
  ScaleFit24Filled,
  ScaleFit24Regular,
  Scan24Filled,
  Scan24Regular,
  Search24Filled,
  Search24Regular,
  Settings24Filled,
  Settings24Regular,
  Share24Filled,
  Share24Regular,
  Shield24Filled,
  Shield24Regular,
  ShieldCheckmark24Filled,
  ShieldCheckmark24Regular,
  ShoppingBag24Filled,
  ShoppingBag24Regular,
  TargetArrow24Filled,
  TargetArrow24Regular,
  Umbrella24Filled,
  Umbrella24Regular,
  VehicleCar24Filled,
  VehicleCar24Regular,
  Wallet24Filled,
  Wallet24Regular,
  Warning24Filled,
  Warning24Regular,
  Wifi124Filled,
  Wifi124Regular,
  WifiOff24Filled,
  WifiOff24Regular,
} from '@fluentui/react-icons';

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

type LucideIconComponent = ComponentType<Record<string, unknown>>;
type FluentIconComponent = ComponentType<Record<string, unknown>>;

const LUCIDE_ICONS = {
  'arrow-down-to-line': ArrowDownToLine,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up-down': ArrowUpDown,
  'arrow-up-from-line': ArrowUpFromLine,
  'badge-dollar-sign': BadgeDollarSign,
  banknote: Banknote,
  bell: Bell,
  calculator: Calculator,
  car: Car,
  'chart-bar': ChartBar,
  'chart-column': ChartColumn,
  'chart-line': ChartLine,
  'chart-pie': ChartPie,
  check: Check,
  'chef-hat': ChefHat,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-user-round': CircleUserRound,
  'circle-x': CircleX,
  clock: Clock,
  copy: Copy,
  'credit-card': CreditCard,
  download: Download,
  dumbbell: Dumbbell,
  'file-down': FileDown,
  'file-text': FileText,
  'file-up': FileUp,
  flag: Flag,
  fuel: Fuel,
  funnel: Funnel,
  gift: Gift,
  'graduation-cap': GraduationCap,
  'hand-coins': HandCoins,
  'heart-pulse': HeartPulse,
  home: Home,
  house: House,
  'house-plus': HousePlus,
  info: Info,
  landmark: Landmark,
  'layout-dashboard': LayoutDashboard,
  lightbulb: Lightbulb,
  lock: Lock,
  'lock-open': LockOpen,
  'palm-tree': Palmtree,
  pencil: Pencil,
  'piggy-bank': PiggyBank,
  plane: Plane,
  plug: Plug,
  plus: Plus,
  popcorn: Popcorn,
  receipt: Receipt,
  'receipt-text': ReceiptText,
  'refresh-ccw': RefreshCcw,
  'refresh-cw': RefreshCw,
  repeat: Repeat,
  save: Save,
  scale: Scale,
  'scan-line': ScanLine,
  search: Search,
  settings: Settings,
  'share-2': Share2,
  shield: Shield,
  'shield-check': ShieldCheck,
  'shopping-bag': ShoppingBag,
  'shopping-basket': ShoppingBasket,
  target: Target,
  'trash-2': Trash2,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  upload: Upload,
  users: Users,
  utensils: Utensils,
  wallet: Wallet,
  wifi: Wifi,
  'wifi-off': WifiOff,
  x: X,
} satisfies Record<string, LucideIconComponent>;

const FLUENT_ICONS = {
  Add24Filled,
  Add24Regular,
  Airplane24Filled,
  Airplane24Regular,
  Alert24Filled,
  Alert24Regular,
  ArrowClockwise24Filled,
  ArrowClockwise24Regular,
  ArrowDownload24Filled,
  ArrowDownload24Regular,
  ArrowRepeatAll24Filled,
  ArrowRepeatAll24Regular,
  ArrowSort24Filled,
  ArrowSort24Regular,
  ArrowSwap24Filled,
  ArrowSwap24Regular,
  ArrowSync24Filled,
  ArrowSync24Regular,
  ArrowTrending24Filled,
  ArrowTrending24Regular,
  ArrowUpload24Filled,
  ArrowUpload24Regular,
  Board24Filled,
  Board24Regular,
  BuildingBank24Filled,
  BuildingBank24Regular,
  Calculator24Filled,
  Calculator24Regular,
  Checkmark24Filled,
  Checkmark24Regular,
  CheckmarkCircle24Filled,
  CheckmarkCircle24Regular,
  Clock24Filled,
  Clock24Regular,
  Copy24Filled,
  Copy24Regular,
  DataBarVertical24Filled,
  DataBarVertical24Regular,
  DataLine24Filled,
  DataLine24Regular,
  DataPie24Filled,
  DataPie24Regular,
  Delete24Filled,
  Delete24Regular,
  Dismiss24Filled,
  Dismiss24Regular,
  DismissCircle24Filled,
  DismissCircle24Regular,
  DocumentArrowDown24Filled,
  DocumentArrowDown24Regular,
  DocumentData24Filled,
  DocumentData24Regular,
  DocumentText24Filled,
  DocumentText24Regular,
  Dumbbell24Filled,
  Dumbbell24Regular,
  Edit24Filled,
  Edit24Regular,
  ErrorCircle24Filled,
  ErrorCircle24Regular,
  Filter24Filled,
  Filter24Regular,
  Flag24Filled,
  Flag24Regular,
  Food24Filled,
  Food24Regular,
  FoodApple24Filled,
  FoodApple24Regular,
  FoodPizza24Filled,
  FoodPizza24Regular,
  Gas24Filled,
  Gas24Regular,
  Gift24Filled,
  Gift24Regular,
  HatGraduation24Filled,
  HatGraduation24Regular,
  HeartPulse24Filled,
  HeartPulse24Regular,
  Home24Filled,
  Home24Regular,
  HomePerson24Filled,
  HomePerson24Regular,
  Info24Filled,
  Info24Regular,
  Lightbulb24Filled,
  Lightbulb24Regular,
  LockClosed24Filled,
  LockClosed24Regular,
  LockOpen24Filled,
  LockOpen24Regular,
  Money24Filled,
  Money24Regular,
  MoneyHand24Filled,
  MoneyHand24Regular,
  MoviesAndTv24Filled,
  MoviesAndTv24Regular,
  Payment24Filled,
  Payment24Regular,
  People24Filled,
  People24Regular,
  PersonCircle24Filled,
  PersonCircle24Regular,
  PlugConnected24Filled,
  PlugConnected24Regular,
  Receipt24Filled,
  Receipt24Regular,
  ReceiptMoney24Filled,
  ReceiptMoney24Regular,
  Save24Filled,
  Save24Regular,
  Savings24Filled,
  Savings24Regular,
  ScaleFit24Filled,
  ScaleFit24Regular,
  Scan24Filled,
  Scan24Regular,
  Search24Filled,
  Search24Regular,
  Settings24Filled,
  Settings24Regular,
  Share24Filled,
  Share24Regular,
  Shield24Filled,
  Shield24Regular,
  ShieldCheckmark24Filled,
  ShieldCheckmark24Regular,
  ShoppingBag24Filled,
  ShoppingBag24Regular,
  TargetArrow24Filled,
  TargetArrow24Regular,
  Umbrella24Filled,
  Umbrella24Regular,
  VehicleCar24Filled,
  VehicleCar24Regular,
  Wallet24Filled,
  Wallet24Regular,
  Warning24Filled,
  Warning24Regular,
  Wifi124Filled,
  Wifi124Regular,
  WifiOff24Filled,
  WifiOff24Regular,
} satisfies Record<string, FluentIconComponent>;

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
  const Component = LUCIDE_ICONS[iconName as keyof typeof LUCIDE_ICONS];

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
  const mapping = getPackMapping(resolvedPackId);
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

  if (resolvedPackId === FLUENT_REGULAR || resolvedPackId === FLUENT_FILLED) {
    const Component = FLUENT_ICONS[iconName as keyof typeof FLUENT_ICONS];
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
      packId={
        resolvedPackId === FLUENT_REGULAR || resolvedPackId === FLUENT_FILLED
          ? STANDARD_LUCIDE
          : resolvedPackId
      }
    />
  );
}

export default Icon;
