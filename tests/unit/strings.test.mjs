import test from "node:test";
import assert from "node:assert/strict";

import {
  STRINGS,
  getAvailableLocales,
  getLocale,
  setLocale,
  t,
} from "../../cheat-engine/www/cheat/js/strings.js";
import en from "../../cheat-engine/www/cheat/js/locales/en.js";
import ja from "../../cheat-engine/www/cheat/js/locales/ja.js";

test("t：读取共享文案", () => {
  assert.equal(t("common.search"), "搜索...");
  assert.equal(t("common.perPage"), "每页");
  assert.equal(t("common.all"), "全部");
  assert.equal(t("common.reloadGameData"), "重新加载游戏数据");
});

test("t：缺失的 key 回显自身，方便发现拼写错误", () => {
  assert.equal(t("common.notExist"), "common.notExist");
  assert.equal(t("nope"), "nope");
});

test("t：支持 {name} 占位符", () => {
  assert.equal(
    t("common.reloadTarget", { target: "存档数据" }),
    "重新加载存档数据",
  );
  assert.equal(t("common.reloadTarget", {}), "重新加载{target}");
});

test("导航文案完整且不重复", () => {
  const names = Object.values(STRINGS.nav);

  assert.ok(names.length >= 15);
  assert.equal(new Set(names).size, names.length, "导航文案不应重复");
});

function collectKeys(value, prefix = "") {
  const keys = [];

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (child && typeof child === "object") {
      keys.push(...collectKeys(child, path));
    } else {
      keys.push(path);
    }
  }

  return keys.sort();
}

test("各语言文案表的 key 与中文表一致", () => {
  const expected = collectKeys(STRINGS);

  assert.deepEqual(collectKeys(en), expected);
  assert.deepEqual(collectKeys(ja), expected);
});

test("setLocale：切换语言并支持未知语言回退", () => {
  const original = getLocale();

  try {
    assert.deepEqual(
      getAvailableLocales().map((item) => item.value),
      ["zh-CN", "en", "ja"],
    );

    assert.equal(setLocale("en"), "en");
    assert.equal(t("common.search"), "Search...");

    assert.equal(setLocale("ja"), "ja");
    assert.equal(t("general.noClip"), "壁抜け");

    assert.equal(setLocale("fr"), "zh-CN");
    assert.equal(t("common.search"), "搜索...");
  } finally {
    setLocale(original);
  }
});
