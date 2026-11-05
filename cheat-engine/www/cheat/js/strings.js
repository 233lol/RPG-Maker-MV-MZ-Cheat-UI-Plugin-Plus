// @ts-check
// 共享 UI 文案 + 轻量国际化。
//
// 默认语言是简体中文；`t()` 每次调用都会按当前语言查表，因此组件重新渲染时
// 会显示新语言。切换语言后界面会刷新窗口，让模块级常量（分页选项等）也重新求值。
//
// 用法：
//   import { t } from "../js/strings.js";
//   t("common.search")
//   t("common.reloadTarget", { target: "游戏数据" })
import zhCN from "./locales/zh-CN.js";
import en from "./locales/en.js";
import ja from "./locales/ja.js";
import { loadSavedLocale } from "./LocaleService.js";

const DICTIONARIES = {
  "zh-CN": zhCN,
  en,
  ja,
};

const LOCALE_TITLES = {
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
};

const currentLocale = loadSavedLocale();

export function getLocale() {
  return currentLocale;
}

export function getAvailableLocales() {
  return Object.keys(DICTIONARIES).map((value) => ({
    value,
    title: LOCALE_TITLES[value] || value,
  }));
}

function lookup(dictionary, key) {
  return key
    .split(".")
    .reduce(
      (node, part) =>
        node && Object.hasOwnProperty.call(node, part) ? node[part] : undefined,
      dictionary,
    );
}

export function t(key, params = {}) {
  const current = lookup(DICTIONARIES[currentLocale], key);
  const text =
    typeof current === "string" ? current : lookup(DICTIONARIES["zh-CN"], key);

  if (typeof text !== "string") {
    // 缺失的 key 回显自身，方便开发时发现拼写错误，而不是静默显示空字符串。
    return key;
  }

  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}
