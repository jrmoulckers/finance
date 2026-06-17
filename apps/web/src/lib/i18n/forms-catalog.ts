// SPDX-License-Identifier: BUSL-1.1

import { translate } from '../i18n';

export type ToastMessageType = 'success' | 'error' | 'warning' | 'info';

export const FORM_COPY_IDS = {
  errorSummaryTitle: 'forms.errorSummary.title',
  validationErrorCount: 'forms.validation.errorCount',
  accountCreateTitle: 'forms.account.title.create',
  accountEditTitle: 'forms.account.title.edit',
  accountNameLabel: 'forms.account.name.label',
  accountNameRequired: 'forms.account.name.required',
  accountInitialBalanceLabel: 'forms.account.initialBalance.label',
  accountInitialBalanceInvalid: 'forms.account.initialBalance.invalid',
  accountNoHousehold: 'forms.account.noHousehold',
  accountCreateFailed: 'forms.account.createFailed',
  accountUpdateFailed: 'forms.account.updateFailed',
  accountCancel: 'forms.account.action.cancel',
  accountCreate: 'forms.account.action.create',
  accountUpdate: 'forms.account.action.update',
  accountCreating: 'forms.account.action.creating',
  accountUpdating: 'forms.account.action.updating',
  toastSuccess: 'toast.type.success',
  toastError: 'toast.type.error',
  toastWarning: 'toast.type.warning',
  toastInfo: 'toast.type.info',
  toastDismiss: 'toast.dismiss',
  toastAria: 'toast.aria',
} as const;

export type FormCopyKey = keyof typeof FORM_COPY_IDS;
export type FormTranslator = (
  id: string,
  values?: Record<string, string | number>,
  locale?: string,
) => { text: string; translated: boolean };

const TOAST_TYPE_KEYS: Readonly<Record<ToastMessageType, FormCopyKey>> = {
  success: 'toastSuccess',
  error: 'toastError',
  warning: 'toastWarning',
  info: 'toastInfo',
};

export function getFormCopy(
  key: FormCopyKey,
  locale?: string,
  values: Record<string, string | number> = {},
  translator: FormTranslator = translate,
): string {
  return translator(FORM_COPY_IDS[key], values, locale).text;
}

export function getToastTypeLabel(type: ToastMessageType, locale?: string): string {
  return getFormCopy(TOAST_TYPE_KEYS[type], locale);
}

export function getToastDismissLabel(locale?: string): string {
  return getFormCopy('toastDismiss', locale);
}

export function getToastAriaLabel(type: ToastMessageType, message: string, locale?: string): string {
  return getFormCopy('toastAria', locale, { type: getToastTypeLabel(type, locale), message });
}
