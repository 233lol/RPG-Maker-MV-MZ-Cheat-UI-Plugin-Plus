import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

// GlobalShortcut 在模块加载时就会读取 Utils / 设置文件，
// 先准备一个浏览器环境，避免 Node 下直接 ReferenceError。
globalThis.Utils = {
  isNwjs: () => false,
  RPGMAKER_NAME: "MZ",
};

const { GLOBAL_SHORTCUT, isInValueInRange } =
  await import("../../cheat-engine/www/cheat/js/GlobalShortcut.js");
const { Key } = await import("../../cheat-engine/www/cheat/js/KeyCodes.js");

afterEach(() => {
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

test("GlobalShortcut.migrateShortcutSettings：补齐缺失动作与新增参数", () => {
  delete GLOBAL_SHORTCUT.shortcutSettings.gotoTitle;
  GLOBAL_SHORTCUT.shortcutSettings.skipMessage.param = {};

  GLOBAL_SHORTCUT.migrateShortcutSettings();

  assert.equal(GLOBAL_SHORTCUT.getShortcut("gotoTitle").asString(), "ctrl t");
  assert.equal(GLOBAL_SHORTCUT.getParam("skipMessage", "accelerate"), 1);
});
