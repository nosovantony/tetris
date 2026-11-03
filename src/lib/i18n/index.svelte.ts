import { TRANSLATIONS, type Language } from './translations.js';
import { DEFAULT_SETTINGS } from '../settings/types.js';

export { type Language, TRANSLATIONS };

class I18nManager {
	current = $state<Language>('ru');

	constructor() {
		if (typeof window !== 'undefined') {
			try {
				const savedSettings = localStorage.getItem('tetris:settings:v1');
				if (savedSettings) {
					const parsed = JSON.parse(savedSettings);
					if (parsed.language === 'en' || parsed.language === 'ru') {
						this.current = parsed.language;
						return;
					}
				}
				const savedLang = localStorage.getItem('tetris:lang');
				if (savedLang === 'en' || savedLang === 'ru') {
					this.current = savedLang;
				}
			} catch {
				// ignore
			}
		}
	}

	setLanguage(lang: Language) {
		this.current = lang;
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem('tetris:lang', lang);
				const savedSettings = localStorage.getItem('tetris:settings:v1');
				const parsed = savedSettings ? JSON.parse(savedSettings) : { ...DEFAULT_SETTINGS };
				parsed.language = lang;
				localStorage.setItem('tetris:settings:v1', JSON.stringify(parsed));
			} catch {
				// ignore
			}
		}
	}

	get t() {
		return TRANSLATIONS[this.current];
	}
}

export const i18n = new I18nManager();
