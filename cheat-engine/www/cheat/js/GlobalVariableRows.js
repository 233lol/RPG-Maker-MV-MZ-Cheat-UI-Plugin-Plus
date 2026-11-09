// @ts-check
/**
 * 全局变量面板的行构建 / 过滤 / 分页辅助（纯函数）。
 */
import { t } from "./strings.js";
import {
  createEntry,
  formatPathText,
  getContainerKeys,
  getRootNamesByFilter,
  isHiddenKind,
  resolvePathValue,
} from "./GlobalObjectHelper.js";

export function buildBreadcrumbItems(
  path,
  rootLabel = t("globalVariable.title"),
) {
  const items = [{ label: rootLabel, path: [] }];

  (path || []).forEach((key, index) => {
    items.push({
      label: String(key),
      path: path.slice(0, index + 1),
    });
  });

  return items;
}

export function entryMatches(item, keyword) {
  const text = String(keyword || "")
    .trim()
    .toLowerCase();

  if (!text) {
    return true;
  }

  return (
    String(item.name || "")
      .toLowerCase()
      .includes(text) ||
    String(item.preview || "")
      .toLowerCase()
      .includes(text) ||
    String(item.typeText || "")
      .toLowerCase()
      .includes(text)
  );
}

export function filterEntries(entries, search) {
  const keyword = String(search || "")
    .trim()
    .toLowerCase();

  if (!keyword) {
    return entries;
  }

  return entries.filter((item) => entryMatches(item, keyword));
}

export function buildEntries({
  container,
  atRoot,
  rootScan,
  rootFilter,
  pluginNameMap = {},
}) {
  if (container === null || container === undefined) {
    return [];
  }

  const keys = atRoot
    ? getRootNamesByFilter(rootScan || { rpg: [], plugin: [] }, rootFilter)
    : getContainerKeys(container);

  return keys
    .map((key) => {
      const entry = createEntry(container, key, atRoot);

      if (atRoot) {
        entry.isPlugin = !!pluginNameMap[key];
      }

      return entry;
    })
    .filter((entry) => !isHiddenKind(entry.kind));
}

// ---------- 收藏 ----------

/**
 * 收藏路径只接受「非空、元素可转字符串」的数组，并去重。
 * panel-state.json 可能被旧版本 / 手工改成任意结构，这里统一收口。
 *
 * @param {unknown} value
 * @returns {string[][]}
 */
export function normalizeFavoritePaths(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const rawPath of value) {
    if (!Array.isArray(rawPath) || rawPath.length === 0) {
      continue;
    }

    if (
      !rawPath.every(
        (key) => typeof key === "string" || typeof key === "number",
      )
    ) {
      continue;
    }

    const path = rawPath.map((key) => String(key));
    const key = path.join("\u0000");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(path);
  }

  return result;
}

/**
 * @param {unknown} path
 * @returns {string}
 */
export function favoritePathKey(path) {
  return Array.isArray(path)
    ? path.map((key) => String(key)).join("\u0000")
    : "";
}

/**
 * @param {unknown} favorites
 * @param {unknown} path
 * @returns {boolean}
 */
export function isFavoritePath(favorites, path) {
  const key = favoritePathKey(path);

  if (!key) {
    return false;
  }

  return normalizeFavoritePaths(favorites).some(
    (item) => favoritePathKey(item) === key,
  );
}

/**
 * 切换一个路径的收藏状态，返回新数组。
 *
 * @param {unknown} favorites
 * @param {unknown} path
 * @returns {string[][]}
 */
export function toggleFavoritePath(favorites, path) {
  const list = normalizeFavoritePaths(favorites);
  const normalized = Array.isArray(path) ? path.map((key) => String(key)) : [];

  if (normalized.length === 0) {
    return list;
  }

  const key = favoritePathKey(normalized);
  const index = list.findIndex((item) => favoritePathKey(item) === key);

  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(normalized);
  }

  return list;
}

/**
 * 把收藏路径解析成列表行。路径失效（变量被删 / 对象被替换）时跳过，
 * 避免收藏列表里出现一堆永远打不开的条目。
 *
 * @param {unknown} favorites
 * @param {unknown} root
 * @returns {Array<Record<string, any>>}
 */
export function buildFavoriteRows(favorites, root) {
  const rows = [];

  for (const path of normalizeFavoritePaths(favorites)) {
    const parent = resolvePathValue(root, path.slice(0, -1));

    if (!parent.ok) {
      continue;
    }

    const key = path[path.length - 1];
    const entry = createEntry(parent.value, key, false);

    if (entry.kind === "error" || isHiddenKind(entry.kind)) {
      continue;
    }

    entry.fullPath = path;
    entry.pathText = formatPathText(path);
    entry.isFavorite = true;

    rows.push(entry);
  }

  return rows;
}

/**
 * 收藏行的搜索：除了常规字段，还要匹配完整路径。
 *
 * @param {Array<Record<string, any>>} rows
 * @param {unknown} search
 * @returns {Array<Record<string, any>>}
 */
export function filterFavoriteRows(rows, search) {
  const list = Array.isArray(rows) ? rows : [];
  const keyword = String(search || "")
    .trim()
    .toLowerCase();

  if (!keyword) {
    return list;
  }

  return list.filter(
    (item) =>
      entryMatches(item, keyword) ||
      String(item.pathText || "")
        .toLowerCase()
        .includes(keyword),
  );
}

export function findPageOfKey(entries, key, perPage) {
  if (perPage <= 0) {
    return 1;
  }

  const index = (entries || []).findIndex(
    (item) => String(item.key) === String(key),
  );

  if (index < 0) {
    return 1;
  }

  return Math.floor(index / perPage) + 1;
}

// 自动刷新用：两次构建结果的显示字段全部一致时复用旧数组，
// 避免默认每 2 秒整体替换 entries 触发整列表 diff 与重渲染。
export function entriesShallowEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];

    if (x === y) {
      continue;
    }

    if (!x || !y) {
      return false;
    }

    if (
      x.key !== y.key ||
      x.kind !== y.kind ||
      x.preview !== y.preview ||
      x.valueText !== y.valueText ||
      x.boolValue !== y.boolValue ||
      x.isContainer !== y.isContainer ||
      x.isEditable !== y.isEditable ||
      x.isPlugin !== y.isPlugin
    ) {
      return false;
    }
  }

  return true;
}
