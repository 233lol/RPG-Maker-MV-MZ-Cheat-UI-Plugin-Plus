import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// GlobalShortcut 在模块加载时就会读取 Utils / 设置文件，
// 先准备一个浏览器环境，避免 Node 下直接 ReferenceError。
globalThis.Utils = {
  isNwjs: () => false,
  RPGMAKER_NAME: "MZ",
};

const { GLOBAL_SHORTCUT, isInValueInRange } =
  await import("../../cheat-engine/www/cheat/js/GlobalShortcut.js");
const { Key } = await import("../../cheat-engine/www/cheat/js/KeyCodes.js");
const { Alert } =
  await import("../../cheat-engine/www/cheat/js/AlertHelper.js");
const { ShortcutMap } =
  await import("../../cheat-engine/www/cheat/js/ShortcutHelper.js");

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

afterEach(() => {
  for (const name of [
    "$gamePlayer",
    "$gameParty",
    "$gameTroop",
    "$gameMap",
    "$gameSystem",
    "DataManager",
    "SceneManager",
    "BattleManager",
    "Scene_Title",
    "Scene_Save",
    "Scene_Load",
    "Scene_Map",
    "Scene_Battle",
    "nw",
    "window",
  ]) {
    delete globalThis[name];
  }

  globalThis.Utils = {
    isNwjs: () => false,
    RPGMAKER_NAME: "MZ",
  };

  Alert.handler = null;
  Alert.pending = [];
  GLOBAL_SHORTCUT.initialize();
});

test("isInValueInRange：合法整数返回 false", () => {
  assert.equal(isInValueInRange(1, 1, 20), false);
  assert.equal(isInValueInRange(20, 1, 20), false);
  assert.equal(isInValueInRange("10", 1, 20), false);
  assert.equal(isInValueInRange(0, 0, 0), false);
});

test("isInValueInRange：非整数返回类型错误文案", () => {
  for (const value of ["abc", "1.5", 1.5, Number.NaN, undefined]) {
    const message = isInValueInRange(value, 1, 20);
    assert.equal(typeof message, "string", String(value));
    assert.match(message, /数字|number/i, String(value));
  }
});

test("isInValueInRange：空字符串 / null 按 0 处理并判越界", () => {
  assert.match(isInValueInRange("", 1, 20), /1|20/);
  assert.match(isInValueInRange(null, 1, 20), /1|20/);
});

test("isInValueInRange：越界返回范围错误文案", () => {
  assert.match(isInValueInRange(0, 1, 20), /1|20/);
  assert.match(isInValueInRange(21, 1, 20), /1|20/);
  assert.match(isInValueInRange(-5, 0, 3), /0|3/);
});

test("isInValueInRange：布尔值按数字处理", () => {
  assert.equal(isInValueInRange(true, 1, 20), false);
  assert.match(isInValueInRange(false, 1, 20), /1|20/);
});

test("GlobalShortcut：读取设置 / 配置 / 参数", () => {
  assert.equal(GLOBAL_SHORTCUT.getShortcut("quickSave").asString(), "ctrl s");
  assert.equal(GLOBAL_SHORTCUT.getConfig("quickSave").id, "quickSave");
  assert.equal(typeof GLOBAL_SHORTCUT.getConfig("quickSave").name, "string");
  assert.equal(GLOBAL_SHORTCUT.getParam("setSpeed", "speed"), 5);
  assert.equal(
    GLOBAL_SHORTCUT.getParamConfig("setSpeed", "speed").name,
    "速度",
  );
  assert.equal(
    GLOBAL_SHORTCUT.getParamConfig("setSpeed", "speed").desc,
    "设置的速度（1-10）",
  );
});

test("GlobalShortcut.setShortcut：拒绝无效 / 不可表示 / 冲突的按键", () => {
  assert.throws(
    () => GLOBAL_SHORTCUT.setShortcut("quickSave", null),
    /无效的快捷键/,
  );

  assert.throws(
    () =>
      GLOBAL_SHORTCUT.setShortcut(
        "quickSave",
        new Key(226, false, false, false, false),
      ),
    /无法保存/,
  );

  // 与 toggleNoClip 的 alt w 冲突
  assert.throws(
    () => GLOBAL_SHORTCUT.setShortcut("quickSave", Key.fromString("alt w")),
    /冲突/,
  );

  // 与当前值相同不写入，也不抛错
  assert.doesNotThrow(() =>
    GLOBAL_SHORTCUT.setShortcut("quickSave", Key.fromString("ctrl s")),
  );
});

test("GlobalShortcut.setShortcut：成功时更新设置与快捷键表", () => {
  const next = Key.fromString("ctrl shift f9");

  GLOBAL_SHORTCUT.setShortcut("quickSave", next);

  assert.equal(
    GLOBAL_SHORTCUT.getShortcut("quickSave").asString(),
    "ctrl shift f9",
  );
  assert.equal(
    GLOBAL_SHORTCUT.getConfig("quickSave"),
    GLOBAL_SHORTCUT.shortcutMap.getValue(next),
  );
});

test("GlobalShortcut.setParam：按参数配置校验并转换类型", () => {
  assert.throws(
    () => GLOBAL_SHORTCUT.setParam("setSpeed", "speed", "0"),
    /1|10/,
  );
  assert.throws(
    () => GLOBAL_SHORTCUT.setParam("setSpeed", "speed", "abc"),
    /数字|number/i,
  );
  assert.throws(
    () => GLOBAL_SHORTCUT.setParam("setSpeed", "speed", "11"),
    /1|10/,
  );

  GLOBAL_SHORTCUT.setParam("setSpeed", "speed", "9");
  assert.equal(GLOBAL_SHORTCUT.getParam("setSpeed", "speed"), 9);
});

test("GlobalShortcut.runKeyXxxEvent：命中时阻止事件，未命中时放行", () => {
  const originalMap = GLOBAL_SHORTCUT.shortcutMap;
  const results = [true, false, true];
  const calls = [];
  const event = {
    preventDefault: () => calls.push("prevent"),
    stopImmediatePropagation: () => calls.push("immediate"),
    stopPropagation: () => calls.push("stop"),
  };

  GLOBAL_SHORTCUT.shortcutMap = {
    runEnterAction: () => results.shift(),
    runRepeatAction: () => results.shift(),
    runLeaveAction: () => results.shift(),
  };

  try {
    const key = Key.fromString("ctrl c");

    GLOBAL_SHORTCUT.runKeyEnterEvent(event, key);
    assert.deepEqual(calls, ["prevent", "immediate", "stop"]);

    calls.length = 0;
    GLOBAL_SHORTCUT.runKeyRepeatEvent(event, key);
    assert.deepEqual(calls, []);

    GLOBAL_SHORTCUT.runKeyLeaveEvent(event, key);
    assert.deepEqual(calls, ["prevent", "immediate", "stop"]);
  } finally {
    GLOBAL_SHORTCUT.shortcutMap = originalMap;
  }
});

test("GlobalShortcut 注册的快捷键动作都能派发到 CheatHelper", async () => {
  const alerts = captureAlerts();
  const calls = [];

  globalThis.$gamePlayer = {
    _through: false,
    mhp: 10,
    mmp: 5,
    setMoveSpeed() {},
    setHp() {},
    setMp() {},
    setPosition() {},
  };
  globalThis.$gameParty = {
    members: () => [],
    setHp() {},
  };
  globalThis.$gameTroop = { members: () => [] };
  globalThis.$gameMap = { mapId: () => 1 };
  globalThis.$gameSystem = {
    onBeforeSave() {},
    onAfterLoad() {},
  };

  class Scene_Title {}
  class Scene_Save {}
  class Scene_Load {}
  class Scene_Map {}
  class Scene_Battle {}

  globalThis.Scene_Title = Scene_Title;
  globalThis.Scene_Save = Scene_Save;
  globalThis.Scene_Load = Scene_Load;
  globalThis.Scene_Map = Scene_Map;
  globalThis.Scene_Battle = Scene_Battle;

  globalThis.SceneManager = {
    _scene: new Scene_Battle(),
    goto: (scene) => calls.push(["goto", scene]),
    push: (scene) => calls.push(["push", scene]),
    pop: () => calls.push(["pop"]),
  };
  globalThis.BattleManager = {
    _phase: "input",
    _preemptive: false,
    processVictory: () => calls.push(["victory"]),
    processDefeat: () => calls.push(["defeat"]),
    processEscape: () => calls.push(["escape"]),
  };
  globalThis.DataManager = {
    saveGame: async () => true,
    loadGame: async () => true,
    maxSavefiles: () => 20,
  };

  const run = async (shortcut) => {
    await GLOBAL_SHORTCUT.shortcutMap.runEnterAction(Key.fromString(shortcut));
  };

  await run("ctrl c");
  await run("ctrl m");
  await run("ctrl b");
  await run("ctrl s");
  await run("ctrl q");
  await run("ctrl [");
  await run("ctrl ]");
  await run("ctrl t");
  await run("ctrl v");
  await run("ctrl d");
  await run("ctrl e");
  await run("alt w");
  await run("alt 1");
  await run("alt 0");
  await run("alt 2");
  await run("alt 9");

  assert.deepEqual(
    calls.filter(([name]) => ["victory", "defeat", "escape"].includes(name)),
    [["victory"], ["defeat"], ["escape"]],
  );
  assert.equal(
    alerts.some((item) => item.level === "success"),
    true,
  );
});

test("GlobalShortcut 未绑定按键的动作也能直接执行", () => {
  const alerts = captureAlerts();

  globalThis.$gamePlayer = {
    _through: false,
    setMoveSpeed() {},
  };
  globalThis.$gameParty = { members: () => [] };
  globalThis.$gameMap = { mapId: () => 1 };
  globalThis.$gameSystem = {};
  globalThis.SceneManager = {
    updateScene() {},
    goto() {},
    push() {},
    pop() {},
  };

  const setSpeed = GLOBAL_SHORTCUT.getConfig("setSpeed");
  setSpeed.enterAction({ speed: 7 });

  const skip = GLOBAL_SHORTCUT.getConfig("skipMessage");
  skip.enterAction({ accelerate: 5 });
  assert.equal(
    GLOBAL_SHORTCUT.getConfig("skipMessage").leaveAction,
    skip.leaveAction,
  );
  skip.leaveAction({ accelerate: 5 });

  assert.equal(typeof alerts, "object");
  assert.equal(GLOBAL_SHORTCUT.getConfig("setSpeed").id, "setSpeed");
});

test("GlobalShortcut 参数配置的名称、描述和转换", () => {
  const slot = GLOBAL_SHORTCUT.getParamConfig("quickSave", "slot");
  const accelerate = GLOBAL_SHORTCUT.getParamConfig(
    "skipMessage",
    "accelerate",
  );
  const speed = GLOBAL_SHORTCUT.getParamConfig("setSpeed", "speed");

  globalThis.DataManager = { maxSavefiles: () => 20 };

  for (const param of [slot, accelerate, speed]) {
    assert.equal(typeof param.name, "string");
    assert.notEqual(param.name, "");
    assert.equal(typeof param.desc, "string");
    assert.notEqual(param.desc, "");
    assert.equal(param.convertValue("7"), 7);
  }

  assert.match(slot.isInvalidValue(0), /1|20/);
  assert.equal(slot.isInvalidValue(1), false);
  assert.match(accelerate.isInvalidValue(51), /1|50/);
  assert.equal(accelerate.isInvalidValue(50), false);
});

test("GlobalShortcut 迁移遇到底键冲突时清空新绑定", () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    delete GLOBAL_SHORTCUT.shortcutSettings.gotoTitle;
    // gotoTitle 默认 ctrl t 与现有绑定冲突
    GLOBAL_SHORTCUT.shortcutSettings.toggleNoClip.shortcut =
      Key.fromString("ctrl t");

    GLOBAL_SHORTCUT.migrateShortcutSettings();
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(
    GLOBAL_SHORTCUT.getShortcut("gotoTitle").isEmpty(),
    true,
    "冲突的默认快捷键应清空",
  );
  assert.equal(warnings.length >= 1, true);
});

test("GlobalShortcut.initializeShortcutMap 遇到已占用按键时跳过", () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    GLOBAL_SHORTCUT.shortcutSettings.quickSave.shortcut =
      GLOBAL_SHORTCUT.shortcutSettings.toggleCheatModal.shortcut;
    GLOBAL_SHORTCUT.shortcutMap = new ShortcutMap();
    GLOBAL_SHORTCUT.initializeShortcutMap();
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length >= 1, true);
  assert.equal(
    GLOBAL_SHORTCUT.shortcutMap.getValue(Key.fromString("ctrl s")),
    null,
  );
});

test("GlobalShortcut 浏览器模式读取默认设置", () => {
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const settings = GLOBAL_SHORTCUT.readRawShortcutSettings();
    assert.equal(typeof settings.quickSave.shortcut, "string");
  } finally {
    console.warn = originalWarn;
  }

  assert.doesNotThrow(() => GLOBAL_SHORTCUT.writeRawShortcutSettings({}));
  assert.doesNotThrow(() => GLOBAL_SHORTCUT.restoreDefaultSettings());
});

test("GlobalShortcut NW.js 模式读取 / 重建 / 写盘失败回退", () => {
  const originalUtils = globalThis.Utils;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-shortcut-"));
  const file = path.join(tempDir, "shortcuts.json");

  globalThis.require = createRequire(import.meta.url);
  globalThis.Utils = {
    isNwjs: () => true,
    RPGMAKER_NAME: "MZ",
  };
  GLOBAL_SHORTCUT.shortcutSettingsFile = file;

  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    // 文件缺失时自动写入默认设置并读取
    const created = GLOBAL_SHORTCUT.readRawShortcutSettings();
    assert.equal(typeof created.quickSave.shortcut, "string");
    assert.equal(fs.existsSync(file), true);

    // 已有合法文件时直接读取
    fs.writeFileSync(
      file,
      JSON.stringify({ quickSave: { shortcut: "ctrl y", param: { slot: 2 } } }),
      "utf8",
    );
    const read = GLOBAL_SHORTCUT.readRawShortcutSettings();
    assert.equal(read.quickSave.shortcut, "ctrl y");

    // 文件损坏且无法重建时回退到默认设置
    GLOBAL_SHORTCUT.shortcutSettingsFile = path.join(
      tempDir,
      "no-such-dir",
      "x.json",
    );
    const fallback = GLOBAL_SHORTCUT.readRawShortcutSettings();
    assert.equal(typeof fallback.toggleCheatModal.shortcut, "string");
  } finally {
    console.warn = originalWarn;
    globalThis.Utils = originalUtils;
    delete globalThis.require;
    GLOBAL_SHORTCUT.shortcutSettingsFile = path.join(tempDir, "restored.json");
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("GlobalShortcut.readShortcutSettings 解析失败时回退默认值", () => {
  const originalRead = GLOBAL_SHORTCUT.readRawShortcutSettings;
  const originalWarn = console.warn;
  const alerts = captureAlerts();
  console.warn = () => {};

  try {
    GLOBAL_SHORTCUT.readRawShortcutSettings = () => ({
      quickSave: { shortcut: 123 },
    });
    GLOBAL_SHORTCUT.readShortcutSettings();
  } finally {
    GLOBAL_SHORTCUT.readRawShortcutSettings = originalRead;
    console.warn = originalWarn;
  }

  assert.equal(GLOBAL_SHORTCUT.getShortcut("quickSave").asString(), "ctrl s");
  assert.equal(alerts.at(-1).level, "warn");
});

test("GlobalShortcut.openDevTool：NW.js 下打开开发者工具，浏览器下静默跳过", () => {
  const opened = [];

  globalThis.nw = {
    Window: {
      get: () => ({
        showDevTools() {
          opened.push(true);
        },
      }),
    },
  };

  GLOBAL_SHORTCUT.getConfig("openDevTool").enterAction({});
  assert.equal(opened.length, 1);

  // 没有 nw / nw.Window 时不应抛错
  delete globalThis.nw;
  assert.doesNotThrow(() =>
    GLOBAL_SHORTCUT.getConfig("openDevTool").enterAction({}),
  );
  assert.equal(opened.length, 1);
});

test("GlobalShortcut.migrateShortcutSettings：补齐缺失动作与新增参数", () => {
  delete GLOBAL_SHORTCUT.shortcutSettings.gotoTitle;
  GLOBAL_SHORTCUT.shortcutSettings.skipMessage.param = {};

  GLOBAL_SHORTCUT.migrateShortcutSettings();

  assert.equal(GLOBAL_SHORTCUT.getShortcut("gotoTitle").asString(), "ctrl t");
  assert.equal(GLOBAL_SHORTCUT.getParam("skipMessage", "accelerate"), 1);
});
