import test from "node:test";
import assert from "node:assert/strict";

// GlobalShortcut 在模块加载时就会读取 Utils / 设置文件，
// 先准备一个浏览器环境，避免 Node 下直接 ReferenceError。
globalThis.Utils = {
  isNwjs: () => false,
  RPGMAKER_NAME: "MZ",
};

const { isInValueInRange } =
  await import("../../cheat-engine/www/cheat/js/GlobalShortcut.js");

test("isInValueInRange：合法整数返回 false", () => {
  assert.equal(isInValueInRange(1, 1, 20), false);
  assert.equal(isInValueInRange(20, 1, 20), false);
  assert.equal(isInValueInRange("10", 1, 20), false);
  assert.equal(isInValueInRange(0, 0, 0), false);
});

test("isInValueInRange：非整数返回类型错误文案", () => {
  for (const value of ["abc", "1.5", 1.5, Number.NaN, undefined]) {
    const message = isInValueInRange(value, 1, 20);
    assert.equal(typeof message, "string", String(value));
    assert.match(message, /数字|number/i, String(value));
  }
});

test("isInValueInRange：空字符串 / null 按 0 处理并判越界", () => {
  assert.match(isInValueInRange("", 1, 20), /1|20/);
  assert.match(isInValueInRange(null, 1, 20), /1|20/);
});

test("isInValueInRange：越界返回范围错误文案", () => {
  assert.match(isInValueInRange(0, 1, 20), /1|20/);
  assert.match(isInValueInRange(21, 1, 20), /1|20/);
  assert.match(isInValueInRange(-5, 0, 3), /0|3/);
});

test("isInValueInRange：布尔值按数字处理", () => {
  assert.equal(isInValueInRange(true, 1, 20), false);
  assert.match(isInValueInRange(false, 1, 20), /1|20/);
});
