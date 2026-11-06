import test from "node:test";
import assert from "node:assert/strict";

import interpretCodes from "../../cheat-engine/www/cheat/js/eventCodes.js";

test("interpretCodes：常见事件指令返回英文说明", () => {
  const cases = {
    0: "nop",
    101: "show text",
    401: "text line",
    102: "show choices",
    404: "end choices",
    111: "begin if",
    112: "loop",
    115: "exit event",
    121: "set switches",
    122: "set variables",
    125: "set gold",
    126: "set items",
    201: "set coord",
    205: "set movement route",
    311: "change HP",
    313: "change state",
    317: "change parameters",
    326: "change TP",
  };

  for (const [code, text] of Object.entries(cases)) {
    assert.equal(interpretCodes.interpretCodes(Number(code)), text, code);
  }
});

test("interpretCodes：未知指令返回空字符串", () => {
  assert.equal(interpretCodes.interpretCodes(999), "");
  assert.equal(interpretCodes.interpretCodes(-1), "");
  assert.equal(interpretCodes.interpretCodes(null), "");
});

test("interpretCodes：所有已登记指令的文案都不为空", () => {
  const codes = [
    0, 101, 102, 103, 104, 105, 108, 111, 112, 113, 115, 116, 117, 118, 119,
    121, 122, 123, 124, 125, 126, 127, 128, 129, 201, 202, 203, 204, 205, 206,
    311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 324, 325, 326, 401,
    402, 403, 404, 405, 411, 412, 413,
  ];

  for (const code of codes) {
    assert.notEqual(interpretCodes.interpretCodes(code), "", String(code));
  }
});
