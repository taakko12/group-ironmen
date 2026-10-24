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
