/**
 * Pure grouping logic, kept free of Obsidian imports so it can be unit tested.
 *
 * Core Bases groups a list property by the whole list ("main, side" is one
 * group). This module redistributes entries so a note appears under every
 * element of its list, while leaving non-list groupings untouched.
 */

export type GroupKey =
	| { kind: 'null' }
	| { kind: 'scalar'; label: string }
	| { kind: 'list'; labels: string[] };

export interface SourceGroup<E> {
	key: GroupKey;
	entries: E[];
}

export interface SplitGroup<E> {
	/** null means "no value", always rendered last. */
	label: string | null;
	entries: E[];
}

export type Direction = 'asc' | 'desc';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function firstLabel(key: GroupKey): string | null {
	if (key.kind === 'scalar') return key.label;
	if (key.kind === 'list') return key.labels[0] ?? null;
	return null;
}

/**
 * The view config does not expose the groupBy direction, so infer it from the
 * order core already applied: compare the first and last non-null groups.
 * With fewer than two non-null groups the order cannot matter, so default asc.
 */
export function inferDirection(groups: SourceGroup<unknown>[]): Direction {
	const labels = groups.map((g) => firstLabel(g.key)).filter((l): l is string => l !== null);
	if (labels.length < 2) return 'asc';
	return collator.compare(labels[0] as string, labels[labels.length - 1] as string) > 0 ? 'desc' : 'asc';
}

/**
 * @param rank position of an entry in the flat, user-sorted result; used to keep
 *   the user's sort inside each split group.
 */
export function splitGroups<E>(groups: SourceGroup<E>[], rank: (entry: E) => number): SplitGroup<E>[] {
	const hasList = groups.some((g) => g.key.kind === 'list');
	if (!hasList) {
		// Nothing to split: mirror core exactly, including its ordering.
		return groups.map((g) => ({ label: firstLabel(g.key), entries: [...g.entries] }));
	}

	const buckets = new Map<string, E[]>();
	const noValue: E[] = [];
	const add = (label: string, entry: E): void => {
		const bucket = buckets.get(label) ?? [];
		if (!bucket.includes(entry)) bucket.push(entry);
		buckets.set(label, bucket);
	};

	for (const group of groups) {
		const { key } = group;
		for (const entry of group.entries) {
			if (key.kind === 'null') {
				noValue.push(entry);
			} else if (key.kind === 'scalar') {
				add(key.label, entry);
			} else {
				for (const label of key.labels) add(label, entry);
			}
		}
	}

	const sign = inferDirection(groups) === 'desc' ? -1 : 1;
	const byRank = (a: E, b: E): number => rank(a) - rank(b);
	const result: SplitGroup<E>[] = [...buckets.entries()]
		.sort(([a], [b]) => sign * collator.compare(a, b))
		.map(([label, entries]) => ({ label, entries: entries.sort(byRank) }));
	if (noValue.length > 0) result.push({ label: null, entries: noValue.sort(byRank) });
	return result;
}

/**
 * The groupBy property id is not readable from the view config either. Return
 * every property whose value equals the group key for all entries of all
 * non-null groups. More than one candidate means the label is ambiguous.
 */
export function inferGroupProperty<P, E, K>(
	properties: P[],
	groups: { key: K; isNull: boolean; entries: E[] }[],
	matches: (entry: E, property: P, key: K) => boolean,
): P[] {
	const keyed = groups.filter((g) => !g.isNull);
	if (keyed.length === 0) return [];
	return properties.filter((p) => keyed.every((g) => g.entries.every((e) => matches(e, p, g.key))));
}
