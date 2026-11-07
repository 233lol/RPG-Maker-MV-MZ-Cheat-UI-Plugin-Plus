import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ENUMERATED_KEYS,
  createEntry,
  deleteChildValue,
  getChildValue,
  getContainerKeys,
  isTraversableContainer,
  setChildValue,
  toJsonText,
} from "../../cheat-engine/www/cheat/js/global-object/edit.js";

test("getContainerKeys：空值与普通对象", () => {
  assert.deepEqual(getContainerKeys(null), []);
  assert.deepEqual(getContainerKeys(undefined), []);

  const inherited = Object.create({ inherited: true });
  inherited.own = 1;
  Object.defineProperty(inherited, "hidden", {
    value: 2,
    enumerable: false,
  });

  assert.deepEqual(getContainerKeys(inherited), ["own"]);
});

test("getContainerKeys：数组按元素返回，超大数组只生成上限个下标", () => {
  assert.deepEqual(getContainerKeys([1, 2, 3]), ["0", "1", "2"]);

  const sparse = [1, 2, 3];
  delete sparse[1];
  assert.deepEqual(getContainerKeys(sparse), ["0", "2"]);

  const keys = getContainerKeys(Array.from({ length: 20 }), 5);
  assert.deepEqual(keys, ["0", "1", "2", "3", "4"]);

  assert.deepEqual(getContainerKeys([1, 2], 0), ["0", "1"]);
  assert.deepEqual(getContainerKeys([1, 2], -1), ["0", "1"]);
  assert.deepEqual(getContainerKeys([1, 2], Number.NaN), ["0", "1"]);
});

test("getContainerKeys：非法 limit 退回默认上限", () => {
  const value = { a: 1 };
  assert.deepEqual(getContainerKeys(value, Number.POSITIVE_INFINITY), ["a"]);
  assert.ok(MAX_ENUMERATED_KEYS > 0);
});

test("isTraversableContainer：普通对象 / 数组可进入，原生宿主对象不可进入", () => {
  assert.equal(isTraversableContainer({}), true);
  assert.equal(isTraversableContainer([]), true);
  assert.equal(isTraversableContainer(Object.create(null)), true);

  class Custom {}
  assert.equal(isTraversableContainer(new Custom()), true);

  assert.equal(isTraversableContainer(new Date()), false);
  assert.equal(isTraversableContainer(new Map()), false);
  assert.equal(isTraversableContainer(new Set()), false);
});

test("getChildValue：属性 getter 抛错时返回错误信息", () => {
  assert.deepEqual(getChildValue({ a: 1 }, "a"), { ok: true, value: 1 });

  const broken = {
    get bad() {
      throw new Error("getter exploded");
    },
  };

  const result = getChildValue(broken, "bad");
  assert.equal(result.ok, false);
  assert.match(result.message, /getter exploded/);
});

test("setChildValue：写入普通属性，拒绝原型相关键名", () => {
  const target = {};

  assert.deepEqual(setChildValue(target, "a", 1), { ok: true });
  assert.equal(target.a, 1);

  for (const key of ["__proto__", "constructor", "prototype"]) {
    const result = setChildValue(target, key, "x");
    assert.equal(result.ok, false, key);
    assert.match(result.message, new RegExp(key));
  }

  const frozen = Object.freeze({ a: 1 });
  const failed = setChildValue(frozen, "a", 2);
  assert.equal(failed.ok, false);
});

test("deleteChildValue：对象删除与数组 splice", () => {
  const object = { a: 1, b: 2 };
  assert.deepEqual(deleteChildValue(object, "a"), { ok: true });
  assert.deepEqual(object, { b: 2 });

  const array = [1, 2, 3];
  assert.deepEqual(deleteChildValue(array, "1"), { ok: true });
  assert.deepEqual(array, [1, 3]);

  for (const key of ["-1", "9", "1.5", "x"]) {
    const result = deleteChildValue([1, 2, 3], key);
    assert.equal(result.ok, false, key);
    assert.match(result.message, /下标/);
  }

  assert.equal(deleteChildValue(array, "constructor").ok, false);
});

test("createEntry：可编辑值 / 容器 / 数组下标 / 根节点", () => {
  const number = createEntry({ a: 42 }, "a");
  assert.equal(number.kind, "number");
  assert.equal(number.valueText, "42");
  assert.equal(number.isEditable, true);
  assert.equal(number.isContainer, false);
  assert.equal(number.isIndex, false);
  assert.equal(number.isRoot, false);

  const object = createEntry({ a: { b: 1 } }, "a", true);
  assert.equal(object.kind, "object");
  assert.equal(object.isContainer, true);
  assert.equal(object.isEditable, false);
  assert.equal(object.isRoot, true);
  assert.equal(object.preview, "对象(1 个属性)");

  const array = createEntry([true], "0");
  assert.equal(array.kind, "boolean");
  assert.equal(array.boolValue, true);
  assert.equal(array.isIndex, true);

  const symbol = createEntry({ a: Symbol("s") }, "a");
  assert.equal(symbol.kind, "symbol");
  assert.equal(symbol.isEditable, false);
});

test("createEntry：读取失败时返回 error 行而不是抛错", () => {
  const broken = {
    get bad() {
      throw new Error("cannot read");
    },
  };

  const entry = createEntry(broken, "bad");
  assert.equal(entry.kind, "error");
  assert.equal(entry.preview, "cannot read");
  assert.equal(entry.isContainer, false);
  assert.equal(entry.isEditable, false);
});

test("toJsonText：BigInt / 函数 / 循环引用 / undefined", () => {
  const bigint = toJsonText({ value: 10n });
  assert.equal(bigint.ok, true);
  assert.deepEqual(JSON.parse(bigint.text), { value: "10" });

  const withFunction = toJsonText({ a: 1, fn: () => 1 });
  assert.equal(withFunction.ok, true);
  assert.deepEqual(JSON.parse(withFunction.text), { a: 1 });

  const circular = {};
  circular.self = circular;
  const failed = toJsonText(circular);
  assert.equal(failed.ok, false);
  assert.match(failed.message, /循环引用/);

  assert.equal(toJsonText(undefined).ok, false);
  assert.equal(toJsonText(() => 1).ok, false);
  assert.equal(toJsonText(null).text, "null");
});

test("getContainerKeys returns collected keys when enumeration throws", () => {
  const root = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("cannot enumerate");
      },
    },
  );

  assert.deepEqual(getContainerKeys(root), []);
});

test("isTraversableContainer handles constructor access and proxy failures", () => {
  const proto = Object.create(null);
  Object.defineProperty(proto, "constructor", {
    configurable: true,
    get() {
      throw new Error("constructor getter broken");
    },
  });

  const value = Object.create(proto);
  assert.equal(isTraversableContainer(value), true);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.equal(isTraversableContainer(revoked.proxy), false);
});

test("deleteChildValue reports delete failures", () => {
  const container = new Proxy(
    {},
    {
      deleteProperty() {
        throw new Error("delete blocked");
      },
    },
  );

  const result = deleteChildValue(container, "a");
  assert.equal(result.ok, false);
  assert.match(result.message, /delete blocked/);
});
