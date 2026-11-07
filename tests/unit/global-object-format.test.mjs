import test from "node:test";
import assert from "node:assert/strict";

import {
  formatValuePreview,
  formatValueText,
  getKindIcon,
  getKindText,
  getValueKind,
  isContainerKind,
  isEditableKind,
  isHiddenKind,
  parseValueByKind,
} from "../../cheat-engine/www/cheat/js/global-object/format.js";

test("getValueKind：覆盖基础类型与特殊对象", () => {
  assert.equal(getValueKind(null), "null");
  assert.equal(getValueKind(undefined), "undefined");
  assert.equal(getValueKind(1), "number");
  assert.equal(getValueKind("x"), "string");
  assert.equal(getValueKind(true), "boolean");
  assert.equal(getValueKind(10n), "bigint");
  assert.equal(getValueKind(Symbol("s")), "symbol");
  assert.equal(
    getValueKind(() => {}),
    "function",
  );
  assert.equal(getValueKind([]), "array");
  assert.equal(getValueKind({}), "object");
  assert.equal(getValueKind(new Date()), "date");
  assert.equal(getValueKind(/x/), "regexp");
  assert.equal(getValueKind(new Map()), "map");
  assert.equal(getValueKind(new Set()), "set");
});

test("getValueKind：被 revoke 的 Proxy 兜底为 object", () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();

  assert.equal(getValueKind(proxy), "object");
  assert.equal(formatValuePreview(proxy, "object"), "对象(0 个属性)");
});

test("类型判定：只有对象 / 数组可进入，函数隐藏", () => {
  assert.equal(isContainerKind("object"), true);
  assert.equal(isContainerKind("array"), true);
  assert.equal(isContainerKind("map"), false);

  for (const kind of [
    "number",
    "string",
    "boolean",
    "null",
    "undefined",
    "bigint",
  ]) {
    assert.equal(isEditableKind(kind), true, kind);
  }

  for (const kind of ["object", "array", "date", "map", "set", "function"]) {
    assert.equal(isEditableKind(kind), false, kind);
  }

  assert.equal(isHiddenKind("function"), true);
  assert.equal(isHiddenKind("object"), false);
});

test("getKindText / getKindIcon：已知类型翻译，未知类型回显", () => {
  assert.equal(getKindText("number"), "数字");
  assert.equal(getKindText("array"), "数组");
  assert.equal(getKindText("null"), "null");
  assert.equal(getKindText("map"), "Map");
  assert.equal(getKindText("something-else"), "something-else");

  assert.equal(getKindIcon("number"), "mdi-numeric");
  assert.equal(getKindIcon("object"), "mdi-folder");
  assert.equal(getKindIcon("unknown"), "mdi-help");
});

test("formatValuePreview：字符串 / 数字 / 容器计数", () => {
  assert.equal(formatValuePreview("abc", "string"), '"abc"');
  assert.equal(formatValuePreview(42, "number"), "42");
  assert.equal(formatValuePreview(true, "boolean"), "true");
  assert.equal(formatValuePreview(null, "null"), "null");
  assert.equal(formatValuePreview(undefined, "undefined"), "undefined");
  assert.equal(formatValuePreview(5n, "bigint"), "5");

  assert.equal(formatValuePreview([1, 2, 3], "array"), "数组(3 项)");
  assert.equal(formatValuePreview({ a: 1, b: 2 }, "object"), "对象(2 个属性)");
  assert.equal(formatValuePreview(new Map([["a", 1]]), "map"), "Map(1 项)");
  assert.equal(formatValuePreview(new Set([1, 2]), "set"), "Set(2 项)");
});

test("formatValuePreview：超长字符串截断并保留引号", () => {
  const text = "x".repeat(200);
  const preview = formatValuePreview(text, "string");

  assert.equal(preview.length, 163);
  assert.ok(preview.startsWith('"xxx'));
  assert.ok(preview.endsWith('"…'));
});

test("formatValuePreview：日期 / 正则 / 函数 / 异常值", () => {
  assert.equal(
    formatValuePreview(new Date("2026-01-02T03:04:05.000Z"), "date"),
    "2026-01-02T03:04:05.000Z",
  );
  assert.equal(formatValuePreview(new Date("bad"), "date"), "Invalid Date");
  assert.equal(formatValuePreview(/a+/gi, "regexp"), "/a+/gi");
  assert.equal(formatValuePreview(() => 1, "function").includes("=>"), true);

  const broken = {
    get size() {
      throw new Error("boom");
    },
  };

  assert.equal(formatValuePreview(broken, "map"), "（无法读取）");
});

test("formatValueText：可编辑类型转输入框文本", () => {
  assert.equal(formatValueText("abc", "string"), "abc");
  assert.equal(formatValueText(42, "number"), "42");
  assert.equal(formatValueText(5n, "bigint"), "5");
  assert.equal(formatValueText(null, "null"), "null");
  assert.equal(formatValueText(undefined, "undefined"), "undefined");
  assert.equal(formatValueText(true, "boolean"), "true");
});

test("parseValueByKind：数字校验与空值", () => {
  assert.deepEqual(parseValueByKind("42", "number"), { ok: true, value: 42 });
  assert.deepEqual(parseValueByKind(" 3.5 ", "number"), {
    ok: true,
    value: 3.5,
  });
  assert.equal(parseValueByKind("", "number").ok, false);
  assert.equal(parseValueByKind("   ", "number").ok, false);
  assert.equal(parseValueByKind("abc", "number").ok, false);
  assert.match(parseValueByKind("abc", "number").message, /abc/);
});

test("parseValueByKind：字符串 / 布尔 / BigInt", () => {
  assert.deepEqual(parseValueByKind("你好", "string"), {
    ok: true,
    value: "你好",
  });
  assert.deepEqual(parseValueByKind("true", "boolean"), {
    ok: true,
    value: true,
  });
  assert.deepEqual(parseValueByKind(" false ", "boolean"), {
    ok: true,
    value: false,
  });
  assert.deepEqual(parseValueByKind(" 7 ", "bigint"), {
    ok: true,
    value: 7n,
  });
  assert.equal(parseValueByKind("7.5", "bigint").ok, false);
  assert.match(parseValueByKind("abc", "bigint").message, /BigInt/);
});

test("parseValueByKind：未知类型按 JSON 字面量宽松解析", () => {
  assert.deepEqual(parseValueByKind("null", "object"), {
    ok: true,
    value: null,
  });
  assert.deepEqual(parseValueByKind("undefined", "object"), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(parseValueByKind("true", "object"), {
    ok: true,
    value: true,
  });
  assert.deepEqual(parseValueByKind("12", "object"), { ok: true, value: 12 });
  assert.deepEqual(parseValueByKind("hello", "object"), {
    ok: true,
    value: "hello",
  });
  assert.equal(parseValueByKind("   ", "object").ok, false);
});

test("getValueKind / formatValuePreview handle DOM, typed arrays and revoked proxies", () => {
  class FakeNode {
    constructor(nodeName) {
      this.nodeName = nodeName;
    }
  }

  globalThis.Node = FakeNode;

  try {
    const node = new FakeNode("DIV");
    assert.equal(getValueKind(node), "dom");
    assert.match(formatValuePreview(node, "dom"), /DIV/);

    const longNode = new FakeNode("N".repeat(200));
    const preview = formatValuePreview(longNode, "dom");
    assert.equal(typeof preview, "string");
    assert.ok(preview.length <= 202);

    const typed = new Uint8Array(4);
    assert.equal(getValueKind(typed), "object");
    assert.ok(formatValuePreview(typed, "object").length > 0);

    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    assert.equal(getValueKind(revoked.proxy), "object");
  } finally {
    delete globalThis.Node;
  }

  assert.equal(parseValueByKind("false", "boolean").value, false);
  assert.equal(parseValueByKind("true", "boolean").value, true);
});
