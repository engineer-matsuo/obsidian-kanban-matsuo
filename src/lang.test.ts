import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale } from './lang';
import { en } from './lang/en';
import { ja } from './lang/ja';

describe('i18n translation system', () => {
	beforeEach(() => {
		setLocale('en');
	});

	describe('setLocale / t()', () => {
		it('returns English text when locale is en', () => {
			setLocale('en');
			expect(t('board.kanban-board')).toBe('Kanban board');
			expect(t('card.add')).toBe('Add a card...');
		});

		it('returns Japanese text when locale is ja', () => {
			setLocale('ja');
			expect(t('board.kanban-board')).toBe('カンバンボード');
			expect(t('card.add')).toBe('カードを追加...');
		});

		it('falls back to English for unknown locale', () => {
			setLocale('fr' as 'en');
			expect(t('board.kanban-board')).toBe('Kanban board');
		});
	});

	describe('template interpolation', () => {
		it('replaces {{var}} placeholders', () => {
			setLocale('en');
			expect(t('card.add-to', { lane: 'To Do' })).toBe('Add card to To Do');
			expect(t('card.move-to', { lane: 'Done' })).toBe('Move to "Done"');
		});

		it('replaces numeric placeholders', () => {
			setLocale('en');
			expect(t('lane.delete-confirm', { count: 5 })).toBe('This lane has 5 card(s). Delete anyway?');
		});

		it('works with Japanese locale', () => {
			setLocale('ja');
			expect(t('card.add-to', { lane: 'やること' })).toBe('やること にカードを追加');
			expect(t('lane.delete-confirm', { count: 3 })).toBe('このレーンには 3 枚のカードがあります。削除しますか？');
		});
	});

	describe('translation completeness', () => {
		it('ja.ts has all keys from en.ts', () => {
			const enKeys = Object.keys(en);
			const jaKeys = Object.keys(ja);
			for (const key of enKeys) {
				expect(jaKeys).toContain(key);
			}
		});

		it('en and ja have the same number of keys', () => {
			expect(Object.keys(en).length).toBe(Object.keys(ja).length);
		});

		it('no empty translations in en', () => {
			for (const [key, value] of Object.entries(en)) {
				expect(value.length, `en key "${key}" is empty`).toBeGreaterThan(0);
			}
		});

		it('no empty translations in ja', () => {
			for (const [key, value] of Object.entries(ja)) {
				expect(value.length, `ja key "${key}" is empty`).toBeGreaterThan(0);
			}
		});
	});

	describe('new feature translation keys', () => {
		it('has filter keys', () => {
			setLocale('en');
			expect(t('filter.by-tag')).toBe('Filter by tag');
			expect(t('filter.overdue')).toBe('Overdue');
			expect(t('filter.this-week')).toBe('This week');
		});

		it('has card editor keys', () => {
			setLocale('ja');
			expect(t('card-editor.title')).toBe('カードを編集');
			expect(t('card-editor.tags')).toBe('タグ');
			expect(t('card-editor.due-date')).toBe('期日');
		});

		it('has timezone keys', () => {
			setLocale('en');
			expect(t('settings.timezone')).toBe('Timezone for dates');
			setLocale('ja');
			expect(t('settings.timezone')).toBe('日付のタイムゾーン');
		});
	});
});
