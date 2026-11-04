import test from "node:test";
import assert from "node:assert/strict";

import { cloneObject } from "../../cheat-engine/www/cheat/js/Tools.js";

test("cloneObject：基本类型原样返回", () => {
  assert.equal(cloneObject(null), null);
  assert.equal(cloneObject(undefined), undefined);
  assert.equal(cloneObject(1), 1);
  assert.equal(cloneObject("x"), "x");
  assert.equal(cloneObject(true), true);
});

test("cloneObject：深拷贝对象与数组，不共享引用", () => {
  const source = {
    a: 1,
    nested: { b: [1, 2, { c: 3 }] },
  };

  const copy = cloneObject(source);

  assert.deepEqual(copy, source);
  assert.notEqual(copy, source);
  assert.notEqual(copy.nested, source.nested);
  assert.notEqual(copy.nested.b, source.nested.b);
  assert.notEqual(copy.nested.b[2], source.nested.b[2]);

  copy.nested.b[2].c = 99;
  assert.equal(source.nested.b[2].c, 3);
});

test("cloneObject：保留数组类型", () => {
  const copy = cloneObject([{ a: 1 }, 2]);

  assert.ok(Array.isArray(copy));
  assert.notEqual(copy[0], undefined);
  assert.notEqual(copy[0].a, undefined);
});
