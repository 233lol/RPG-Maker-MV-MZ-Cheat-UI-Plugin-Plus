import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_GLOBAL_NAMES,
  RPG_GLOBAL_NAMES,
} from "../../cheat-engine/www/cheat/js/global-object/names.js";
import * as Helper from "../../cheat-engine/www/cheat/js/GlobalObjectHelper.js";

test("RPG_GLOBAL_NAMES：非空、全部是字符串且不重复", () => {
  assert.ok(RPG_GLOBAL_NAMES.length > 20);

  const seen = new Set();

  for (const name of RPG_GLOBAL_NAMES) {
    assert.equal(typeof name, "string");
    assert.ok(name.length > 0);
    assert.equal(seen.has(name), false, `重复项: ${name}`);
    seen.add(name);
  }
});

test("RPG_GLOBAL_NAMES：覆盖数据库、运行时与管理器三类全局", () => {
  for (const name of [
    "$dataSystem",
    "$dataMap",
    "$gamePlayer",
    "$gameSwitches",
    "$gameVariables",
    "DataManager",
    "SceneManager",
    "Utils",
  ]) {
    assert.ok(RPG_GLOBAL_NAMES.includes(name), name);
  }
});

test("BUILTIN_GLOBAL_NAMES：是 Set、元素均为字符串且与 RPG 名单不重叠", () => {
  assert.ok(BUILTIN_GLOBAL_NAMES instanceof Set);
  assert.ok(BUILTIN_GLOBAL_NAMES.size > 50);

  for (const name of BUILTIN_GLOBAL_NAMES) {
    assert.equal(typeof name, "string");
    assert.equal(RPG_GLOBAL_NAMES.includes(name), false, name);
  }

  for (const name of ["window", "document", "console", "nw", "require"]) {
    assert.ok(BUILTIN_GLOBAL_NAMES.has(name), name);
  }
});

test("GlobalObjectHelper：统一 re-export 了拆分模块的 API", () => {
  assert.equal(Helper.RPG_GLOBAL_NAMES, RPG_GLOBAL_NAMES);
  assert.equal(Helper.BUILTIN_GLOBAL_NAMES, BUILTIN_GLOBAL_NAMES);

  for (const name of [
    "getValueKind",
    "formatValuePreview",
    "parseValueByKind",
    "getContainerKeys",
    "getChildValue",
    "scanRootGlobals",
    "getRootNamesByFilter",
    "searchGlobalTree",
  ]) {
    assert.equal(typeof Helper[name], "function", name);
  }
});
