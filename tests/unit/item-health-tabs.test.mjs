import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import HealthSettingTab from "../../cheat-engine/www/cheat/panels/HealthSettingTab.js";
import ItemTableTab from "../../cheat-engine/www/cheat/panels/ItemTableTab.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";
import { LockService } from "../../cheat-engine/www/cheat/js/LockService.js";

const originalAlertHandler = Alert.handler;

afterEach(() => {
  LockService.setItemLocks({});
  delete globalThis.$gameParty;
  delete globalThis.$gamePlayer;
  delete globalThis.$dataItems;
  delete globalThis.$dataWeapons;
  delete globalThis.$dataArmors;
  Alert.handler = originalAlertHandler;
  Alert.pending = [];
});

/* ------------------------------------------------------------ HealthSettingTab */

function defineComputed(target, name, getter) {
  Object.defineProperty(target, name, {
    configurable: true,
    get() {
      return getter.call(this);
    },
  });
  return target;
}

function makeHealthPanel(overrides = {}) {
  const panel = {
    ...HealthSettingTab.data(),
    ...HealthSettingTab.methods,
    events: [],
    $emit(name, payload) {
      this.events.push([name, payload]);
    },
    ...overrides,
  };

  defineComputed(panel, "tableHeaders", HealthSettingTab.computed.tableHeaders);
  return panel;
}

function makeMember(id, name, hp, mhp, mp, mmp, tp = 0, maxTp = 100) {
  return {
    id,
    name: () => name,
    hp,
    mhp,
    mp,
    mmp,
    tp,
    maxTp: () => maxTp,
  };
}

test("HealthSettingTab：表头与初始编辑列表", () => {
  const panel = makeHealthPanel();

  assert.deepEqual(
    panel.tableHeaders.map((header) => header.key),
    ["name", "hp", "mp", "tp"],
  );
  assert.deepEqual(panel.editingItems, []);
});

test("HealthSettingTab：items 变化时把队员映射成可编辑行", () => {
  const alice = makeMember(1, "Alice", 120, 500, 30, 100);
  const bob = makeMember(2, "Bob", "80", "400", "0", "50");
  const panel = makeHealthPanel({ items: [alice, bob] });

  HealthSettingTab.watch.items.handler.call(panel);

  assert.equal(panel.editingItems.length, 2);
  assert.deepEqual(
    panel.editingItems.map((row) => ({
      name: row.name,
      hp: row.hp,
      mp: row.mp,
      tp: row.tp,
    })),
    [
      {
        name: "Alice",
        hp: { hp: 120, mhp: 500 },
        mp: { mp: 30, mmp: 100 },
        tp: { tp: 0, maxTp: 100 },
      },
      // 引擎偶尔给出字符串，编辑框需要数字才能正确比较 / 写入
      {
        name: "Bob",
        hp: { hp: 80, mhp: 400 },
        mp: { mp: 0, mmp: 50 },
        tp: { tp: 0, maxTp: 100 },
      },
    ],
  );
  assert.equal(panel.editingItems[0]._member, alice);
});

test("HealthSettingTab：items 为空 / 不是数组时编辑列表清空", () => {
  const panel = makeHealthPanel({
    items: [],
    editingItems: [{ name: "stale" }],
  });

  HealthSettingTab.watch.items.handler.call(panel);
  assert.deepEqual(panel.editingItems, []);
});

test("HealthSettingTab.onDataChange：只在编辑列表是数组时向上抛出", () => {
  const rows = [{ name: "Alice" }];
  const panel = makeHealthPanel({ editingItems: rows });

  panel.onDataChange();
  assert.deepEqual(panel.events, [["change", rows]]);

  panel.editingItems = null;
  panel.onDataChange();
  assert.equal(panel.events.length, 1);
});

/* --------------------------------------------------------------- ItemTableTab */

function makeItemPanel(overrides = {}) {
  const panel = {
    ...ItemTableTab.data(),
    ...ItemTableTab.methods,

    stateKey: "item",
    itemKind: "item",
    items: [],
    headers: [{ title: "Name", key: "name" }],
    asTableData: (item) => ({ name: item.name, description: item.description }),
    searchableAttrs: ["name", "description"],

    ...overrides,
  };

  defineComputed(panel, "tableHeaders", ItemTableTab.computed.tableHeaders);
  return panel;
}

function partyWithItems(amounts) {
  const gained = [];

  return {
    gained,
    numItems(item) {
      return Object.hasOwnProperty.call(amounts, item.id)
        ? amounts[item.id]
        : 0;
    },
    gainItem(item, diff) {
      gained.push([item.id, diff]);
      amounts[item.id] = (amounts[item.id] || 0) + diff;
    },
  };
}

test("ItemTableTab.startLockSync / stopLockSync：幂等启停定时器", () => {
  const timers = new Map();
  const cleared = [];
  let nextId = 1;

  globalThis.window = {
    setInterval(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) {
      cleared.push(id);
      timers.delete(id);
    },
  };

  const panel = makeItemPanel();
  let syncCount = 0;
  panel.syncLockedRows = () => {
    syncCount += 1;
  };

  try {
    panel.startLockSync();
    panel.startLockSync();

    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 1000);

    [...timers.values()][0].callback();
    assert.equal(syncCount, 1);

    panel.stopLockSync();
    panel.stopLockSync();

    assert.deepEqual(cleared, [1]);
    assert.equal(panel.__itemLockSyncTimer, null);
  } finally {
    delete globalThis.window;
  }
});

test("ItemTableTab：panelStateId 区分不同物品类型", () => {
  assert.equal(
    ItemTableTab.computed.panelStateId.call({ stateKey: "item" }),
    "item-table-item",
  );
  assert.equal(
    ItemTableTab.computed.panelStateId.call({ stateKey: "weapon" }),
    "item-table-weapon",
  );
});

test("ItemTableTab.initializeVariables：队伍未就绪时只准备表头", () => {
  const panel = makeItemPanel();

  panel.initializeVariables();

  assert.deepEqual(
    panel.tableHeaders.map((header) => header.key),
    ["name", "amount", "lock"],
  );
  assert.deepEqual(panel.tableItems, []);
});

test("ItemTableTab.initializeVariables：过滤空条目并同步持有数量", () => {
  const potion = { id: 1, name: "Potion", description: "Heals" };
  const ether = { id: 2, name: "Ether", description: null };
  const amounts = { 1: 3, 2: 0 };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems(amounts);

  const panel = makeItemPanel({
    items: [potion, null, ether],
  });

  panel.initializeVariables();

  assert.equal(panel.tableItems.length, 2);
  assert.deepEqual(
    panel.tableItems.map((row) => ({
      name: row.name,
      amount: row.amount,
      item: row._item,
    })),
    [
      { name: "Potion", amount: 3, item: potion },
      { name: "Ether", amount: 0, item: ether },
    ],
  );
  // 每次刷新都追加 amount 表头，不应该重复
  assert.deepEqual(
    panel.tableHeaders.map((header) => header.key),
    ["name", "amount", "lock"],
  );
});

test("ItemTableTab.filteredTableItems：隐藏无名 / 只看持有 / 关键字过滤", () => {
  const panel = makeItemPanel({
    tableItems: [
      { name: "Potion", description: "Heals HP", amount: 2 },
      { name: "", description: "Nameless item", amount: 5 },
      { name: "Ether", description: "Restores MP", amount: 0 },
      { name: "Elixir", description: null, amount: 1 },
    ],
    excludeNameless: true,
    onlyOwnedItems: false,
    search: "",
  });

  const names = () =>
    ItemTableTab.computed.filteredTableItems
      .call(panel)
      .map((item) => item.name || "(unknown)");

  assert.deepEqual(names(), ["Potion", "Ether", "Elixir"]);

  panel.onlyOwnedItems = true;
  assert.deepEqual(names(), ["Potion", "Elixir"]);

  panel.onlyOwnedItems = false;
  panel.excludeNameless = false;
  assert.deepEqual(names(), ["Potion", "(unknown)", "Ether", "Elixir"]);

  // 大小写不敏感，description 为 null 也不会让匹配抛错
  panel.search = "potion";
  assert.deepEqual(names(), ["Potion"]);

  panel.search = "ELIX";
  assert.deepEqual(names(), ["Elixir"]);

  panel.search = "";
  assert.equal(names().length, 4);
});

test("ItemTableTab.onItemChange：队伍未就绪时提示且不写游戏数据", () => {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));

  const item = { amount: 9, _item: { id: 1 } };
  const panel = makeItemPanel();

  panel.onItemChange(item);

  assert.equal(item.amount, 9);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].level, "warn");
});

test("ItemTableTab.onItemChange：按差值增减物品，非法输入回滚", () => {
  const amounts = { 1: 3 };
  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems(amounts);

  const rawItem = { id: 1, name: "Potion" };
  const item = { amount: "7", _item: rawItem };
  const panel = makeItemPanel();

  panel.onItemChange(item);
  assert.deepEqual(globalThis.$gameParty.gained, [[1, 4]]);
  assert.equal(item.amount, 7);

  // 小数向下取整，再按实际差值写入
  item.amount = "2.9";
  panel.onItemChange(item);
  assert.deepEqual(globalThis.$gameParty.gained, [
    [1, 4],
    [1, -5],
  ]);
  assert.equal(item.amount, 2);

  // 非数字：不写游戏数据，把显示值恢复成当前持有数量
  item.amount = "abc";
  panel.onItemChange(item);
  assert.equal(item.amount, 2);
  assert.deepEqual(globalThis.$gameParty.gained, [
    [1, 4],
    [1, -5],
  ]);
});

test("ItemTableTab.itemKind / allFilteredLocked：类型与全锁判断", () => {
  const panel = makeItemPanel({ stateKey: "weapon" });
  assert.equal(ItemTableTab.computed.itemKind.call(panel), "weapon");
  panel.itemKind = "weapon";

  panel.stateKey = "unknown";
  assert.equal(ItemTableTab.computed.itemKind.call(panel), "item");
  panel.itemKind = "item";

  const items = [
    { id: 1, lockEnabled: true },
    { id: 2, lockEnabled: true },
    { id: 0, lockEnabled: false },
    { id: undefined, lockEnabled: false },
  ];

  panel.filteredTableItems = items;
  assert.equal(
    ItemTableTab.computed.allFilteredLocked.call(panel),
    true,
    "占位项 / 无效 ID 不参与判断",
  );

  items[1].lockEnabled = false;
  assert.equal(ItemTableTab.computed.allFilteredLocked.call(panel), false);

  panel.filteredTableItems = [];
  assert.equal(ItemTableTab.computed.allFilteredLocked.call(panel), false);
});

test("ItemTableTab.initializeVariables：读取已保存的物品锁", () => {
  const potion = { id: 1, name: "Potion", description: "Heals" };
  const amounts = { 1: 3 };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems(amounts);
  globalThis.$dataItems = [null, potion];

  LockService.setItemLocks({
    "item:1": { lockEnabled: true, lockValue: 5 },
  });

  const panel = makeItemPanel({ items: [potion], stateKey: "item" });
  panel.initializeVariables();

  const row = panel.tableItems[0];
  assert.equal(row.kind, "item");
  assert.equal(row.id, 1);
  assert.equal(row.lockEnabled, true);
  assert.equal(row.lockValue, 5);
  assert.equal(row.amount, 5, "锁定会立即把数量写到游戏里");
});

test("ItemTableTab.toggleItemLock：锁定当前数量 / 再次点击解除", () => {
  const potion = { id: 1, name: "Potion" };
  const amounts = { 1: 3 };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems(amounts);
  globalThis.$dataItems = [null, potion];

  const panel = makeItemPanel({ items: [potion] });
  panel.initializeVariables();

  const row = panel.tableItems[0];
  assert.equal(row.lockEnabled, false);

  panel.toggleItemLock(row);
  assert.equal(row.lockEnabled, true);
  assert.deepEqual(LockService.getItemLocks(), {
    "item:1": { lockEnabled: true, lockValue: 3 },
  });

  panel.toggleItemLock(row);
  assert.equal(row.lockEnabled, false);
  assert.deepEqual(LockService.getItemLocks(), {});
});

test("ItemTableTab.toggleItemLock：非法 ID / 队伍未就绪时忽略", () => {
  const messages = [];
  Alert.setHandler((level, msg) => messages.push({ level, msg }));

  const panel = makeItemPanel();
  panel.toggleItemLock({ id: 0, lockEnabled: false });
  assert.equal(messages.length, 1, "队伍未就绪先提示");
  assert.equal(messages[0].level, "warn");

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems({});

  panel.toggleItemLock({ id: 0, lockEnabled: false });
  assert.deepEqual(LockService.getItemLocks(), {});
});

test("ItemTableTab.toggleAllFilteredLocks：按当前状态批量锁定 / 解锁", () => {
  const potion = { id: 1, name: "Potion" };
  const ether = { id: 2, name: "Ether" };
  const amounts = { 1: 2, 2: 7 };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems(amounts);
  globalThis.$dataItems = [null, potion, ether];

  const panel = makeItemPanel({ items: [potion, ether] });
  panel.initializeVariables();
  panel.filteredTableItems = panel.tableItems;

  panel.toggleAllFilteredLocks();
  assert.deepEqual(LockService.getItemLocks(), {
    "item:1": { lockEnabled: true, lockValue: 2 },
    "item:2": { lockEnabled: true, lockValue: 7 },
  });
  assert.equal(
    panel.tableItems.every((row) => row.lockEnabled),
    true,
  );

  panel.toggleAllFilteredLocks();
  assert.deepEqual(LockService.getItemLocks(), {});
  assert.equal(
    panel.tableItems.every((row) => !row.lockEnabled),
    true,
  );
});

test("ItemTableTab.syncLockedRows：只同步锁定行", () => {
  const potion = { id: 1, name: "Potion" };
  const ether = { id: 2, name: "Ether" };
  const amounts = { 1: 2, 2: 7 };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems(amounts);
  globalThis.$dataItems = [null, potion, ether];

  const panel = makeItemPanel({ items: [potion, ether] });
  panel.initializeVariables();
  panel.tableItems[0].lockEnabled = true;

  amounts[1] = 8;
  amounts[2] = 9;
  panel.syncLockedRows();

  assert.equal(panel.tableItems[0].amount, 8, "锁定行跟随游戏值");
  assert.equal(panel.tableItems[1].amount, 7, "未锁定行保留显示值");
});

test("ItemTableTab.onItemChange：锁定中的物品会更新锁定数量", () => {
  const potion = { id: 1, name: "Potion" };
  const amounts = { 1: 3 };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = partyWithItems(amounts);
  globalThis.$dataItems = [null, potion];

  const panel = makeItemPanel({ items: [potion] });
  panel.initializeVariables();

  const row = panel.tableItems[0];
  panel.toggleItemLock(row);
  row.amount = "10";
  panel.onItemChange(row);

  assert.equal(row.amount, 10);
  assert.deepEqual(LockService.getItemLocks(), {
    "item:1": { lockEnabled: true, lockValue: 10 },
  });
});
