// 分页面板的统一计算。
//
// v-data-table 的 "All" 选项值是 -1，直接把 itemsPerPage 代入
// (page - 1) * itemsPerPage + 1 会得到 0 / 负数，导致页码标签和
// pageCount 全错。这里统一把它当成「全部」。
import { t } from "./strings.js";

// 分页选项在每次调用时按当前语言生成，避免切换语言后「全部」仍是旧文案。
export function getItemsPerPageOptions() {
  return [5, 10, 15, 20, { title: t("common.all"), value: -1 }];
}

// 返回 0 表示「全部」
export function normalizeItemsPerPage(value) {
  const num = Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }

  return Math.floor(num);
}

export function getPageCount(total, itemsPerPage) {
  const count = Math.max(0, Number(total) || 0);
  const perPage = normalizeItemsPerPage(itemsPerPage);

  if (perPage <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(count / perPage));
}

export function clampPage(page, pageCount) {
  const count = Math.max(1, Number(pageCount) || 1);
  const value = Number(page);

  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }

  return Math.min(Math.floor(value), count);
}

// start / stop 是给界面显示的 1-based 范围；startIndex / endIndex 用于 slice。
export function getPageBounds(total, page, itemsPerPage) {
  const count = Math.max(0, Number(total) || 0);
  const perPage = normalizeItemsPerPage(itemsPerPage);
  const pageCount = getPageCount(count, perPage);
  const currentPage = clampPage(page, pageCount);

  if (count === 0) {
    return {
      pageCount,
      page: 1,
      start: 0,
      stop: 0,
      startIndex: 0,
      endIndex: 0,
    };
  }

  if (perPage <= 0) {
    return {
      pageCount: 1,
      page: 1,
      start: 1,
      stop: count,
      startIndex: 0,
      endIndex: count,
    };
  }

  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, count);

  return {
    pageCount,
    page: currentPage,
    start: startIndex + 1,
    stop: endIndex,
    startIndex,
    endIndex,
  };
}

export function paginate(items, page, itemsPerPage) {
  const list = Array.isArray(items) ? items : [];
  const bounds = getPageBounds(list.length, page, itemsPerPage);

  return list.slice(bounds.startIndex, bounds.endIndex);
}

// 过滤后条目变少时把页码收回范围内（例如搜索只剩 1 页但当前在第 5 页）。
export const paginationWatcherMixin = {
  watch: {
    pageCount(value) {
      if (
        this.pagination &&
        Number.isFinite(value) &&
        value > 0 &&
        this.pagination.page > value
      ) {
        this.pagination.page = value;
      }
    },
  },
};
