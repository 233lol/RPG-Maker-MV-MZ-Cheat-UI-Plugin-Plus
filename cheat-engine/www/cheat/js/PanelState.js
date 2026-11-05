// @ts-check
/**
 * 面板筛选 / 分页状态的持久化。
 *
 * 所有面板共用一个 `panel-state.json`，按面板 id 存一段 JSON：
 *   { "item-table-weapon": { "search": "剑", "pagination": { ... } } }
 *
 * 值在写入前按面板提供的默认值做一次类型收敛，避免旧版本 / 手工改坏的
 * 字段把 v-model 变成错误类型。写入做 300ms 防抖，拖动分页时不会每帧写盘。
 */
import { KeyValueStorage } from "./KeyValueStorage.js";
import { getCheatSettingsPath } from "./SettingsPath.js";

const STORAGE_KEY = "panels";
const WRITE_DELAY_MS = 300;

let storage = null;
let cache = null;
let writeTimer = null;

function getStorage() {
  if (!storage) {
    storage = new KeyValueStorage(getCheatSettingsPath("panel-state.json"));
  }

  return storage;
}

function readAll() {
  if (cache) {
    return cache;
  }

  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    cache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
  } catch (error) {
    console.warn("[cheat plugin] 读取面板状态失败，按空状态处理", error);
    cache = {};
  }

  return cache;
}

function sanitizeValue(value, fallback) {
  if (Array.isArray(fallback)) {
    if (!Array.isArray(value)) {
      return fallback.slice();
    }

    const template = fallback[0];

    if (template && typeof template === "object") {
      return value.map((item) => sanitizeValue(item, template));
    }

    return value;
  }

  if (fallback && typeof fallback === "object") {
    const source =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const result = {};

    for (const [key, defaultValue] of Object.entries(fallback)) {
      result[key] = sanitizeValue(source[key], defaultValue);
    }

    return result;
  }

  if (typeof fallback === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;
  }

  if (typeof fallback === "boolean") {
    return typeof value === "boolean" ? value : fallback;
  }

  if (typeof fallback === "string") {
    return typeof value === "string" ? value : fallback;
  }

  return value === undefined ? fallback : value;
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

export function flushPanelState() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }

  if (!cache) {
    return;
  }

  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("[cheat plugin] 写入面板状态失败", error);
  }
}

function scheduleWrite() {
  if (writeTimer) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(flushPanelState, WRITE_DELAY_MS);
}

/**
 * 读取某个面板的状态；缺失 / 损坏字段回退到 defaults。
 *
 * @param {string} panelId
 * @param {Record<string, unknown>} defaults
 * @returns {Record<string, unknown>}
 */
export function loadPanelState(panelId, defaults = {}) {
  const all = readAll();
  const saved = all[panelId];

  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    return cloneJson(defaults);
  }

  return sanitizeValue(saved, defaults);
}

/**
 * 保存某个面板的状态（防抖）。
 *
 * @param {string} panelId
 * @param {Record<string, unknown>} state
 */
export function savePanelState(panelId, state) {
  if (!panelId) {
    return;
  }

  const all = readAll();
  all[panelId] = cloneJson(state);
  scheduleWrite();
}

/**
 * 面板 mixin：mounted 时恢复，之后深度监听快照并自动保存。
 *
 * 组件需要提供：
 * - `panelStateId`：字符串或 computed
 * - `getPanelStateSnapshot()`：返回要持久化的对象
 * - `applyPanelState(state)`：可选，默认把字段写回组件
 */
export const panelStateMixin = {
  mounted() {
    const panelId = this.panelStateId;

    if (!panelId) {
      return;
    }

    const defaults = this.getPanelStateSnapshot();

    // 恢复状态期间置标记：带 watcher 的面板（例如全局变量面板）不要在
    // 恢复 search / rootFilter 时顺手把分页重置到第 1 页或清空搜索词。
    // watcher 在 pre-flush 阶段执行，早于 $nextTick 回调，标记仍然有效。
    this.__restoringPanelState = true;

    try {
      this.applyPanelState(loadPanelState(panelId, defaults));
    } finally {
      this.$nextTick(() => {
        this.__restoringPanelState = false;
      });
    }

    this.__panelStateUnwatch = this.$watch(
      () => this.getPanelStateSnapshot(),
      (state) => savePanelState(panelId, state),
      { deep: true },
    );
  },

  beforeUnmount() {
    if (this.__panelStateUnwatch) {
      this.__panelStateUnwatch();
      this.__panelStateUnwatch = null;
    }

    // 切换面板 / 关闭窗口时立即落盘，不等 300ms 防抖
    flushPanelState();
  },

  methods: {
    getPanelStateSnapshot() {
      return {};
    },

    applyPanelState(state) {
      for (const [key, value] of Object.entries(state || {})) {
        this[key] = value;
      }
    },
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushPanelState);
}
