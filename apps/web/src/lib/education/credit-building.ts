// SPDX-License-Identifier: BUSL-1.1

/**
 * Beginner-friendly credit-building education for newcomers who are starting
 * from zero (or starting over).
 *
 * The audience often has no credit score yet, may file taxes with an ITIN, and
 * is meeting ideas like FICO scores, utilization, statement vs. due dates, hard
 * inquiries, and credit reports for the first time. The copy is deliberately
 * plain-language, non-judgmental, and reading-level friendly.
 *
 * Two principles drive the content:
 *  1. Nothing here asks the reader to buy or pull a real credit *score*. Every
 *     checklist item is a habit or goal the person fully controls.
 *  2. This is educational content only — not financial, legal, or
 *     credit-repair advice.
 *
 * Content is provided in English and Spanish. It lives in this lazy-loaded
 * module (imported only by LearningPage) rather than the app-wide i18n catalog
 * so the long-form copy never bloats shared route chunks. Locale resolution
 * reuses the app's i18n locale (see `resolveCreditEducationLocale`).
 *
 * References: issue #2174
 */

export type CreditEducationLocale = 'en' | 'es';

/** Canonical order for the plain-language credit explainers. */
export const CREDIT_EXPLAINER_KEYS = [
  'fico',
  'utilization',
  'statementVsDue',
  'hardInquiries',
  'creditReports',
] as const;
export type CreditExplainerKey = (typeof CREDIT_EXPLAINER_KEYS)[number];

/** Canonical order for the secured-card guidance steps. */
export const SECURED_CARD_STEP_KEYS = [
  'deposit',
  'lowUtilization',
  'onTimePayments',
  'graduation',
] as const;
export type SecuredCardStepKey = (typeof SECURED_CARD_STEP_KEYS)[number];

/** Canonical order for the no-score-required credit-building checklist. */
export const CREDIT_CHECKLIST_KEYS = [
  'secureCard',
  'autopay',
  'smallRecurringCharge',
  'lowUtilization',
  'dueDateReminder',
  'limitApplications',
  'reviewFreeReport',
  'paymentBuffer',
] as const;
export type CreditChecklistKey = (typeof CREDIT_CHECKLIST_KEYS)[number];

export interface CreditExplainer {
  /** Stable identifier used for ordering, anchors, and tests. */
  readonly id: CreditExplainerKey;
  /** Short, question-style heading. */
  readonly title: string;
  /** Plain-language description of the concept. */
  readonly body: string;
  /** Why it matters to the reader's money, in everyday terms. */
  readonly whyItMatters: string;
}

export interface SecuredCardStep {
  readonly id: SecuredCardStepKey;
  readonly title: string;
  readonly body: string;
}

export interface CreditChecklistItem {
  readonly id: CreditChecklistKey;
  /** Short imperative label shown next to the checkbox. */
  readonly label: string;
  /** One-sentence explanation of how to do the step. */
  readonly detail: string;
}

export interface CreditEducationContent {
  readonly locale: CreditEducationLocale;
  readonly sectionTitle: string;
  readonly sectionIntro: string;
  readonly disclaimer: string;
  readonly languageToggleLabel: string;
  readonly languageOptionEnglish: string;
  readonly languageOptionSpanish: string;
  readonly whyItMattersLabel: string;
  readonly explainersHeading: string;
  readonly explainers: readonly CreditExplainer[];
  readonly securedHeading: string;
  readonly securedIntro: string;
  readonly securedSteps: readonly SecuredCardStep[];
  readonly checklistHeading: string;
  readonly checklistIntro: string;
  readonly checklistNoScoreNote: string;
  readonly checklistItems: readonly CreditChecklistItem[];
  /** Template with `{done}` and `{total}` placeholders. */
  readonly checklistProgressTemplate: string;
  readonly checklistAllDone: string;
  readonly checklistDoneBadge: string;
}

const EN_CONTENT: CreditEducationContent = {
  locale: 'en',
  sectionTitle: 'Building credit from zero',
  sectionIntro:
    'If you are new to credit, or starting over, these plain-language guides explain how credit works in the United States and how a secured card can help you build a history step by step. Nothing here asks you to pay for or pull a credit score.',
  disclaimer:
    'This is general education, not financial, legal, or credit-repair advice. Credit rules and card terms change, so always check the details with your bank or credit union.',
  languageToggleLabel: 'Reading language',
  languageOptionEnglish: 'English',
  languageOptionSpanish: 'Español',
  whyItMattersLabel: 'Why it matters',
  explainersHeading: 'Credit, explained simply',
  explainers: [
    {
      id: 'fico',
      title: 'What is a FICO score?',
      body: 'A FICO score is a three-digit number, usually between 300 and 850, that lenders use to estimate how likely you are to repay borrowed money. It is built from your payment history, how much of your available credit you use, the length of your credit history, the mix of accounts you have, and how often you apply for new credit.',
      whyItMatters:
        'A higher score can make it easier to rent a home, get a card or loan, and pay a lower interest rate. When you are starting out you may have no score yet. That is normal, and steady habits build one over time.',
    },
    {
      id: 'utilization',
      title: 'What is credit utilization?',
      body: 'Utilization is how much of your credit limit you are using. If your card limit is $500 and your balance is $50, your utilization is 10%. It is usually figured for each card and across all your cards together.',
      whyItMatters:
        'Lower utilization generally helps your score. Many people aim to keep it under 30%, and under 10% is even better. Paying the balance down before the statement closes can keep the reported number low.',
    },
    {
      id: 'statementVsDue',
      title: 'Statement date vs. due date',
      body: 'The statement (or closing) date is when the card adds up everything you spent that month and creates a bill. The due date, usually about three weeks later, is the day your payment must arrive to avoid a late fee and interest.',
      whyItMatters:
        'The balance on your statement date is often the one reported to the credit bureaus. Paying before the statement date can lower your reported utilization, while paying by the due date keeps your payments on time.',
    },
    {
      id: 'hardInquiries',
      title: 'What is a hard inquiry?',
      body: 'A hard inquiry happens when a lender checks your credit because you applied for a card or loan. A soft inquiry, like checking your own report or getting a pre-qualified offer, does not affect your score.',
      whyItMatters:
        'Each hard inquiry can lower your score by a few points for a short time, and several in a row can look risky to lenders. Applying only when you need to, and spacing applications out, keeps the impact small.',
    },
    {
      id: 'creditReports',
      title: 'What is a credit report?',
      body: 'A credit report is a detailed record of your accounts, balances, and payment history, kept by three main bureaus: Equifax, Experian, and TransUnion. In the U.S. you can get free copies of your reports at AnnualCreditReport.com.',
      whyItMatters:
        'Checking your own report is a soft inquiry, so it never lowers your score. Reviewing it once in a while lets you catch errors or fraud and dispute anything that is wrong, an important habit while you build credit.',
    },
  ],
  securedHeading: 'How a secured card helps',
  securedIntro:
    'A secured card is a real credit card backed by a refundable deposit you place up front. It works almost like any other card, reports to the credit bureaus, and is one of the most common ways to build credit from zero. Some issuers accept an ITIN instead of a Social Security number, so it helps to ask before you apply.',
  securedSteps: [
    {
      id: 'deposit',
      title: 'Place a refundable deposit',
      body: 'You put down a deposit, often $200 to $500, and that amount usually becomes your credit limit. The deposit is held safely and refunded when you close or upgrade the account in good standing. It is not a fee.',
    },
    {
      id: 'lowUtilization',
      title: 'Keep your balance low',
      body: 'Because the limit is small, even normal spending can push utilization high. Charging just one small recurring bill, like a phone plan or a streaming service, keeps utilization low and your report healthy.',
    },
    {
      id: 'onTimePayments',
      title: 'Pay on time, every time',
      body: 'Payment history is the biggest part of most scores. Turning on autopay for at least the minimum, and ideally the full balance, helps you never miss a due date and avoid interest.',
    },
    {
      id: 'graduation',
      title: 'Aim to graduate',
      body: 'After about six to twelve months of on-time payments, many issuers will graduate you to a regular unsecured card and return your deposit. Asking your issuer about their graduation path gives you a clear goal.',
    },
  ],
  checklistHeading: 'Your credit-building checklist',
  checklistIntro:
    'Work through these steps at your own pace. Tick off each one as you go. Your progress is saved on this device only.',
  checklistNoScoreNote:
    'None of these steps need you to buy or pull a credit score. They are habits and goals you fully control.',
  checklistItems: [
    {
      id: 'secureCard',
      label: 'Open a starter account',
      detail:
        'Apply for a secured card or ask a trusted family member to add you as an authorized user.',
    },
    {
      id: 'autopay',
      label: 'Turn on autopay',
      detail: 'Set up automatic payments for at least the minimum so a due date is never missed.',
    },
    {
      id: 'smallRecurringCharge',
      label: 'Add one small recurring charge',
      detail: 'Put a single low-cost subscription on the card and pay it off each month.',
    },
    {
      id: 'lowUtilization',
      label: 'Keep utilization low',
      detail: 'Aim to use less than 30% of your limit, and under 10% when you can.',
    },
    {
      id: 'dueDateReminder',
      label: 'Set a due-date reminder',
      detail: 'Add a calendar alert a few days before each payment is due.',
    },
    {
      id: 'limitApplications',
      label: 'Apply for new credit sparingly',
      detail: 'Space out applications so you avoid several hard inquiries close together.',
    },
    {
      id: 'reviewFreeReport',
      label: 'Review your free credit report',
      detail:
        'Check your free reports at AnnualCreditReport.com to catch errors. This is a soft pull and never lowers your score.',
    },
    {
      id: 'paymentBuffer',
      label: 'Build a small payment buffer',
      detail: 'Keep a little cash set aside so on-time payments never depend on payday timing.',
    },
  ],
  checklistProgressTemplate: '{done} of {total} steps done',
  checklistAllDone: 'Great work. You have completed every step. Keep the habits going!',
  checklistDoneBadge: 'Done',
};

const ES_CONTENT: CreditEducationContent = {
  locale: 'es',
  sectionTitle: 'Crear crédito desde cero',
  sectionIntro:
    'Si es nuevo en el crédito, o vuelve a empezar, estas guías en lenguaje sencillo explican cómo funciona el crédito en Estados Unidos y cómo una tarjeta asegurada puede ayudarle a crear historial paso a paso. Nada de esto le pide pagar ni consultar una puntuación de crédito.',
  disclaimer:
    'Esto es educación general, no asesoría financiera, legal ni de reparación de crédito. Las reglas del crédito y las condiciones de las tarjetas cambian, así que confirme siempre los detalles con su banco o cooperativa de crédito.',
  languageToggleLabel: 'Idioma de lectura',
  languageOptionEnglish: 'English',
  languageOptionSpanish: 'Español',
  whyItMattersLabel: 'Por qué importa',
  explainersHeading: 'El crédito, explicado de forma sencilla',
  explainers: [
    {
      id: 'fico',
      title: '¿Qué es una puntuación FICO?',
      body: 'Una puntuación FICO es un número de tres cifras, normalmente entre 300 y 850, que los prestamistas usan para estimar la probabilidad de que devuelva el dinero prestado. Se calcula con su historial de pagos, cuánto usa de su crédito disponible, la antigüedad de su historial, la variedad de cuentas y la frecuencia con que solicita crédito nuevo.',
      whyItMatters:
        'Una puntuación más alta puede facilitar alquilar una vivienda, obtener una tarjeta o un préstamo y pagar menos intereses. Al empezar quizá aún no tenga puntuación: es normal, y los hábitos constantes la van construyendo con el tiempo.',
    },
    {
      id: 'utilization',
      title: '¿Qué es la utilización del crédito?',
      body: 'La utilización es cuánto usa de su límite de crédito. Si el límite de la tarjeta es $500 y el saldo es $50, la utilización es del 10%. Suele calcularse por cada tarjeta y también con todas sus tarjetas juntas.',
      whyItMatters:
        'Una utilización más baja suele ayudar a su puntuación. Muchas personas procuran mantenerla por debajo del 30%, y por debajo del 10% es aún mejor. Pagar el saldo antes de que cierre el estado de cuenta ayuda a que la cifra reportada sea baja.',
    },
    {
      id: 'statementVsDue',
      title: 'Fecha de corte y fecha de vencimiento',
      body: 'La fecha de corte (o cierre) es cuando la tarjeta suma todo lo que gastó ese mes y genera la factura. La fecha de vencimiento, normalmente unas tres semanas después, es el día en que su pago debe llegar para evitar un cargo por atraso e intereses.',
      whyItMatters:
        'El saldo en la fecha de corte suele ser el que se reporta a las agencias de crédito. Pagar antes del corte puede bajar la utilización reportada, mientras que pagar antes del vencimiento mantiene sus pagos al día.',
    },
    {
      id: 'hardInquiries',
      title: '¿Qué es una consulta dura?',
      body: 'Una consulta dura ocurre cuando un prestamista revisa su crédito porque usted solicitó una tarjeta o un préstamo. Una consulta suave, como revisar su propio informe o recibir una oferta precalificada, no afecta su puntuación.',
      whyItMatters:
        'Cada consulta dura puede bajar su puntuación unos pocos puntos por poco tiempo, y varias seguidas pueden parecer arriesgadas a los prestamistas. Solicitar solo cuando lo necesite y espaciar las solicitudes mantiene el efecto pequeño.',
    },
    {
      id: 'creditReports',
      title: '¿Qué es un informe de crédito?',
      body: 'Un informe de crédito es un registro detallado de sus cuentas, saldos e historial de pagos, que guardan tres agencias principales: Equifax, Experian y TransUnion. En EE. UU. puede obtener copias gratuitas de sus informes en AnnualCreditReport.com.',
      whyItMatters:
        'Revisar su propio informe es una consulta suave, así que nunca baja su puntuación. Revisarlo de vez en cuando le permite detectar errores o fraude y disputar lo que esté mal: un hábito importante mientras construye su crédito.',
    },
  ],
  securedHeading: 'Cómo ayuda una tarjeta asegurada',
  securedIntro:
    'Una tarjeta asegurada es una tarjeta de crédito real respaldada por un depósito reembolsable que usted entrega por adelantado. Funciona casi como cualquier otra tarjeta, se reporta a las agencias de crédito y es una de las formas más comunes de crear crédito desde cero. Algunos emisores aceptan un ITIN en lugar de un número de Seguro Social: conviene preguntar antes de solicitarla.',
  securedSteps: [
    {
      id: 'deposit',
      title: 'Entregue un depósito reembolsable',
      body: 'Usted deja un depósito, a menudo de $200 a $500, y esa cantidad suele convertirse en su límite de crédito. El depósito se guarda de forma segura y se reembolsa cuando cierra o mejora la cuenta en buen estado. No es un cargo.',
    },
    {
      id: 'lowUtilization',
      title: 'Mantenga el saldo bajo',
      body: 'Como el límite es pequeño, incluso un gasto normal puede subir mucho la utilización. Cargar solo una factura recurrente pequeña, como el plan del teléfono o un servicio de streaming, mantiene baja la utilización y sano su informe.',
    },
    {
      id: 'onTimePayments',
      title: 'Pague a tiempo, siempre',
      body: 'El historial de pagos es la parte más importante de la mayoría de las puntuaciones. Activar el pago automático por al menos el mínimo, e idealmente el saldo total, le ayuda a no perder ninguna fecha de vencimiento y a evitar intereses.',
    },
    {
      id: 'graduation',
      title: 'Apunte a graduarse',
      body: 'Tras unos seis a doce meses de pagos puntuales, muchos emisores le gradúan a una tarjeta normal sin depósito y le devuelven su depósito. Preguntar a su emisor por su proceso de graduación le da una meta clara.',
    },
  ],
  checklistHeading: 'Su lista para crear crédito',
  checklistIntro:
    'Avance por estos pasos a su propio ritmo. Marque cada uno a medida que avanza: su progreso se guarda solo en este dispositivo.',
  checklistNoScoreNote:
    'Ninguno de estos pasos necesita que compre ni consulte una puntuación de crédito. Son hábitos y metas que usted controla por completo.',
  checklistItems: [
    {
      id: 'secureCard',
      label: 'Abra una cuenta inicial',
      detail:
        'Solicite una tarjeta asegurada o pida a un familiar de confianza que le agregue como usuario autorizado.',
    },
    {
      id: 'autopay',
      label: 'Active el pago automático',
      detail:
        'Configure pagos automáticos por al menos el mínimo para no perder nunca una fecha de vencimiento.',
    },
    {
      id: 'smallRecurringCharge',
      label: 'Agregue un cargo recurrente pequeño',
      detail: 'Ponga una sola suscripción de bajo costo en la tarjeta y páguela cada mes.',
    },
    {
      id: 'lowUtilization',
      label: 'Mantenga baja la utilización',
      detail: 'Procure usar menos del 30% de su límite, y menos del 10% cuando pueda.',
    },
    {
      id: 'dueDateReminder',
      label: 'Ponga un recordatorio de vencimiento',
      detail: 'Agregue una alerta en el calendario unos días antes de cada pago.',
    },
    {
      id: 'limitApplications',
      label: 'Solicite crédito nuevo con moderación',
      detail: 'Espacie las solicitudes para evitar varias consultas duras seguidas.',
    },
    {
      id: 'reviewFreeReport',
      label: 'Revise su informe de crédito gratuito',
      detail:
        'Consulte sus informes gratuitos en AnnualCreditReport.com para detectar errores: es una consulta suave y nunca baja su puntuación.',
    },
    {
      id: 'paymentBuffer',
      label: 'Cree un pequeño colchón de pago',
      detail:
        'Guarde algo de efectivo para que los pagos puntuales nunca dependan del día de cobro.',
    },
  ],
  checklistProgressTemplate: '{done} de {total} pasos completados',
  checklistAllDone: '¡Buen trabajo! Ha completado todos los pasos. ¡Siga con los hábitos!',
  checklistDoneBadge: 'Hecho',
};

const CREDIT_EDUCATION: Readonly<Record<CreditEducationLocale, CreditEducationContent>> = {
  en: EN_CONTENT,
  es: ES_CONTENT,
};

/**
 * Maps any app locale (e.g. `es-ES`, `en-US`) to one of the two supported
 * credit-education languages. Anything that is not Spanish falls back to
 * English so the reader always sees usable copy.
 */
export function resolveCreditEducationLocale(
  locale: string | null | undefined,
): CreditEducationLocale {
  if (locale && locale.toLowerCase().startsWith('es')) {
    return 'es';
  }
  return 'en';
}

/** Returns the full credit-education content for the resolved locale. */
export function getCreditEducation(locale: string | null | undefined): CreditEducationContent {
  return CREDIT_EDUCATION[resolveCreditEducationLocale(locale)];
}

/**
 * Fills `{done}` and `{total}` placeholders in the progress template. Kept here
 * so the progress copy stays fully localized in this module.
 */
export function formatChecklistProgress(
  content: CreditEducationContent,
  done: number,
  total: number,
): string {
  return content.checklistProgressTemplate
    .replace('{done}', String(done))
    .replace('{total}', String(total));
}
