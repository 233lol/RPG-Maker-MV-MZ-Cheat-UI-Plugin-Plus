# AGENTS.md

## Build

```shell
pnpm i && make           # build both MV & MZ with the Vue production build
make mv                  # build only MV
make mz                  # build only MZ
make dev                 # build both with the Vue dev build (warnings + Devtools)
make prod                # switch back to the Vue production build and rebuild
make check               # lint + format check + unit tests + typecheck (no game required)
```

Output: `mv-<hash>.zip` and/or `mz-<hash>.zip`. Packing is done by `node tools/pack.mjs <mv|mz> <output.zip>` (fflate); MV archives are prefixed with `www/` (MV game root), MZ archives are not.

The Makefile is cross-platform: it only invokes `node` / `pnpm` / `git` — the former POSIX-only operations (`find` / `printf` / `ln -s` / `rm`) live in `tools/gen-version.mjs`, `tools/link-latest.mjs`, `tools/clean.mjs` and a pure-make recursive wildcard (`rwildcard`). It runs under cmd.exe and POSIX shells alike; only `make`, `node`, `pnpm`, `git` must be on PATH.

Vendor scripts (all available via `pnpm run vendor:*`):

| Command | Output |
|---|---|
| `vendor:shiki` | `cheat-engine/www/cheat/libs/shiki.bundle.mjs` (minified production bundle) |
| `vendor:shiki:dev` | same file but unminified with inline sourcemap (for debugging) |
| `vendor:vuetify` | `cheat-engine/www/cheat/libs/vuetify.js` (minified production bundle) |
| `vendor:vuetify:dev` | same file but unminified (readable Vuetify stack traces, for debugging) |
| `vendor:vue` | `cheat-engine/www/cheat/libs/vue.js` (production build `vue.esm-browser.prod.js`) |
| `vendor:vue:dev` | same file but development build `vue.esm-browser.js` (warnings + Vue Devtools, for debugging) |
| `vendor:assets` | `css/vuetify.css`, `css/materialdesignicons.css`, `fonts/*` (copied from npm packages; prod = minified `*.min.css` + no sourceMappingURL, `vendor:assets:dev` = unminified) |
| `vendor:libs` | combo script: runs `vendor:vuetify` + `vendor:vue` + `vendor:assets` (does **not** include shiki) |

`vendor:shiki` is auto-triggered by Makefile dependency. `make vendor` runs all four.


## Test

```shell
pnpm test           # headless MV + MZ + packaging
pnpm test:mv        # MV only
pnpm test:mz        # MZ only
pnpm test:unit      # node --test pure-logic unit tests (no game / nwjs required)
pnpm test:coverage  # coverage report (Node.js >= 22.8)
pnpm test:coverage:check # coverage thresholds used by CI
pnpm test:packaging # archive structure test (run `make` first for vendor files)
pnpm run typecheck  # tsc project check for files marked // @ts-check
```

The e2e suite expects test games at `mv/` (with `www/index.html`) and `mz/` (with `index.html`) in the repo root, and `nwjs-sdk` installed (`NWJS_PATH` overrides discovery). It runs nw.js with `show: false` and SwiftShader WebGL by default, drives the game through CDP, and restores the settings directory (`www/cheat-settings/` for MV, `cheat-settings/` for MZ) plus `save/global.*` afterwards. Node.js >= 22 is required for the built-in `WebSocket`.

Code style: `pnpm run lint` (ESLint flat config), `pnpm run format` (Prettier), `pnpm run format:check` (CI). `no-undef` is disabled for RPG Maker sources because the engine injects globals at runtime; do not list every `$gameXxx` symbol by hand.

## Structure

| Path | Purpose |
|---|---|
| `cheat-engine/www/cheat/` | Cheat UI source. Vue 3 + Vuetify 4, ES module JS files. |
| `cheat-engine/www/cheat/js/actor/` | Actor / party / equipment pure helpers |
| `cheat-engine/www/cheat/js/SettingsPath.js` | MV/MZ settings directory + legacy migration |
| `cheat-engine/www/cheat/js/LockService.js` | Global switch/variable lock service (independent of panel lifetime) |
| `cheat-engine/www/cheat/js/AtomicFile.js` | Atomic JSON/text file writes (temp file + `fsync` + rename, stale `.tmp` cleanup) |
| `cheat-engine/www/cheat/js/GameState.js` | Game-data readiness checks for panels and shortcuts |
| `cheat-engine/www/cheat/js/PaginationHelper.js` | Shared pagination math (including the `All` option) |
| `cheat-engine/www/cheat/js/TablePanelMixin.js` | Shared search / pagination / panel-state mixin for table panels (`panelStateExtraKeys`) |
| `cheat-engine/www/cheat/js/LockTableMixin.js` | Shared switch/variable table logic: rows, locking, persisted lock map |
| `cheat-engine/www/cheat/js/SearchFilter.js` | Shared keyword matching (`matchesKeyword`, `filterByKeyword`) |
| `cheat-engine/www/cheat/js/strings.js` | Shared UI copy (`t("common.search")`, nav names, ...) |
| `cheat-engine/www/cheat/js/ClickGuard.js` | Ignore game input when clicking cheat UI / overlays |
| `cheat-engine/www/cheat/components/` | Shared UI (`SearchField`, `RefreshButton`, `PaginationFooter`, `PageJump`, ...) |
| `cheat-engine/www/_cheat_initialize/mv/` | MV-specific `main.js` replacement |
| `cheat-engine/www/_cheat_initialize/mz/` | MZ-specific `main.js` replacement |
| `tools/` | Vendor build scripts (`build-shiki.mjs`, `copy-vue.mjs`, ...), `pack.mjs` (zip packaging), `Makefile` helpers (`gen-version.mjs`, `link-latest.mjs`, `clean.mjs`)|
| `tests/` | Headless MV/MZ tests (`tests/run.mjs`, `tests/lib/nw.mjs`, `tests/specs/*`) |
| `tests/unit/` | `node --test` unit tests for pure helpers, settings migration, and classic-script bootstrap logic (`import-bootstrap.test.mjs` runs `init/import.js` in `node:vm`) (CI) |
| `CHANGELOG.md` | Semver release history; bump together with `package.json` |

The cheat replaces the game's `main.js` with a version that loads `cheat/init/import.js` → `cheat/init/setup.js` (ES module) → mounts Vue 3 `MainComponent`.

Cheat-owned persistent settings live under the game's web root:
- MV: `www/cheat-settings/` (`shortcuts.json`, `gameSpeed.json`, `speed.json`, `kv-storage.json`, `locale.json`, `panel-state.json`, `map-event.json`, `switch-locks.json`, `variable-locks.json`, `save-backups/`).
- MZ: `cheat-settings/` at the game root (same files). An existing legacy `www/cheat-settings/` is migrated once on load; the migration merges missing files and can resume after an interrupted copy.
- Paths are resolved against `nw.App.startPath` (fallback `process.cwd()`), not the launcher's working directory.
- `map-event.json` stores the map-event panel display settings. NW.js never uses `localStorage` for settings: all games share the same NW.js user data directory, so `localStorage` would leak settings across games. Use `SettingsPath` / `KeyValueStorage` instead.
- Corrupt settings JSON is renamed to `<file>.corrupt-<timestamp>` before a fresh file is written.

New features that need on-disk state should use `cheat/js/SettingsPath.js` instead of hardcoding a path.

## CI

GitHub Actions on push to `main` or `vue-3` and on `pull_request` (paths: `cheat-engine/**`, `tools/**`, `tests/**`, `Makefile`, `.github/workflows/**`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`), plus manual `workflow_dispatch`. Runs `lint`, `format:check`, `test:unit`, `typecheck`, `make`, then `test:packaging`, and uploads both `.zip` archives as a zip artifact.
