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
  delete globalThis.nw;
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

test("SettingsPath.getAppRoot：nw.App.startPath 优先，并去掉尾随分隔符", async () => {
  restoreGlobals();

  try {
    globalThis.Utils = { RPGMAKER_NAME: "MV" };
    globalThis.nw = { App: { startPath: "/games/MyGame///" } };

    let mod = await loadModule("nw-mv");
    assert.equal(mod.getAppRoot(), "/games/MyGame");
    assert.equal(mod.getCheatSettingsDir(), "/games/MyGame/www/cheat-settings");

    globalThis.Utils = { RPGMAKER_NAME: "MZ" };
    mod = await loadModule("nw-mz");
    assert.equal(
      mod.getCheatSettingsPath("save-backups/index.json"),
      "/games/MyGame/cheat-settings/save-backups/index.json",
    );

    // 空 startPath 退回当前工作目录
    globalThis.nw = { App: { startPath: "" } };
    mod = await loadModule("nw-empty");
    assert.equal(mod.getAppRoot(), process.cwd());

    // startPath 不是字符串也退回 cwd
    globalThis.nw = { App: { startPath: 42 } };
    mod = await loadModule("nw-invalid");
    assert.equal(mod.getAppRoot(), process.cwd());

    // 访问 nw 抛错时同样退回 cwd
    globalThis.nw = {
      get App() {
        throw new Error("nw unavailable");
      },
    };
    mod = await loadModule("nw-throws");
    assert.equal(mod.getAppRoot(), process.cwd());
  } finally {
    restoreGlobals();
  }
});

test("SettingsPath：DataManager 探测抛错时按 MV 处理", async () => {
  restoreGlobals();

  try {
    globalThis.DataManager = {
      get makeSavename() {
        throw new Error("not ready");
      },
    };

    const mod = await loadModule("dm-throws");
    assert.equal(mod.isMZEngine(), false);
  } finally {
    restoreGlobals();
  }
});
