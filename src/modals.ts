import { Modal, Setting } from 'obsidian';
import { KanbanBoard, KanbanLane, KanbanItem } from './types';
import { t } from './lang';

export class WipLimitModal extends Modal {
	private lane: KanbanLane;
	private onSubmit: (limit: number) => void;
	constructor(app: import('obsidian').App, lane: KanbanLane, onSubmit: (limit: number) => void) {
		super(app); this.lane = lane; this.onSubmit = onSubmit;
	}
	onOpen(): void {
		const { contentEl } = this; contentEl.empty();
		contentEl.createEl('h3', { text: t('modal.wip-limit-title') });
		new Setting(contentEl).setName(t('modal.wip-limit-name')).setDesc(t('modal.wip-limit-desc'))
			.addText((text) => { text.setValue(String(this.lane.wipLimit || '')); text.inputEl.type = 'number'; text.inputEl.min = '0'; text.inputEl.setAttribute('aria-label', t('modal.wip-limit-label'));
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') this.submit(text.getValue()); }); });
		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText(t('modal.save')).setCta().onClick(() => { const inp = contentEl.querySelector('input') as HTMLInputElement; this.submit(inp?.value || '0'); }))
			.addButton((btn) => btn.setButtonText(t('modal.cancel')).onClick(() => this.close()));
	}
	private submit(value: string): void { this.onSubmit(parseInt(value, 10) || 0); this.close(); }
	onClose(): void { this.contentEl.empty(); }
}

export class ConfirmDeleteModal extends Modal {
	private message: string;
	private onConfirm: () => void;
	private heading: string;
	private confirmText: string;
	constructor(app: import('obsidian').App, nameOrTitle: string, cardCount: number, onConfirm: () => void, heading?: string, confirmText?: string) {
		super(app);
		this.message = cardCount > 0
			? t('lane.delete-confirm', { count: cardCount })
			: `"${nameOrTitle}" — ${heading || t('modal.delete')}?`;
		this.onConfirm = onConfirm;
		this.heading = heading || t('modal.delete-lane-title');
		this.confirmText = confirmText || t('modal.delete');
	}
	onOpen(): void {
		const { contentEl } = this; contentEl.empty();
		contentEl.createEl('h3', { text: this.heading });
		contentEl.createEl('p', { text: this.message });
		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText(this.confirmText).setWarning().onClick(() => { this.onConfirm(); this.close(); }))
			.addButton((btn) => btn.setButtonText(t('modal.cancel')).onClick(() => this.close()));
	}
	onClose(): void { this.contentEl.empty(); }
}

/**
 * Modal for editing a card's title, tags, due date, and body via GUI.
 */
export class CardEditorModal extends Modal {
	private item: KanbanItem;
	private onSave: (item: KanbanItem) => void;

	constructor(app: import('obsidian').App, item: KanbanItem, onSave: (item: KanbanItem) => void) {
		super(app);
		this.item = item;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('kanban-matsuo-card-editor');

		contentEl.createEl('h3', { text: t('card-editor.title') });

		// Title
		let titleValue = this.item.title
			.replace(/#[^\s#]+/g, '')
			.replace(/@\{[^}]*\}/g, '')
			.trim();
		const titleSetting = new Setting(contentEl)
			.setName(t('card-editor.card-title'));
		const titleInput = titleSetting.controlEl.createEl('textarea', {
			cls: 'kanban-matsuo-editor-textarea',
			attr: {
				placeholder: t('card-editor.card-title-placeholder'),
				rows: '2',
				'aria-label': t('card-editor.card-title'),
			},
		});
		titleInput.value = titleValue;

		// Tags
		const tagsSetting = new Setting(contentEl)
			.setName(t('card-editor.tags'))
			.setDesc(t('card-editor.tags-desc'));
		const tagsInput = tagsSetting.controlEl.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: {
				type: 'text',
				placeholder: t('card-editor.tags-placeholder'),
				'aria-label': t('card-editor.tags'),
			},
		});
		(tagsInput as HTMLInputElement).value = this.item.tags.join(', ');

		// Start date
		const startSetting = new Setting(contentEl)
			.setName(t('card-editor.start-date'));
		const startInput = startSetting.controlEl.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: { type: 'date', 'aria-label': t('card-editor.start-date') },
		});
		(startInput as HTMLInputElement).value = this.item.startDate || '';

		// End date
		const endSetting = new Setting(contentEl)
			.setName(t('card-editor.end-date'));
		const endInput = endSetting.controlEl.createEl('input', {
			cls: 'kanban-matsuo-editor-input',
			attr: { type: 'date', 'aria-label': t('card-editor.end-date') },
		});
		(endInput as HTMLInputElement).value = this.item.endDate || '';

		// Body / description
		const bodySetting = new Setting(contentEl)
			.setName(t('card-editor.body'));
		const bodyInput = bodySetting.controlEl.createEl('textarea', {
			cls: 'kanban-matsuo-editor-textarea',
			attr: {
				placeholder: t('card-editor.body-placeholder'),
				rows: '4',
				'aria-label': t('card-editor.body'),
			},
		});
		bodyInput.value = this.item.body || '';


		// Buttons
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText(t('modal.save')).setCta().onClick(() => {
					this.saveAndClose(titleInput, tagsInput as HTMLInputElement, startInput as HTMLInputElement, endInput as HTMLInputElement, bodyInput);
				});
			})
			.addButton((btn) => {
				btn.setButtonText(t('modal.cancel')).onClick(() => this.close());
			});

		// Focus title on open
		titleInput.focus();
	}

	private saveAndClose(
		titleEl: HTMLTextAreaElement,
		tagsEl: HTMLInputElement,
		startEl: HTMLInputElement,
		endEl: HTMLInputElement,
		bodyEl: HTMLTextAreaElement,
	): void {
		const title = titleEl.value.trim();
		if (!title) return;

		const tags = tagsEl.value
			.split(',')
			.map((s) => s.trim().replace(/^#/, ''))
			.filter((s) => s.length > 0);
		const startDate = startEl.value || null;
		const endDate = endEl.value || null;

		let fullTitle = title;
		if (tags.length > 0) {
			fullTitle += ' ' + tags.map((tag) => `#${tag}`).join(' ');
		}
		if (startDate && endDate) {
			fullTitle += ` @{${startDate}~${endDate}}`;
		} else if (endDate) {
			fullTitle += ` @{${endDate}}`;
		} else if (startDate) {
			fullTitle += ` @{${startDate}~}`;
		}

		this.item.title = fullTitle;
		this.item.tags = tags;
		this.item.startDate = startDate;
		this.item.endDate = endDate;
		this.item.body = bodyEl.value.trim();

		this.onSave(this.item);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Modal showing archived cards with restore/delete options.
 */
export class ArchiveModal extends Modal {
	private board: KanbanBoard;
	private onUpdate: (board: KanbanBoard) => void;

	constructor(app: import('obsidian').App, board: KanbanBoard, onUpdate: (board: KanbanBoard) => void) {
		super(app);
		this.board = board;
		this.onUpdate = onUpdate;
	}

	onOpen(): void {
		this.renderContent();
	}

	private renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('kanban-matsuo-archive-modal');

		contentEl.createEl('h3', { text: t('archive.title') });

		// Collect all archived items with their lane info
		const archived: { item: KanbanItem; lane: KanbanLane; parentList: KanbanItem[] }[] = [];
		const collectArchived = (items: KanbanItem[], lane: KanbanLane) => {
			for (const item of items) {
				if (item.archived) archived.push({ item, lane, parentList: items });
				collectArchived(item.children, lane);
			}
		};
		for (const lane of this.board.lanes) {
			collectArchived(lane.items, lane);
		}

		if (archived.length === 0) {
			contentEl.createEl('p', { text: t('archive.empty'), cls: 'kanban-matsuo-archive-empty' });
			return;
		}

		const list = contentEl.createDiv({ cls: 'kanban-matsuo-archive-list' });

		for (const { item, lane, parentList } of archived) {
			const row = list.createDiv({ cls: 'kanban-matsuo-archive-row' });

			// Card info
			const info = row.createDiv({ cls: 'kanban-matsuo-archive-info' });
			const title = item.title.replace(/#[^\s#]+/g, '').replace(/@\{[^}]*\}/g, '').trim();
			info.createSpan({ cls: 'kanban-matsuo-archive-title', text: title });
			info.createSpan({ cls: 'kanban-matsuo-archive-lane', text: lane.title });

			// Tags
			if (item.tags.length > 0) {
				const tagsEl = info.createSpan({ cls: 'kanban-matsuo-archive-tags' });
				tagsEl.setText(item.tags.map((tag) => `#${tag}`).join(' '));
			}

			// Buttons
			const actions = row.createDiv({ cls: 'kanban-matsuo-archive-actions' });

			// Restore button
			const restoreBtn = actions.createEl('button', {
				cls: 'kanban-matsuo-archive-restore-btn',
				text: t('archive.restore'),
			});
			restoreBtn.addEventListener('click', () => {
				item.archived = false;
				this.onUpdate(this.board);
				this.renderContent();
			});

			// Delete permanently
			const deleteBtn = actions.createEl('button', {
				cls: 'kanban-matsuo-archive-delete-btn',
				text: t('archive.delete-permanent'),
			});
			deleteBtn.addEventListener('click', () => {
				const idx = parentList.indexOf(item);
				if (idx >= 0) parentList.splice(idx, 1);
				this.onUpdate(this.board);
				this.renderContent();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
