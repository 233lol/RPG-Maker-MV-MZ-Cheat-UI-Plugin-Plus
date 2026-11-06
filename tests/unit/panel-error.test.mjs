import test from "node:test";
import assert from "node:assert/strict";

import { formatPanelError } from "../../cheat-engine/www/cheat/js/PanelError.js";

test("formatPanelError：保留 message / stack / info", () => {
  const error = new Error("boom");
  const result = formatPanelError(error, "render function");

  assert.equal(result.message, "boom");
  assert.equal(result.info, "render function");
  assert.match(result.stack, /boom/);
  assert.match(result.text, /^boom\n\nrender function\n\n/);
});

test("formatPanelError：兼容字符串、null 与缺失 info", () => {
  assert.deepEqual(formatPanelError("oops"), {
    message: "oops",
    stack: "",
    info: "",
    text: "oops",
  });

  assert.deepEqual(formatPanelError(null), {
    message: "unknown",
    stack: "",
    info: "",
    text: "unknown",
  });
});
