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

test("Key.fromKey / createEmpty：复制字段且不共享引用", () => {
  const source = Key.fromString("ctrl shift c");
  const copy = Key.fromKey(source);

  assert.notEqual(copy, source);
  assert.equal(copy.equals(source), true);

  copy.ctrl = false;
  assert.equal(source.ctrl, true);

  const empty = Key.createEmpty();
  assert.equal(empty.isEmpty(), true);
  assert.equal(empty.asStringArray().length, 0);
  assert.equal(empty.asDisplayString(), "");
});

test("Key.fromEvent：普通键与组合键分支", () => {
  const normal = Key.fromEvent({
    keyCode: 67,
    ctrlKey: true,
    altKey: false,
    shiftKey: true,
    metaKey: false,
  });
  assert.equal(normal.asString(), "ctrl shift c");

  const rightMeta = Key.fromEvent({
    keyCode: 92,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: true,
  });
  assert.equal(rightMeta.isCombiningKey(), true);
  assert.equal(rightMeta.asString(), "meta");

  const ctrlAlone = Key.fromEvent({
    keyCode: 17,
    ctrlKey: false,
    altKey: true,
    shiftKey: true,
    metaKey: false,
  });
  assert.equal(ctrlAlone.asString(), "ctrl alt shift");
});

test("Key.adjustCombiningKey：同步事件里的修饰键状态", () => {
  const key = Key.fromString("ctrl c");

  key.adjustCombiningKey({
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    metaKey: true,
  });

  assert.equal(key.ctrl, false);
  assert.equal(key.alt, true);
  assert.equal(key.meta, true);
  assert.equal(key.code, 67);
});

test("Key.countPressingKeys / check：按键数量与事件匹配", () => {
  assert.equal(Key.createEmpty().countPressingKeys(), 0);
  assert.equal(Key.fromString("ctrl").countPressingKeys(), 1);
  assert.equal(Key.fromString("ctrl shift c").countPressingKeys(), 3);

  const key = Key.fromString("ctrl c");
  assert.equal(
    key.check({
      keyCode: 67,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    }),
    true,
  );
  assert.equal(
    key.check({
      keyCode: 67,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    }),
    false,
  );
});

test("Key.remove / add：修饰键与未分配键码", () => {
  const key = Key.fromString("ctrl alt shift meta c");

  key.remove(18);
  assert.equal(key.alt, false);
  key.remove(16);
  assert.equal(key.shift, false);
  key.remove(91);
  assert.equal(key.meta, false);
  key.remove(91);
  assert.equal(key.meta, false);

  key.add(92);
  assert.equal(key.meta, true);

  // 未分配的普通键码不改变组合键
  const empty = Key.createEmpty();
  empty.remove(67);
  assert.equal(empty.isEmpty(), true);
});

test("Key.capitalize：空值 / 单字符 / 普通字符串", () => {
  const key = Key.createEmpty();

  assert.equal(key.capitalize(""), "");
  assert.equal(key.capitalize(null), "");
  assert.equal(key.capitalize("c"), "C");
  assert.equal(key.capitalize("ctrl"), "Ctrl");
});
