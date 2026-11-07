// @ts-check
/**
 * 全局变量面板的编辑历史 / 撤销（纯函数）。
 *
 * 面板允许直接修改 window 上的任意全局变量、编辑容器 JSON、新增 / 删除属性。
 * 这些操作没有引擎级回滚，改错一个值（例如把 $gameParty._gold 写成对象）
 * 只能靠玩家自己回忆。这里记录「足够把值恢复原状」的最小信息：
 *   - set：写入前的旧值，以及该键原本是否存在
 *   - add：新增的键（撤销时删除）
 *   - delete：删除的旧值（数组按原下标插回）
 *
 * 历史只保存在内存里，不落盘：它服务于「刚才点错了」这一场景，不应跨重启。
 */
import {
  deleteChildValue,
  resolvePathValue,
  setChildValue,
} from "./GlobalObjectHelper.js";

export const HISTORY_LIMIT = 50;

/**
 * @typedef {{
 *   action: "set",
 *   path: string[],
 *   key: string,
 *   hadOwn: boolean,
 *   oldValue: unknown,
 * }} SetHistoryEntry
 * @typedef {{
 *   action: "add",
 *   path: string[],
 *   key: string,
 * }} AddHistoryEntry
 * @typedef {{
 *   action: "delete",
 *   path: string[],
 *   key: string,
 *   oldValue: unknown,
 *   isArray: boolean,
 *   index: number,
 * }} DeleteHistoryEntry
 * @typedef {SetHistoryEntry | AddHistoryEntry | DeleteHistoryEntry} HistoryEntry
 */

/** @param {unknown} value */
function normalizePath(value) {
  return Array.isArray(value) ? value.map((key) => String(key)) : [];
}

/** @param {unknown} key */
function normalizeKey(key) {
  return String(key);
}

/**
 * @param {unknown} path
 * @param {unknown} key
 * @param {unknown} oldValue
 * @param {boolean} hadOwn
 * @returns {SetHistoryEntry}
 */
export function buildSetHistoryEntry(path, key, oldValue, hadOwn) {
  return {
    action: "set",
    path: normalizePath(path),
    key: normalizeKey(key),
    hadOwn: !!hadOwn,
    oldValue,
  };
}

/**
 * @param {unknown} path
 * @param {unknown} key
 * @returns {AddHistoryEntry}
 */
export function buildAddHistoryEntry(path, key) {
  return {
    action: "add",
    path: normalizePath(path),
    key: normalizeKey(key),
  };
}

/**
 * @param {unknown} path
 * @param {unknown} key
 * @param {unknown} oldValue
 * @param {boolean} isArray
 * @returns {DeleteHistoryEntry}
 */
export function buildDeleteHistoryEntry(path, key, oldValue, isArray) {
  const index = Number(key);
  return {
    action: "delete",
    path: normalizePath(path),
    key: normalizeKey(key),
    oldValue,
    isArray: !!isArray,
    index: Number.isInteger(index) ? index : -1,
  };
}

/**
 * 追加一条历史，超出上限时丢弃最旧的记录。
 *
 * @param {HistoryEntry[]} stack
 * @param {HistoryEntry} entry
 * @param {number} [limit]
 * @returns {HistoryEntry[]}
 */
export function pushHistoryEntry(stack, entry, limit = HISTORY_LIMIT) {
  const next = Array.isArray(stack) ? stack.slice() : [];
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;

  if (!entry) {
    return next;
  }

  next.push(entry);

  if (max > 0 && next.length > max) {
    return next.slice(next.length - max);
  }

  return next;
}

/**
 * 把一条历史记录应用到 root 上。
 *
 * @param {unknown} root
 * @param {HistoryEntry | null | undefined} entry
 * @returns {{ ok: boolean, message?: string }}
 */
export function revertHistoryEntry(root, entry) {
  if (!entry || typeof entry !== "object") {
    return { ok: false, message: "empty history entry" };
  }

  const path = Array.isArray(entry.path) ? entry.path : [];
  const resolved = resolvePathValue(root, path);

  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const container = resolved.value;

  if (
    container === null ||
    (typeof container !== "object" && typeof container !== "function")
  ) {
    return { ok: false, message: "history target is not writable" };
  }

  if (entry.action === "set") {
    if (entry.hadOwn) {
      return setChildValue(container, entry.key, entry.oldValue);
    }

    return deleteChildValue(container, entry.key);
  }

  if (entry.action === "add") {
    return deleteChildValue(container, entry.key);
  }

  if (entry.action === "delete") {
    if (entry.isArray && entry.index >= 0) {
      try {
        container.splice(entry.index, 0, entry.oldValue);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: String((error && error.message) || error),
        };
      }
    }

    return setChildValue(container, entry.key, entry.oldValue);
  }

  return { ok: false, message: "unknown history action" };
}
