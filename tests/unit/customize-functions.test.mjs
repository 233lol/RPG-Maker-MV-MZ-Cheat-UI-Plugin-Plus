import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

// CheatHelper 在模块加载时会启动重试定时器。测试只验证 TouchInput 包装，
// 不需要真的跑这些定时器，用假定时器吞掉，避免测试进程留下活跃 handle。
function installFakeTimers() {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timers = new Map();
  let nextId = 1;

  globalThis.setInterval = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, ms });
    return id;
  };
  globalThis.clearInterval = (id) => timers.delete(id);

  return {
    restore() {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    },
  };
}

const bootstrapTimers = installFakeTimers();
const [
  { customizeRPGMakerFunctions, clearGameInput },
  { MessageCheat },
  { setGameInputBlocked },
] = await Promise.all([
  import("../../cheat-engine/www/cheat/init/customize_functions.js"),
  import("../../cheat-engine/www/cheat/js/CheatHelper.js"),
  import("../../cheat-engine/www/cheat/js/ClickGuard.js"),
]);
bootstrapTimers.restore();

const GUARDED_METHODS = [
  "_onMouseDown",
  "_onTouchStart",
  "_onTouchMove",
  "_onTouchEnd",
  "_onTouchCancel",
  "_onPointerDown",
  "_onPointerMove",
  "_onPointerUp",
  "_onPointerCancel",
];

const cheatTarget = {
  tagName: "DIV",
  closest(selector) {
    return selector === "#cheat-modal" ? {} : null;
  },
};

const gameTarget = {
  tagName: "CANVAS",
  closest() {
    return null;
  },
};

const editableTarget = {
  tagName: "INPUT",
  closest(selector) {
    return selector.includes("input") ? {} : null;
  },
};

function makeTouchInput() {
  const calls = [];
  const touchInput = {
    _events: { wheelX: 0, wheelY: 0 },
    _newState: { wheelX: 0, wheelY: 0 },
  };

  for (const name of GUARDED_METHODS) {
    touchInput[name] = function (event) {
      calls.push({ name, self: this, event });
      return `original:${name}`;
    };
  }

  touchInput.update = function () {
    calls.push({ name: "update", self: this });
    return "original:update";
  };

  return { touchInput, calls };
}

function makeInput() {
  const calls = [];

  const input = {
    clear() {
      calls.push({ name: "clear" });
    },
  };

  for (const name of ["_onKeyDown", "_onKeyUp", "update"]) {
    input[name] = function (event) {
      calls.push({ name, self: this, event });
      return `original:${name}`;
    };
  }

  return { input, calls };
}

let originalTouchInput;
let originalInput;
let originalUtils;
let originalInitialize;
let originalDocument;

beforeEach(() => {
  originalTouchInput = globalThis.TouchInput;
  originalInput = globalThis.Input;
  originalUtils = globalThis.Utils;
  originalInitialize = MessageCheat.initialize;
  originalDocument = globalThis.document;

  MessageCheat.initialize = () => {};
  setGameInputBlocked(false);
});

afterEach(() => {
  setGameInputBlocked(false);

  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }

  if (originalTouchInput === undefined) {
    delete globalThis.TouchInput;
  } else {
    globalThis.TouchInput = originalTouchInput;
  }

  if (originalInput === undefined) {
    delete globalThis.Input;
  } else {
    globalThis.Input = originalInput;
  }

  if (originalUtils === undefined) {
    delete globalThis.Utils;
  } else {
    globalThis.Utils = originalUtils;
  }

  MessageCheat.initialize = originalInitialize;
});

test("customizeRPGMakerFunctions：MV 摸轮事件拦截作弊 UI，正常目标照常滚动", () => {
  const { touchInput } = makeTouchInput();
  globalThis.TouchInput = touchInput;
  globalThis.Utils = { RPGMAKER_NAME: "MV" };

  customizeRPGMakerFunctions();

  assert.equal(typeof touchInput._onWheel, "function");
  assert.equal(touchInput._onWheel.__cheatTouchGuard, true);

  touchInput._onWheel.call(touchInput, {
    target: cheatTarget,
    deltaX: 3,
    deltaY: 4,
  });
  assert.equal(touchInput._events.wheelX, 0);
  assert.equal(touchInput._events.wheelY, 0);

  touchInput._onWheel.call(touchInput, {
    target: gameTarget,
    deltaX: 3,
    deltaY: 4,
  });
  assert.equal(touchInput._events.wheelX, 3);
  assert.equal(touchInput._events.wheelY, 4);
});

test("customizeRPGMakerFunctions：MZ 摸轮事件写入 _newState", () => {
  const { touchInput } = makeTouchInput();
  globalThis.TouchInput = touchInput;
  globalThis.Utils = { RPGMAKER_NAME: "MZ" };

  customizeRPGMakerFunctions();

  touchInput._onWheel.call(touchInput, {
    target: gameTarget,
    deltaX: -2,
    deltaY: 5,
  });

  assert.equal(touchInput._newState.wheelX, -2);
  assert.equal(touchInput._newState.wheelY, 5);
});

test("customizeRPGMakerFunctions：所有触摸/指针方法都包了一层，且只包一次", () => {
  const { touchInput, calls } = makeTouchInput();
  globalThis.TouchInput = touchInput;
  globalThis.Utils = { RPGMAKER_NAME: "MV" };

  customizeRPGMakerFunctions();

  const firstWrappers = new Map(
    GUARDED_METHODS.map((name) => [name, touchInput[name]]),
  );

  for (const name of GUARDED_METHODS) {
    assert.equal(touchInput[name].__cheatTouchGuard, true, name);
  }

  customizeRPGMakerFunctions();

  for (const name of GUARDED_METHODS) {
    assert.equal(
      touchInput[name],
      firstWrappers.get(name),
      `${name} 不应重复包装`,
    );
  }

  // 作弊 UI 上的事件被吞掉，正常事件带正确的 this 转给原方法
  assert.equal(
    touchInput._onMouseDown.call(touchInput, { target: cheatTarget }),
    undefined,
  );
  assert.equal(calls.length, 0);

  assert.equal(
    touchInput._onMouseDown.call(touchInput, { target: gameTarget }),
    "original:_onMouseDown",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "_onMouseDown");
  assert.equal(calls[0].self, touchInput);
});

test("customizeRPGMakerFunctions：缺失的回调直接跳过，MessageCheat 仍会初始化", () => {
  const { touchInput } = makeTouchInput();
  delete touchInput._onPointerUp;
  globalThis.TouchInput = touchInput;
  globalThis.Utils = { RPGMAKER_NAME: "MV" };

  let initializeCalls = 0;
  MessageCheat.initialize = () => {
    initializeCalls += 1;
  };

  customizeRPGMakerFunctions();

  assert.equal(touchInput._onPointerUp, undefined);
  assert.equal(initializeCalls, 1);
});

test("customizeRPGMakerFunctions：作弊菜单打开时忽略键盘 / 鼠标输入，关闭后恢复", () => {
  const { touchInput, calls: touchCalls } = makeTouchInput();
  const { input, calls: inputCalls } = makeInput();
  globalThis.TouchInput = touchInput;
  globalThis.Input = input;
  globalThis.Utils = { RPGMAKER_NAME: "MZ" };

  customizeRPGMakerFunctions();

  assert.equal(input._onKeyDown.__cheatInputGuard, true);
  assert.equal(input._onKeyUp.__cheatInputGuard, true);
  assert.equal(input.update.__cheatUpdateGuard, true);
  assert.equal(touchInput.update.__cheatUpdateGuard, true);

  setGameInputBlocked(true);

  assert.equal(
    input._onKeyDown.call(input, { target: gameTarget, keyCode: 39 }),
    undefined,
  );
  assert.equal(
    input._onKeyUp.call(input, { target: gameTarget, keyCode: 39 }),
    undefined,
  );
  assert.equal(
    touchInput._onMouseDown.call(touchInput, { target: gameTarget }),
    undefined,
  );
  assert.equal(
    touchInput._onWheel.call(touchInput, {
      target: gameTarget,
      deltaX: 1,
      deltaY: 2,
    }),
    undefined,
  );
  assert.equal(inputCalls.length, 0);
  assert.equal(touchCalls.length, 0);

  // 主循环每帧调用 update：被阻断时清空引擎输入状态，不跑原始 update
  assert.equal(input.update.call(input), undefined);
  assert.deepEqual(
    inputCalls.map((call) => call.name),
    ["clear"],
  );
  assert.equal(touchInput.update.call(touchInput), undefined);
  assert.deepEqual(
    touchCalls.map((call) => call.name),
    [],
  );
  assert.deepEqual(
    inputCalls.map((call) => call.name),
    ["clear", "clear"],
  );

  clearGameInput();
  assert.deepEqual(
    inputCalls.map((call) => call.name),
    ["clear", "clear", "clear"],
  );

  setGameInputBlocked(false);

  assert.equal(
    input._onKeyDown.call(input, { target: gameTarget }),
    "original:_onKeyDown",
  );
  assert.equal(
    touchInput._onMouseDown.call(touchInput, { target: gameTarget }),
    "original:_onMouseDown",
  );
  assert.equal(input.update.call(input), "original:update");
  assert.equal(touchInput.update.call(touchInput), "original:update");
});

test("customizeRPGMakerFunctions：输入框里的按键不传给引擎", () => {
  const { input, calls } = makeInput();
  globalThis.TouchInput = makeTouchInput().touchInput;
  globalThis.Input = input;
  globalThis.Utils = { RPGMAKER_NAME: "MV" };

  customizeRPGMakerFunctions();
  setGameInputBlocked(false);

  assert.equal(
    input._onKeyDown.call(input, { target: editableTarget, keyCode: 39 }),
    undefined,
  );
  assert.equal(calls.length, 0);

  assert.equal(
    input._onKeyDown.call(input, { target: gameTarget }),
    "original:_onKeyDown",
  );

  // 地图事件面板放行输入时，如果焦点在输入框里，主循环仍要清空
  // 引擎状态，避免方向键编辑文本时角色也跟着走。
  globalThis.document = { activeElement: editableTarget };
  assert.equal(input.update.call(input), undefined);
  assert.deepEqual(
    calls.map((call) => call.name),
    ["_onKeyDown", "clear"],
  );
});
