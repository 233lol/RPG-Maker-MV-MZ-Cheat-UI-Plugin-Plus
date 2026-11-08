import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

// 单独一个文件是为了在模块第一次读取设置之前准备好会抛错的 localStorage，
// 从而覆盖 PanelState 的读 / 写失败降级分支（模块级 cache 会在第一次读取后缓存）。
const calls = [];

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
};
globalThis.localStorage = {
  getItem(key) {
    calls.push(["get", key]);
    throw new Error("read failed");
  },
  setItem(key, value) {
    calls.push(["set", key, value]);
    throw new Error("write failed");
  },
};

const { flushPanelState, loadPanelState, savePanelState } =
  await import("../../cheat-engine/www/cheat/js/PanelState.js");

const originalWarn = console.warn;
const warnings = [];

beforeEach(() => {
  console.warn = (...args) => warnings.push(args);
});

afterEach(() => {
  console.warn = originalWarn;
  warnings.length = 0;
});

test("PanelState：没有缓存时 flush 不访问存储", () => {
  calls.length = 0;

  assert.doesNotThrow(() => flushPanelState());
  assert.deepEqual(calls, []);
});

test("PanelState：读取存储抛错时按默认值处理并记录警告", () => {
  calls.length = 0;

  const state = loadPanelState("unit-error-panel", {
    search: "",
    pagination: { page: 1 },
  });

  assert.deepEqual(state, { search: "", pagination: { page: 1 } });
  assert.equal(
    calls.some(([action]) => action === "get"),
    true,
    "应该尝试读取存储",
  );
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /读取面板状态失败/);
});

test("PanelState：写入存储抛错时不抛出，只记录警告", () => {
  calls.length = 0;
  warnings.length = 0;

  savePanelState("unit-write-error", { search: "abc" });

  assert.doesNotThrow(() => flushPanelState());
  assert.equal(
    calls.some(([action]) => action === "set"),
    true,
    "应该尝试写入存储",
  );
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /写入面板状态失败/);
});

test("PanelState：状态无法序列化时保留原值且不抛错", () => {
  warnings.length = 0;

  const circular = { search: "loop" };
  circular.self = circular;

  assert.doesNotThrow(() => savePanelState("unit-circular-state", circular));
  assert.doesNotThrow(() => flushPanelState());

  assert.equal(warnings.length >= 1, true);
});

test("PanelState：默认值为 null 时原样保留", () => {
  savePanelState("unit-null-fallback", {});

  assert.deepEqual(loadPanelState("unit-null-fallback", { extra: null }), {
    extra: null,
  });

  // 清掉防抖定时器，避免它在测试结束后才触发
  flushPanelState();
});
