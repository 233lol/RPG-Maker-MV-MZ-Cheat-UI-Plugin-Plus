import test from "node:test";
import assert from "node:assert/strict";

import {
  ITEMS_PER_PAGE_OPTIONS,
  clampPage,
  getPageBounds,
  getPageCount,
  normalizeItemsPerPage,
  paginate,
} from "../../cheat-engine/www/cheat/js/PaginationHelper.js";

test("normalizeItemsPerPage：-1 / 非正数 / 非数字都按「全部」处理", () => {
  assert.equal(normalizeItemsPerPage(-1), 0);
  assert.equal(normalizeItemsPerPage(0), 0);
  assert.equal(normalizeItemsPerPage("abc"), 0);
  assert.equal(normalizeItemsPerPage(5.9), 5);
  assert.equal(normalizeItemsPerPage("10"), 10);
});

test("getPageCount：空列表也至少 1 页，All 只算 1 页", () => {
  assert.equal(getPageCount(0, 5), 1);
  assert.equal(getPageCount(5, 5), 1);
  assert.equal(getPageCount(6, 5), 2);
  assert.equal(getPageCount(12, 5), 3);
  assert.equal(getPageCount(12, -1), 1);
});

test("clampPage：非法页码回到第 1 页，越界页码收回最后一页", () => {
  assert.equal(clampPage(0, 3), 1);
  assert.equal(clampPage(-2, 3), 1);
  assert.equal(clampPage("abc", 3), 1);
  assert.equal(clampPage(2.9, 3), 2);
  assert.equal(clampPage(99, 3), 3);
  assert.equal(clampPage(1, 0), 1);
});

test("getPageBounds：普通分页返回 1-based 显示范围和 slice 下标", () => {
  assert.deepEqual(getPageBounds(12, 3, 5), {
    pageCount: 3,
    page: 3,
    start: 11,
    stop: 12,
    startIndex: 10,
    endIndex: 12,
  });
});

test("getPageBounds：空列表和 All 边界", () => {
  assert.deepEqual(getPageBounds(0, 2, 5), {
    pageCount: 1,
    page: 1,
    start: 0,
    stop: 0,
    startIndex: 0,
    endIndex: 0,
  });

  assert.deepEqual(getPageBounds(12, 5, -1), {
    pageCount: 1,
    page: 1,
    start: 1,
    stop: 12,
    startIndex: 0,
    endIndex: 12,
  });
});

test("getPageBounds：页码越界时自动回收", () => {
  assert.equal(getPageBounds(12, 99, 5).page, 3);
  assert.equal(getPageBounds(12, 99, 5).startIndex, 10);
});

test("paginate：返回当前页切片，All 返回全部", () => {
  const items = Array.from({ length: 12 }, (_, index) => index + 1);

  assert.deepEqual(paginate(items, 1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(paginate(items, 3, 5), [11, 12]);
  assert.deepEqual(paginate(items, 1, -1), items);
  assert.deepEqual(paginate(null, 1, 5), []);
});

test("ITEMS_PER_PAGE_OPTIONS 末项为「全部」", () => {
  const last = ITEMS_PER_PAGE_OPTIONS.at(-1);

  assert.equal(last.value, -1);
  assert.equal(last.title, "全部");
});
