import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

import GeneralPanel from "../../cheat-engine/www/cheat/panels/GeneralPanel.js";
import {
  GeneralCheat,
  GameSpeedCheat,
  SpeedCheat,
} from "../../cheat-engine/www/cheat/js/CheatHelper.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";
import { Key } from "../../cheat-engine/www/cheat/js/KeyCodes.js";
import * as BuildVersion from "../../cheat-engine/www/cheat/version.js";

// ShortcutPanel 会创建 GlobalShortcut 单例，模块加载阶段就需要 Utils。
globalThis.Utils = {
  isNwjs: () => false,
  RPGMAKER_NAME: "MZ",
};

const { default: ShortcutPanel } =
  await import("../../cheat-engine/www/cheat/panels/ShortcutPanel.js");
const { GLOBAL_SHORTCUT } =
  await import("../../cheat-engine/www/cheat/js/GlobalShortcut.js");

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

function makeGeneralPanel(overrides = {}) {
  return {
    ...GeneralPanel.methods,
    ...GeneralPanel.data.call({}),
    $refs: {},
    ...overrides,
  };
}

function makeShortcutPanel(overrides = {}) {
  return {
    ...ShortcutPanel.methods,
    ...ShortcutPanel.data.call({}),
    ...overrides,
  };
}

function resetTestGlobals() {
  for (const name of [
    "$gamePlayer",
    "$gameParty",
    "$gameMap",
    "$gameSystem",
    "$dataSystem",
  ]) {
    globalThis[name] = null;
  }

  delete globalThis.nw;
  delete globalThis.window;

  Alert.handler = null;
  Alert.pending = [];
}

beforeEach(resetTestGlobals);
afterEach(resetTestGlobals);

/* ------------------------------------------------------------------ GeneralPanel */

test("GeneralPanel.initializeVariables：游戏未就绪时使用安全默认值", () => {
  const original = {
    isFixed: SpeedCheat.isFixed,
    getRate: GameSpeedCheat.getRate,
    getSceneOption: GameSpeedCheat.getSceneOption,
    sceneOptions: GameSpeedCheat.sceneOptions,
  };

  SpeedCheat.isFixed = () => false;
  GameSpeedCheat.getRate = () => 1;
  GameSpeedCheat.getSceneOption = () => GameSpeedCheat.sceneOptions().all;

  const panel = makeGeneralPanel();

  try {
    panel.initializeVariables();
  } finally {
    SpeedCheat.isFixed = original.isFixed;
    GameSpeedCheat.getRate = original.getRate;
    GameSpeedCheat.getSceneOption = original.getSceneOption;
    GameSpeedCheat.sceneOptions = original.sceneOptions;
  }

  assert.equal(panel.noClip, false);
  assert.equal(panel.speed, 4);
  assert.equal(panel.fixSpeed, false);
  assert.equal(panel.gold, 0);
  assert.equal(panel.gameSpeed, 1);
  assert.equal(panel.applyAllForGameSpeed, true);
  assert.equal(panel.applyBattleForGameSpeed, false);
});

test("GeneralPanel.initializeVariables：读取穿墙 / 速度 / 金币与战斗场景选项", () => {
  globalThis.$gamePlayer = {
    _through: true,
    moveSpeed: () => 6,
  };
  globalThis.$gameParty = { _gold: 42 };

  const original = {
    isFixed: SpeedCheat.isFixed,
    getRate: GameSpeedCheat.getRate,
    getSceneOption: GameSpeedCheat.getSceneOption,
    sceneOptions: GameSpeedCheat.sceneOptions,
  };

  SpeedCheat.isFixed = () => true;
  GameSpeedCheat.getRate = () => 2;
  GameSpeedCheat.getSceneOption = () => GameSpeedCheat.sceneOptions().battle;

  const panel = makeGeneralPanel();

  try {
    panel.initializeVariables();
  } finally {
    SpeedCheat.isFixed = original.isFixed;
    GameSpeedCheat.getRate = original.getRate;
    GameSpeedCheat.getSceneOption = original.getSceneOption;
  }

  assert.equal(panel.noClip, true);
  assert.equal(panel.speed, 6);
  assert.equal(panel.fixSpeed, true);
  assert.equal(panel.gold, 42);
  assert.equal(panel.gameSpeed, 2);
  assert.equal(panel.applyAllForGameSpeed, false);
  assert.equal(panel.applyBattleForGameSpeed, true);
});

test("GeneralPanel.onNoClipChange / onSpeedChange：转调 CheatHelper 并刷新", () => {
  const calls = [];
  const originals = {
    toggleNoClip: GeneralCheat.toggleNoClip,
    setSpeed: SpeedCheat.setSpeed,
    writeSettings: SpeedCheat.__writeSettings,
  };

  GeneralCheat.toggleNoClip = (...args) => calls.push(["noClip", ...args]);
  SpeedCheat.setSpeed = (...args) => calls.push(["speed", ...args]);
  SpeedCheat.__writeSettings = (...args) => calls.push(["write", ...args]);

  const panel = makeGeneralPanel({
    speed: 7,
    fixSpeed: true,
    initializeVariables() {
      this.refreshed = (this.refreshed || 0) + 1;
    },
  });

  try {
    panel.onNoClipChange();
    panel.onSpeedChange();
  } finally {
    GeneralCheat.toggleNoClip = originals.toggleNoClip;
    SpeedCheat.setSpeed = originals.setSpeed;
    SpeedCheat.__writeSettings = originals.writeSettings;
  }

  assert.deepEqual(calls, [["noClip"], ["speed", 7, true], ["write", 7, true]]);
  assert.equal(panel.refreshed, 2);
});

test("GeneralPanel.addSpeed：限制在 1-10", () => {
  const applied = [];
  const panel = makeGeneralPanel({
    speed: 9,
    onSpeedChange() {
      applied.push(this.speed);
    },
  });

  panel.addSpeed(3);
  assert.equal(panel.speed, 10);

  panel.speed = 1;
  panel.addSpeed(-3);
  assert.equal(panel.speed, 1);

  panel.speed = 5;
  panel.addSpeed(0.5);
  assert.equal(panel.speed, 5.5);
  assert.deepEqual(applied, [10, 1, 5.5]);
});

test("GeneralPanel.onGoldChange：非法输入回滚，缺少队伍时提示", () => {
  const alerts = captureAlerts();
  const panel = makeGeneralPanel({
    gold: "",
    initializeVariables() {
      this.refreshed = (this.refreshed || 0) + 1;
    },
  });

  panel.onGoldChange();
  assert.equal(panel.refreshed, 1);

  panel.gold = "bad";
  panel.onGoldChange();
  assert.equal(panel.refreshed, 2);

  panel.gold = -1;
  panel.onGoldChange();
  assert.equal(panel.refreshed, 3);

  panel.gold = 1.5;
  panel.onGoldChange();
  assert.equal(panel.refreshed, 4);

  panel.gold = 100;
  panel.onGoldChange();
  assert.equal(alerts.at(-1).level, "warn");
  assert.equal(panel.refreshed, 5);
});

test("GeneralPanel.onGoldChange：增加 / 减少金币并同步显示", () => {
  globalThis.$gameParty = {
    _gold: 100,
    gainGold(amount) {
      this._gold += amount;
    },
    loseGold(amount) {
      this._gold -= amount;
    },
  };

  const panel = makeGeneralPanel({
    gold: 120,
    initializeVariables() {
      this.refreshed = (this.refreshed || 0) + 1;
    },
  });

  panel.onGoldChange();
  assert.equal(globalThis.$gameParty._gold, 120);
  assert.equal(panel.gold, 120);

  panel.gold = 80;
  panel.onGoldChange();
  assert.equal(globalThis.$gameParty._gold, 80);
  assert.equal(panel.gold, 80);
  assert.equal(panel.refreshed, 2);
});

test("GeneralPanel.getCurrentEventId / getCurrentEventCommandIndex：解释器位置", () => {
  globalThis.$gameMap = {
    _interpreter: {
      eventId: () => 5,
      _index: 3,
    },
  };

  const panel = makeGeneralPanel();

  assert.equal(panel.getCurrentEventId(), 5);
  assert.equal(panel.getCurrentEventCommandIndex(), 2);

  globalThis.$gameMap._interpreter._index = "bad";
  assert.equal(panel.getCurrentEventCommandIndex(), -1);

  globalThis.$gameMap._interpreter.eventId = () => Number.NaN;
  assert.equal(panel.getCurrentEventId(), 0);

  globalThis.$gameMap._interpreter._index = 0;
  assert.equal(panel.getCurrentEventCommandIndex(), -1);
});

test("GeneralPanel.scrollToCurrentEventEntry：兼容数组 / 单个 ref 与缺失节点", () => {
  const calls = [];
  const panel = makeGeneralPanel({
    inspectedEventCurrentIndex: 1,
    $refs: {
      "eventRow-1": [
        {
          scrollIntoView: (options) => calls.push(options),
        },
      ],
    },
  });

  panel.scrollToCurrentEventEntry();
  assert.deepEqual(calls, [{ behavior: "smooth", block: "center" }]);

  panel.inspectedEventCurrentIndex = -1;
  panel.scrollToCurrentEventEntry();
  assert.equal(calls.length, 1);

  panel.inspectedEventCurrentIndex = 1;
  panel.$refs["eventRow-1"] = {};
  panel.scrollToCurrentEventEntry();
  assert.equal(calls.length, 1);
});

test("GeneralPanel.formatEventListEntries：整理指令、缩进并只高亮锚点附近", async () => {
  const highlighted = [];
  const panel = makeGeneralPanel({
    async highlightParamText(text) {
      highlighted.push(text);
      return `<highlight>${text}</highlight>`;
    },
  });

  const rows = await panel.formatEventListEntries(
    [
      { code: 101, parameters: ["Hello"], indent: 2 },
      { code: null, parameters: null },
      { code: 999, parameters: { a: 1 } },
    ],
    0,
  );

  assert.equal(rows.length, 3);
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].codeText, "101");
  assert.equal(rows[0].commandName, "show text");
  assert.equal(rows[0].indentPx, 32);
  assert.equal(rows[0].paramHtml, '<highlight>["Hello"]</highlight>');
  assert.equal(rows[1].codeText, "n/a");
  assert.equal(rows[1].commandName, "unknown");
  assert.equal(rows[2].codeText, "999");
  assert.equal(rows[2].commandName, "");
  assert.equal(highlighted.length, 3);

  // 远离锚点后不再调用 shiki
  highlighted.length = 0;
  const far = await panel.formatEventListEntries(
    [{ code: 101, parameters: ["Far"], indent: -1 }],
    99,
  );

  assert.equal(highlighted.length, 0);
  assert.equal(far[0].indentPx, 0);
  assert.match(far[0].paramHtml, /^&lt;|^<pre|Far/);

  assert.deepEqual(await panel.formatEventListEntries(null), []);
  assert.deepEqual(await panel.formatEventListEntries([]), []);
});

test("GeneralPanel.formatReplValue：基础类型 / 对象 / 不可序列化值", () => {
  const panel = makeGeneralPanel();

  assert.equal(panel.formatReplValue(undefined), "undefined");
  assert.equal(panel.formatReplValue("text"), "text");
  assert.equal(panel.formatReplValue(1), "1");
  assert.equal(panel.formatReplValue(true), "true");
  assert.equal(panel.formatReplValue(null), "null");
  assert.equal(panel.formatReplValue({ a: 1 }), '{\n  "a": 1\n}');

  const circular = {};
  circular.self = circular;
  assert.equal(panel.formatReplValue(circular), "[object Object]");

  const unserializable = {
    toJSON() {
      throw new Error("no json");
    },
    toString() {
      return "stringified";
    },
  };
  assert.equal(panel.formatReplValue(unserializable), "stringified");
});

test("GeneralPanel.appendReplOutput / clearReplOutput：标签与 200 条上限", () => {
  const panel = makeGeneralPanel({ replOutputEntries: [] });

  panel.appendReplOutput("input", "x");
  panel.appendReplOutput("result", "y");
  panel.appendReplOutput("error", "z");
  panel.appendReplOutput("warn", "w");
  panel.appendReplOutput("unknown", "u");

  assert.deepEqual(panel.replOutputEntries, [
    "IN> x",
    "OUT> y",
    "ERR> z",
    "WARN> w",
    "LOG> u",
  ]);

  for (let i = 0; i < 205; i++) {
    panel.appendReplOutput("result", i);
  }

  assert.equal(panel.replOutputEntries.length, 200);
  assert.equal(
    GeneralPanel.computed.replOutputText.call(panel),
    panel.replOutputEntries.join("\n"),
  );

  panel.clearReplOutput();
  assert.deepEqual(panel.replOutputEntries, []);
});

test("GeneralPanel.runRepl：空输入 / 表达式 / 异常", () => {
  const panel = makeGeneralPanel({
    replInput: "",
    replOutputEntries: [],
  });

  panel.runRepl();
  assert.match(panel.replOutputEntries.at(-1), /WARN>/);

  panel.replInput = "1 + 1";
  panel.runRepl();
  assert.equal(panel.replOutputEntries.at(-1), "OUT> 2");

  panel.replInput = "({ a: 1 })";
  panel.runRepl();
  assert.match(panel.replOutputEntries.at(-1), /OUT> \{\n {2}"a": 1\n\}/);

  panel.replInput = "throw new Error('boom')";
  panel.runRepl();
  assert.match(panel.replOutputEntries.at(-1), /^ERR> Error: boom/);

  panel.openDebugRepl();
  assert.equal(panel.showDebugReplDialog, true);
  panel.closeDebugRepl();
  assert.equal(panel.showDebugReplDialog, false);
});

test("GeneralPanel：弹层 Esc 守卫与 REPL 全局按键守卫", () => {
  const listeners = new Map();
  globalThis.window = {
    addEventListener(type, handler, capture) {
      listeners.set(type, { handler, capture });
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };

  const panel = makeGeneralPanel({
    showEventInspectDialog: true,
    showDebugReplDialog: true,
    closeDebugRepl() {
      this.showDebugReplDialog = false;
    },
    closeEventInspectDialog() {
      this.showEventInspectDialog = false;
    },
  });

  panel.enablePopupEscapeKeyGuard();
  assert.equal(panel.popupEscapeKeyGuard !== null, true);
  assert.equal(listeners.get("keydown").capture, true);

  const escaped = [];
  const event = {
    key: "Escape",
    stopImmediatePropagation: () => escaped.push("immediate"),
    stopPropagation: () => escaped.push("stop"),
    preventDefault: () => escaped.push("prevent"),
  };

  listeners.get("keydown").handler(event);

  assert.deepEqual(escaped, ["immediate", "stop", "prevent"]);
  assert.equal(panel.showDebugReplDialog, false);
  assert.equal(panel.showEventInspectDialog, false);

  panel.enablePopupEscapeKeyGuard();
  assert.equal(typeof panel.popupEscapeKeyGuard, "function");
  panel.disablePopupEscapeKeyGuard();
  assert.equal(panel.popupEscapeKeyGuard, null);

  panel.showDebugReplDialog = true;
  panel.enableReplGlobalKeyGuard();
  assert.equal(listeners.size, 3);

  const replEvent = {
    target: {},
    stopImmediatePropagation: () => escaped.push("repl-immediate"),
    stopPropagation: () => escaped.push("repl-stop"),
    preventDefault: () => escaped.push("repl-prevent"),
  };
  listeners.get("keydown").handler(replEvent);
  assert.equal(escaped.includes("repl-prevent"), true);

  panel.disableReplGlobalKeyGuard();
  assert.equal(panel.replGlobalKeyGuard, null);
  assert.equal(listeners.size, 0);
});

test("GeneralPanel.isNodeInsideDebugRepl：组件根节点 / 弹层 / 外部节点", () => {
  const inside = { closest: () => null };
  const root = {
    contains: (node) => node === inside,
  };
  const panel = makeGeneralPanel({
    $refs: {
      debugReplCard: { $el: root },
    },
  });

  assert.equal(panel.isNodeInsideDebugRepl(inside), true);

  const inDialog = {
    closest: (selector) => (selector === ".v-dialog" ? {} : null),
  };
  assert.equal(panel.isNodeInsideDebugRepl(inDialog), true);

  assert.equal(panel.isNodeInsideDebugRepl(null), false);
  assert.equal(panel.isNodeInsideDebugRepl({ closest: () => null }), false);

  panel.$refs = {};
  assert.equal(panel.isNodeInsideDebugRepl(inside), false);
});

test("GeneralPanel.openVersionLink / 版本文案：优先 nw.Shell，其次浏览器窗口", () => {
  const opened = [];
  globalThis.nw = {
    Shell: {
      openExternal: (url) => opened.push(["nw", url]),
    },
  };
  globalThis.window = {
    open: (url, target) => opened.push([target, url]),
  };

  const panel = makeGeneralPanel();
  Object.defineProperty(panel, "versionUrl", {
    get() {
      return GeneralPanel.computed.versionUrl.call(this);
    },
  });
  const event = { preventDefault: () => opened.push(["prevent"]) };

  panel.openVersionLink(event);
  assert.deepEqual(opened[0], ["prevent"]);
  assert.equal(opened[1][0], "nw");
  assert.match(opened[1][1], /github\.com/);
  assert.match(GeneralPanel.computed.versionUrl.call(panel), /github\.com/);

  delete globalThis.nw;
  panel.openVersionLink(event);
  assert.equal(opened.at(-1)[0], "_blank");

  const label = GeneralPanel.computed.versionLabel.call(panel);
  assert.match(label, new RegExp(BuildVersion.RPGSEMVER));
  assert.match(label, /Vue 3/);
});

test("GeneralPanel：倍率变更 / 步进 / 场景开关互相排斥", () => {
  const calls = [];
  const originals = {
    setGameSpeed: GameSpeedCheat.setGameSpeed,
    writeSettings: GameSpeedCheat.__writeSettings,
    sceneOptions: GameSpeedCheat.sceneOptions,
  };

  GameSpeedCheat.setGameSpeed = (...args) => calls.push(["set", ...args]);
  GameSpeedCheat.__writeSettings = (...args) => calls.push(["write", ...args]);

  const panel = makeGeneralPanel({
    gameSpeed: 1,
    applyAllForGameSpeed: true,
    applyBattleForGameSpeed: false,
    initializeVariables() {
      this.refreshed = (this.refreshed || 0) + 1;
    },
  });

  try {
    panel.onGameSpeedChange();
    assert.equal(calls[0][0], "set");
    assert.equal(calls[0][1], 1);
    assert.equal(calls[0][2], GameSpeedCheat.sceneOptions().all);

    panel.applyAllForGameSpeed = false;
    panel.applyBattleForGameSpeed = true;
    panel.onGameSpeedChange();
    assert.equal(calls[2][2], GameSpeedCheat.sceneOptions().battle);

    panel.applyBattleForGameSpeed = false;
    panel.onGameSpeedChange();
    assert.equal(calls[4][2], null);

    panel.addGameSpeed(20);
    assert.equal(panel.gameSpeed, 10);
    panel.addGameSpeed(-20);
    assert.equal(panel.gameSpeed, 0.1);

    panel.setGameSpeed(3);
    assert.equal(panel.gameSpeed, 3);

    panel.applyAllForGameSpeed = true;
    panel.applyBattleForGameSpeed = true;
    panel.onApplyAllForGameSpeedChange();
    assert.equal(panel.applyAllForGameSpeed, true);
    assert.equal(panel.applyBattleForGameSpeed, false);

    panel.applyAllForGameSpeed = false;
    panel.onApplyAllForGameSpeedChange();
    assert.equal(panel.applyAllForGameSpeed, false);
    assert.equal(panel.applyBattleForGameSpeed, true);

    panel.applyBattleForGameSpeed = true;
    panel.onApplyBattleForGameSpeedChange();
    assert.equal(panel.applyAllForGameSpeed, false);
    assert.equal(panel.applyBattleForGameSpeed, true);

    panel.applyBattleForGameSpeed = false;
    panel.onApplyBattleForGameSpeedChange();
    assert.equal(panel.applyAllForGameSpeed, true);
    assert.equal(panel.applyBattleForGameSpeed, false);
  } finally {
    GameSpeedCheat.setGameSpeed = originals.setGameSpeed;
    GameSpeedCheat.__writeSettings = originals.writeSettings;
    GameSpeedCheat.sceneOptions = originals.sceneOptions;
  }

  assert.ok(panel.refreshed >= 7);
});

/* ----------------------------------------------------------------- ShortcutPanel */

test("ShortcutPanel.convertToInternalData：复制设置并整理参数", () => {
  const panel = makeShortcutPanel();
  const shortcut = Key.fromString("ctrl c");
  const config = {
    id: "setSpeed",
    name: "设置速度",
    desc: "描述",
    necessary: false,
    combiningKeyAlone: true,
    param: { speed: { name: "速度" } },
  };
  const settings = {
    shortcut,
    param: { speed: 5 },
  };

  const item = panel.convertToInternalData(settings, config);

  assert.equal(item.id, "setSpeed");
  assert.equal(item.name, "设置速度");
  assert.equal(item.desc, "描述");
  assert.equal(item.necessary, false);
  assert.equal(item.combiningKeyAlone, true);
  assert.equal(item.paramDesc, config.param);
  assert.notEqual(item.shortcut, shortcut);
  assert.equal(item.shortcut.asString(), "ctrl c");
  assert.deepEqual(item.param, {
    speed: { id: "speed", value: 5 },
  });

  assert.deepEqual(
    panel.convertToInternalData({ shortcut }, { id: "x" }).param,
    {},
  );
});

test("ShortcutPanel：表头 / 搜索 / 快捷键搜索与分页总数", () => {
  const panel = makeShortcutPanel({
    shortcuts: [
      {
        id: "a",
        name: "快速存档",
        desc: "保存",
        shortcut: Key.fromString("ctrl s"),
      },
      {
        id: "b",
        name: "快速读档",
        desc: "读取",
        shortcut: Key.fromString("ctrl l"),
      },
    ],
    tableHeaders: [{ key: "name" }, { key: "desc" }, { key: "shortcut" }],
    hideDesc: true,
    shortcutSearch: Key.createEmpty(),
    search: "",
  });

  assert.deepEqual(ShortcutPanel.computed.filteredHeaders.call(panel), [
    { key: "name" },
    { key: "shortcut" },
  ]);

  panel.hideDesc = false;
  assert.equal(ShortcutPanel.computed.filteredHeaders.call(panel).length, 3);

  assert.equal(ShortcutPanel.computed.filteredShortcuts.call(panel).length, 2);

  panel.shortcutSearch = Key.fromString("ctrl s");
  assert.deepEqual(
    ShortcutPanel.computed.filteredShortcuts.call(panel).map((item) => item.id),
    ["a"],
  );

  panel.shortcutSearch = Key.createEmpty();
  panel.search = "读档";
  Object.defineProperty(panel, "filteredShortcuts", {
    get() {
      return ShortcutPanel.computed.filteredShortcuts.call(this);
    },
  });
  assert.equal(ShortcutPanel.computed.totalCount.call(panel), 1);

  panel.onSearchChange("x");
  assert.equal(panel.shortcutSearch.isEmpty(), true);
  panel.onShortcutSearchChange(Key.fromString("ctrl s"));
  assert.equal(panel.search, "");

  panel.tableExpanded = [];
  panel.changeExpanded({ id: "a" });
  assert.deepEqual(panel.tableExpanded, ["a"]);
  panel.changeExpanded({ id: "a" });
  assert.deepEqual(panel.tableExpanded, []);
  panel.changeExpanded({ id: "b" });
  assert.deepEqual(panel.tableExpanded, ["b"]);
  panel.changeExpanded({ id: "c" });
  assert.deepEqual(panel.tableExpanded, ["c"]);
});

test("ShortcutPanel.onShortcutChange / onParameterChange：成功更新显示，失败提示", () => {
  const alerts = captureAlerts();
  const originals = {
    setShortcut: GLOBAL_SHORTCUT.setShortcut,
    getShortcut: GLOBAL_SHORTCUT.getShortcut,
    setParam: GLOBAL_SHORTCUT.setParam,
    getParam: GLOBAL_SHORTCUT.getParam,
  };

  const nextKey = Key.fromString("ctrl shift f9");
  GLOBAL_SHORTCUT.setShortcut = () => {};
  GLOBAL_SHORTCUT.getShortcut = () => nextKey;
  GLOBAL_SHORTCUT.setParam = () => {};
  GLOBAL_SHORTCUT.getParam = () => 9;

  const panel = makeShortcutPanel();
  const item = {
    id: "setSpeed",
    shortcut: Key.fromString("ctrl s"),
    param: { speed: { value: 5 } },
  };

  try {
    panel.onShortcutChange(nextKey, item);
    assert.equal(item.shortcut, nextKey);

    panel.onParameterChange("9", item, "speed");
    assert.equal(item.param.speed.value, 9);

    GLOBAL_SHORTCUT.setShortcut = () => {
      throw new Error("conflict");
    };
    panel.onShortcutChange(nextKey, item);
    assert.equal(alerts.at(-1).level, "error");
    assert.match(alerts.at(-1).msg, /conflict/);

    GLOBAL_SHORTCUT.setParam = () => {
      throw new Error("bad param");
    };
    panel.onParameterChange("99", item, "speed");
    assert.equal(alerts.at(-1).level, "error");
  } finally {
    GLOBAL_SHORTCUT.setShortcut = originals.setShortcut;
    GLOBAL_SHORTCUT.getShortcut = originals.getShortcut;
    GLOBAL_SHORTCUT.setParam = originals.setParam;
    GLOBAL_SHORTCUT.getParam = originals.getParam;
  }
});

test("ShortcutPanel.initializeVariables / restoreToDefault", () => {
  const panel = makeShortcutPanel({ shortcuts: [] });
  const originalRestore = GLOBAL_SHORTCUT.restoreDefaultSettings;

  panel.initializeVariables();

  assert.equal(
    panel.shortcuts.length,
    Object.keys(GLOBAL_SHORTCUT.shortcutConfig).length,
  );
  assert.ok(panel.shortcuts.every((item) => item.shortcut instanceof Key));

  let restored = 0;
  GLOBAL_SHORTCUT.restoreDefaultSettings = () => {
    restored++;
  };

  try {
    panel.restoreToDefault();
  } finally {
    GLOBAL_SHORTCUT.restoreDefaultSettings = originalRestore;
  }

  assert.equal(restored, 1);
  assert.equal(ShortcutPanel.computed.panelStateId.call(panel), "shortcuts");
});
