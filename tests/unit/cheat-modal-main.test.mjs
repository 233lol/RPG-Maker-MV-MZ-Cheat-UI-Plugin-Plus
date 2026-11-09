import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.Utils = {
  isNwjs: () => false,
  RPGMAKER_NAME: "MZ",
};

const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

// 模块加载阶段 CheatHelper 会注册 500ms 重试定时器，测试里不需要真的运行。
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};

const { GeneralCheat, MessageCheat } =
  await import("../../cheat-engine/www/cheat/js/CheatHelper.js");
const { default: CheatModal } =
  await import("../../cheat-engine/www/cheat/CheatModal.js");
const { default: MainComponent } =
  await import("../../cheat-engine/www/cheat/MainComponent.js");
const { GLOBAL_SHORTCUT } =
  await import("../../cheat-engine/www/cheat/js/GlobalShortcut.js");
const { Key } = await import("../../cheat-engine/www/cheat/js/KeyCodes.js");
const { isGameInputBlocked, setGameInputBlocked } =
  await import("../../cheat-engine/www/cheat/js/ClickGuard.js");

globalThis.setInterval = originalSetInterval;
globalThis.clearInterval = originalClearInterval;

const originalShortcutMethods = {
  runKeyEnterEvent: GLOBAL_SHORTCUT.runKeyEnterEvent,
  runKeyRepeatEvent: GLOBAL_SHORTCUT.runKeyRepeatEvent,
  runKeyLeaveEvent: GLOBAL_SHORTCUT.runKeyLeaveEvent,
};

const originalCheatMethods = {
  toggleCheatModal: GeneralCheat.toggleCheatModal,
  openCheatModal: GeneralCheat.openCheatModal,
};

function resetGlobals() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.ResizeObserver;
  delete globalThis.TouchInput;
  delete globalThis.Input;
  Object.assign(GLOBAL_SHORTCUT, originalShortcutMethods);
  Object.assign(GeneralCheat, originalCheatMethods);
  setGameInputBlocked(false);
}

beforeEach(resetGlobals);
afterEach(resetGlobals);

function applyComputed(target, definition) {
  for (const [name, getter] of Object.entries(definition.computed || {})) {
    Object.defineProperty(target, name, {
      configurable: true,
      get() {
        return getter.call(this);
      },
    });
  }

  return target;
}

function makeModal(overrides = {}) {
  return applyComputed(
    {
      ...CheatModal.methods,
      ...CheatModal.data.call({ modelValue: "general-panel" }),
      $refs: {},
      $emit() {},
      ...overrides,
    },
    CheatModal,
  );
}

function makeMain(overrides = {}) {
  return {
    ...MainComponent.methods,
    currentKey: Key.createEmpty(),
    show: false,
    currentComponentName: "general-panel",
    get shouldBlockGameInput() {
      return this.show && this.currentComponentName !== "map-event-panel";
    },
    $refs: {},
    $nextTick(callback) {
      this.tick = callback;
    },
    $emit() {},
    ...overrides,
  };
}

function targetMatching(predicate) {
  return {
    closest(selector) {
      return predicate(selector) ? {} : null;
    },
  };
}

/* ------------------------------------------------------------------- CheatModal */

test("CheatModal：cardStyle 与组件名到导航项的映射", () => {
  const panel = makeModal({
    geometry: { x: 10, y: 20, width: 500, height: 400 },
  });

  assert.equal(CheatModal.computed.panelStateId.call(panel), "cheat-window");
  assert.deepEqual(CheatModal.computed.cardStyle.call(panel), {
    left: "10px",
    top: "20px",
    width: "500px",
    height: "400px",
  });

  const map = CheatModal.computed.componentNameToNavItem.call(panel);

  assert.equal(map["general-panel"].component, "general-panel");
  assert.equal(map["save-backup-panel"].component, "save-backup-panel");
  assert.equal(map["shortcut-panel"].component, "shortcut-panel");
  assert.equal(
    Object.values(map).length,
    panel.navTreeItems.reduce(
      (sum, item) => sum + (item.children ? item.children.length : 1),
      0,
    ),
  );
});

test("CheatModal：根节点 / 聚焦 / 几何信息收敛", () => {
  const focused = [];
  const element = {
    focus(options) {
      focused.push(options);
    },
  };
  const panel = makeModal({
    $refs: { cardRoot: { $el: element } },
    geometry: { x: 0, y: 0, width: 500, height: 400 },
  });

  assert.equal(panel.getRootElement(), element);
  panel.focusModal();
  assert.deepEqual(focused, [{ preventScroll: true }]);

  panel.$refs = { cardRoot: element };
  assert.equal(panel.getRootElement(), element);
  panel.$refs = {};
  assert.equal(panel.getRootElement(), undefined);

  assert.deepEqual(panel.clampGeometry({ x: -10, y: -10 }), {
    x: 0,
    y: 0,
    width: 480,
    height: 320,
  });

  panel.updateGeometry({ x: 100, y: 200 });
  assert.equal(panel.geometry.x, 100);
  assert.equal(panel.geometry.y, 200);

  // 未变化的几何信息保持原对象引用
  const before = panel.geometry;
  panel.updateGeometry({ x: 100, y: 200 });
  assert.equal(panel.geometry, before);

  panel.updateGeometry({ x: 99999, y: 99999 });
  assert.equal(panel.geometry.x, 1280 - panel.geometry.width);
  assert.equal(panel.geometry.y, 800 - panel.geometry.height);

  assert.doesNotThrow(() => panel.onViewportResize());
});

test("CheatModal.scheduleSizeSync：合并连续尺寸变化，在下一个任务写回", () => {
  const timers = [];
  let nextId = 1;

  globalThis.window = {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout() {},
  };

  const panel = makeModal({
    geometry: { x: 100, y: 100, width: 500, height: 400 },
  });

  panel.scheduleSizeSync(600, 500);
  panel.scheduleSizeSync(700, 600);

  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 0);
  assert.deepEqual(panel.__pendingSize, { width: 700, height: 600 });

  timers[0].fn();

  assert.equal(panel.geometry.width, 700);
  assert.equal(panel.geometry.height, 600);
  assert.equal(panel.__pendingSize, null);
  assert.equal(panel.__sizeSyncTimer, null);

  // 尺寸没有变化时不写回
  const before = panel.geometry;
  panel.scheduleSizeSync(700, 600);
  timers[1].fn();
  assert.equal(panel.geometry, before);
});

test("CheatModal：拖动更新位置，松开 / buttons=0 结束拖动", () => {
  const listeners = new Map();
  const removed = [];
  globalThis.window = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      removed.push(type);
      listeners.delete(type);
    },
  };

  const captures = [];
  const panel = makeModal({
    geometry: { x: 100, y: 100, width: 500, height: 400 },
  });

  // 没有开始拖动时收到 pointermove 不应移动窗口
  const initialGeometry = panel.geometry;
  panel.onDragMove({ buttons: 1, clientX: 999, clientY: 999 });
  assert.equal(panel.geometry, initialGeometry);

  const event = {
    button: 0,
    clientX: 120,
    clientY: 130,
    pointerId: 7,
    target: { closest: () => null },
    currentTarget: {
      setPointerCapture(id) {
        captures.push(id);
      },
    },
    preventDefault() {
      this.prevented = true;
    },
  };

  panel.startDrag(event);

  assert.equal(event.prevented, true);
  assert.deepEqual(captures, [7]);
  assert.deepEqual(panel.__dragState, {
    startX: 120,
    startY: 130,
    originX: 100,
    originY: 100,
  });
  assert.equal(typeof listeners.get("pointermove"), "function");
  assert.equal(typeof listeners.get("pointerup"), "function");
  assert.equal(typeof listeners.get("pointercancel"), "function");

  panel.onDragMove({ buttons: 1, clientX: 150, clientY: 170 });
  assert.equal(panel.geometry.x, 130);
  assert.equal(panel.geometry.y, 140);

  panel.onDragMove({ buttons: 0, clientX: 999, clientY: 999 });
  assert.equal(panel.__dragState, null);
  assert.deepEqual(removed, ["pointermove", "pointerup", "pointercancel"]);

  // 关闭按钮不触发拖动
  removed.length = 0;
  panel.startDrag({
    button: 0,
    target: { closest: (selector) => (selector === "button" ? {} : null) },
    currentTarget: {},
  });
  assert.equal(panel.__dragState, null);

  // 右键不触发拖动
  panel.startDrag({
    button: 2,
    target: { closest: () => null },
  });
  assert.equal(panel.__dragState, null);

  panel.startDrag({
    event: true,
    button: 0,
    clientX: 1,
    clientY: 2,
    target: { closest: () => null },
    currentTarget: {
      setPointerCapture() {
        throw new Error("unsupported");
      },
    },
    preventDefault() {},
  });
  assert.notEqual(panel.__dragState, null);
  panel.stopDrag();
});

test("CheatModal：面板状态保存 / 恢复与导航点击", () => {
  const emitted = [];
  const panel = makeModal({
    geometry: { x: 100, y: 100, width: 500, height: 400 },
    $emit(event, value) {
      emitted.push([event, value]);
    },
  });

  assert.deepEqual(panel.getPanelStateSnapshot(), {
    geometry: { x: 100, y: 100, width: 500, height: 400 },
  });

  panel.applyPanelState({
    geometry: { x: 99999, y: -20, width: 99999, height: 10 },
  });

  assert.equal(panel.geometry.x, 1280 - panel.geometry.width);
  assert.equal(panel.geometry.y, 0);
  assert.equal(panel.geometry.width, 1280 - 8);
  assert.equal(panel.geometry.height, 320);

  panel.onNavItemClick({ component: "teleport-panel" });
  assert.deepEqual(emitted, [["update:modelValue", "teleport-panel"]]);

  // 没有 geometry 时保持原值
  const before = panel.geometry;
  panel.applyPanelState({});
  assert.equal(panel.geometry, before);
});

/* ---------------------------------------------------------------- MainComponent */

test("MainComponent.data：恢复上次面板 / 空输入状态", () => {
  const data = MainComponent.data.call({});

  assert.equal(data.show, false);
  assert.equal(Object.hasOwn(data, "localeKey"), false);
  assert.ok(data.currentKey);
  assert.equal(typeof data.currentComponentName, "string");
  assert.ok(data.currentComponentName.length > 0);
  assert.equal(data.currentComponentName.includes("-panel"), true);
});

test("MainComponent：关闭窗口直接卸载，只保留打开时的 CSS 淡入", () => {
  // 旧实现用 <v-fade-transition>，show=false 后还要等 0.3 秒 leave 动画才移除，
  // 期间窗口仍覆盖页面，看起来像「关不掉」。这里用源码断言防止回退。
  assert.doesNotMatch(MainComponent.template, /v-fade-transition/);
  assert.match(MainComponent.template, /<cheat-modal[\s\S]*v-if="show"/);

  const css = readFileSync(
    new URL("../../cheat-engine/www/cheat/css/main.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.cheat-window\s*\{[^}]*animation:\s*cheat-window-fade-in/s,
    "打开窗口时应使用 CSS 淡入动画",
  );
  assert.match(css, /@keyframes\s+cheat-window-fade-in/);
});

test("MainComponent.watch.currentComponentName：有值才写入面板状态", () => {
  assert.doesNotThrow(() =>
    MainComponent.watch.currentComponentName.call({}, null),
  );
  assert.doesNotThrow(() =>
    MainComponent.watch.currentComponentName.call({}, "teleport-panel"),
  );
});

test("MainComponent.beforeUnmount：移除全局监听并释放输入状态", () => {
  const removed = [];
  globalThis.window = {
    removeEventListener(...args) {
      removed.push(args[0]);
    },
  };
  globalThis.document = {
    removeEventListener(...args) {
      removed.push(args[0]);
    },
  };

  const panel = makeMain({
    teardownInputGuard() {
      this.guardTornDown = true;
    },
    releaseCurrentKey() {
      this.keyReleased = true;
    },
  });

  MainComponent.beforeUnmount.call(panel);

  assert.equal(panel.keyReleased, true);
  assert.equal(panel.guardTornDown, true);
  assert.ok(removed.includes("keydown"));
  assert.ok(removed.includes("keyup"));
  assert.ok(removed.includes("keypress"));
  assert.ok(removed.includes("blur"));
  assert.ok(removed.includes("focusin"));
});

test("MainComponent.openCheatModal / toggleCheatModal / closeCheatModal", () => {
  const releases = [];
  const panel = makeMain({
    releaseCurrentKey() {
      releases.push("release");
    },
    focusCheatModal() {
      this.focused = true;
    },
  });

  panel.openCheatModal("teleport-panel");
  assert.equal(panel.show, true);
  assert.equal(panel.currentComponentName, "teleport-panel");
  panel.tick();
  assert.equal(panel.focused, true);

  panel.closeCheatModal();
  assert.equal(panel.show, false);
  assert.deepEqual(releases, ["release"]);

  panel.toggleCheatModal();
  assert.equal(panel.show, true);

  panel.toggleCheatModal();
  assert.equal(panel.show, false);
  assert.deepEqual(releases, ["release", "release"]);

  panel.toggleCheatModal("save-backup-panel");
  assert.equal(panel.show, true);
  assert.equal(panel.currentComponentName, "save-backup-panel");

  // 窗口已打开时传入同一个组件 -> 关闭；传入不同组件 -> 仅切换
  panel.toggleCheatModal("save-backup-panel");
  assert.equal(panel.show, false);

  panel.toggleCheatModal("save-backup-panel");
  panel.toggleCheatModal("teleport-panel");
  assert.equal(panel.show, true);
  assert.equal(panel.currentComponentName, "teleport-panel");
});

test("MainComponent.releaseCurrentKey：有按键时补 leave，异常也不残留状态", () => {
  const calls = [];
  GLOBAL_SHORTCUT.runKeyLeaveEvent = (event, key) => {
    calls.push([event.preventDefault instanceof Function, key.asString()]);
  };

  const panel = makeMain({
    currentKey: Key.fromString("ctrl c"),
  });

  panel.releaseCurrentKey();

  assert.deepEqual(calls, [[true, "ctrl c"]]);
  assert.equal(panel.currentKey.isEmpty(), true);

  GLOBAL_SHORTCUT.runKeyLeaveEvent = () => {
    throw new Error("boom");
  };
  panel.currentKey = Key.fromString("ctrl s");
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.doesNotThrow(() => panel.releaseCurrentKey());
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(panel.currentKey.isEmpty(), true);

  // 空按键不调用 leave
  let count = calls.length;
  GLOBAL_SHORTCUT.runKeyLeaveEvent = () => {
    count++;
  };
  panel.releaseCurrentKey();
  assert.equal(count, calls.length);

  panel.onWindowBlur();
  assert.equal(panel.currentKey.isEmpty(), true);
});

test("MainComponent.focusCheatModal / onDocumentFocusIn", () => {
  const panel = makeMain({
    show: true,
    $refs: {
      cheatModal: {
        focusModal() {
          panel.focused = (panel.focused || 0) + 1;
        },
      },
    },
  });

  panel.focusCheatModal();
  assert.equal(panel.focused, 1);

  panel.onDocumentFocusIn({
    target: targetMatching(() => false),
  });
  assert.equal(panel.focused, 2);

  panel.onDocumentFocusIn({
    target: targetMatching((selector) => selector === "#cheat-modal"),
  });
  assert.equal(panel.focused, 2);

  panel.show = false;
  panel.onDocumentFocusIn({
    target: targetMatching(() => false),
  });
  assert.equal(panel.focused, 2);

  panel.focusCheatModal();
  panel.$refs = {};
  panel.focusCheatModal();
  assert.equal(panel.focused, 3);
});

test("MainComponent.setupInputGuard / teardownInputGuard", () => {
  const listeners = new Map();
  const app = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  globalThis.document = {
    getElementById: (id) => (id === "app" ? app : null),
  };

  const panel = makeMain();
  let stops = 0;

  panel.setupInputGuard();
  const guard = listeners.get("keydown");
  assert.equal(typeof guard, "function");
  assert.equal(listeners.size, 3);

  // 重复 setup 不重复监听
  panel.setupInputGuard();
  assert.equal(listeners.size, 3);

  panel.show = true;
  guard({
    stopPropagation() {
      stops++;
    },
  });
  assert.equal(stops, 1);

  // 地图事件面板需要边看地图边操作游戏，不禁用输入
  panel.currentComponentName = "map-event-panel";
  guard({ stopPropagation() {} });
  assert.equal(stops, 1);

  panel.currentComponentName = "general-panel";
  panel.show = false;
  guard({ stopPropagation() {} });
  assert.equal(stops, 1);

  panel.teardownInputGuard();
  assert.equal(listeners.size, 0);
  assert.equal(panel.__inputGuard, null);

  // 没有 #app / 没有 guard 时都是空操作
  globalThis.document = { getElementById: () => null };
  assert.doesNotThrow(() => panel.setupInputGuard());
  assert.doesNotThrow(() => panel.teardownInputGuard());
});

test("MainComponent：面板切换同步引擎输入阻断状态", () => {
  const panel = makeMain();
  const handler = MainComponent.watch.shouldBlockGameInput.handler;

  assert.equal(MainComponent.computed.shouldBlockGameInput.call(panel), false);

  panel.show = true;
  assert.equal(MainComponent.computed.shouldBlockGameInput.call(panel), true);

  handler.call(panel, true);
  assert.equal(isGameInputBlocked(), true);

  panel.currentComponentName = "map-event-panel";
  assert.equal(MainComponent.computed.shouldBlockGameInput.call(panel), false);

  handler.call(panel, false);
  assert.equal(isGameInputBlocked(), false);
});

test("MainComponent.onGlobalKeyPress：只在作弊窗口打开且焦点不在 UI 上时拦截", () => {
  const panel = makeMain();
  const calls = [];

  const event = (isUi) => ({
    target: targetMatching((selector) => isUi && selector === "#cheat-modal"),
    preventDefault: () => calls.push("prevent"),
    stopPropagation: () => calls.push("stop"),
  });

  panel.onGlobalKeyPress(event(false));
  assert.deepEqual(calls, []);

  panel.show = true;
  panel.onGlobalKeyPress(event(true));
  assert.deepEqual(calls, []);

  panel.onGlobalKeyPress(event(false));
  assert.deepEqual(calls, ["prevent", "stop"]);

  // 地图事件面板除外：不拦截游戏输入
  calls.length = 0;
  panel.currentComponentName = "map-event-panel";
  panel.onGlobalKeyPress(event(false));
  assert.deepEqual(calls, []);
});

test("MainComponent.onGlobalKeyDown：普通按键 / repeat / 输入框 / UI 焦点", () => {
  const calls = [];
  GLOBAL_SHORTCUT.runKeyEnterEvent = (event, key) =>
    calls.push(["enter", key.asString()]);
  GLOBAL_SHORTCUT.runKeyRepeatEvent = (event, key) =>
    calls.push(["repeat", key.asString()]);
  GLOBAL_SHORTCUT.runKeyLeaveEvent = (event, key) =>
    calls.push(["leave", key.asString()]);

  const panel = makeMain();
  const makeEvent = (overrides = {}) => ({
    key: "c",
    keyCode: 67,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    target: targetMatching(() => false),
    preventDefault: () => calls.push("prevent"),
    stopPropagation: () => calls.push("stop"),
    ...overrides,
  });

  panel.onGlobalKeyDown(makeEvent());

  assert.deepEqual(calls, [
    ["leave", ""],
    ["enter", "ctrl c"],
  ]);
  assert.equal(panel.currentKey.asString(), "ctrl c");

  calls.length = 0;
  panel.onGlobalKeyDown(makeEvent({ repeat: true }));
  assert.deepEqual(calls, [["repeat", "ctrl c"]]);

  // 输入框获得焦点时不响应全局快捷键
  calls.length = 0;
  panel.onGlobalKeyDown(
    makeEvent({
      target: targetMatching((selector) => selector.includes("input")),
    }),
  );
  assert.deepEqual(calls, []);

  // 焦点在作弊 UI 上时仍可触发快捷键，但不阻止事件继续冒泡
  calls.length = 0;
  panel.show = true;
  panel.onGlobalKeyDown(
    makeEvent({
      target: targetMatching((selector) => selector === "#cheat-modal"),
    }),
  );
  assert.deepEqual(calls, [
    ["leave", "ctrl c"],
    ["enter", "ctrl c"],
  ]);

  // 焦点不在作弊 UI 上时，普通面板要阻止按键继续传给游戏
  calls.length = 0;
  panel.onGlobalKeyDown(makeEvent());
  assert.deepEqual(calls, [
    ["leave", "ctrl c"],
    ["enter", "ctrl c"],
    "prevent",
    "stop",
  ]);

  // 地图事件面板打开时放行，不阻止事件
  calls.length = 0;
  panel.currentComponentName = "map-event-panel";
  panel.onGlobalKeyDown(makeEvent());
  assert.deepEqual(calls, [
    ["leave", "ctrl c"],
    ["enter", "ctrl c"],
  ]);
});

test("MainComponent.onGlobalKeyDown：target 没有 closest 时按非输入框处理", () => {
  const calls = [];
  GLOBAL_SHORTCUT.runKeyEnterEvent = (event, key) =>
    calls.push(["enter", key.asString()]);
  GLOBAL_SHORTCUT.runKeyLeaveEvent = () => calls.push(["leave"]);
  GLOBAL_SHORTCUT.runKeyRepeatEvent = () => calls.push(["repeat"]);

  const panel = makeMain();
  // 合成事件 / 游戏注入的 DOM 事件可能没有 target.closest。
  const event = {
    key: "c",
    keyCode: 67,
    target: null,
    repeat: false,
    preventDefault() {},
    stopPropagation() {},
  };

  panel.onGlobalKeyDown(event);

  assert.deepEqual(calls, [["leave"], ["enter", "c"]]);
  assert.equal(panel.currentKey.asString(), "c");
});

test("MainComponent.onGlobalKeyDown：Tab 在窗口内循环，Esc 关闭窗口", () => {
  const calls = [];
  const panel = makeMain({
    show: true,
    currentComponentName: "general-panel",
    closeCheatModal() {
      this.show = false;
      calls.push("close");
    },
    $refs: {
      cheatModal: {
        trapFocus(event) {
          calls.push(["trap", event.key]);
        },
      },
    },
  });

  const makeEvent = (key, overrides = {}) => ({
    key,
    target: targetMatching(() => false),
    preventDefault: () => calls.push("prevent"),
    stopPropagation: () => calls.push("stop"),
    ...overrides,
  });

  panel.onGlobalKeyDown(makeEvent("Tab"));
  assert.deepEqual(calls, [["trap", "Tab"], "prevent", "stop"]);

  // 弹层内 Tab 不拦截
  calls.length = 0;
  panel.onGlobalKeyDown(
    makeEvent("Tab", {
      target: targetMatching((selector) => selector.includes(".v-overlay")),
    }),
  );
  assert.deepEqual(calls, []);

  calls.length = 0;
  panel.onGlobalKeyDown(makeEvent("Escape"));
  assert.deepEqual(calls, ["close", "prevent", "stop"]);
  assert.equal(panel.show, false);

  // 弹层内 Esc 交给弹层自己处理：不关闭窗口，也不阻止事件
  panel.show = true;
  calls.length = 0;
  panel.onGlobalKeyDown(
    makeEvent("Escape", {
      target: targetMatching((selector) => selector.includes(".v-menu")),
    }),
  );
  assert.deepEqual(
    calls.filter((item) => ["prevent", "stop", "close"].includes(item)),
    [],
  );
});

test("MainComponent.onGlobalKeyUp / onWindowBlur", () => {
  const calls = [];
  GLOBAL_SHORTCUT.runKeyLeaveEvent = (event, key) =>
    calls.push(["leave", key.asString()]);

  const panel = makeMain({
    show: true,
    currentKey: Key.fromString("ctrl c"),
  });

  const event = {
    keyCode: 67,
    target: targetMatching(() => false),
    stopPropagation: () => calls.push("stop"),
  };

  panel.onGlobalKeyUp(event);

  assert.deepEqual(calls, [["leave", "ctrl c"], "stop"]);
  assert.equal(panel.currentKey.asString(), "ctrl");

  // UI 上的 keyup 不停止冒泡
  calls.length = 0;
  panel.onGlobalKeyUp({
    keyCode: 67,
    target: targetMatching((selector) => selector === "#cheat-modal"),
  });
  assert.deepEqual(calls, [["leave", "ctrl"]]);

  panel.onWindowBlur();
  assert.equal(panel.currentKey.isEmpty(), true);
});

/* ------------------------------------------------- CheatModal 生命周期 */

test("CheatModal.mounted：非法面板回退到第一个导航项并注册 resize / 聚焦", () => {
  const emitted = [];
  const listeners = [];
  let focused = 0;

  globalThis.window = {
    addEventListener(type, handler) {
      listeners.push(["add", type, handler]);
    },
    removeEventListener() {},
  };

  const modal = makeModal({
    modelValue: "missing-panel",
    componentNameToNavItem: {
      "general-panel": { component: "general-panel" },
      "teleport-panel": { component: "teleport-panel" },
    },
    $emit(event, value) {
      emitted.push([event, value]);
    },
    setupResizeObserver() {
      this.observerSetup = true;
    },
    focusModal() {
      focused++;
    },
  });

  CheatModal.mounted.call(modal);

  assert.deepEqual(emitted, [["update:modelValue", "general-panel"]]);
  assert.equal(modal.observerSetup, true);
  assert.ok(
    listeners.some(([action, type]) => action === "add" && type === "resize"),
  );
  assert.equal(focused, 1);

  // 合法面板不回退、不 emit
  emitted.length = 0;
  modal.modelValue = "teleport-panel";
  CheatModal.mounted.call(modal);
  assert.deepEqual(emitted, []);
});

test("CheatModal.beforeUnmount：清理尺寸同步定时器 / 观察者 / resize 监听", () => {
  const cleared = [];
  const removed = [];
  let disconnected = 0;
  let stopped = 0;

  globalThis.window = {
    clearTimeout(id) {
      cleared.push(id);
    },
    removeEventListener(type) {
      removed.push(type);
    },
  };

  const modal = makeModal({
    stopDrag() {
      stopped++;
    },
    __sizeSyncTimer: 42,
    __pendingSize: { width: 100, height: 200 },
    __resizeObserver: {
      disconnect() {
        disconnected++;
      },
    },
  });

  CheatModal.beforeUnmount.call(modal);

  assert.equal(stopped, 1);
  assert.deepEqual(cleared, [42]);
  assert.equal(modal.__sizeSyncTimer, null);
  assert.equal(modal.__pendingSize, null);
  assert.equal(disconnected, 1);
  assert.equal(modal.__resizeObserver, null);
  assert.deepEqual(removed, ["resize"]);
});

test("CheatModal.trapFocus：没有可聚焦元素 / 焦点在外部 / 首尾循环", () => {
  const events = [];
  const el = (name) => ({
    name,
    offsetParent: {},
    focus(options) {
      events.push([name, options]);
    },
  });
  const first = el("first");
  const middle = el("middle");
  const last = el("last");

  const root = {
    contains() {
      return false;
    },
    querySelectorAll() {
      return [first, middle, last];
    },
  };

  globalThis.document = { activeElement: middle };

  let focused = 0;
  const modal = makeModal({
    $refs: { cardRoot: { $el: root } },
    focusModal() {
      focused++;
    },
  });

  const event = () => ({
    shiftKey: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  });

  // 没有 root：直接返回
  CheatModal.methods.trapFocus.call(makeModal(), event());

  // 没有可聚焦元素：阻止默认行为并把焦点放到窗口
  root.querySelectorAll = () => [];
  let ev = event();
  modal.trapFocus(ev);
  assert.equal(ev.prevented, true);
  assert.equal(focused, 1);

  // 焦点不在窗口里：移动到首个元素
  root.querySelectorAll = () => [first, middle, last];
  root.contains = () => false;
  ev = event();
  modal.trapFocus(ev);
  assert.equal(ev.prevented, true);
  assert.deepEqual(events.at(-1), ["first", { preventScroll: true }]);

  // 焦点就是根节点：Shift+Tab -> 最后一个，Tab -> 第一个
  root.contains = (element) => element === root;
  globalThis.document.activeElement = root;
  ev = { ...event(), shiftKey: true };
  modal.trapFocus(ev);
  assert.deepEqual(events.at(-1), ["last", { preventScroll: true }]);

  ev = event();
  modal.trapFocus(ev);
  assert.deepEqual(events.at(-1), ["first", { preventScroll: true }]);

  // 焦点在第一个 + Shift+Tab -> 最后一个；在最后一个 + Tab -> 第一个
  root.contains = (element) => element === first || element === last;
  globalThis.document.activeElement = first;
  ev = { ...event(), shiftKey: true };
  modal.trapFocus(ev);
  assert.deepEqual(events.at(-1), ["last", { preventScroll: true }]);

  globalThis.document.activeElement = last;
  ev = event();
  modal.trapFocus(ev);
  assert.deepEqual(events.at(-1), ["first", { preventScroll: true }]);
});

test("CheatModal.trapFocus：焦点在中间时不拦截", () => {
  const focused = [];
  const first = { offsetParent: {}, focus: (options) => focused.push(options) };
  const middle = { offsetParent: {}, focus: () => {} };
  const last = { offsetParent: {}, focus: () => {} };

  const root = {
    contains: (element) => element === middle,
    querySelectorAll: () => [first, middle, last],
  };

  globalThis.document = { activeElement: middle };

  const modal = makeModal({ $refs: { cardRoot: root } });
  const event = {
    shiftKey: false,
    preventDefault() {
      throw new Error("不应该阻止默认行为");
    },
  };

  modal.trapFocus(event);
  assert.deepEqual(focused, []);
});

test("CheatModal.setupResizeObserver：无 API / 无根节点时安全返回", () => {
  const modal = makeModal();

  assert.doesNotThrow(() => modal.setupResizeObserver());

  globalThis.ResizeObserver = class {};
  assert.doesNotThrow(() => modal.setupResizeObserver());
  assert.equal(modal.__resizeObserver, undefined);
});

test("CheatModal.setupResizeObserver：尺寸有效且变化时才安排同步", () => {
  const observed = [];
  let callback = null;

  globalThis.ResizeObserver = class {
    constructor(handler) {
      callback = handler;
    }
    observe(element) {
      observed.push(element);
    }
  };

  const root = {
    getBoundingClientRect: () => ({ width: 640.4, height: 480.6 }),
  };
  const scheduled = [];
  const modal = makeModal({
    $refs: { cardRoot: root },
    geometry: { x: 0, y: 0, width: 500, height: 400 },
    scheduleSizeSync(width, height) {
      scheduled.push([width, height]);
    },
  });

  modal.setupResizeObserver();

  assert.deepEqual(observed, [root]);
  assert.ok(modal.__resizeObserver);

  // 空 entries / 尺寸为 0 / 尺寸未变化都不应同步
  callback([]);
  callback([
    { target: { getBoundingClientRect: () => ({ width: 0, height: 0 }) } },
  ]);
  callback([
    { target: { getBoundingClientRect: () => ({ width: 500, height: 400 }) } },
  ]);
  assert.deepEqual(scheduled, []);

  callback([{ target: root }]);
  // 四舍五入后写入，避免 CSS 小数尺寸导致布局抖动
  assert.deepEqual(scheduled, [[640, 481]]);
});

test("CheatModal.scheduleSizeSync：合并多次请求，只取下一次任务的最新尺寸", () => {
  const timers = [];
  globalThis.window = {
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
  };

  const updates = [];
  const modal = makeModal({
    geometry: { x: 0, y: 0, width: 500, height: 400 },
    updateGeometry(patch) {
      updates.push(patch);
    },
  });

  modal.scheduleSizeSync(600, 500);
  modal.scheduleSizeSync(700, 600);

  assert.equal(timers.length, 1);
  assert.deepEqual(modal.__pendingSize, { width: 700, height: 600 });

  timers[0]();

  assert.equal(modal.__sizeSyncTimer, null);
  assert.equal(modal.__pendingSize, null);
  assert.deepEqual(updates, [{ width: 700, height: 600 }]);
});

test("CheatModal.scheduleSizeSync：尺寸没变 / 请求已清空时不写回", () => {
  const timers = [];
  globalThis.window = {
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
  };

  const modal = makeModal({
    geometry: { x: 0, y: 0, width: 500, height: 400 },
    updateGeometry() {
      throw new Error("不应该写回尺寸");
    },
  });

  modal.scheduleSizeSync(500, 400);
  timers[0]();

  // 定时器执行前请求被其它路径清空
  modal.scheduleSizeSync(640, 480);
  modal.__pendingSize = null;
  timers[1]();

  assert.equal(modal.__pendingSize, null);
});

test("MainComponent.created 安装补丁 / 接管 CheatHelper / 注册监听", () => {
  const listeners = [];
  globalThis.window = {
    addEventListener(type, handler, capture) {
      listeners.push([type, handler, capture]);
    },
    removeEventListener() {},
  };
  globalThis.TouchInput = {
    _newState: { wheelX: 0, wheelY: 0 },
    _events: { wheelX: 0, wheelY: 0 },
  };

  const originalInitialized = MessageCheat.__initialized;
  MessageCheat.__initialized = true;

  const calls = [];
  const panel = {
    toggleCheatModal(name) {
      calls.push(["toggle", name]);
    },
    openCheatModal(name) {
      calls.push(["open", name]);
    },
  };

  try {
    MainComponent.created.call(panel);
  } finally {
    MessageCheat.__initialized = originalInitialized;
  }

  assert.deepEqual(
    listeners.map(([type]) => type),
    ["keydown", "keyup", "keypress", "blur"],
  );
  assert.equal(typeof GeneralCheat.toggleCheatModal, "function");
  assert.equal(typeof GeneralCheat.openCheatModal, "function");
  assert.equal(Object.hasOwn(panel, "__unsubscribeLocaleChange"), false);

  // 静态方法通过实例转发
  GeneralCheat.toggleCheatModal("x");
  GeneralCheat.openCheatModal("y");
  assert.deepEqual(calls, [
    ["toggle", "x"],
    ["open", "y"],
  ]);
});

test("MainComponent.mounted 设置输入守卫并监听 focusin", () => {
  const listeners = [];
  globalThis.document = {
    addEventListener(type, handler, capture) {
      listeners.push([type, handler, capture]);
    },
    removeEventListener() {},
  };

  const panel = {
    setupInputGuard() {
      this.guardSetup = true;
    },
  };

  MainComponent.mounted.call(panel);

  assert.equal(panel.guardSetup, true);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0][0], "focusin");
  assert.equal(listeners[0][2], true);
});
