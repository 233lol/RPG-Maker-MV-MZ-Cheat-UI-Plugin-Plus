import test from "node:test";
import assert from "node:assert/strict";

import {
  ROOT_FILTERS,
  formatPathText,
  getRootNamesByFilter,
  invalidateRootScanCache,
  resolvePathValue,
  scanRootGlobals,
  scanRootGlobalsCached,
  searchGlobalTree,
} from "../../cheat-engine/www/cheat/js/global-object/scan.js";

test("scanRootGlobals：区分 RPG 全局、插件全局与浏览器内置", () => {
  const root = {
    $dataMap: {},
    $gameParty: {},
    $plugins: [],
    $customSingleton: {},
    MyPlugin: { value: 1 },
    ignoredPrimitive: 1,
    ignoredFunction: () => {},
    document: {},
  };

  const result = scanRootGlobals(root);

  assert.ok(result.rpg.includes("$dataMap"));
  assert.ok(result.rpg.includes("$gameParty"));
  assert.ok(result.rpg.includes("$plugins"));
  assert.ok(result.plugin.includes("$customSingleton"));
  assert.ok(result.plugin.includes("MyPlugin"));
  assert.equal(result.plugin.includes("ignoredPrimitive"), false);
  assert.equal(result.plugin.includes("ignoredFunction"), false);
  assert.equal(result.plugin.includes("document"), false);
  assert.equal(result.rpg.includes("document"), false);
});

test("scanRootGlobals：插件全局属性读取抛错时跳过", () => {
  const root = {};
  Object.defineProperty(root, "BrokenPlugin", {
    enumerable: true,
    get() {
      throw new Error("boom");
    },
  });

  const result = scanRootGlobals(root);

  assert.equal(result.plugin.includes("BrokenPlugin"), false);
  assert.equal(result.rpg.includes("BrokenPlugin"), false);
});

test("scanRootGlobalsCached：TTL 内复用结果，invalidate 后重新扫描", () => {
  invalidateRootScanCache();

  const first = scanRootGlobalsCached({ $dataMap: {} });
  const second = scanRootGlobalsCached({ $gameParty: {} });

  assert.equal(second, first);
  assert.deepEqual(first.rpg, ["$dataMap"]);

  invalidateRootScanCache();

  const third = scanRootGlobalsCached({ $gameParty: {} });
  assert.notEqual(third, first);
  assert.deepEqual(third.rpg, ["$gameParty"]);
});

test("getRootNamesByFilter：按筛选返回副本", () => {
  const scan = { rpg: ["a"], plugin: ["b"] };

  assert.deepEqual(getRootNamesByFilter(scan, ROOT_FILTERS.rpg), ["a"]);
  assert.deepEqual(getRootNamesByFilter(scan, ROOT_FILTERS.plugin), ["b"]);
  assert.deepEqual(getRootNamesByFilter(scan, ROOT_FILTERS.all), ["a", "b"]);
  assert.deepEqual(getRootNamesByFilter(scan, "unknown"), ["a", "b"]);

  const all = getRootNamesByFilter(scan, ROOT_FILTERS.all);
  all.push("c");
  assert.deepEqual(scan.rpg, ["a"], "返回值不应与输入共享数组");

  assert.deepEqual(getRootNamesByFilter(null, ROOT_FILTERS.all), []);
});

test("resolvePathValue：逐层读取，路径为空时返回根", () => {
  const root = { a: { b: [10, 20] } };

  assert.equal(resolvePathValue(root, []).value, root);
  assert.equal(resolvePathValue(root, ["a", "b", "1"]).value, 20);

  const missing = resolvePathValue(root, ["a", "nope"]);
  assert.equal(
    missing.ok,
    true,
    "缺失属性和 null / undefined 一样按 undefined 返回",
  );
  assert.equal(missing.value, undefined);

  const broken = {
    get bad() {
      throw new Error("cannot read");
    },
  };
  const failed = resolvePathValue(broken, ["bad"]);
  assert.equal(failed.ok, false);
  assert.match(failed.message, /cannot read/);
});

test("formatPathText：根节点、属性与数组下标", () => {
  assert.equal(formatPathText([]), "window");
  assert.equal(formatPathText([], "$gameParty"), "$gameParty");
  assert.equal(formatPathText(["a", "b"]), "a.b");
  assert.equal(
    formatPathText(["$gameParty", "_actors", "0", "_name"]),
    "$gameParty._actors[0]._name",
  );
  assert.equal(formatPathText(["0"]), "[0]");
  assert.equal(formatPathText(null), "window");
});

test("searchGlobalTree：按名称 / 可编辑值搜索并给出路径", () => {
  const root = {
    alpha: { beta: "needle" },
    matchName: 1,
    list: [{ value: 42 }],
  };

  const byValue = searchGlobalTree(root, "needle");
  assert.equal(byValue.truncated, false);
  assert.equal(byValue.results.length, 1);
  assert.equal(byValue.results[0].pathText, "alpha.beta");
  assert.deepEqual(byValue.results[0].path, ["alpha", "beta"]);

  const byName = searchGlobalTree(root, "MATCHNAME");
  assert.equal(byName.results[0].name, "matchName");

  const byNumber = searchGlobalTree(root, "42");
  assert.equal(byNumber.results.length, 1);
  assert.equal(byNumber.results[0].pathText, "list[0].value");
});

test("searchGlobalTree：空关键词返回空结果且不截断", () => {
  const result = searchGlobalTree({ a: 1 }, "   ");

  assert.deepEqual(result.results, []);
  assert.equal(result.truncated, false);
  assert.equal(result.reason, null);
  assert.deepEqual(searchGlobalTree({ a: 1 }, null).results, []);
});

test("searchGlobalTree：maxDepth / maxResults / maxNodes 限制", () => {
  const deep = { a: { b: { c: "needle" } } };

  assert.equal(
    searchGlobalTree(deep, "needle", { maxDepth: 1 }).results.length,
    0,
  );
  assert.equal(
    searchGlobalTree(deep, "needle", { maxDepth: 3 }).results.length,
    1,
  );

  const limited = searchGlobalTree(
    { a: "needle", b: "needle", c: "needle" },
    "needle",
    { maxResults: 2 },
  );
  assert.equal(limited.results.length, 2);
  assert.equal(limited.truncated, true);
  assert.equal(limited.reason, "results");

  const nodes = searchGlobalTree({ a: { value: 1 }, b: "needle" }, "needle", {
    maxNodes: 1,
  });
  assert.equal(nodes.truncated, true);
  assert.equal(nodes.reason, "nodes");
});

test("searchGlobalTree：跳过函数、危险全局名和循环引用", () => {
  const cycle = { needle: 1 };
  cycle.self = cycle;

  const root = {
    fn: () => "needle",
    window: { needle: 1 },
    cycle,
  };

  const result = searchGlobalTree(root, "needle", { maxDepth: 4 });

  assert.ok(result.results.some((item) => item.pathText === "cycle.needle"));
  assert.equal(
    result.results.some((item) => item.pathText.startsWith("window")),
    false,
    "不应进入 window / top 等危险全局",
  );
  assert.equal(
    result.results.some((item) => item.name === "fn"),
    false,
    "函数不应进入结果",
  );
});

test("searchGlobalTree：支持 basePath 前缀", () => {
  const result = searchGlobalTree({ child: { needle: "hit" } }, "needle", {
    basePath: ["$gameParty"],
  });

  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0].path, ["$gameParty", "child", "needle"]);
  assert.equal(result.results[0].pathText, "$gameParty.child.needle");
});
