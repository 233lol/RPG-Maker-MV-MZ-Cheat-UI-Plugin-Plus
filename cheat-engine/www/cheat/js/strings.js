// @ts-check
// 共享 UI 文案 + 轻量国际化。
//
// 默认语言是简体中文；`t()` 每次调用都会按当前语言查表。
// 切换语言时调用 `setLocale()`，主界面会订阅变更并重挂作弊 UI（不重载游戏），
// 因此模块级常量不能直接保存 `t()` 的结果，应改成函数 / getter 按需求值。
//
// 用法：
//   import { t } from "../js/strings.js";
//   t("common.search")
//   t("common.reloadTarget", { target: "游戏数据" })
//   t("saveBackup.snapshotCount", { count: 2 })   // 支持复数
//
// 复数条目写成 { one, other }（需要时也可以写 zero / two / few / many），
// `t()` 会按当前语言的 Intl.PluralRules 选择对应形式。
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

// Intl 的 BCP 47 语言标签（这里是界面语言，不是文案 key）
const INTL_LOCALES = {
  "zh-CN": "zh-CN",
  en: "en-US",
  ja: "ja-JP",
};

// 复数形式条目只允许出现这些键，用来和普通嵌套对象区分开
const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

let currentLocale = loadSavedLocale();
const localeChangeListeners = new Set();

export function getLocale() {
  return currentLocale;
}

/**
 * 切换当前界面语言，并通知订阅者（主界面会重挂作弊 UI）。
 * 只接受 DICTIONARIES 里存在的语言；返回是否真的发生了变化。
 *
 * @param {string} locale
 * @returns {boolean}
 */
export function setLocale(locale) {
  if (
    typeof locale !== "string" ||
    !Object.hasOwnProperty.call(DICTIONARIES, locale) ||
    locale === currentLocale
  ) {
    return false;
  }

  currentLocale = locale;

  for (const listener of localeChangeListeners) {
    try {
      listener(locale);
    } catch (error) {
      console.warn("[cheat plugin] 语言变更监听器执行失败", error);
    }
  }

  return true;
}

/**
 * 订阅界面语言变化。返回取消订阅函数。
 *
 * @param {(locale: string) => void} listener
 * @returns {() => void}
 */
export function subscribeLocaleChange(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  localeChangeListeners.add(listener);

  return () => {
    localeChangeListeners.delete(listener);
  };
}

export function getAvailableLocales() {
  return Object.keys(DICTIONARIES).map((value) => ({
    value,
    title: LOCALE_TITLES[value] || value,
  }));
}

export function getIntlLocale() {
  return INTL_LOCALES[currentLocale] || currentLocale;
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

function isPluralEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);

  return keys.length > 0 && keys.every((key) => PLURAL_FORMS.has(key));
}

function pickPlural(entry, count) {
  const value = Number(count);

  if (!Number.isFinite(value)) {
    return entry.other;
  }

  try {
    if (typeof Intl !== "undefined" && typeof Intl.PluralRules === "function") {
      const rules = new Intl.PluralRules(getIntlLocale());
      const form = rules.select(value);

      if (typeof entry[form] === "string") {
        return entry[form];
      }
    }
  } catch (error) {
    // Intl 不可用时退回英语式的单复数判断
  }

  if (value === 1 && typeof entry.one === "string") {
    return entry.one;
  }

  return entry.other;
}

function resolveText(key, params) {
  let text = lookup(DICTIONARIES[currentLocale], key);

  if (isPluralEntry(text)) {
    text = pickPlural(text, params.count);
  }

  if (typeof text !== "string") {
    // 当前语言缺这条时回退到简体中文，避免切到一半出现空白。
    text = lookup(DICTIONARIES["zh-CN"], key);

    if (isPluralEntry(text)) {
      text = pickPlural(text, params.count);
    }
  }

  return typeof text === "string" ? text : null;
}

export function hasTranslation(key) {
  return resolveText(key, {}) !== null;
}

export function t(key, params = {}) {
  const text = resolveText(key, params);

  if (text === null) {
    // 缺失的 key 回显自身，方便开发时发现拼写错误，而不是静默显示空字符串。
    return key;
  }

  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

// 按当前语言格式化数字（千分位、本地数字符号）。
export function formatNumber(value, options = undefined) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return String(value);
  }

  try {
    if (
      typeof Intl !== "undefined" &&
      typeof Intl.NumberFormat === "function"
    ) {
      return new Intl.NumberFormat(getIntlLocale(), options).format(num);
    }
  } catch (error) {
    // Intl 不可用时退回 String()
  }

  return String(num);
}

// 按当前语言格式化时间。默认给出「年-月-日 时:分:秒」的紧凑格式。
export function formatDateTime(value, options = undefined) {
  const date = value instanceof Date ? value : new Date(Number(value));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const resolved = options || {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };

  try {
    if (
      typeof Intl !== "undefined" &&
      typeof Intl.DateTimeFormat === "function"
    ) {
      return new Intl.DateTimeFormat(getIntlLocale(), resolved).format(date);
    }
  } catch (error) {
    // Intl 不可用时退回 ISO 片段
  }

  return date.toISOString();
}
