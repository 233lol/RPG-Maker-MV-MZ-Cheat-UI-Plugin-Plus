import test from "node:test";
import assert from "node:assert/strict";

import {
  flushPanelState,
  loadPanelState,
  savePanelState,
} from "../../cheat-engine/www/cheat/js/PanelState.js";
import {
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
    flushPanelState();
  }
});

test("GameDataState：订阅、通知与取消订阅", () => {
  const reasons = [];
  const versions = [];
  const unsubscribe = subscribeGameData((reason, version) => {
    reasons.push(reason);
    versions.push(version);
  });

  try {
    notifyGameDataChanged("unit-test");
    notifyGameDataChanged("unit-test-2");

    assert.deepEqual(reasons, ["unit-test", "unit-test-2"]);
    assert.ok(versions[1] > versions[0], "版本号应随通知递增");
  } finally {
    unsubscribe();
  }

  notifyGameDataChanged("after-unsubscribe");
  assert.deepEqual(reasons, ["unit-test", "unit-test-2"]);
});
