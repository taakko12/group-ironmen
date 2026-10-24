# dps

DPS engine for the group's own gear. Wraps the [OSRS Wiki calculator](https://github.com/weirdgloop/osrs-dps-calc)'s
combat maths and feeds it the item ids we already store in `members.equipment`,
`members.inventory` and `members.bank`.

## Why this is a separate package

**Licensing.** `osrs-dps-calc` is GPL-3.0 and the rest of this repo is
BSD-2-Clause. Everything GPL stays inside this directory, which is its own
deployable with its own `package.json` and `"license": "GPL-3.0"`. Nothing in
`site/`, `server/` or `bot/` imports from here — they talk to it over HTTP.

**Not reimplementing the maths.** The OSRS combat formulas are a swamp of
special cases (Tombs invocations, Chambers scaling, Vampyres, Obsidian,
Soulreaper stacks, Inquisitor's, demonbane spells) and they change whenever
Jagex patches the game. Writing our own would mean owning that forever, and a
DPS number that is quietly wrong is worse than no number at all.

## What we actually wrote

Almost nothing, deliberately:

- `src/engine.ts` — the seam. Item ids to `EquipmentPiece`, slot filling,
  two-hander/shield resolution, monster lookup, and a `DpsResult`.
- `src/playerDefaults.ts` — the blank `Player` every loadout starts from.

## Vendoring

`npm run vendor` clones upstream at a **pinned commit** and copies `src/lib`,
`src/types`, `src/enums`, `src/utils.ts` and `src/tests` into `vendor/`, plus
`cdn/json/*` into `cdn/json/`. None of it is committed — it is rebuilt from the
pin.

The pin is deliberate. Upstream's main branch moves daily and the formulas
change with game updates; a float shifting under us should be a visible bump
with the validation suite re-run, never a surprise on a Tuesday.

Three substitutions are applied on the way in, documented in
`scripts/vendor.mjs`. They replace imports rather than delete code, so an
upstream refactor cannot silently chop out half a file. A leak check fails the
vendor step if anything still reaches for `next/image`, `@/public/`, `react` or
`mobx`.

`@/state` (upstream's mobx store, the one file that cannot come across) is
redirected to our `src/playerDefaults.ts`.

## Validation

`npm test` runs **our tests and upstream's own suite** against the vendored
copy. Theirs is the oracle: if our vendoring or our `generateEmptyPlayer`
drifts from what their maths expects, their assertions say so.

```
Test Files  29 passed | 1 skipped (30)
     Tests  347 passed | 4 skipped (351)
```

That is the gate for everything built on top. Their suite caught a real bug
during the first run: defaulting `onSlayerTask` to `false` in the shared
baseline broke their slayer-helmet max-hit assertions, so the baseline stays
faithful to upstream and our off-task policy is applied in `buildPlayer`
instead.

## Running a plan

```
npm install
npm run plan -- --find vorkath
npm run plan -- --member "T aak" --targets "Vorkath,Zulrah,General Graardor" --budget 4
npm run plan -- --member "T aak" --targets "Vorkath,Zulrah" --curve
npm run plan -- --member "T aak" --targets "Vorkath,Zulrah" --lock "Crystal body (Ithell)"
```

Needs `BACKEND_URL`, `GROUP_NAME` and `GROUP_TOKEN` — the same values the bot
runs on — in `dps/.env` (gitignored) or the environment. Gear comes from the
live group data, so a plan reflects what that member owns right now.

| Flag | |
|---|---|
| `--find <text>` | Look a monster up. Names must match the wiki's exactly, including the `[version]` where one exists. |
| `--member <name>` | Whose bank to plan from. |
| `--targets <a,b,c>` | The boss list to optimise across, all at once. |
| `--budget <n>` | Inventory slots the gear may take. Default 4. |
| `--curve` | Every budget up to `--budget`, and what each extra slot buys. |
| `--lock <names>` | Slots you have already decided. Never searched, never swapped, never costs a slot. |
| `--weapons <n>` | Candidate weapons per monster. Higher is slower and better. Default 12. |

Two things the output is not:

- **Levels are assumed maxed.** Real levels are in `members.skills` and are not
  wired in yet, so these numbers flatter anyone who is not maxed.
- **Mechanics are not modelled.** It will suggest a halberd at Zulrah because
  reach gives it nonzero DPS. Whether a fight is actually playable that way is
  a judgement this does not make, and the same applies to raid phases.
