import test from "node:test";
import assert from "node:assert/strict";

import {
  Key,
  MAX_KEY_CODE,
  UNASSIGNED_KEY_CODE,
} from "../../cheat-engine/www/cheat/js/KeyCodes.js";

test("Key.fromString：解析组合键并往返序列化", () => {
  const key = Key.fromString("ctrl c");

  assert.equal(key.code, 67);
  assert.equal(key.ctrl, true);
  assert.equal(key.asString(), "ctrl c");
  assert.equal(key.asDisplayString(), "Ctrl + C");
  assert.equal(Key.fromString(key.asString()).equals(key), true);
});

test("Key.fromString：修饰键顺序无关", () => {
  assert.equal(
    Key.fromString("shift alt ctrl a").asString(),
    "ctrl alt shift a",
  );
});

test("Key.fromString：空字符串是未分配键", () => {
  const key = Key.fromString("");

  assert.equal(key.isEmpty(), true);
  assert.equal(key.code, UNASSIGNED_KEY_CODE);
  assert.equal(key.asString(), "");
});

test("Key.fromString：只按修饰键时是组合键而不是空键", () => {
  const key = Key.fromString("ctrl");

  assert.equal(key.isCombiningKey(), true);
  assert.equal(key.isEmpty(), false);
  assert.equal(key.asString(), "ctrl");
});

test("Key.fromString：非法写法会抛错", () => {
  assert.throws(() => Key.fromString("ctrl c d"), /不能组合多个普通按键/);
  assert.throws(() => Key.fromString("ctrl not-a-key"), /未知的按键/);
});

test("Key.fromString：容忍旧配置里的空 token / 尾随空格", () => {
  const key = Key.fromString("ctrl ");

  assert.equal(key.asString(), "ctrl");
  assert.equal(key.isCombiningKey(), true);
});

test("未登记 keyCode 不会让 asDisplayString 崩溃", () => {
  const key = new Key(226, true, false, false, false);

  assert.equal(key.isRepresentable(), false);
  assert.equal(key.asString(), "ctrl");
  assert.doesNotThrow(() => key.asDisplayString());
});

test("右侧 Meta（keyCode 92）按组合键处理", () => {
  const key = Key.fromEvent({
    keyCode: 92,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: true,
  });

  assert.equal(key.isCombiningKey(), true);
  assert.equal(key.asString(), "meta");
});

test("Key.contains：组合键包含关系", () => {
  const ctrlC = Key.fromString("ctrl c");
  const ctrl = Key.fromString("ctrl");
  const ctrlShiftC = Key.fromString("ctrl shift c");
  const ctrlD = Key.fromString("ctrl d");

  assert.equal(ctrlC.contains(ctrlC), true);
  assert.equal(ctrlC.contains(ctrl), true);
  assert.equal(ctrlC.contains(ctrlShiftC), false);
  assert.equal(ctrlC.contains(ctrlD), false);
});

test("Key.add / remove：更新组合与普通键码", () => {
  const key = Key.createEmpty();

  key.add(17);
  key.add(67);
  assert.equal(key.asString(), "ctrl c");

  key.remove(67);
  assert.equal(key.asString(), "ctrl");
  assert.equal(key.code, UNASSIGNED_KEY_CODE);

  key.remove(17);
  assert.equal(key.isEmpty(), true);
});

test("MAX_KEY_CODE 覆盖所有可分配键码", () => {
  assert.equal(MAX_KEY_CODE, UNASSIGNED_KEY_CODE);
  assert.ok(MAX_KEY_CODE > 222);
});
