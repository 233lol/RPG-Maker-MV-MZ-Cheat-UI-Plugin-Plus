# AGENTS.md

## Build

```shell
pnpm i && make           # build both MV & MZ with the Vue production build
make mv                  # build only MV
make mz                  # build only MZ
make dev                 # build both with the Vue dev build (warnings + Devtools)
make prod                # switch back to the Vue production build and rebuild
```

Output: `mv-<hash>.zip` and/or `mz-<hash>.zip`. Packing is done by `node tools/pack.mjs <mv|mz> <output.zip>` (fflate); MV archives are prefixed with `www/` (MV game root), MZ archives are not.

Vendor scripts (all available via `pnpm run vendor:*`):

| Command | Output |
|---|---|
| `vendor:shiki` | `cheat-engine/www/cheat/libs/shiki.bundle.mjs` (minified production bundle) |
| `vendor:shiki:dev` | same file but unminified with inline sourcemap (for debugging) |
| `vendor:vuetify` | `cheat-engine/www/cheat/libs/vuetify.js` (minified production bundle) |
| `vendor:vuetify:dev` | same file but unminified (readable Vuetify stack traces, for debugging) |
| `vendor:vue` | `cheat-engine/www/cheat/libs/vue.js` (production build `vue.esm-browser.prod.js`) |
| `vendor:vue:dev` | same file but development build `vue.esm-browser.js` (warnings + Vue Devtools, for debugging) |
| `vendor:assets` | `css/vuetify.css`, `css/materialdesignicons.css`, `fonts/*` (copied from npm packages) |

`vendor:shiki` is auto-triggered by Makefile dependency. `make vendor` runs all four.

No tests, linter, typechecker, or tsconfig (all source is plain JS except `tools/shiki.bundle.ts`).

## Structure

| Path | Purpose |
|---|---|
| `cheat-engine/www/cheat/` | Cheat UI source. Vue 3 + Vuetify 4, ES module JS files. |
| `cheat-engine/www/_cheat_initialize/mv/` | MV-specific `main.js` replacement |
| `cheat-engine/www/_cheat_initialize/mz/` | MZ-specific `main.js` replacement |
| `tools/` | Vendor build scripts (`build-shiki.mjs`, `copy-vue.mjs`, ...) and `pack.mjs` (zip packaging) |

The cheat replaces the game's `main.js` with a version that loads `cheat/init/import.js` → `cheat/init/setup.js` (ES module) → mounts Vue 3 `MainComponent`.

## CI

GitHub Actions on push to `main` or `vue-3` (paths: `cheat-engine/**`, `package.json`, `package-lock.json`), plus manual `workflow_dispatch`. Uploads both `.zip` archives as a zip artifact.
