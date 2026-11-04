import test from "node:test";
import assert from "node:assert/strict";

import { ShortcutMap } from "../../cheat-engine/www/cheat/js/ShortcutHelper.js";
import { Key } from "../../cheat-engine/www/cheat/js/KeyCodes.js";

function createMap() {
  const calls = [];
  const map = new ShortcutMap();
  const key = Key.fromString("ctrl c");

  map.register(
    key,
    { name: "action" },
    () => calls.push("enter"),
    () => calls.push("repeat"),
    () => calls.push("leave"),
  );

  return { map, key, calls };
}

test("ShortcutMap：注册后可以查询与触发", () => {
  const { map, key, calls } = createMap();

  assert.equal(map.getValue(key), map.getItem(key).value);
  assert.equal(map.getItem(key).value.name, "action");

  assert.equal(map.runEnterAction(key), true);
  assert.equal(map.runRepeatAction(key), true);
  assert.equal(map.runLeaveAction(key), true);
  assert.deepEqual(calls, ["enter", "repeat", "leave"]);
});

test("ShortcutMap：不同组合键互不干扰", () => {
  const { map, key } = createMap();
  const other = Key.fromString("alt c");

  assert.equal(map.getItem(other), null);
  assert.equal(map.getValue(other), null);
  assert.equal(map.runEnterAction(other), false);
  assert.ok(map.getItem(key));
});

test("ShortcutMap：remove 返回旧 value 并清空槽位", () => {
  const { map, key } = createMap();

  assert.equal(map.remove(key).name, "action");
  assert.equal(map.getItem(key), null);
  assert.equal(map.remove(key), null);
});

test("ShortcutMap：未分配键不注册也不删除", () => {
  const map = new ShortcutMap();
  const empty = Key.createEmpty();

  map.register(empty, "x", () => {});
  assert.equal(map.getItem(empty), null);
  assert.equal(map.remove(empty), null);
});

test("ShortcutMap.tableIndex：修饰键与键码组合唯一", () => {
  const seen = new Set();

  for (const text of ["a", "ctrl a", "alt a", "shift a", "meta a"]) {
    const index = ShortcutMap.tableIndex(Key.fromString(text));
    assert.equal(seen.has(index), false, `${text} 的索引不应重复`);
    seen.add(index);
  }
});
