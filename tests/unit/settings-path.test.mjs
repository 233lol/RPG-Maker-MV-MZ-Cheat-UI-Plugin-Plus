import test from "node:test";
import assert from "node:assert/strict";

const SETTINGS_MODULE = "../../cheat-engine/www/cheat/js/SettingsPath.js";

async function loadModule(caseName) {
  // Each import gets a fresh module instance so the engine globals can differ.
  return import(`${SETTINGS_MODULE}?${caseName}`);
}

function restoreGlobals() {
  delete globalThis.Utils;
  delete globalThis.DataManager;
}

test("SettingsPath：优先使用 Utils.RPGMAKER_NAME 判断引擎", async () => {
  restoreGlobals();

  const root = process.cwd();

  try {
    globalThis.Utils = { RPGMAKER_NAME: "MZ" };
    let mod = await loadModule("mz");
    assert.equal(mod.isMZEngine(), true);
    assert.equal(mod.getCheatSettingsDir(), `${root}/cheat-settings`);
    assert.equal(
      mod.getCheatSettingsPath("shortcuts.json"),
      `${root}/cheat-settings/shortcuts.json`,
    );

    globalThis.Utils = { RPGMAKER_NAME: "MV" };
    mod = await loadModule("mv");
    assert.equal(mod.isMZEngine(), false);
    assert.equal(mod.getCheatSettingsDir(), `${root}/www/cheat-settings`);
    assert.equal(
      mod.getCheatSettingsPath("shortcuts.json"),
      `${root}/www/cheat-settings/shortcuts.json`,
    );
  } finally {
    restoreGlobals();
  }
});

test("SettingsPath：没有 Utils 时用 DataManager.makeSavename 兜底探测", async () => {
  restoreGlobals();

  try {
    globalThis.DataManager = { makeSavename: () => "file1.rmmzsave" };
    const mod = await loadModule("fallback-mz");
    assert.equal(mod.isMZEngine(), true);
  } finally {
    restoreGlobals();
  }
});

test("SettingsPath：没有任何引擎标记时按 MV 处理", async () => {
  restoreGlobals();

  try {
    const mod = await loadModule("no-engine");
    assert.equal(mod.isMZEngine(), false);
    assert.equal(
      mod.getCheatSettingsDir(),
      `${process.cwd()}/www/cheat-settings`,
    );
  } finally {
    restoreGlobals();
  }
});
