import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBreadcrumbItems,
  buildEntries,
  entriesShallowEqual,
  entryMatches,
  filterEntries,
  findPageOfKey,
} from "../../cheat-engine/www/cheat/js/GlobalVariableRows.js";

test("buildBreadcrumbItems：根节点 + 每层路径切片", () => {
  const items = buildBreadcrumbItems(["$gameParty", "_actors", "0"]);

  assert.deepEqual(items, [
    { label: "全局变量", path: [] },
    { label: "$gameParty", path: ["$gameParty"] },
    { label: "_actors", path: ["$gameParty", "_actors"] },
    {
      label: "0",
      path: ["$gameParty", "_actors", "0"],
    },
  ]);

  assert.deepEqual(buildBreadcrumbItems(null), [
    { label: "全局变量", path: [] },
  ]);
  assert.equal(buildBreadcrumbItems([], "window")[0].label, "window");
});

test("entryMatches：名称 / 预览 / 类型任一命中", () => {
  const item = {
    name: "MyPlugin",
    preview: "对象(2 个属性)",
    typeText: "对象",
  };

  assert.equal(entryMatches(item, ""), true);
  assert.equal(entryMatches(item, "   "), true);
  assert.equal(entryMatches(item, "myplug"), true);
  assert.equal(entryMatches(item, "2 个"), true);
  assert.equal(entryMatches(item, "对象"), true);
  assert.equal(entryMatches(item, "missing"), false);

  assert.equal(entryMatches({ name: null, preview: null }, "x"), false);
  assert.equal(entryMatches({}, ""), true);
});

test("filterEntries：空关键词原样返回，有关键词时过滤", () => {
  const entries = [
    { name: "Alpha", preview: "1", typeText: "数字" },
    { name: "Beta", preview: "对象(0 个属性)", typeText: "对象" },
  ];

  assert.equal(filterEntries(entries, ""), entries);
  assert.equal(filterEntries(entries, null), entries);
  assert.deepEqual(filterEntries(entries, "beta"), [entries[1]]);
  assert.deepEqual(filterEntries(entries, "数字"), [entries[0]]);
  assert.deepEqual(filterEntries(entries, "none"), []);
});

test("buildEntries：普通容器与根层筛选 + 插件标记", () => {
  const container = {
    visible: 1,
    nested: { a: 1 },
    fn: () => {},
  };

  const entries = buildEntries({ container, atRoot: false });

  assert.deepEqual(
    entries.map((entry) => entry.key),
    ["visible", "nested"],
    "函数不应出现在列表里",
  );

  const root = {
    $gameParty: {},
    MyPlugin: { a: 1 },
  };
  const rootEntries = buildEntries({
    container: root,
    atRoot: true,
    rootScan: { rpg: ["$gameParty"], plugin: ["MyPlugin"] },
    rootFilter: "all",
    pluginNameMap: { MyPlugin: true },
  });

  assert.deepEqual(
    rootEntries.map((entry) => [entry.key, entry.isPlugin, entry.isRoot]),
    [
      ["$gameParty", false, true],
      ["MyPlugin", true, true],
    ],
  );

  assert.deepEqual(buildEntries({ container: null, atRoot: false }), []);
  assert.deepEqual(buildEntries({ container: undefined, atRoot: false }), []);
});

test("findPageOfKey：全部 / 缺失 / 正常分页", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    key: `k${index}`,
  }));

  assert.equal(findPageOfKey(entries, "k0", -1), 1);
  assert.equal(findPageOfKey(entries, "k0", 0), 1);
  assert.equal(findPageOfKey(entries, "missing", 5), 1);
  assert.equal(findPageOfKey(entries, "k5", 5), 2);
  assert.equal(
    findPageOfKey(
      Array.from({ length: 12 }, (_, index) => ({ key: index })),
      5,
      5,
    ),
    2,
    "键名应按字符串比较",
  );
  assert.equal(findPageOfKey(null, "k0", 5), 1);
});

test("entriesShallowEqual：长度 / 显示字段 / 引用比较", () => {
  const make = (value = 1) => ({
    key: "a",
    kind: "number",
    preview: String(value),
    valueText: String(value),
    boolValue: false,
    isContainer: false,
    isEditable: true,
    isPlugin: false,
  });

  const first = make();
  const second = make();

  assert.equal(entriesShallowEqual(first, first), true);
  assert.equal(entriesShallowEqual([first], [second]), true);

  assert.equal(entriesShallowEqual([first], []), false);
  assert.equal(entriesShallowEqual([first], [make(2)]), false);
  assert.equal(entriesShallowEqual([first], [null]), false);
  assert.equal(entriesShallowEqual(null, []), false);
  assert.equal(entriesShallowEqual([], []), true);

  const plugin = { ...second, isPlugin: true };
  assert.equal(entriesShallowEqual([first], [plugin]), false);
});
