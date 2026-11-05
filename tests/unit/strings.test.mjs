import test from "node:test";
import assert from "node:assert/strict";

import {
  getAvailableLocales,
  getLocale,
  t,
} from "../../cheat-engine/www/cheat/js/strings.js";
import {
  detectLocale,
  loadSavedLocale,
} from "../../cheat-engine/www/cheat/js/LocaleService.js";
import zhCN from "../../cheat-engine/www/cheat/js/locales/zh-CN.js";
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
  const names = Object.values(zhCN.nav);

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
  const expected = collectKeys(zhCN);

  assert.deepEqual(collectKeys(en), expected);
  assert.deepEqual(collectKeys(ja), expected);
});

test("getLocale / getAvailableLocales：默认语言与支持列表", () => {
  assert.equal(getLocale(), "zh-CN");

  assert.deepEqual(
    getAvailableLocales().map((item) => item.value),
    ["zh-CN", "en", "ja"],
  );
  assert.deepEqual(
    getAvailableLocales().map((item) => item.title),
    ["简体中文", "English", "日本語"],
  );
});

test("LocaleService：没有窗口环境时回退到默认中文", () => {
  assert.equal(detectLocale(), "zh-CN");
  assert.equal(loadSavedLocale(), "zh-CN");
});
