import test from "node:test";
import assert from "node:assert/strict";

import {
  itemLockKey,
  normalizeItemAmount,
  parseItemLockKey,
  buildItemLocksPayload,
  resolveItemData,
  sanitizeItemLocks,
} from "../../cheat-engine/www/cheat/js/ItemLockHelper.js";

test("itemLockKey / parseItemLockKey：合法类型与 ID", () => {
  assert.equal(itemLockKey("item", 1), "item:1");
  assert.equal(itemLockKey("weapon", "12"), "weapon:12");
  assert.equal(itemLockKey("armor", 3), "armor:3");

  assert.deepEqual(parseItemLockKey("item:1"), { kind: "item", id: 1 });
  assert.deepEqual(parseItemLockKey("armor:99"), { kind: "armor", id: 99 });
});

test("itemLockKey / parseItemLockKey：拒绝非法类型与 ID", () => {
  for (const [kind, id] of [
    ["potion", 1],
    ["", 1],
    ["item", 0],
    ["item", -1],
    ["item", 1.5],
    ["item", "abc"],
    ["item", null],
  ]) {
    assert.equal(itemLockKey(kind, id), null);
  }

  for (const key of [
    "",
    "item",
    "item:0",
    "item:-1",
    "item:1.5",
    "item:abc",
    "potion:1",
    "__proto__:1",
  ]) {
    assert.equal(parseItemLockKey(key), null);
  }
});

test("normalizeItemAmount：非负整数与回退值", () => {
  assert.equal(normalizeItemAmount(5), 5);
  assert.equal(normalizeItemAmount("7"), 7);
  assert.equal(normalizeItemAmount(2.9), 2);
  assert.equal(normalizeItemAmount(0), 0);
  assert.equal(normalizeItemAmount(-1), 0);
  assert.equal(normalizeItemAmount("abc"), 0);
  assert.equal(normalizeItemAmount(null), 0);
  assert.equal(normalizeItemAmount(undefined, 3), 3);
});

test("sanitizeItemLocks：只保留合法的已启用项", () => {
  const locks = sanitizeItemLocks({
    "item:1": { lockEnabled: true, lockValue: 5 },
    "weapon:2": { lockEnabled: true, lockValue: "7" },
    "armor:3": { lockEnabled: false, lockValue: 1 },
    "item:0": { lockEnabled: true, lockValue: 1 },
    "item:4": { lockEnabled: true, lockValue: -1 },
    "item:5": { lockEnabled: true, lockValue: "abc" },
    "potion:6": { lockEnabled: true, lockValue: 1 },
    bad: null,
  });

  assert.deepEqual(locks, {
    "item:1": { lockEnabled: true, lockValue: 5 },
    "weapon:2": { lockEnabled: true, lockValue: 7 },
  });

  assert.deepEqual(sanitizeItemLocks(null), {});
  assert.deepEqual(sanitizeItemLocks([]), {});
  assert.deepEqual(sanitizeItemLocks("bad"), {});
});

test("buildItemLocksPayload：由表格行生成锁定表并跳过无效行", () => {
  const payload = buildItemLocksPayload([
    { kind: "item", id: 1, lockEnabled: true, lockValue: 5 },
    { kind: "item", id: 1, lockEnabled: true, lockValue: 9 },
    { kind: "weapon", id: 2, lockEnabled: false, lockValue: 3 },
    { kind: "armor", id: 3, lockEnabled: true, lockValue: "8" },
    { kind: "armor", id: 0, lockEnabled: true, lockValue: 1 },
    null,
  ]);

  assert.deepEqual(payload, {
    "item:1": { lockEnabled: true, lockValue: 9 },
    "armor:3": { lockEnabled: true, lockValue: 8 },
  });
});

test("resolveItemData：按类型从数据库取条目", () => {
  const item = { id: 1, name: "Potion" };
  const weapon = { id: 2, name: "Sword" };
  const armor = { id: 3, name: "Shield" };
  const tables = {
    items: [null, item],
    weapons: [null, null, weapon],
    armors: [null, null, null, armor],
  };

  assert.equal(resolveItemData(tables, "item", 1), item);
  assert.equal(resolveItemData(tables, "weapon", 2), weapon);
  assert.equal(resolveItemData(tables, "armor", 3), armor);

  assert.equal(resolveItemData(tables, "item", 2), null);
  assert.equal(resolveItemData(tables, "potion", 1), null);
  assert.equal(resolveItemData(tables, "item", 0), null);
  assert.equal(resolveItemData({}, "item", 1), null);
  assert.equal(resolveItemData(null, "item", 1), null);
});
