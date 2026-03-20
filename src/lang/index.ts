import { en, type TranslationKey } from './en';
import { ja } from './ja';

export type SupportedLocale = 'en' | 'ja' | 'auto';

const translations: Record<string, Record<TranslationKey, string>> = {
	en,
	ja,
};

let currentLocale: SupportedLocale = 'auto';

/**
 * Set the active locale.
 */
export function setLocale(locale: SupportedLocale): void {
	currentLocale = locale;
}

/**
 * Get the resolved locale (resolves 'auto' to Obsidian's language).
 */
function getResolvedLocale(): string {
	if (currentLocale === 'auto') {
		// Use Obsidian's locale setting (document.documentElement.lang or navigator.language)
		const obsidianLang = document.documentElement.lang || navigator.language || 'en';
		return obsidianLang.split('-')[0];
	}
	return currentLocale;
}

/**
 * Get a translated string by key, with optional interpolation.
 *
 * Usage:
 *   t('lane.delete-confirm', { count: 5 })
 *   → "このレーンには 5 枚のカードがあります。削除しますか？"
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
	const locale = getResolvedLocale();
	const dict = translations[locale] || translations['en'];
	let text = dict[key] || en[key] || key;

	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
		}
	}

	return text;
}

export type { TranslationKey };
