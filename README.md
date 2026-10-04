# Bases Multi-Group

A [Bases](https://obsidian.md/help/bases) table view that lists a note under **every** value of a grouped list property.

Core Bases groups a list property by the whole list, so a note with `category: [main, side]` lands in one combined group called "main, side". With this view it appears under **main** and again under **side**. This is the behaviour asked for in the forum thread [Make a note fall into multiple groups](https://forum.obsidian.md/t/bases-group-by-sorting-improvement-make-a-note-fall-into-multiple-groups/107097).

## Usage

1. Open a base and add a view of type **Multi-group table**.
2. Set **Group by** as usual. There are no extra options: the view reads the grouping you already configured.

Groupings that are not lists render exactly as core does, in the same order.

## Designed to be retired

The view keeps no settings of its own. If core Bases adds this behaviour, switch the view type back to **Table** and nothing else needs migrating.

## Behaviour and limits

- Group order follows the direction you chose in Group by. The direction is inferred from the order core returns, because the plugin API does not expose the group-by setting.
- Rows inside each group keep your sort order.
- The "No value" group is always last.
- The property name is shown in group headings only when it can be identified unambiguously. If two properties hold identical values, only the value is shown.
- Each group shows its first 50 rows. Use **Show more** to reveal the next 50. Expanded groups stay expanded when the data updates.
- Group tables are rendered only when they scroll near the viewport, so bases with hundreds of groups stay responsive.
- Not yet supported: inline editing, kanban or cards layouts, nested groups, collapsing groups.
- Desktop only for now; it has not been tested on mobile.

Tested on Obsidian 1.13.7 and 1.14.3.

## Development

```bash
npm ci
npm test
npm run build
```

Releases are built and attested by the `Release` workflow when a tag matching the manifest version is pushed. If you regenerate `package-lock.json`, do it from a directory without `node_modules` (npm 11 or later) so bindings for every platform are kept.

## License

[MIT](LICENSE)
