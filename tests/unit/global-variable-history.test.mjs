import test from "node:test";
import assert from "node:assert/strict";

import {
  HISTORY_LIMIT,
  buildAddHistoryEntry,
  buildDeleteHistoryEntry,
  buildSetHistoryEntry,
  pushHistoryEntry,
  revertHistoryEntry,
} from "../../cheat-engine/www/cheat/js/GlobalVariableHistory.js";

test("pushHistoryEntry：追加并保留最近 N 条", () => {
  const stack = [];
  const a = buildSetHistoryEntry(["x"], "a", 1, true);
  const b = buildAddHistoryEntry(["x"], "b");

  assert.deepEqual(pushHistoryEntry(stack, a), [a]);
  assert.deepEqual(pushHistoryEntry(pushHistoryEntry(stack, a), b), [a, b]);

  const many = [];
  for (let i = 0; i < HISTORY_LIMIT + 3; i++) {
    many.push(buildSetHistoryEntry([], String(i), i, true));
  }
  const limited = many.reduce(
    (result, entry) => pushHistoryEntry(result, entry),
    [],
  );

  assert.equal(limited.length, HISTORY_LIMIT);
  assert.equal(limited[0].key, "3");
  assert.equal(limited.at(-1).key, String(HISTORY_LIMIT + 2));
});

test("pushHistoryEntry：非法输入安全降级", () => {
  assert.deepEqual(pushHistoryEntry(null, null), []);
  assert.deepEqual(pushHistoryEntry(undefined, undefined), []);
  assert.deepEqual(pushHistoryEntry("bad", null), []);
});

test("revertHistoryEntry：恢复已存在的属性", () => {
  const root = { nested: { value: 2 } };
  const entry = buildSetHistoryEntry(["nested"], "value", 1, true);

  assert.deepEqual(revertHistoryEntry(root, entry), { ok: true });
  assert.equal(root.nested.value, 1);
});

test("revertHistoryEntry：原本不存在的属性撤销时删除", () => {
  const root = { nested: {} };
  const entry = buildSetHistoryEntry(["nested"], "value", undefined, false);

  assert.deepEqual(revertHistoryEntry(root, entry), { ok: true });
  assert.equal(Object.hasOwn(root.nested, "value"), false);
});

test("revertHistoryEntry：撤销新增属性 / 数组元素", () => {
  const root = { obj: { a: 1 }, arr: [1, 2, 3] };

  assert.deepEqual(
    revertHistoryEntry(root, buildAddHistoryEntry(["obj"], "b")),
    { ok: true },
  );
  assert.deepEqual(root.obj, { a: 1 });

  assert.deepEqual(revertHistoryEntry(root, buildAddHistoryEntry(["arr"], 2)), {
    ok: true,
  });
  assert.deepEqual(root.arr, [1, 2]);
});

test("revertHistoryEntry：撤销删除对象属性", () => {
  const root = { obj: { a: 1 } };
  const entry = buildDeleteHistoryEntry(["obj"], "a", 1, false);

  assert.deepEqual(revertHistoryEntry(root, entry), { ok: true });
  assert.deepEqual(root.obj, { a: 1 });
});

test("revertHistoryEntry：撤销删除数组元素时按原下标插回", () => {
  const root = { arr: [1, 3] };
  const entry = buildDeleteHistoryEntry(["arr"], "1", 2, true);

  assert.deepEqual(revertHistoryEntry(root, entry), { ok: true });
  assert.deepEqual(root.arr, [1, 2, 3]);
});

test("revertHistoryEntry：路径 / 容器失效时返回失败", () => {
  assert.equal(revertHistoryEntry({}, null).ok, false);
  assert.equal(revertHistoryEntry({}, { action: "nope" }).ok, false);

  const missing = revertHistoryEntry(
    { a: 1 },
    buildSetHistoryEntry(["missing"], "x", 1, true),
  );
  assert.equal(missing.ok, false);
  assert.match(missing.message, /undefined|not|read/i);

  const primitive = revertHistoryEntry(
    { value: 1 },
    buildSetHistoryEntry(["value"], "x", 1, true),
  );
  assert.equal(primitive.ok, false);
});

test("revertHistoryEntry：保留复杂旧值的引用", () => {
  const oldValue = { nested: [1, 2] };
  const root = { value: "changed" };

  revertHistoryEntry(root, buildSetHistoryEntry([], "value", oldValue, true));

  assert.equal(root.value, oldValue);
});
