import test from "node:test";
import assert from "node:assert/strict";

import {
  filterByKeyword,
  matchesKeyword,
  normalizeKeyword,
} from "../../cheat-engine/www/cheat/js/SearchFilter.js";

test("normalizeKeyword：去空白并转小写，容忍空值", () => {
  assert.equal(normalizeKeyword("  ABc  "), "abc");
  assert.equal(normalizeKeyword(null), "");
  assert.equal(normalizeKeyword(undefined), "");
  assert.equal(normalizeKeyword(1024), "1024");
});

test("matchesKeyword：空关键词命中全部，多字段任一命中", () => {
  assert.equal(matchesKeyword("", "任意"), true);
  assert.equal(matchesKeyword("   ", "任意"), true);

  assert.equal(matchesKeyword("sword", "Iron Sword", "desc"), true);
  assert.equal(matchesKeyword("SWORD", "Iron Sword", "desc"), true);
  assert.equal(matchesKeyword("sword", "Iron Shield", "desc"), false);
  assert.equal(matchesKeyword("desc", "Iron Shield", "desc"), true);
});

test("matchesKeyword：字段为 null / undefined 时不会抛错", () => {
  assert.equal(matchesKeyword("x", null, undefined, "x-ray"), true);
  assert.equal(matchesKeyword("x", null, undefined, ""), false);
});

test("filterByKeyword：无关键词时原样返回，有关键词时按 pick 过滤", () => {
  const items = [
    { name: "Potion", desc: "heal" },
    { name: "Ether", desc: "mana" },
    { name: null, desc: undefined },
  ];

  assert.equal(
    filterByKeyword(items, "", (item) => [item.name]),
    items,
  );

  assert.deepEqual(
    filterByKeyword(items, "  ot ", (item) => [item.name, item.desc]),
    [items[0]],
  );

  assert.deepEqual(
    filterByKeyword(items, "mana", (item) => [item.name, item.desc]),
    [items[1]],
  );

  assert.deepEqual(
    filterByKeyword(items, "nothing", (item) => [item.name, item.desc]),
    [],
  );
});

test("filterByKeyword：非数组输入按空列表处理", () => {
  assert.deepEqual(
    filterByKeyword(null, "x", (item) => [item]),
    [],
  );
});
