import { describe, expect, it } from 'vitest';
import { inferDirection, inferGroupProperty, splitGroups, type SourceGroup } from './split';

// Mirrors the CDP fixture: a [main, side], b [main], c [side, dessert], d none.
const order = ['a', 'b', 'c', 'd'];
const rank = (e: string): number => order.indexOf(e);
const list = (...labels: string[]) => ({ kind: 'list' as const, labels });

const ascGroups: SourceGroup<string>[] = [
	{ key: list('main'), entries: ['b'] },
	{ key: list('main', 'side'), entries: ['a'] },
	{ key: list('side', 'dessert'), entries: ['c'] },
	{ key: { kind: 'null' }, entries: ['d'] },
];

describe('splitGroups', () => {
	it('puts a note under every element of its list, no-value group last', () => {
		expect(splitGroups(ascGroups, rank)).toEqual([
			{ label: 'dessert', entries: ['c'] },
			{ label: 'main', entries: ['a', 'b'] },
			{ label: 'side', entries: ['a', 'c'] },
			{ label: null, entries: ['d'] },
		]);
	});

	it('keeps descending order when core sorted descending', () => {
		const desc = [ascGroups[2], ascGroups[1], ascGroups[0], ascGroups[3]] as SourceGroup<string>[];
		expect(splitGroups(desc, rank).map((g) => g.label)).toEqual(['side', 'main', 'dessert', null]);
	});

	it('mirrors core untouched when no group key is a list', () => {
		const scalars: SourceGroup<string>[] = [
			{ key: { kind: 'scalar', label: 'todo' }, entries: ['b', 'a'] },
			{ key: { kind: 'scalar', label: 'done' }, entries: ['c'] },
		];
		expect(splitGroups(scalars, rank)).toEqual([
			{ label: 'todo', entries: ['b', 'a'] },
			{ label: 'done', entries: ['c'] },
		]);
	});

	it('lists a note once per group even if its list repeats a value', () => {
		const groups: SourceGroup<string>[] = [{ key: list('main', 'main'), entries: ['a'] }];
		expect(splitGroups(groups, rank)).toEqual([{ label: 'main', entries: ['a'] }]);
	});
});

describe('inferDirection', () => {
	it('defaults to asc with fewer than two keyed groups', () => {
		expect(inferDirection([{ key: list('main'), entries: [] }])).toBe('asc');
	});

	it('compares numbers numerically', () => {
		const groups = [
			{ key: { kind: 'scalar' as const, label: '10' }, entries: [] },
			{ key: { kind: 'scalar' as const, label: '9' }, entries: [] },
		];
		expect(inferDirection(groups)).toBe('desc');
	});
});

describe('inferGroupProperty', () => {
	const values: Record<string, Record<string, string>> = {
		a: { category: 'x', status: 'todo' },
		b: { category: 'y', status: 'todo' },
	};
	const matches = (e: string, p: string, key: string) => values[e]?.[p] === key;

	it('finds the single property that produced the groups', () => {
		const groups = [
			{ key: 'x', isNull: false, entries: ['a'] },
			{ key: 'y', isNull: false, entries: ['b'] },
		];
		expect(inferGroupProperty(['category', 'status'], groups, matches)).toEqual(['category']);
	});

	it('returns nothing when only the no-value group exists', () => {
		expect(inferGroupProperty(['category'], [{ key: '', isNull: true, entries: ['a'] }], matches)).toEqual([]);
	});
});
