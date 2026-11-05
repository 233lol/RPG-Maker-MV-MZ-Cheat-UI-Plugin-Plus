import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  flushPanelState,
  loadPanelState,
  savePanelState,
} from "../../cheat-engine/www/cheat/js/PanelState.js";

afterEach(() => {
  flushPanelState();
});

function defaults() {
  return {
    search: "",
    count: 1,
    enabled: true,
    list: ["x"],
    nested: { a: 1, b: "x" },
    items: [{ id: 1 }],
  };
}

test("loadPanelState：没有保存状态时返回默认值的深拷贝", () => {
  const template = defaults();
  const state = loadPanelState("unit-missing-panel", template);

  assert.deepEqual(state, template);
  assert.notEqual(state, template);
  assert.notEqual(state.list, template.list);
  assert.notEqual(state.nested, template.nested);
  assert.notEqual(state.items, template.items);
  assert.notEqual(state.items[0], template.items[0]);
});

test("loadPanelState：逐字段按默认值类型收敛", () => {
  const panelId = "unit-sanitize-panel";

  savePanelState(panelId, {
    search: 42,
    count: "bad",
    enabled: "yes",
    list: "not-array",
    nested: { a: "bad", b: 2 },
    items: [{ id: "bad" }, null],
    unknown: "ignored",
  });

  const state = loadPanelState(panelId, defaults());

  assert.deepEqual(state, {
    search: "",
    count: 1,
    enabled: true,
    list: ["x"],
    nested: { a: 1, b: "x" },
    items: [{ id: 1 }, { id: 1 }],
  });
});

test("loadPanelState：非对象状态回退到默认值", () => {
  savePanelState("unit-array-state", ["bad"]);
  assert.deepEqual(loadPanelState("unit-array-state", defaults()), defaults());

  savePanelState("unit-string-state", "bad");
  assert.deepEqual(loadPanelState("unit-string-state", defaults()), defaults());
});

test("loadPanelState：NaN / Infinity 经过持久化后退回默认值", () => {
  savePanelState("unit-nan-state", {
    count: Number.NaN,
    enabled: true,
    search: "ok",
  });

  const state = loadPanelState("unit-nan-state", defaults());

  assert.equal(state.count, 1);
  assert.equal(state.search, "ok");
});

test("savePanelState：空面板 id 不写入，flush 可重复调用", () => {
  savePanelState("", { search: "ignored" });
  savePanelState(null, { search: "ignored" });

  assert.deepEqual(loadPanelState("", defaults()), defaults());
  assert.doesNotThrow(() => {
    flushPanelState();
    flushPanelState();
  });
});
