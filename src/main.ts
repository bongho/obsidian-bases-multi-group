import {
	BasesView,
	type BasesEntry,
	type BasesPropertyId,
	Keymap,
	ListValue,
	NullValue,
	Plugin,
	type QueryController,
	type Value,
} from 'obsidian';
import { type GroupKey, inferGroupProperty, splitGroups } from './split';

const VIEW_TYPE = 'multi-group-table';
// Rendering every row re-creates the whole DOM on each data update; at ~18k
// rows that blocked the UI for 1-1.6s per edit. Cap rows per group instead.
const ROWS_PER_PAGE = 50;
const NO_VALUE_ID = '\u0000no-value';
// With many small groups the row cap alone is not enough (1,813 real notes split
// into 317 groups still drew 2,272 rows, ~0.7s per edit). Only draw a group's
// table once it nears the viewport; until then reserve its estimated height.
const ESTIMATED_ROW_PX = 30;
const ESTIMATED_HEAD_PX = 36;
const PREFETCH_MARGIN = '800px 0px';

function scrollParent(el: HTMLElement): HTMLElement | null {
	for (let p = el.parentElement; p; p = p.parentElement) {
		const { overflowY } = getComputedStyle(p);
		if (overflowY === 'auto' || overflowY === 'scroll') return p;
	}
	return null;
}

function isEmpty(value: Value | null | undefined): boolean {
	return value == null || value instanceof NullValue;
}

function toGroupKey(value: Value | null | undefined): GroupKey {
	if (isEmpty(value)) return { kind: 'null' };
	if (value instanceof ListValue) {
		const labels: string[] = [];
		for (let i = 0; i < value.length(); i++) {
			const label = String(value.get(i));
			if (label !== '') labels.push(label);
		}
		return labels.length > 0 ? { kind: 'list', labels } : { kind: 'null' };
	}
	return { kind: 'scalar', label: String(value) };
}

class MultiGroupTableView extends BasesView {
	readonly type = VIEW_TYPE;
	private readonly rootEl: HTMLElement;
	/** Rows revealed per group, kept across data updates so edits do not collapse groups. */
	private readonly shownRows = new Map<string, number>();
	private observer: IntersectionObserver | null = null;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.rootEl = parentEl.createDiv({ cls: 'multi-group-table' });
	}

	onunload(): void {
		this.observer?.disconnect();
		this.observer = null;
	}

	onDataUpdated(): void {
		const source = this.data.groupedData;
		const ranks = new Map<BasesEntry, number>(this.data.data.map((e, i) => [e, i]));
		const groups = splitGroups(
			source.map((g) => ({ key: toGroupKey(g.key), entries: g.entries })),
			(e) => ranks.get(e) ?? Number.MAX_SAFE_INTEGER,
		);

		const candidates = inferGroupProperty(
			this.allProperties,
			source.map((g) => ({ key: g.key, isNull: isEmpty(g.key), entries: g.entries })),
			(entry, prop, key) => {
				const v = entry.getValue(prop);
				return !isEmpty(v) && key != null && (v as Value).looseEquals(key);
			},
		);
		// Only name the property when the inference is unambiguous.
		const groupProp = candidates.length === 1 ? candidates[0] : undefined;
		const columns = this.config.getOrder().filter((p) => p !== 'file.name' && p !== groupProp);

		this.observer?.disconnect();
		this.rootEl.empty();
		const pending = new Map<Element, () => void>();
		const observer = new IntersectionObserver(
			(records) => {
				for (const record of records) {
					if (!record.isIntersecting) continue;
					const draw = pending.get(record.target);
					if (!draw) continue;
					pending.delete(record.target);
					observer.unobserve(record.target);
					draw();
				}
			},
			{ root: scrollParent(this.rootEl), rootMargin: PREFETCH_MARGIN },
		);
		this.observer = observer;

		for (const group of groups) {
			const section = this.rootEl.createDiv({ cls: 'multi-group-table-group' });
			const heading = section.createDiv({ cls: 'multi-group-table-heading' });
			if (groupProp) {
				heading.createSpan({ cls: 'multi-group-table-property', text: `${this.config.getDisplayName(groupProp)}: ` });
			}
			heading.createSpan({ cls: 'multi-group-table-value', text: group.label ?? 'No value' });
			heading.createSpan({ cls: 'multi-group-table-count', text: String(group.entries.length) });

			const groupId = group.label ?? NO_VALUE_ID;
			const body = section.createDiv({ cls: 'multi-group-table-body' });
			const rows = Math.min(group.entries.length, this.shownRows.get(groupId) ?? ROWS_PER_PAGE);
			body.addClass('is-pending');
			body.setCssProps({ '--multi-group-table-reserved': `${ESTIMATED_HEAD_PX + rows * ESTIMATED_ROW_PX}px` });
			pending.set(body, () => {
				body.removeClass('is-pending');
				this.renderTable(body, group.entries, columns, groupId);
			});
			observer.observe(body);
		}
	}

	private renderTable(parent: HTMLElement, entries: BasesEntry[], columns: BasesPropertyId[], groupId: string): void {
		const table = parent.createEl('table');
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: this.config.getDisplayName('file.name') });
		for (const p of columns) head.createEl('th', { text: this.config.getDisplayName(p) });

		const body = table.createEl('tbody');
		let rendered = 0;
		const more = parent.createEl('button', { cls: 'multi-group-table-more' });
		const renderUpTo = (limit: number): void => {
			const end = Math.min(limit, entries.length);
			this.renderRows(body, entries.slice(rendered, end), columns);
			rendered = end;
			const rest = entries.length - rendered;
			more.toggle(rest > 0);
			more.setText(`Show ${Math.min(rest, ROWS_PER_PAGE)} more (${rest} hidden)`);
		};
		more.addEventListener('click', () => {
			const next = rendered + ROWS_PER_PAGE;
			this.shownRows.set(groupId, next);
			renderUpTo(next);
		});
		renderUpTo(this.shownRows.get(groupId) ?? ROWS_PER_PAGE);
	}

	private renderRows(body: HTMLElement, entries: BasesEntry[], columns: BasesPropertyId[]): void {
		for (const entry of entries) {
			const row = body.createEl('tr');
			const link = row.createEl('td').createEl('a', { cls: 'internal-link', text: entry.file.basename });
			link.addEventListener('click', (evt) => {
				evt.preventDefault();
				void this.app.workspace.openLinkText(entry.file.path, '', Keymap.isModEvent(evt));
			});
			for (const p of columns) {
				const cell = row.createEl('td');
				const value = entry.getValue(p);
				if (!isEmpty(value)) (value as Value).renderTo(cell, this.app.renderContext);
			}
		}
	}
}

export default class MultiGroupPlugin extends Plugin {
	onload(): void {
		this.registerBasesView(VIEW_TYPE, {
			name: 'Multi-group table',
			icon: 'layers',
			factory: (controller, parentEl) => new MultiGroupTableView(controller, parentEl),
		});
	}
}
