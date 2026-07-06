// SPDX-License-Identifier: BUSL-1.1

import { createCatalogTranslator, type MessageCatalog } from './catalog-loader';
import { DEFAULT_LOCALE, getCurrentLocale } from '../i18n';

/**
 * Centralized, localized document (browser tab) titles for every route.
 *
 * Historically the web app never set `document.title`, so every route rendered
 * with the static `<title>Finance</title>` from `index.html` — making tabs,
 * history entries, and bookmarks indistinguishable (#3104). This module is the
 * single source of truth that maps a route to a descriptive, translated title.
 *
 * It is deliberately self-contained: rather than editing the shared locale
 * catalogs, it declares its own `pageTitle.*` catalogs and reuses the existing
 * i18n `createCatalogTranslator` machinery for locale resolution, fallback, and
 * interpolation. Locales without a catalog entry fall back to English, matching
 * the rest of the app.
 */

const BRAND_ID = 'pageTitle.brand';
const FORMAT_ID = 'pageTitle.format';
const NOT_FOUND_ID = 'pageTitle.notFound';

/**
 * English source catalog. This is the default locale and the fallback for any
 * message id missing from another locale.
 */
const EN_US_TITLES: MessageCatalog = {
  [BRAND_ID]: 'Finance',
  // `{page}` is the localized page label; `{brand}` is the product name. The
  // middot separator matches the in-app `Settings · Account` convention.
  [FORMAT_ID]: '{page} · {brand}',
  [NOT_FOUND_ID]: 'Page Not Found',
  'pageTitle.dashboard': 'Dashboard',
  'pageTitle.safety': 'Safety',
  'pageTitle.accounts': 'Accounts',
  'pageTitle.transactions': 'Transactions',
  'pageTitle.budgets': 'Budgets',
  'pageTitle.tripBudgets': 'Trip & Country Budgets',
  'pageTitle.categories': 'Categories',
  'pageTitle.goals': 'Goals',
  'pageTitle.debt': 'Debt',
  'pageTitle.buildingCredit': 'Building Credit',
  'pageTitle.import': 'Import',
  'pageTitle.importWizard': 'Import Wizard',
  'pageTitle.importP2p': 'P2P Import',
  'pageTitle.importBrokerage': 'Brokerage Import',
  'pageTitle.receiptOcr': 'Receipt OCR',
  'pageTitle.insights': 'Insights',
  'pageTitle.household': 'Household',
  'pageTitle.acceptInvite': 'Accept Invitation',
  'pageTitle.reportBuilder': 'Report Builder',
  'pageTitle.clientProfitability': 'Client Profitability',
  'pageTitle.businessPnl': 'Profit & Loss',
  'pageTitle.estimatedTax': 'Estimated Taxes',
  'pageTitle.gigDriver': 'Gig Driver Economics',
  'pageTitle.achievements': 'Achievements',
  'pageTitle.settings': 'Settings',
  'pageTitle.settingsAccount': 'Account Settings',
  'pageTitle.settingsPreferences': 'Preferences',
  'pageTitle.settingsPrivacy': 'Privacy & Data',
  'pageTitle.settingsSecurity': 'Security & Encryption',
  'pageTitle.settingsSync': 'Sync & Devices',
  'pageTitle.settingsAdvanced': 'Advanced',
  'pageTitle.settingsAbout': 'About',
  'pageTitle.watchlists': 'Watchlists',
  'pageTitle.investments': 'Investments',
  'pageTitle.livePnl': 'Live P&L',
  'pageTitle.taxCenter': 'Tax Center',
  'pageTitle.bills': 'Bills',
  'pageTitle.createBill': 'New Bill',
  'pageTitle.planning': 'Financial Planning',
  'pageTitle.fire': 'FIRE Planner',
  'pageTitle.learning': 'Learning',
  'pageTitle.estate': 'Estate Inventory',
  'pageTitle.cashFlow': 'Cash Flow',
  'pageTitle.cashRunway': 'Cash Runway',
  'pageTitle.invoices': 'Invoices',
  'pageTitle.netWorth': 'Net Worth',
  'pageTitle.subscriptions': 'Subscriptions',
  'pageTitle.bankConnections': 'Bank Connections',
  'pageTitle.remittances': 'Remittances',
  'pageTitle.expectedIncome': 'Expected Income',
  'pageTitle.privacyDashboard': 'Privacy Dashboard',
  'pageTitle.login': 'Log In',
  'pageTitle.signup': 'Sign Up',
  'pageTitle.forgotPassword': 'Forgot Password',
  'pageTitle.resetPassword': 'Reset Password',
  'pageTitle.legal': 'Legal',
  'pageTitle.legalPrivacy': 'Privacy Policy',
  'pageTitle.legalTerms': 'Terms of Service',
  'pageTitle.legalCcpa': 'California Privacy Notice',
  'pageTitle.beta': 'Beta',
  'pageTitle.onboarding': 'Welcome',
};

/** Spanish (Spain) titles. */
const ES_ES_TITLES: MessageCatalog = {
  [BRAND_ID]: 'Finance',
  [FORMAT_ID]: '{page} · {brand}',
  [NOT_FOUND_ID]: 'Página no encontrada',
  'pageTitle.dashboard': 'Panel',
  'pageTitle.safety': 'Seguridad',
  'pageTitle.accounts': 'Cuentas',
  'pageTitle.transactions': 'Transacciones',
  'pageTitle.budgets': 'Presupuestos',
  'pageTitle.tripBudgets': 'Presupuestos de viaje',
  'pageTitle.categories': 'Categorías',
  'pageTitle.goals': 'Metas',
  'pageTitle.debt': 'Deudas',
  'pageTitle.buildingCredit': 'Crear crédito',
  'pageTitle.import': 'Importar',
  'pageTitle.importWizard': 'Asistente de importación',
  'pageTitle.importP2p': 'Importación P2P',
  'pageTitle.importBrokerage': 'Importación de corretaje',
  'pageTitle.receiptOcr': 'OCR de recibos',
  'pageTitle.insights': 'Análisis',
  'pageTitle.household': 'Hogar',
  'pageTitle.acceptInvite': 'Aceptar invitación',
  'pageTitle.reportBuilder': 'Generador de informes',
  'pageTitle.clientProfitability': 'Rentabilidad de clientes',
  'pageTitle.businessPnl': 'Pérdidas y ganancias',
  'pageTitle.estimatedTax': 'Impuestos estimados',
  'pageTitle.gigDriver': 'Economía para conductores',
  'pageTitle.achievements': 'Logros',
  'pageTitle.settings': 'Ajustes',
  'pageTitle.settingsAccount': 'Ajustes de cuenta',
  'pageTitle.settingsPreferences': 'Preferencias',
  'pageTitle.settingsPrivacy': 'Privacidad y datos',
  'pageTitle.settingsSecurity': 'Seguridad y cifrado',
  'pageTitle.settingsSync': 'Sincronización y dispositivos',
  'pageTitle.settingsAdvanced': 'Avanzado',
  'pageTitle.settingsAbout': 'Acerca de',
  'pageTitle.watchlists': 'Listas de seguimiento',
  'pageTitle.investments': 'Inversiones',
  'pageTitle.livePnl': 'Resultados en vivo',
  'pageTitle.taxCenter': 'Centro fiscal',
  'pageTitle.bills': 'Facturas',
  'pageTitle.createBill': 'Nueva factura',
  'pageTitle.planning': 'Planificación financiera',
  'pageTitle.fire': 'Planificador FIRE',
  'pageTitle.learning': 'Aprendizaje',
  'pageTitle.estate': 'Inventario patrimonial',
  'pageTitle.cashFlow': 'Flujo de caja',
  'pageTitle.cashRunway': 'Autonomía de efectivo',
  'pageTitle.invoices': 'Facturas emitidas',
  'pageTitle.netWorth': 'Patrimonio neto',
  'pageTitle.subscriptions': 'Suscripciones',
  'pageTitle.bankConnections': 'Conexiones bancarias',
  'pageTitle.remittances': 'Remesas',
  'pageTitle.expectedIncome': 'Ingresos previstos',
  'pageTitle.privacyDashboard': 'Panel de privacidad',
  'pageTitle.login': 'Iniciar sesión',
  'pageTitle.signup': 'Crear cuenta',
  'pageTitle.forgotPassword': 'Recuperar contraseña',
  'pageTitle.resetPassword': 'Restablecer contraseña',
  'pageTitle.legal': 'Aviso legal',
  'pageTitle.legalPrivacy': 'Política de privacidad',
  'pageTitle.legalTerms': 'Términos del servicio',
  'pageTitle.legalCcpa': 'Aviso de privacidad de California',
  'pageTitle.beta': 'Beta',
  'pageTitle.onboarding': 'Bienvenida',
};

/** Chinese (Simplified) titles. */
const ZH_HANS_TITLES: MessageCatalog = {
  [BRAND_ID]: 'Finance',
  [FORMAT_ID]: '{page} · {brand}',
  [NOT_FOUND_ID]: '页面未找到',
  'pageTitle.dashboard': '概览',
  'pageTitle.safety': '安全',
  'pageTitle.accounts': '账户',
  'pageTitle.transactions': '交易',
  'pageTitle.budgets': '预算',
  'pageTitle.tripBudgets': '旅行预算',
  'pageTitle.categories': '分类',
  'pageTitle.goals': '目标',
  'pageTitle.debt': '债务',
  'pageTitle.buildingCredit': '建立信用',
  'pageTitle.import': '导入',
  'pageTitle.importWizard': '导入向导',
  'pageTitle.importP2p': 'P2P 导入',
  'pageTitle.importBrokerage': '券商导入',
  'pageTitle.receiptOcr': '收据识别',
  'pageTitle.insights': '洞察',
  'pageTitle.household': '家庭',
  'pageTitle.acceptInvite': '接受邀请',
  'pageTitle.reportBuilder': '报表生成器',
  'pageTitle.clientProfitability': '客户盈利',
  'pageTitle.businessPnl': '损益',
  'pageTitle.estimatedTax': '预估税款',
  'pageTitle.gigDriver': '零工司机收益',
  'pageTitle.achievements': '成就',
  'pageTitle.settings': '设置',
  'pageTitle.settingsAccount': '账户设置',
  'pageTitle.settingsPreferences': '偏好设置',
  'pageTitle.settingsPrivacy': '隐私与数据',
  'pageTitle.settingsSecurity': '安全与加密',
  'pageTitle.settingsSync': '同步与设备',
  'pageTitle.settingsAdvanced': '高级',
  'pageTitle.settingsAbout': '关于',
  'pageTitle.watchlists': '关注列表',
  'pageTitle.investments': '投资',
  'pageTitle.livePnl': '实时损益',
  'pageTitle.taxCenter': '税务中心',
  'pageTitle.bills': '账单',
  'pageTitle.createBill': '新建账单',
  'pageTitle.planning': '财务规划',
  'pageTitle.fire': 'FIRE 规划',
  'pageTitle.learning': '学习',
  'pageTitle.estate': '遗产清单',
  'pageTitle.cashFlow': '现金流',
  'pageTitle.cashRunway': '现金储备',
  'pageTitle.invoices': '发票',
  'pageTitle.netWorth': '净资产',
  'pageTitle.subscriptions': '订阅',
  'pageTitle.bankConnections': '银行连接',
  'pageTitle.remittances': '汇款',
  'pageTitle.expectedIncome': '预期收入',
  'pageTitle.privacyDashboard': '隐私面板',
  'pageTitle.login': '登录',
  'pageTitle.signup': '注册',
  'pageTitle.forgotPassword': '找回密码',
  'pageTitle.resetPassword': '重置密码',
  'pageTitle.legal': '法律信息',
  'pageTitle.legalPrivacy': '隐私政策',
  'pageTitle.legalTerms': '服务条款',
  'pageTitle.legalCcpa': '加州隐私声明',
  'pageTitle.beta': '测试版',
  'pageTitle.onboarding': '欢迎',
};

/** Localized page-title catalogs keyed by locale code. */
export const PAGE_TITLE_CATALOGS: Readonly<Record<string, MessageCatalog>> = {
  'en-US': EN_US_TITLES,
  'es-ES': ES_ES_TITLES,
  'zh-Hans': ZH_HANS_TITLES,
};

const pageTitleTranslator = createCatalogTranslator({
  defaultLocale: DEFAULT_LOCALE,
  catalogs: PAGE_TITLE_CATALOGS,
});

/**
 * Exact route path → title message id.
 *
 * Dynamic / detail routes (e.g. `/accounts/:id`) are intentionally omitted;
 * they resolve to their parent segment's title via {@link resolvePageTitleId},
 * so `/accounts/abc` renders "Accounts". The bare `/privacy`, `/terms`, and
 * `/ccpa` aliases mirror their `/legal/*` counterparts because the GDPR consent
 * modal links to them directly.
 */
export const ROUTE_TITLE_IDS: Readonly<Record<string, string>> = {
  '/': 'pageTitle.dashboard',
  '/dashboard': 'pageTitle.dashboard',
  '/safety': 'pageTitle.safety',
  '/accounts': 'pageTitle.accounts',
  '/transactions': 'pageTitle.transactions',
  '/budgets': 'pageTitle.budgets',
  '/trip-budgets': 'pageTitle.tripBudgets',
  '/categories': 'pageTitle.categories',
  '/goals': 'pageTitle.goals',
  '/debt': 'pageTitle.debt',
  '/building-credit': 'pageTitle.buildingCredit',
  '/import': 'pageTitle.import',
  '/import/wizard': 'pageTitle.importWizard',
  '/import/p2p': 'pageTitle.importP2p',
  '/import/brokerage': 'pageTitle.importBrokerage',
  '/import/receipt-ocr': 'pageTitle.receiptOcr',
  '/insights': 'pageTitle.insights',
  '/household': 'pageTitle.household',
  '/invite': 'pageTitle.acceptInvite',
  '/report-builder': 'pageTitle.reportBuilder',
  '/client-profitability': 'pageTitle.clientProfitability',
  '/business-pnl': 'pageTitle.businessPnl',
  '/estimated-tax': 'pageTitle.estimatedTax',
  '/gig-driver': 'pageTitle.gigDriver',
  '/achievements': 'pageTitle.achievements',
  '/settings': 'pageTitle.settings',
  '/settings/account': 'pageTitle.settingsAccount',
  '/settings/preferences': 'pageTitle.settingsPreferences',
  '/settings/privacy': 'pageTitle.settingsPrivacy',
  '/settings/security': 'pageTitle.settingsSecurity',
  '/settings/sync': 'pageTitle.settingsSync',
  '/settings/advanced': 'pageTitle.settingsAdvanced',
  '/settings/about': 'pageTitle.settingsAbout',
  '/watchlists': 'pageTitle.watchlists',
  '/investments': 'pageTitle.investments',
  '/investments/tax': 'pageTitle.taxCenter',
  '/live-pnl': 'pageTitle.livePnl',
  '/bills': 'pageTitle.bills',
  '/bills/new': 'pageTitle.createBill',
  '/planning': 'pageTitle.planning',
  '/fire': 'pageTitle.fire',
  '/learning': 'pageTitle.learning',
  '/estate': 'pageTitle.estate',
  '/cash-flow': 'pageTitle.cashFlow',
  '/cash-runway': 'pageTitle.cashRunway',
  '/invoices': 'pageTitle.invoices',
  '/net-worth': 'pageTitle.netWorth',
  '/subscriptions': 'pageTitle.subscriptions',
  '/bank-connections': 'pageTitle.bankConnections',
  '/remittances': 'pageTitle.remittances',
  '/expected-income': 'pageTitle.expectedIncome',
  '/privacy-dashboard': 'pageTitle.privacyDashboard',
  '/login': 'pageTitle.login',
  '/signup': 'pageTitle.signup',
  '/forgot-password': 'pageTitle.forgotPassword',
  '/reset-password': 'pageTitle.resetPassword',
  '/legal': 'pageTitle.legal',
  '/legal/privacy': 'pageTitle.legalPrivacy',
  '/legal/terms': 'pageTitle.legalTerms',
  '/legal/ccpa': 'pageTitle.legalCcpa',
  '/privacy': 'pageTitle.legalPrivacy',
  '/terms': 'pageTitle.legalTerms',
  '/ccpa': 'pageTitle.legalCcpa',
  '/beta': 'pageTitle.beta',
  '/onboarding': 'pageTitle.onboarding',
};

function translateTitle(id: string, locale: string, values: Record<string, string> = {}): string {
  return pageTitleTranslator.translate(id, values, locale).text;
}

/**
 * Resolves the title message id for a pathname.
 *
 * Tries an exact match first, then falls back to the first path segment so
 * detail routes (`/accounts/abc`) inherit their parent's title. Returns
 * `undefined` when neither matches (an unknown / not-found route).
 */
export function resolvePageTitleId(pathname: string): string | undefined {
  const exact = ROUTE_TITLE_IDS[pathname];
  if (exact) {
    return exact;
  }
  const firstSegment = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  return ROUTE_TITLE_IDS[firstSegment];
}

/**
 * Returns the localized short page label for a route (without the brand
 * suffix), or `undefined` for an unknown route.
 */
export function resolvePageLabel(
  pathname: string,
  locale: string = getCurrentLocale(),
): string | undefined {
  const id = resolvePageTitleId(pathname);
  return id ? translateTitle(id, locale) : undefined;
}

/**
 * Returns the full localized document title for a route, e.g.
 * `"Cash Runway · Finance"`. Unknown routes resolve to the localized
 * "Page Not Found" label so the tab is still meaningful.
 */
export function resolveDocumentTitle(
  pathname: string,
  locale: string = getCurrentLocale(),
): string {
  const id = resolvePageTitleId(pathname) ?? NOT_FOUND_ID;
  const page = translateTitle(id, locale);
  const brand = translateTitle(BRAND_ID, locale);
  return translateTitle(FORMAT_ID, locale, { page, brand });
}
