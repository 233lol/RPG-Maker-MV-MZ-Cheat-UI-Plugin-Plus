import test from "node:test";
import assert from "node:assert/strict";

import {
  flushPanelState,
  loadPanelState,
  panelStateMixin,
  savePanelState,
} from "../../cheat-engine/www/cheat/js/PanelState.js";

function makePanel(overrides = {}) {
  return {
    ...panelStateMixin.methods,
    panelStateId: "unit-panel-mixin",
    state: {
      search: "",
      pagination: { page: 1, itemsPerPage: 5 },
    },
    ...overrides,
  };
}

test("panelStateMixin：默认快照为空、默认恢复按字段写回", () => {
  const panel = makePanel();

  assert.deepEqual(panel.getPanelStateSnapshot(), {});

  panel.search = "old";
  panel.pagination = { page: 1, itemsPerPage: 5 };
  panel.applyPanelState({
    search: "剑",
    pagination: { page: 3, itemsPerPage: 10 },
  });

  assert.equal(panel.search, "剑");
  assert.deepEqual(panel.pagination, { page: 3, itemsPerPage: 10 });

  // null / undefined 不应让默认实现抛错
  assert.doesNotThrow(() => panel.applyPanelState(null));
});

test("panelStateMixin.mounted：恢复持久化状态、注册监听并在 nextTick 清除恢复标记", () => {
  const panelId = "unit-panel-mixin-restore";

  savePanelState(panelId, {
    search: "恢复值",
    pagination: { page: 2, itemsPerPage: 10 },
  });

  let applied = null;
  let watcher = null;
  let tickCallback = null;

  const panel = makePanel({
    panelStateId: panelId,
    getPanelStateSnapshot() {
      return this.state;
    },
    applyPanelState(state) {
      applied = state;
    },
    $nextTick(callback) {
      tickCallback = callback;
    },
    $watch(source, callback, options) {
      watcher = { source, callback, options };
      return () => {
        panel.unwatched = true;
      };
    },
  });

  panelStateMixin.mounted.call(panel);

  assert.deepEqual(applied, {
    search: "恢复值",
    pagination: { page: 2, itemsPerPage: 10 },
  });
  assert.equal(panel.__restoringPanelState, true);
  assert.equal(typeof watcher.source, "function");
  assert.deepEqual(watcher.options, { deep: true });
  assert.equal(typeof panel.__panelStateUnwatch, "function");

  tickCallback();
  assert.equal(panel.__restoringPanelState, false);

  watcher.callback({
    search: "新搜索",
    pagination: { page: 4, itemsPerPage: 20 },
  });

  assert.deepEqual(loadPanelState(panelId, panel.state), {
    search: "新搜索",
    pagination: { page: 4, itemsPerPage: 20 },
  });

  panelStateMixin.beforeUnmount.call(panel);

  assert.equal(panel.unwatched, true);
  assert.equal(panel.__panelStateUnwatch, null);
});

test("panelStateMixin.mounted：没有 panelStateId 时不恢复也不监听", () => {
  let watched = false;

  const panel = makePanel({
    panelStateId: "",
    $watch() {
      watched = true;
      return () => {};
    },
  });

  panelStateMixin.mounted.call(panel);

  assert.equal(watched, false);
  assert.equal(panel.__panelStateUnwatch, undefined);
});

test("panelStateMixin.mounted：恢复过程中抛错也会在 nextTick 清除标记", () => {
  savePanelState("unit-panel-mixin-error", { search: "x" });

  let tickCallback = null;

  const panel = makePanel({
    panelStateId: "unit-panel-mixin-error",
    getPanelStateSnapshot() {
      return { search: "" };
    },
    applyPanelState() {
      throw new Error("apply failed");
    },
    $nextTick(callback) {
      tickCallback = callback;
    },
    $watch() {
      return () => {};
    },
  });

  assert.throws(() => panelStateMixin.mounted.call(panel), /apply failed/);
  assert.equal(panel.__restoringPanelState, true);

  tickCallback();
  assert.equal(panel.__restoringPanelState, false);

  panelStateMixin.beforeUnmount.call(panel);
});

test("panelStateMixin.beforeUnmount：没有监听器时也能安全卸载并落盘", () => {
  const panel = makePanel({ panelStateId: "unit-panel-mixin-unmount" });

  assert.doesNotThrow(() => panelStateMixin.beforeUnmount.call(panel));
  assert.doesNotThrow(() => flushPanelState());
});
