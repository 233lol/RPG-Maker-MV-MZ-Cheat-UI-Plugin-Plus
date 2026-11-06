import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import HealthSettingTab from "../../cheat-engine/www/cheat/panels/HealthSettingTab.js";
import ItemTableTab from "../../cheat-engine/www/cheat/panels/ItemTableTab.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";

const originalAlertHandler = Alert.handler;

afterEach(() => {
  delete globalThis.$gameParty;
  delete globalThis.$gamePlayer;
  Alert.handler = originalAlertHandler;
  Alert.pending = [];
});

/* ------------------------------------------------------------ HealthSettingTab */

function makeHealthPanel(overrides = {}) {
  return {
    ...HealthSettingTab.data(),
    ...HealthSettingTab.methods,
    events: [],
    $emit(name, payload) {
      this.events.push([name, payload]);
    },
    ...overrides,
  };
}

function makeMember(id, name, hp, mhp, mp, mmp) {
  return {
    id,
    name: () => name,
    hp,
    mhp,
    mp,
    mmp,
  };
}

test("HealthSettingTab：表头与初始编辑列表", () => {
  const panel = makeHealthPanel();

  assert.deepEqual(
    panel.tableHeaders.map((header) => header.key),
    ["name", "hp", "mp"],
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
    })),
    [
      { name: "Alice", hp: { hp: 120, mhp: 500 }, mp: { mp: 30, mmp: 100 } },
      // 引擎偶尔给出字符串，编辑框需要数字才能正确比较 / 写入
      { name: "Bob", hp: { hp: 80, mhp: 400 }, mp: { mp: 0, mmp: 50 } },
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
  return {
    ...ItemTableTab.data(),
    ...ItemTableTab.methods,

    items: [],
    headers: [{ title: "Name", key: "name" }],
    asTableData: (item) => ({ name: item.name, description: item.description }),
    searchableAttrs: ["name", "description"],

    ...overrides,
  };
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
    ["name", "amount"],
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
    ["name", "amount"],
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
