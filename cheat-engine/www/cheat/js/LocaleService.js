// @ts-check
// 界面语言的检测与持久化。
//
// 语言存到 <设置目录>/locale.json。切换语言后由界面刷新窗口，
// 让所有模块级文案（导航、分页选项等）重新按新语言求值。
import { KeyValueStorage } from "./KeyValueStorage.js";
import { getCheatSettingsPath } from "./SettingsPath.js";

const SUPPORTED = new Set(["zh-CN", "en", "ja"]);
const DEFAULT_LOCALE = "zh-CN";

function normalizeLocale(value) {
  const text = String(value || "");

  if (SUPPORTED.has(text)) {
    return text;
  }

  const lower = text.toLowerCase();

  if (lower.startsWith("zh")) {
    return "zh-CN";
  }

  if (lower.startsWith("ja")) {
    return "ja";
  }

  if (lower.startsWith("en")) {
    return "en";
  }

  return null;
}

export function detectLocale() {
  // Node 也有全局 navigator，但单元测试 / 构建脚本没有窗口环境，
  // 统一按默认中文处理，避免测试结果随运行机器的语言变化。
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  try {
    return normalizeLocale(navigator.language) || DEFAULT_LOCALE;
  } catch (error) {
    return DEFAULT_LOCALE;
  }
}

export function loadSavedLocale() {
  // Node 下没有可用的 localStorage（Node 26 的全局 localStorage 需要
  // --localstorage-file），直接返回默认值，避免测试时触发实验性警告。
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  try {
    const storage = new KeyValueStorage(getCheatSettingsPath("locale.json"));
    const saved = storage.getItem("locale");

    if (saved) {
      return normalizeLocale(saved) || detectLocale();
    }
  } catch (error) {
    // 非 nw.js / 文件损坏时退回浏览器语言
  }

  return detectLocale();
}

export function saveLocale(locale) {
  const normalized = normalizeLocale(locale);

  if (!normalized) {
    return;
  }

  try {
    const storage = new KeyValueStorage(getCheatSettingsPath("locale.json"));
    storage.setItem("locale", normalized);
  } catch (error) {
    console.warn("[cheat plugin] 保存语言设置失败", error);
  }
}
