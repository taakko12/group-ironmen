# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fork of [christoabrown/group-ironmen](https://github.com/christoabrown/group-ironmen) (a RuneLite plugin's web frontend + backend) that has diverged substantially. The fork adds banked XP, boss tracking, bank pings, gear goals, a Discord bot, and a DPS planner.

Four independently deployed pieces:

| Dir | Stack | Deployed to |
|---|---|---|
| `site/` | Vanilla web components, esbuild | Vercel |
| `server/` | Rust (actix-web) + Postgres | Railway |
| `bot/` | Node, discord.js | Railway |
| `dps/` | TypeScript, Node | Railway |

The README is upstream's and documents self-hosting via docker-compose. **That path is vestigial here** — nothing deploys that way.

## Commands

```bash
# site/
npm test                              # vitest, jsdom
npm test -- test/items-page.test.js   # single file
npm run bundle                        # production build into public/
npm run lint && npm run format        # eslint + prettier
npm start                             # watch + local server against groupiron.men

# dps/
npm test                              # vendors upstream, then runs OUR tests AND THEIRS
npx vitest run test/engine.test.ts    # single file (vendor at least once first)
npm run plan -- --find vorkath        # look up a monster
npm run plan -- --member "T aak" --targets "Vorkath,Zulrah" --budget 4

# server/
cargo check                           # needs MSVC build tools on Windows
./build.sh                            # release build

# bot/
npm start
npm run deploy-commands               # re-register slash commands with Discord
```

A husky pre-commit hook runs `format:check && lint` — but **only over `site/src`**. `bot/`, `dps/` and `server/` are not covered, so run their checks yourself.

## Architecture notes that aren't obvious from one file

### site: components are assembled at build time

`build.js` reads `components.json` (a flat list of custom-element names) and, for each, inlines `foo.html` into the `{{foo.html}}` placeholder in `foo.js`, then inlines all CSS into `{{style}}` and the bundle into `{{js}}` in `index.html`.

Consequences:

- A new page needs **four** edits: the component dir, `components.json`, an `<app-route>` in `index.html`, and an import in `index.js`.
- **Components cannot be mounted in tests.** `render()` would emit the literal `{{foo.html}}`. Every test here exercises static methods and pure functions instead — follow that pattern rather than fighting it.
- `vercel.json` rewrites the `"/api"` string in `src/data/api.js` to `$BACKEND_URL/api` at build time via `sed`. Hardcoded service URLs elsewhere in `api.js` are *not* rewritten.

### site: bank data is deliberately not always present

`/live` only pushes full bank contents while the Items page is open (`heavyDataEnabled`). This was an egress-cost fix. Anything needing group-wide bank contents should compute server-side or go through a service, not subscribe to heavy data.

### server: migrations live in code

`db.rs`'s `update_schema` runs idempotent migrations guarded by `has_migration_run(...)` against a `migrations` table. Add a new block; don't edit old ones.

### dps: GPL is quarantined here

`dps/` vendors the [OSRS Wiki DPS calculator](https://github.com/weirdgloop/osrs-dps-calc) (GPL-3.0) while the rest of the repo is BSD-2-Clause. It is its own deployable with its own `license` field, and **nothing in `site/`, `server/` or `bot/` imports it** — they talk to it over HTTP.

`scripts/vendor.mjs` clones upstream at a **pinned commit** and rewrites framework imports (`next/image`, `@/public/*.png`) into local stubs. Nothing vendored is committed; it is rebuilt from the pin. A leak check fails the build if `react`, `mobx`, `next/image` or `@/public` survive.

`npm test` runs **upstream's own ~560 test cases** against the vendored copy, with their `@/state` redirected to our `src/playerDefaults.ts`. That suite is the gate: when bumping the pin, a failure there means our player construction drifted from what their maths expects. It has caught real breakage twice.

### bot: a Discord client with a small HTTP surface

`httpServer.js` exposes `/health` (public), `/status` and `/log` (group token) so the site's Jumane page can read bot health and command history. Persistent state — custom commands, quotes, reminders, command log, watchdog state — lives in JSON on a **mounted Railway volume** at `/data`. Without `COMMANDS_FILE` set, that state is lost on every deploy.

`watchdog.js` polls the backend, the dps service, every configured Groq model id, and each member whose tracker is live but whose Dink has gone silent. It **only posts on a change of state** — never "all fine" — because a watchdog that reports healthy on a schedule gets muted.

### Upstream sync

`.github/workflows/upstream-check.yml` runs Thursdays, pulls upstream's weekly game-cache dumps into a PR, and gates them on `site/test/cache-data.test.js`. `.github/upstream-sync.json` holds `data_synced_from` plus a `ported` map of upstream commits already dealt with — their patch-ids diverged from ours, so `merge-base` reports them as missing forever without it. Hand-edit `ported` when you decide about a commit.

Cache data is deliberately partial: `map_icons.json`, `map.json` and `map_links.json` are **not** synced because this fork carries local changes in them.

## Traps that have cost real time

- **Item names are not unique.** Placeholders, ornament kits and charged variants repeat them. `itemData.js` distinguishes the canonical id (lowest, correct for prices) from *all* ids sharing a name (correct for "who owns one"). Matching on a single id silently misses gear people own.
- **Railway services created with `railway up` are not GitHub-connected** and will not auto-deploy on push. This silently stranded a backend change for six weeks. Verify after any new service.
- **Railway's uploader drops `package-lock.json`** from the build context even when git tracks it, so `dps/Dockerfile` uses `npm install`, not `npm ci`.
- **Groq retires models on a schedule.** Every model id the bot used was decommissioned at once and it answered nothing for two months. The watchdog now checks this; the models are configurable via env.
- `members.*` item columns are flat `[id, qty, id, qty, ...]` arrays — ids sit on odd `ORDINALITY`/`generate_subscripts` indices in SQL.
- ESLint here rejects numeric separators (`1_000_000`) in `site/src`.
