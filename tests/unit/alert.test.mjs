import test from "node:test";
import assert from "node:assert/strict";

import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";

function resetAlert() {
  Alert.handler = null;
  Alert.pending = [];
}

test("Alert：安装 handler 后直接回调", () => {
  resetAlert();

  const received = [];
  Alert.setHandler((level, msg, err, timeout) => {
    received.push({ level, msg, err, timeout });
  });

  Alert.success("ok", null, 123);

  assert.deepEqual(received, [
    { level: "success", msg: "ok", err: null, timeout: 123 },
  ]);

  resetAlert();
});

test("Alert：没有 handler 时进入队列", () => {
  resetAlert();

  Alert.info("a");
  Alert.warn("b");

  assert.equal(Alert.pending.length, 2);
  assert.equal(Alert.pending[0].level, "info");
  assert.equal(Alert.pending[1].level, "warn");

  resetAlert();
});

test("Alert：队列最多保留 20 条，丢弃最旧的", () => {
  resetAlert();

  for (let i = 0; i < 25; i++) {
    Alert.info(`msg-${i}`);
  }

  assert.equal(Alert.pending.length, 20);
  assert.equal(Alert.pending[0].msg, "msg-5");
  assert.equal(Alert.pending.at(-1).msg, "msg-24");

  resetAlert();
});

test("Alert：安装 handler 时按顺序 flush 队列", () => {
  resetAlert();

  Alert.info("one");
  Alert.error("two");

  const received = [];
  Alert.setHandler((level, msg) => received.push(`${level}:${msg}`));

  assert.deepEqual(received, ["info:one", "error:two"]);
  assert.equal(Alert.pending.length, 0);

  resetAlert();
});

test("Alert.clearHandler：只清除匹配的 handler", () => {
  resetAlert();

  const first = () => {};
  const second = () => {};

  Alert.setHandler(first);
  Alert.clearHandler(second);
  assert.equal(Alert.handler, first);

  Alert.clearHandler(first);
  assert.equal(Alert.handler, null);

  resetAlert();
});

test("Alert handler failures are logged and pending continues", () => {
  resetAlert();
  Alert.info("one");
  Alert.info("two");

  const received = [];
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    Alert.setHandler((level, msg) => {
      received.push(msg);
      if (msg === "one") {
        throw new Error("handler failed");
      }
    });
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(received, ["one", "two"]);
  assert.equal(errors.length, 1);
  assert.equal(Alert.pending.length, 0);

  resetAlert();
});

test("Alert without handler logs errors with cause", () => {
  resetAlert();
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    Alert.error("bad", new Error("cause"));
  } finally {
    console.error = originalError;
  }

  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /bad/);
  assert.equal(Alert.pending.length, 1);

  resetAlert();
});
