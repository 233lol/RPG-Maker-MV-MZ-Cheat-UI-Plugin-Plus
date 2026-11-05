// @ts-check
/**
 * 全局变量面板的行构建 / 过滤 / 分页辅助（纯函数）。
 */
import { t } from "./strings.js";
import {
  createEntry,
  getContainerKeys,
  getRootNamesByFilter,
  isHiddenKind,
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
// 避免每 2 秒整体替换 entries 触发整列表 diff 与重渲染。
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
