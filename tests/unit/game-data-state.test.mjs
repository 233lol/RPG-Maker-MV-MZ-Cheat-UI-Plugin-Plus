import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  installGameDataHooks,
  notifyGameDataChanged,
  subscribeGameData,
} from "../../cheat-engine/www/cheat/js/GameDataState.js";

const GLOBALS = ["DataManager", "BattleManager", "Scene_Map"];

function clearGlobals() {
  for (const name of GLOBALS) {
    delete globalThis[name];
  }
}

afterEach(clearGlobals);

test("installGameDataHooks：包装存档 / 战斗 / 地图加载并通知原因", () => {
  const calls = [];

  globalThis.DataManager = {
    setupNewGame() {
      calls.push("setupNewGame");
      return "new";
    },
    extractSaveContents() {
      calls.push("extractSaveContents");
      return "loaded";
    },
    notAFunction: 1,
  };
  globalThis.BattleManager = {
    endBattle() {
      calls.push("endBattle");
      return "ended";
    },
  };
  globalThis.Scene_Map = class Scene_Map {};
  globalThis.Scene_Map.prototype.onMapLoaded = function () {
    calls.push("onMapLoaded");
    return "map";
  };

  const reasons = [];
  const unsubscribe = subscribeGameData((reason) => reasons.push(reason));

  try {
    assert.equal(installGameDataHooks(), true);

    assert.equal(globalThis.DataManager.setupNewGame(), "new");
    assert.equal(globalThis.DataManager.extractSaveContents(), "loaded");
    assert.equal(globalThis.BattleManager.endBattle(), "ended");
    assert.equal(new globalThis.Scene_Map().onMapLoaded(), "map");

    assert.deepEqual(calls, [
      "setupNewGame",
      "extractSaveContents",
      "endBattle",
      "onMapLoaded",
    ]);
    assert.deepEqual(reasons, [
      "new-game",
      "load-game",
      "battle-end",
      "map-loaded",
    ]);
  } finally {
    unsubscribe();
  }
});

test("installGameDataHooks：重复安装不会重复通知", () => {
  let count = 0;

  globalThis.DataManager = {
    setupNewGame() {
      count++;
    },
  };

  const reasons = [];
  const unsubscribe = subscribeGameData((reason) => reasons.push(reason));

  try {
    installGameDataHooks();
    installGameDataHooks();
    installGameDataHooks();

    globalThis.DataManager.setupNewGame();

    assert.equal(count, 1);
    assert.deepEqual(reasons, ["new-game"]);
  } finally {
    unsubscribe();
  }
});

test("installGameDataHooks：引擎对象缺失时返回 false，之后可补装", () => {
  clearGlobals();

  assert.equal(installGameDataHooks(), false);

  let notified = 0;
  const unsubscribe = subscribeGameData(() => notified++);

  try {
    globalThis.DataManager = { setupNewGame() {} };
    assert.equal(installGameDataHooks(), true);

    globalThis.DataManager.setupNewGame();
    assert.equal(notified, 1);
  } finally {
    unsubscribe();
  }
});

test("subscribeGameData：非函数监听器安全忽略；取消订阅后不再通知", () => {
  const noop = subscribeGameData(null);
  assert.equal(typeof noop, "function");
  noop();

  const reasons = [];
  const unsubscribe = subscribeGameData((reason) => reasons.push(reason));

  notifyGameDataChanged();
  notifyGameDataChanged("manual-test");

  unsubscribe();
  notifyGameDataChanged("after-unsubscribe");

  assert.deepEqual(reasons, ["manual", "manual-test"]);
});

test("notifyGameDataChanged：单个监听器抛错不影响其它监听器", () => {
  const reasons = [];
  const originalWarn = console.warn;
  const warnings = [];

  console.warn = (...args) => warnings.push(args);

  const unsubscribeBad = subscribeGameData(() => {
    throw new Error("listener boom");
  });
  const unsubscribeGood = subscribeGameData((reason) => reasons.push(reason));

  try {
    assert.doesNotThrow(() => notifyGameDataChanged("resilient"));
    assert.deepEqual(reasons, ["resilient"]);
    assert.equal(warnings.length, 1);
  } finally {
    unsubscribeBad();
    unsubscribeGood();
    console.warn = originalWarn;
  }
});
