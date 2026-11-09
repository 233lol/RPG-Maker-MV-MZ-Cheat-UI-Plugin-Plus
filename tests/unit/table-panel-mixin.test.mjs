import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLockPayload,
  lockTableMixin,
} from "../../cheat-engine/www/cheat/js/LockTableMixin.js";
import { tablePanelMixin } from "../../cheat-engine/www/cheat/js/TablePanelMixin.js";

const table = tablePanelMixin.methods;
const tableComputed = tablePanelMixin.computed;
const lock = lockTableMixin.methods;

function makePanel(extra = {}) {
  return {
    search: "",
    pagination: { page: 1, itemsPerPage: 5 },
    panelStateExtraKeys: [],
    ...extra,
  };
}

// 组件的所有方法都在同一个实例上，单测里手动把它们摊平
function makeLockPanel(extra = {}) {
  return {
    ...lock,
    lockKind: "switch",
    tableItems: [],
    persistedLockMap: {},
    ...extra,
  };
}

test("tablePanelMixin.data 提供搜索 / 分页默认值", () => {
  const data = tablePanelMixin.data.call({});

  assert.equal(data.search, "");
  assert.deepEqual(data.pagination, { page: 1, itemsPerPage: 5 });
  assert.deepEqual(data.panelStateExtraKeys, []);
  const options = tablePanelMixin.computed.itemsPerPageOptions.call({});
  assert.ok(Array.isArray(options));
  assert.ok(options.length > 0);
});

test("tablePanelMixin：快照包含搜索、分页与声明的额外字段", () => {
  const panel = makePanel({
    search: "abc",
    pagination: { page: 2, itemsPerPage: 10 },
    panelStateExtraKeys: ["excludeNameless"],
    excludeNameless: false,
  });

  assert.deepEqual(table.getPanelStateSnapshot.call(panel), {
    search: "abc",
    pagination: { page: 2, itemsPerPage: 10 },
    excludeNameless: false,
  });
});

test("tablePanelMixin：恢复状态时只覆盖存在的字段", () => {
  const panel = makePanel({
    panelStateExtraKeys: ["excludeNameless"],
    excludeNameless: true,
  });

  table.applyPanelState.call(panel, {
    search: "剑",
    // 旧版本只存了 page，itemsPerPage 应保留当前值
    pagination: { page: 3 },
    excludeNameless: false,
  });

  assert.equal(panel.search, "剑");
  assert.deepEqual(panel.pagination, { page: 3, itemsPerPage: 5 });
  assert.equal(panel.excludeNameless, false);

  // 状态里没有的额外字段保持原值，非字符串搜索词不覆盖
  table.applyPanelState.call(panel, { search: 42 });
  assert.equal(panel.search, "剑");
  assert.equal(panel.excludeNameless, false);
});

test("tablePanelMixin：totalCount / pageCount 的默认实现", () => {
  assert.equal(tableComputed.totalCount.call({}), 0);
  assert.equal(
    tableComputed.totalCount.call({ filteredTableItems: [1, 2, 3] }),
    3,
  );

  const pageCount = (totalCount, itemsPerPage) =>
    tableComputed.pageCount.call({
      totalCount,
      pagination: { itemsPerPage },
    });

  assert.equal(pageCount(0, 5), 1);
  assert.equal(pageCount(12, 5), 3);
  assert.equal(pageCount(12, 20), 1);
  // -1 = 「全部」
  assert.equal(pageCount(12, -1), 1);
});

test("tablePanelMixin：jumpToPage 只改当前页", () => {
  const panel = makePanel();

  table.jumpToPage.call(panel, 4);

  assert.equal(panel.pagination.page, 4);
  assert.equal(panel.pagination.itemsPerPage, 5);
});

test("lockTableMixin：开关锁定值归一化为布尔，变量保留原值", () => {
  const switchPanel = makeLockPanel({ lockKind: "switch" });
  const variablePanel = makeLockPanel({ lockKind: "variable" });

  for (const value of ["", 0, null, undefined]) {
    assert.equal(switchPanel.normalizeLockValue(value), false);
  }
  assert.equal(switchPanel.normalizeLockValue("x"), true);

  const object = { a: 1 };
  assert.equal(variablePanel.normalizeLockValue(object), object);
  assert.equal(variablePanel.normalizeLockValue("text"), "text");
});

test("buildLockPayload：只保留有效的锁定项，并按面板类型归一化", () => {
  const items = [
    { id: 0, lockEnabled: true, lockValue: true },
    { id: 1, lockEnabled: false, lockValue: false },
    { id: 2, lockEnabled: true, lockValue: 1 },
    { id: -3, lockEnabled: true, lockValue: "x" },
    { id: "bad", lockEnabled: true, lockValue: "x" },
    null,
  ];

  assert.deepEqual(buildLockPayload(items, false), {
    2: { lockEnabled: true, lockValue: true },
  });

  assert.deepEqual(
    buildLockPayload(
      [
        { id: 3, lockEnabled: true, lockValue: { nested: [1, 2] } },
        { id: 4, lockEnabled: true, lockValue: 0 },
      ],
      true,
    ),
    {
      3: { lockEnabled: true, lockValue: { nested: [1, 2] } },
      4: { lockEnabled: true, lockValue: 0 },
    },
  );

  assert.deepEqual(buildLockPayload(null, false), {});
});
