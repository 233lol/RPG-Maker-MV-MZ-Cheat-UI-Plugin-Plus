import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildLockPayload,
  lockTableMixin,
} from "../../cheat-engine/www/cheat/js/LockTableMixin.js";
import { LockService } from "../../cheat-engine/www/cheat/js/LockService.js";

const methods = lockTableMixin.methods;
const computed = lockTableMixin.computed;

const originalLockService = {
  getSwitchLocks: LockService.getSwitchLocks,
  setSwitchLocks: LockService.setSwitchLocks,
  applySwitchLock: LockService.applySwitchLock,
  getVariableLocks: LockService.getVariableLocks,
  setVariableLocks: LockService.setVariableLocks,
  applyVariableLock: LockService.applyVariableLock,
  hasAnyLock: LockService.hasAnyLock,
};

function makePanel(overrides = {}) {
  return {
    ...methods,
    lockKind: "switch",
    tableItems: [],
    filteredTableItems: [],
    persistedLockMap: {},
    search: "",
    pagination: { page: 1, itemsPerPage: 5 },
    panelStateExtraKeys: ["excludeNameless"],
    ...overrides,
  };
}

afterEach(() => {
  Object.assign(LockService, originalLockService);
  delete globalThis.$dataSystem;
  delete globalThis.window;
});

test("lockTableMixin.data：默认字段与面板状态额外键", () => {
  const data = lockTableMixin.data.call({});

  assert.equal(data.lockKind, "switch");
  assert.equal(data.excludeNameless, true);
  assert.deepEqual(data.names, []);
  assert.deepEqual(data.tableItems, []);
  assert.deepEqual(data.persistedLockMap, {});
  assert.deepEqual(data.panelStateExtraKeys, ["excludeNameless"]);
});

test("allFilteredLocked：忽略占位项，空列表不算全锁", () => {
  const panel = makePanel();

  assert.equal(computed.allFilteredLocked.call(panel), false);

  panel.filteredTableItems = [{ id: 0, lockEnabled: true }];
  assert.equal(computed.allFilteredLocked.call(panel), false);

  panel.filteredTableItems = [
    { id: 1, lockEnabled: true },
    { id: 2, lockEnabled: false },
  ];
  assert.equal(computed.allFilteredLocked.call(panel), false);

  panel.filteredTableItems = [
    { id: 1, lockEnabled: true },
    { id: 2, lockEnabled: 1 },
  ];
  assert.equal(computed.allFilteredLocked.call(panel), true);
});

test("getLockMapById：优先使用当前表格行，并为每个 id 归一化锁定值", () => {
  const panel = makePanel({
    lockKind: "variable",
    tableItems: [
      { id: 1, lockEnabled: true, lockValue: { a: 1 } },
      { id: 2, lockEnabled: false, lockValue: "x" },
    ],
  });

  const map = panel.getLockMapById();

  assert.deepEqual([...map.keys()], [1, 2]);
  assert.deepEqual(map.get(1), {
    lockEnabled: true,
    lockValue: { a: 1 },
  });
  assert.deepEqual(map.get(2), { lockEnabled: false, lockValue: "x" });
});

test("getLockMapById：表格为空时从持久化锁定表恢复并跳过非法 id", () => {
  const switchPanel = makePanel({
    persistedLockMap: {
      1: { lockEnabled: true, lockValue: "truthy" },
      2: { lockEnabled: false, lockValue: 1 },
      bad: { lockEnabled: true, lockValue: true },
    },
  });

  assert.deepEqual(
    [...switchPanel.getLockMapById().entries()],
    [
      [1, { lockEnabled: true, lockValue: true }],
      [2, { lockEnabled: false, lockValue: true }],
    ],
  );

  const variablePanel = makePanel({
    lockKind: "variable",
    persistedLockMap: {
      3: { lockEnabled: true, lockValue: 0 },
    },
  });

  assert.deepEqual(variablePanel.getLockMapById().get(3), {
    lockEnabled: true,
    lockValue: 0,
  });
});

test("readPersistedLocks：按面板类型读取对应锁定表", () => {
  const switchPanel = makePanel({ lockKind: "switch" });
  const variablePanel = makePanel({ lockKind: "variable" });

  LockService.getSwitchLocks = () => ({ 1: { lockEnabled: true } });
  LockService.getVariableLocks = () => ({ 2: { lockEnabled: true } });

  switchPanel.readPersistedLocks();
  variablePanel.readPersistedLocks();

  assert.deepEqual(switchPanel.persistedLockMap, { 1: { lockEnabled: true } });
  assert.deepEqual(variablePanel.persistedLockMap, {
    2: { lockEnabled: true },
  });
});

test("writePersistedLocks：只写有效锁定项，并同步到 LockService", () => {
  const switchPanel = makePanel({
    tableItems: [
      { id: 1, lockEnabled: true, lockValue: 1 },
      { id: 2, lockEnabled: false, lockValue: false },
      { id: 0, lockEnabled: true, lockValue: true },
    ],
  });
  const variablePanel = makePanel({
    lockKind: "variable",
    tableItems: [{ id: 3, lockEnabled: true, lockValue: { x: 1 } }],
  });

  let switchPayload = null;
  let variablePayload = null;
  LockService.setSwitchLocks = (payload) => {
    switchPayload = payload;
  };
  LockService.setVariableLocks = (payload) => {
    variablePayload = payload;
  };

  switchPanel.writePersistedLocks();
  variablePanel.writePersistedLocks();

  assert.deepEqual(switchPayload, {
    1: { lockEnabled: true, lockValue: true },
  });
  assert.deepEqual(switchPanel.persistedLockMap, switchPayload);

  assert.deepEqual(variablePayload, {
    3: { lockEnabled: true, lockValue: { x: 1 } },
  });
  assert.deepEqual(variablePanel.persistedLockMap, variablePayload);
});

test("lockValueOf / applyLock：读取游戏值，按开关或变量调用对应锁定方法", () => {
  const switchPanel = makePanel({
    readValue: (id) => (id === 1 ? 1 : 0),
    normalizeValue: (value) => !!value,
  });
  const variablePanel = makePanel({
    lockKind: "variable",
    readValue: () => "game-value",
    normalizeValue: (value) => value,
  });

  assert.equal(switchPanel.lockValueOf(1), true);
  assert.equal(variablePanel.lockValueOf(2), "game-value");

  const calls = [];
  LockService.applySwitchLock = (id) => calls.push(["switch", id]);
  LockService.applyVariableLock = (id) => calls.push(["variable", id]);

  const switchItem = { id: 1, value: false, lockEnabled: true };
  const variableItem = { id: 2, value: "", lockEnabled: true };

  switchPanel.applyLock(switchItem);
  variablePanel.applyLock(variableItem);

  assert.deepEqual(calls, [
    ["switch", 1],
    ["variable", 2],
  ]);
  assert.equal(switchItem.value, true);
  assert.equal(variableItem.value, "game-value");

  // 未锁定 / 空条目不应触发写回
  switchPanel.applyLock({ id: 1, lockEnabled: false });
  switchPanel.applyLock(null);
  assert.equal(calls.length, 2);
});

test("toggleItemLock：切换锁定状态、记录当前值并持久化", () => {
  const applied = [];
  const panel = makePanel({
    requireDataReady: () => true,
    lockValueOf: (id) => `value-${id}`,
    applyLock(item) {
      applied.push(item);
    },
    writePersistedLocks() {
      this.writes = (this.writes || 0) + 1;
    },
  });

  const item = { id: 1, lockEnabled: false, lockValue: null };

  panel.toggleItemLock(item);
  assert.equal(item.lockEnabled, true);
  assert.equal(item.lockValue, "value-1");
  assert.deepEqual(applied, [item]);

  panel.toggleItemLock(item);
  assert.equal(item.lockEnabled, false);
  assert.deepEqual(applied, [item], "解锁时不应再套用锁定值");

  assert.equal(panel.writes, 2);

  // 0 号占位 / 非整数 id / 空条目都不处理
  for (const invalid of [
    { id: 0, lockEnabled: false },
    { id: 1.5, lockEnabled: false },
    { id: "1", lockEnabled: false },
    null,
  ]) {
    panel.toggleItemLock(invalid);
  }

  assert.equal(panel.writes, 2);

  panel.requireDataReady = () => false;
  panel.toggleItemLock(item);
  assert.equal(panel.writes, 2);
});

test("toggleAllFilteredLocks：按当前状态批量锁定或解锁，保留 0 号占位", () => {
  const applied = [];
  const panel = makePanel({
    requireDataReady: () => true,
    filteredTableItems: [
      { id: 0, lockEnabled: false, value: false },
      { id: 1, lockEnabled: false, value: true },
      { id: 2, lockEnabled: false, value: false },
    ],
    lockValueOf: (id) => `value-${id}`,
    applyLock(item) {
      applied.push(item.id);
    },
    writePersistedLocks() {
      this.writes = (this.writes || 0) + 1;
    },
    allFilteredLocked: false,
  });

  panel.toggleAllFilteredLocks();

  assert.equal(panel.filteredTableItems[0].lockEnabled, false);
  assert.equal(panel.filteredTableItems[1].lockEnabled, true);
  assert.equal(panel.filteredTableItems[2].lockEnabled, true);
  assert.equal(panel.filteredTableItems[1].lockValue, "value-1");
  assert.deepEqual(applied, [1, 2]);
  assert.equal(panel.writes, 1);

  panel.allFilteredLocked = true;
  panel.toggleAllFilteredLocks();

  assert.ok(panel.filteredTableItems.every((item) => !item.lockEnabled));
  assert.deepEqual(applied, [1, 2], "解锁时不应再套用锁定值");
  assert.equal(panel.writes, 2);

  panel.requireDataReady = () => false;
  panel.toggleAllFilteredLocks();
  assert.equal(panel.writes, 2);
});

test("syncLockedRows：只同步已锁定行，未锁定行保留用户输入", () => {
  const values = { 1: true, 2: false };
  const panel = makePanel({
    tableItems: [
      { id: 1, lockEnabled: true, value: false },
      { id: 2, lockEnabled: false, value: true },
      { id: 3, lockEnabled: true, value: true },
    ],
    isDataReady: () => true,
    readValue: (id) => values[id],
    normalizeValue: (value) => !!value,
  });

  LockService.hasAnyLock = () => true;

  panel.syncLockedRows();

  assert.equal(panel.tableItems[0].value, true);
  assert.equal(panel.tableItems[1].value, true, "未锁定行不能被游戏值覆盖");
  assert.equal(panel.tableItems[2].value, false);
});

test("syncLockedRows：无数据 / 数据未就绪 / 没有锁时直接返回", () => {
  const panel = makePanel({
    tableItems: [{ id: 1, lockEnabled: true, value: false }],
    isDataReady: () => true,
    readValue: () => true,
    normalizeValue: (value) => !!value,
  });

  LockService.hasAnyLock = () => false;
  panel.syncLockedRows();
  assert.equal(panel.tableItems[0].value, false);

  LockService.hasAnyLock = () => true;
  panel.isDataReady = () => false;
  panel.syncLockedRows();
  assert.equal(panel.tableItems[0].value, false);

  panel.isDataReady = () => true;
  panel.tableItems = [];
  panel.syncLockedRows();
  assert.deepEqual(panel.tableItems, []);
});

test("afterValueChange：刷新显示，锁定时同步锁定值并持久化", () => {
  const panel = makePanel({
    readValue: () => 42,
    normalizeValue: (value) => value,
    lockValueOf: (id) => `locked-${id}`,
    writePersistedLocks() {
      this.writes = (this.writes || 0) + 1;
    },
  });

  const item = { id: 1, value: 0, lockEnabled: false, lockValue: null };

  panel.afterValueChange(item);
  assert.equal(item.value, 42);
  assert.equal(item.lockValue, null);
  assert.equal(panel.writes, undefined);

  item.lockEnabled = true;
  panel.afterValueChange(item);
  assert.equal(item.lockValue, "locked-1");
  assert.equal(panel.writes, 1);
});

test("initializeVariables：合并已有锁定状态并读取当前游戏值", async () => {
  globalThis.$dataSystem = { switches: ["", "A", "B"] };

  const panel = makePanel({
    isDataReady: () => true,
    getNames: async () => ["", "A", "B"],
    readValue: (id) => id === 1,
    normalizeValue: (value) => !!value,
    tableItems: [
      { id: 1, lockEnabled: true, lockValue: false },
      { id: 2, lockEnabled: false, lockValue: true },
    ],
  });

  await panel.initializeVariables();

  assert.equal(panel.names.length, 3);
  assert.deepEqual(
    panel.tableItems.map((item) => ({
      id: item.id,
      name: item.name,
      value: item.value,
      lockEnabled: item.lockEnabled,
      lockValue: item.lockValue,
    })),
    [
      {
        id: 0,
        name: "",
        value: false,
        lockEnabled: false,
        lockValue: false,
      },
      {
        id: 1,
        name: "A",
        value: true,
        lockEnabled: true,
        lockValue: false,
      },
      {
        id: 2,
        name: "B",
        value: false,
        lockEnabled: false,
        lockValue: true,
      },
    ],
  );
});

test("initializeVariables：数据未就绪或引擎名字表缺失时清空列表", async () => {
  const panel = makePanel({
    isDataReady: () => false,
    tableItems: [{ id: 1 }],
  });

  await panel.initializeVariables();
  assert.deepEqual(panel.tableItems, []);

  panel.isDataReady = () => true;
  panel.tableItems = [{ id: 1 }];

  await panel.initializeVariables();
  assert.deepEqual(panel.tableItems, []);
});

test("mounted / beforeUnmount：每秒同步锁定行，并在卸载时清理定时器", () => {
  const timers = new Map();
  let nextId = 1;
  let cleared = null;
  let syncs = 0;

  globalThis.window = {
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearInterval(id) {
      cleared = id;
      timers.delete(id);
    },
  };

  const panel = makePanel({
    syncLockedRows() {
      syncs++;
    },
  });

  lockTableMixin.mounted.call(panel);

  const timer = [...timers.values()][0];
  assert.equal(timer.ms, 1000);
  timer.fn();
  assert.equal(syncs, 1);

  lockTableMixin.beforeUnmount.call(panel);

  assert.equal(cleared, 1);
  assert.equal(panel.__lockSyncTimer, null);
  assert.equal(timers.size, 0);

  // 没有定时器时 beforeUnmount 是空操作
  assert.doesNotThrow(() => lockTableMixin.beforeUnmount.call(panel));
});

test("buildLockPayload：跳过 id <= 0 与非整数 id", () => {
  const payload = buildLockPayload(
    [
      { id: 0, lockEnabled: true, lockValue: true },
      { id: -1, lockEnabled: true, lockValue: true },
      { id: 1.5, lockEnabled: true, lockValue: true },
      { id: 2, lockEnabled: true, lockValue: "x" },
    ],
    false,
  );

  assert.deepEqual(payload, {
    2: { lockEnabled: true, lockValue: true },
  });
});
