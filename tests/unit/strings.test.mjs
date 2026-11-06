import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDateTime,
  formatNumber,
  getAvailableLocales,
  getIntlLocale,
  getLocale,
  hasTranslation,
  setLocale,
  subscribeLocaleChange,
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

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

function isPluralEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);

  return keys.length > 0 && keys.every((key) => PLURAL_FORMS.has(key));
}

function collectKeys(value, prefix = "") {
  const keys = [];

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      child &&
      typeof child === "object" &&
      !Array.isArray(child) &&
      !isPluralEntry(child)
    ) {
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

test("setLocale：切换后 t() 立即变化，并通知订阅者", () => {
  const seen = [];
  const unsubscribe = subscribeLocaleChange((locale) => seen.push(locale));

  try {
    assert.equal(setLocale("en"), true);
    assert.equal(getLocale(), "en");
    assert.equal(t("common.search"), "Search...");
    assert.equal(t("common.perPage"), "Per page");

    assert.equal(setLocale("zh-CN"), true);
    assert.equal(t("common.search"), "搜索...");
    assert.deepEqual(seen, ["en", "zh-CN"]);

    assert.equal(setLocale("not-a-locale"), false);
    assert.equal(getLocale(), "zh-CN");
  } finally {
    unsubscribe();
    setLocale("zh-CN");
  }
});

test("setLocale：同步 <html lang>，没有 document 时不报错", () => {
  const originalDocument = globalThis.document;
  const documentElement = { lang: "" };

  globalThis.document = { documentElement };

  try {
    assert.equal(setLocale("en"), true);
    assert.equal(documentElement.lang, "en");

    assert.equal(setLocale("ja"), true);
    assert.equal(documentElement.lang, "ja");
  } finally {
    setLocale("zh-CN");

    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }

  assert.equal(documentElement.lang, "zh-CN");
});

test("LocaleService：没有窗口环境时回退到默认中文", () => {
  assert.equal(detectLocale(), "zh-CN");
  assert.equal(loadSavedLocale(), "zh-CN");
});

test("t：支持 {count} 复数条目", () => {
  assert.equal(t("saveBackup.snapshotCount", { count: 1 }), "快照 1 份");
  assert.equal(t("saveBackup.snapshotCount", { count: 3 }), "快照 3 份");
  assert.equal(t("time.minutesAgo", { count: 2 }), "2 分钟前");
  assert.equal(t("common.seconds", { count: 5 }), "5 秒");
});

test("formatNumber / formatDateTime：按当前语言输出", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
  assert.equal(
    formatDateTime(new Date(2026, 0, 2, 3, 4, 5).getTime()),
    "2026/01/02 03:04:05",
  );
  assert.equal(formatNumber("abc"), "abc");
  assert.equal(formatDateTime("bad"), "");
});

test("英文文案不应残留中文标点或汉字", () => {
  const texts = [];

  const walk = (value, prefix) => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (child && typeof child === "object") {
        walk(child, path);
        continue;
      }

      if (typeof child === "string") {
        texts.push([path, child]);
      }
    }
  };

  walk(en, "");

  for (const [key, text] of texts) {
    assert.doesNotMatch(text, /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/, key);
  }
});

test("所有文案都不为空，且占位符在三种语言里保持一致", () => {
  const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

  const flatten = (value, prefix = "", result = {}) => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const isPlural =
        child &&
        typeof child === "object" &&
        !Array.isArray(child) &&
        Object.keys(child).every((form) => PLURAL_FORMS.has(form));

      if (child && typeof child === "object" && !isPlural) {
        flatten(child, path, result);
      } else {
        result[path] = child;
      }
    }

    return result;
  };

  const textOf = (entry) => {
    if (entry && typeof entry === "object") {
      return `${entry.one ?? ""} ${entry.other ?? ""}`;
    }

    return String(entry ?? "");
  };

  const placeholders = (entry) =>
    [...new Set(textOf(entry).match(/\{(\w+)\}/g) || [])].sort().join(",");

  const zhTexts = flatten(zhCN);
  const enTexts = flatten(en);
  const jaTexts = flatten(ja);

  for (const [key, entry] of Object.entries(zhTexts)) {
    assert.notEqual(textOf(entry).trim(), "", key);
    assert.equal(placeholders(enTexts[key]), placeholders(entry), key);
    assert.equal(placeholders(jaTexts[key]), placeholders(entry), key);
  }
});

test("hasTranslation / getIntlLocale：判断文案并映射 Intl 语言标签", () => {
  assert.equal(hasTranslation("common.search"), true);
  assert.equal(hasTranslation("common.notExist"), false);
  assert.equal(hasTranslation("nope"), false);

  try {
    assert.equal(getIntlLocale(), "zh-CN");
    setLocale("en");
    assert.equal(getIntlLocale(), "en-US");
    setLocale("ja");
    assert.equal(getIntlLocale(), "ja-JP");
  } finally {
    setLocale("zh-CN");
  }
});

test("subscribeLocaleChange：忽略非函数监听器，取消订阅后不再通知", () => {
  assert.doesNotThrow(() => subscribeLocaleChange(null));

  const seen = [];
  const unsubscribe = subscribeLocaleChange((locale) => seen.push(locale));

  try {
    setLocale("en");
    assert.deepEqual(seen, ["en"]);

    unsubscribe();
    setLocale("zh-CN");
    assert.deepEqual(seen, ["en"]);
  } finally {
    unsubscribe();
    setLocale("zh-CN");
  }
});

test("setLocale：异常监听器不影响其他监听器与语言切换", () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  const seen = [];
  const unsubscribeBad = subscribeLocaleChange(() => {
    throw new Error("listener boom");
  });
  const unsubscribeGood = subscribeLocaleChange((locale) => seen.push(locale));

  try {
    assert.equal(setLocale("en"), true);
    assert.deepEqual(seen, ["en"]);
    assert.equal(warnings.length, 1);
    assert.equal(getLocale(), "en");
  } finally {
    unsubscribeBad();
    unsubscribeGood();
    console.warn = originalWarn;
    setLocale("zh-CN");
  }
});

test("formatNumber / formatDateTime：非有限值与 Date 实例", () => {
  assert.equal(formatNumber(Number.NaN), "NaN");
  assert.equal(formatNumber(Number.POSITIVE_INFINITY), "Infinity");
  assert.equal(formatNumber(undefined), "undefined");

  assert.equal(formatDateTime("bad"), "");
  assert.equal(formatDateTime(Number.NaN), "");
  assert.equal(
    formatDateTime(new Date(2026, 0, 2, 3, 4, 5).getTime(), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    "2026/01/02",
  );
});
