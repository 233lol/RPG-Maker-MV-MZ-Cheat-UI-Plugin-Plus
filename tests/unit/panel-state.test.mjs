import test from "node:test";
import assert from "node:assert/strict";

import {
  flushPanelState,
  loadPanelState,
  resetPanelState,
  savePanelState,
} from "../../cheat-engine/www/cheat/js/PanelState.js";
import {
  getGameDataVersion,
  notifyGameDataChanged,
  subscribeGameData,
} from "../../cheat-engine/www/cheat/js/GameDataState.js";

test("PanelState：无存储时返回默认值，并做深拷贝", () => {
  const defaults = {
    search: "",
    excludeNameless: true,
    pagination: { page: 1, itemsPerPage: 5 },
  };

  const state = loadPanelState("unit-test-panel", defaults);

  assert.deepEqual(state, defaults);
  assert.notEqual(state, defaults);
  assert.notEqual(state.pagination, defaults.pagination);
});

test("PanelState：保存后可以读回，并清理防抖定时器", () => {
  const panelId = "unit-test-panel-save";

  const defaults = {
    search: "",
    excludeNameless: true,
    pagination: { page: 1, itemsPerPage: 5 },
  };

  try {
    savePanelState(panelId, {
      search: "abc",
      excludeNameless: false,
      pagination: { page: 2, itemsPerPage: 10 },
    });

    assert.deepEqual(loadPanelState(panelId, defaults), {
      search: "abc",
      excludeNameless: false,
      pagination: { page: 2, itemsPerPage: 10 },
    });
  } finally {
    resetPanelState(panelId);
    flushPanelState();
  }
});

test("GameDataState：订阅、通知与取消订阅", () => {
  const reasons = [];
  const unsubscribe = subscribeGameData((reason) => reasons.push(reason));

  try {
    const before = getGameDataVersion();
    notifyGameDataChanged("unit-test");

    assert.deepEqual(reasons, ["unit-test"]);
    assert.equal(getGameDataVersion(), before + 1);
  } finally {
    unsubscribe();
  }

  notifyGameDataChanged("after-unsubscribe");
  assert.deepEqual(reasons, ["unit-test"]);
});
