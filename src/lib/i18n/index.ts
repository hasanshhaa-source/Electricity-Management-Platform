import { en } from './en';
import { ar } from './ar';

export type Locale = 'en' | 'ar';

export const locales = { en, ar } as const;

/**
 * Returns the translation dictionary for a given locale.
 * Falls back to English for any missing keys.
 */
export function getT(locale: Locale = 'en') {
  return locale === 'ar' ? ar : en;
}

/**
 * Server-side locale resolution from system settings.
 * Import and call this in server components that need translations.
 */
export async function getServerLocale(): Promise<Locale> {
  try {
    const { getSystemSettings } = await import('@/services/settings/systemSettingsService');
    const settings = await getSystemSettings();
    return (settings.default_language as Locale) ?? 'en';
  } catch {
    return 'en';
  }
}

export { en, ar };
