import test from "node:test";
import assert from "node:assert/strict";

import {
  SELF_SWITCH_KEYS,
  buildCommonEventOptions,
  buildEventOptions,
  normalizeSelfSwitchKey,
  normalizeSelfSwitchValue,
  readSelfSwitchState,
  readSelfSwitchValue,
  resolveCommonEvent,
  selfSwitchTarget,
  writeSelfSwitchValue,
} from "../../cheat-engine/www/cheat/js/map-event/tools.js";

test("SELF_SWITCH_KEYS / normalizeSelfSwitchKey：只接受 A-D", () => {
  assert.deepEqual(SELF_SWITCH_KEYS, ["A", "B", "C", "D"]);

  assert.equal(normalizeSelfSwitchKey("a"), "A");
  assert.equal(normalizeSelfSwitchKey(" B "), null);
  assert.equal(normalizeSelfSwitchKey("d"), "D");
  assert.equal(normalizeSelfSwitchKey("E"), null);
  assert.equal(normalizeSelfSwitchKey(""), null);
  assert.equal(normalizeSelfSwitchKey(null), null);
});

test("normalizeSelfSwitchValue：只有 true 算开启", () => {
  assert.equal(normalizeSelfSwitchValue(true), true);
  assert.equal(normalizeSelfSwitchValue(1), false);
  assert.equal(normalizeSelfSwitchValue("true"), false);
  assert.equal(normalizeSelfSwitchValue(false), false);
});

test("selfSwitchTarget：校验地图 / 事件 / 键名", () => {
  assert.deepEqual(selfSwitchTarget(1, 2, "a"), [1, 2, "A"]);
  assert.equal(selfSwitchTarget(0, 2, "A"), null);
  assert.equal(selfSwitchTarget(1, 0, "A"), null);
  assert.equal(selfSwitchTarget(1, 2, "E"), null);
  assert.equal(selfSwitchTarget("x", 2, "A"), null);
  assert.equal(selfSwitchTarget(1, 2.5, "A"), null);
});

function createSelfSwitches(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    values,
    value(target) {
      return values.get(target.join(":")) || false;
    },
    setValue(target, value) {
      values.set(target.join(":"), value);
    },
  };
}

test("readSelfSwitchValue / writeSelfSwitchValue：读写与异常降级", () => {
  const selfSwitches = createSelfSwitches({ "3:5:A": true });

  assert.equal(readSelfSwitchValue(selfSwitches, 3, 5, "A"), true);
  assert.equal(readSelfSwitchValue(selfSwitches, 3, 5, "B"), false);
  assert.equal(readSelfSwitchValue(selfSwitches, 0, 5, "A"), false);

  assert.equal(writeSelfSwitchValue(selfSwitches, 3, 5, "B", true), true);
  assert.equal(readSelfSwitchValue(selfSwitches, 3, 5, "B"), true);
  assert.equal(writeSelfSwitchValue(selfSwitches, 3, 5, "E", true), false);

  const broken = {
    value() {
      throw new Error("read failed");
    },
    setValue() {
      throw new Error("write failed");
    },
  };

  assert.equal(readSelfSwitchValue(broken, 3, 5, "A"), false);
  assert.equal(writeSelfSwitchValue(broken, 3, 5, "A", true), false);
  assert.equal(readSelfSwitchValue(null, 3, 5, "A"), false);
  assert.equal(writeSelfSwitchValue(null, 3, 5, "A", true), false);
});

test("readSelfSwitchState：一次读取 A-D", () => {
  const selfSwitches = createSelfSwitches({
    "3:5:A": true,
    "3:5:C": true,
  });

  assert.deepEqual(readSelfSwitchState(selfSwitches, 3, 5), {
    A: true,
    B: false,
    C: true,
    D: false,
  });

  assert.deepEqual(readSelfSwitchState(selfSwitches, 0, 5), {
    A: false,
    B: false,
    C: false,
    D: false,
  });
});

test("buildEventOptions：兼容静态数据与运行时事件", () => {
  const options = buildEventOptions([
    null,
    { id: 1, name: "Door", x: 2, y: 3 },
    { id: 2, name: "", x: "4", y: "5" },
    { id: 0, name: "ignored", x: 0, y: 0 },
    { id: 3.5, name: "bad", x: 0, y: 0 },
    {
      eventId: () => 4,
      name: "Runtime",
      _x: 6,
      _y: 7,
    },
    null,
  ]);

  assert.deepEqual(
    options.map((option) => ({
      id: option.id,
      name: option.name,
      x: option.x,
      y: option.y,
    })),
    [
      { id: 1, name: "Door", x: 2, y: 3 },
      { id: 2, name: "", x: 4, y: 5 },
      { id: 4, name: "Runtime", x: 6, y: 7 },
    ],
  );
  assert.equal(options[0].title, "1: Door");
  assert.equal(options[1].title, "2: (unnamed)");

  assert.deepEqual(buildEventOptions(null), []);
  assert.deepEqual(buildEventOptions("bad"), []);
});

test("buildCommonEventOptions：过滤空名与搜索", () => {
  const data = [
    null,
    { name: "Teleport" },
    null,
    { name: "Quest start" },
    { name: "   " },
    { name: "Ending" },
  ];

  assert.deepEqual(
    buildCommonEventOptions(data).map((item) => item.id),
    [1, 3, 5],
  );
  assert.deepEqual(
    buildCommonEventOptions(data, "quest").map((item) => item.id),
    [3],
  );
  assert.deepEqual(
    buildCommonEventOptions(data, "3").map((item) => item.id),
    [3],
  );
  assert.deepEqual(buildCommonEventOptions(data, "missing"), []);
  assert.deepEqual(buildCommonEventOptions(null), []);
});

test("resolveCommonEvent：校验 ID 与名称", () => {
  const data = [null, { name: "Teleport" }, { name: "" }, null];

  assert.deepEqual(resolveCommonEvent(data, 1), {
    id: 1,
    name: "Teleport",
    title: "1: Teleport",
  });
  assert.equal(resolveCommonEvent(data, 0), null);
  assert.equal(resolveCommonEvent(data, 2), null);
  assert.equal(resolveCommonEvent(data, 4), null);
  assert.equal(resolveCommonEvent(data, 1.5), null);
  assert.equal(resolveCommonEvent(null, 1), null);
});
