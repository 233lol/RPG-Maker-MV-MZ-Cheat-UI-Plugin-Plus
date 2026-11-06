import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

// 这些函数都在调用时读取全局标记，因此只需要导入一次；
// 之前用 `?query` 重载模块的方式会让 Node 的覆盖率统计漏掉整个文件。
import * as mod from "../../cheat-engine/www/cheat/js/SettingsPath.js";

function restoreGlobals() {
  delete globalThis.Utils;
  delete globalThis.DataManager;
  delete globalThis.nw;
}

afterEach(restoreGlobals);

test("SettingsPath：优先使用 Utils.RPGMAKER_NAME 判断引擎", () => {
  restoreGlobals();

  const root = process.cwd();

  globalThis.Utils = { RPGMAKER_NAME: "MZ" };
  assert.equal(mod.isMZEngine(), true);
  assert.equal(mod.getCheatSettingsDir(), `${root}/cheat-settings`);
  assert.equal(
    mod.getCheatSettingsPath("shortcuts.json"),
    `${root}/cheat-settings/shortcuts.json`,
  );

  globalThis.Utils = { RPGMAKER_NAME: "MV" };
  assert.equal(mod.isMZEngine(), false);
  assert.equal(mod.getCheatSettingsDir(), `${root}/www/cheat-settings`);
  assert.equal(
    mod.getCheatSettingsPath("shortcuts.json"),
    `${root}/www/cheat-settings/shortcuts.json`,
  );

  // 其它引擎名（或空值）都按 MV 处理
  globalThis.Utils = { RPGMAKER_NAME: "" };
  assert.equal(mod.isMZEngine(), false);
});

test("SettingsPath：没有 Utils 时用 DataManager.makeSavename 兜底探测", () => {
  restoreGlobals();

  globalThis.DataManager = { makeSavename: () => "file1.rmmzsave" };
  assert.equal(mod.isMZEngine(), true);

  globalThis.DataManager = { makeSavename: "not-a-function" };
  assert.equal(mod.isMZEngine(), false);
});

test("SettingsPath：没有任何引擎标记时按 MV 处理", () => {
  restoreGlobals();

  assert.equal(mod.isMZEngine(), false);
  assert.equal(
    mod.getCheatSettingsDir(),
    `${process.cwd()}/www/cheat-settings`,
  );
});

test("SettingsPath.getAppRoot：nw.App.startPath 优先，并去掉尾随分隔符", () => {
  restoreGlobals();

  globalThis.Utils = { RPGMAKER_NAME: "MV" };
  globalThis.nw = { App: { startPath: "/games/MyGame///" } };

  assert.equal(mod.getAppRoot(), "/games/MyGame");
  assert.equal(mod.getCheatSettingsDir(), "/games/MyGame/www/cheat-settings");

  globalThis.Utils = { RPGMAKER_NAME: "MZ" };
  assert.equal(
    mod.getCheatSettingsPath("save-backups/index.json"),
    "/games/MyGame/cheat-settings/save-backups/index.json",
  );

  // 反斜杠路径同样去掉尾随分隔符
  globalThis.nw = { App: { startPath: "C:\\Games\\MyGame\\\\" } };
  assert.equal(mod.getAppRoot(), "C:\\Games\\MyGame");

  // 空 startPath 退回当前工作目录
  globalThis.nw = { App: { startPath: "" } };
  assert.equal(mod.getAppRoot(), process.cwd());

  // startPath 不是字符串也退回 cwd
  globalThis.nw = { App: { startPath: 42 } };
  assert.equal(mod.getAppRoot(), process.cwd());

  // nw 存在但没有 App
  globalThis.nw = {};
  assert.equal(mod.getAppRoot(), process.cwd());

  // 访问 nw 抛错时同样退回 cwd
  globalThis.nw = {
    get App() {
      throw new Error("nw unavailable");
    },
  };
  assert.equal(mod.getAppRoot(), process.cwd());
});

test("SettingsPath：DataManager 探测抛错时按 MV 处理", () => {
  restoreGlobals();

  globalThis.DataManager = {
    get makeSavename() {
      throw new Error("not ready");
    },
  };

  assert.equal(mod.isMZEngine(), false);
});
