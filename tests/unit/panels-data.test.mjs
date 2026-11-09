import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { createItemDatabasePanel } from "../../cheat-engine/www/cheat/panels/ItemDatabasePanel.js";
import ItemSettingPanel from "../../cheat-engine/www/cheat/panels/ItemSettingPanel.js";
import WeaponSettingPanel from "../../cheat-engine/www/cheat/panels/WeaponSettingPanel.js";
import ArmorSettingPanel from "../../cheat-engine/www/cheat/panels/ArmorSettingPanel.js";
import SwitchSettingPanel from "../../cheat-engine/www/cheat/panels/SwitchSettingPanel.js";
import VariableSettingPanel from "../../cheat-engine/www/cheat/panels/VariableSettingPanel.js";
import StatsSettingPanel from "../../cheat-engine/www/cheat/panels/StatsSettingPanel.js";
import SkillSettingPanel from "../../cheat-engine/www/cheat/panels/SkillSettingPanel.js";
import HealthSettingPanel from "../../cheat-engine/www/cheat/panels/HealthSettingPanel.js";
import {
  GeneralCheat,
  BattleCheat,
} from "../../cheat-engine/www/cheat/js/CheatHelper.js";
import { ConfirmDialog } from "../../cheat-engine/www/cheat/js/DialogHelper.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";

globalThis.Game_Actor = class Game_Actor {};

function makePanel(definition, overrides = {}) {
  return {
    ...definition.methods,
    ...overrides,
  };
}

afterEach(() => {
  for (const name of [
    "$dataSystem",
    "$gameSwitches",
    "$gameVariables",
    "$gameParty",
    "$gamePlayer",
    "$gameTroop",
    "$gameMap",
    "$gameSystem",
    "$dataClasses",
    "$dataItems",
    "$dataWeapons",
    "$dataArmors",
    "$dataStates",
    "$dataActors",
  ]) {
    delete globalThis[name];
  }

  Alert.handler = null;
  Alert.pending = [];
});

/* --------------------------------------------------------------- ItemDatabasePanel */

test("createItemDatabasePanel：工厂组件初始化数据并转换表格行", () => {
  const source = [
    { name: "Potion", description: "Heals 50 HP" },
    { name: "Ether", description: "Restores MP" },
  ];

  const Panel = createItemDatabasePanel({
    name: "ItemSettingPanel",
    stateKey: "item",
    getItems: () => source,
    descTitleKey: "items.desc",
  });

  const panel = makePanel(Panel, { items: [], stateKey: "" });
  const data = Panel.data.call(panel);

  assert.equal(Panel.name, "ItemSettingPanel");
  assert.equal(data.stateKey, "item");
  assert.equal(data.items.length, 0);
  assert.equal(data.headers[0].key, "name");
  assert.equal(data.headers[1].key, "desc");
  assert.equal(typeof data.headers[0].title, "string");

  Panel.created.call(panel);
  assert.equal(panel.items, source);
  assert.deepEqual(panel.convertToTableData(source[0]), {
    name: "Potion",
    desc: "Heals 50 HP",
  });

  // 数据源为空 / undefined 时退回空数组
  const EmptyPanel = createItemDatabasePanel({
    name: "Empty",
    stateKey: "empty",
    getItems: () => undefined,
    descTitleKey: "items.desc",
  });
  const emptyPanel = makePanel(EmptyPanel, { items: [{}] });
  EmptyPanel.created.call(emptyPanel);
  assert.deepEqual(emptyPanel.items, []);
});

test("createItemDatabasePanel：activated / deactivated 转发给物品表格", () => {
  const Panel = createItemDatabasePanel({
    name: "ItemSettingPanel",
    stateKey: "item",
    getItems: () => [],
    descTitleKey: "items.desc",
  });

  const calls = [];
  const panel = makePanel(Panel, {
    $refs: {
      itemTable: {
        startLockSync() {
          calls.push("start");
        },
        stopLockSync() {
          calls.push("stop");
        },
      },
    },
  });

  Panel.activated.call(panel);
  Panel.deactivated.call(panel);

  assert.deepEqual(calls, ["start", "stop"]);

  // 子组件尚未挂载时不应抛错
  const emptyPanel = makePanel(Panel, { $refs: {} });
  assert.doesNotThrow(() => Panel.activated.call(emptyPanel));
  assert.doesNotThrow(() => Panel.deactivated.call(emptyPanel));
});

test("物品 / 武器 / 防具面板：各自读取对应的数据库", () => {
  globalThis.$dataItems = [{ name: "Potion", description: "Heals 50 HP" }];
  globalThis.$dataWeapons = [{ name: "Sword", description: "Sharp" }];
  globalThis.$dataArmors = [{ name: "Shield", description: "Tough" }];

  const cases = [
    [ItemSettingPanel, "item", "Potion", "Heals 50 HP"],
    [WeaponSettingPanel, "weapon", "Sword", "Sharp"],
    [ArmorSettingPanel, "armor", "Shield", "Tough"],
  ];

  for (const [Panel, stateKey, name, description] of cases) {
    const panel = makePanel(Panel, { items: [], stateKey: "" });
    const data = Panel.data.call(panel);

    assert.equal(Panel.name.endsWith("SettingPanel"), true);
    assert.equal(data.stateKey, stateKey);

    Panel.created.call(panel);

    assert.equal(panel.items.length, 1);
    assert.equal(panel.items[0].name, name);
    assert.deepEqual(panel.convertToTableData(panel.items[0]), {
      name,
      desc: description,
    });
  }
});

/* --------------------------------------------------------------- SwitchSettingPanel */

function makeSwitchPanel(overrides = {}) {
  return makePanel(SwitchSettingPanel, {
    search: "",
    excludeNameless: true,
    tableItems: [],
    filteredTableItems: [],
    ...overrides,
  });
}

test("SwitchSettingPanel：名字表 / 读写 / 归一化", () => {
  const panel = makeSwitchPanel();

  globalThis.$dataSystem = { switches: ["", "A", "B"] };
  assert.deepEqual(panel.getNames(), ["", "A", "B"]);

  globalThis.$dataSystem = { switches: "bad" };
  assert.deepEqual(panel.getNames(), []);

  const writes = [];
  globalThis.$gameSwitches = {
    value: (id) => id === 1,
    setValue: (id, value) => writes.push([id, value]),
  };

  assert.equal(panel.readValue(1), true);
  panel.writeValue(2, false);
  assert.deepEqual(writes, [[2, false]]);
  assert.equal(panel.normalizeValue("truthy"), true);
  assert.equal(panel.normalizeValue(0), false);
});

test("SwitchSettingPanel.filteredTableItems / allSwitchOn：搜索、隐藏无名项与全开判断", () => {
  const panel = makeSwitchPanel({
    tableItems: [
      { id: 0, name: "", value: false },
      { id: 1, name: "", value: true },
      { id: 2, name: "Door", value: true },
      { id: 3, name: "Door B", value: false },
    ],
  });

  assert.deepEqual(
    SwitchSettingPanel.computed.filteredTableItems.call(panel).map((i) => i.id),
    [2, 3],
  );

  panel.search = "Door";
  assert.deepEqual(
    SwitchSettingPanel.computed.filteredTableItems.call(panel).map((i) => i.id),
    [2, 3],
  );

  panel.excludeNameless = false;
  panel.search = "";
  assert.deepEqual(
    SwitchSettingPanel.computed.filteredTableItems.call(panel).map((i) => i.id),
    [1, 2, 3],
    "0 号占位始终不显示",
  );

  panel.filteredTableItems = [{ id: 2, value: true }];
  panel.allSwitchOn = true;
  assert.equal(SwitchSettingPanel.computed.allSwitchOn.call(panel), true);
  assert.equal(
    SwitchSettingPanel.computed.allSwitchIcon.call(panel),
    "mdi-toggle-switch-off",
  );

  panel.filteredTableItems = [
    { id: 2, value: true },
    { id: 3, value: false },
  ];
  panel.allSwitchOn = false;
  assert.equal(SwitchSettingPanel.computed.allSwitchOn.call(panel), false);
  assert.equal(
    SwitchSettingPanel.computed.allSwitchIcon.call(panel),
    "mdi-toggle-switch",
  );

  panel.filteredTableItems = [];
  assert.equal(SwitchSettingPanel.computed.allSwitchOn.call(panel), true);
});

test("SwitchSettingPanel.onItemChange：数据就绪时写回游戏并刷新显示", () => {
  const writes = [];
  let refreshed = 0;

  globalThis.$gameSwitches = {
    value: () => false,
    setValue: (id, value) => writes.push([id, value]),
  };

  const panel = makeSwitchPanel({
    afterValueChange() {
      refreshed++;
    },
  });

  panel.onItemChange({ id: 2, value: true });

  assert.deepEqual(writes, [[2, true]]);
  assert.equal(refreshed, 1);

  delete globalThis.$gameSwitches;
  panel.onItemChange({ id: 3, value: true });
  assert.equal(writes.length, 1, "数据未就绪时不写回");
});

test("SwitchSettingPanel.toggleAllSwitches：确认后批量写入并同步锁定值", async () => {
  const actions = [];
  const originalShow = ConfirmDialog.show;
  const originalClose = ConfirmDialog.close;

  ConfirmDialog.show = (options) => actions.push(options);
  ConfirmDialog.close = () => {};

  const values = new Map();
  globalThis.$gameSwitches = {
    value: (id) => values.get(id) ?? false,
    setValue: (id, value) => values.set(id, value),
  };

  const panel = makeSwitchPanel({
    filteredTableItems: [
      { id: 1, value: false, lockEnabled: true },
      { id: 2, value: false, lockEnabled: false },
    ],
    allSwitchOn: false,
    allSwitchIcon: "mdi-toggle-switch",
    writePersistedLocks() {
      this.writes = (this.writes || 0) + 1;
    },
    initializeVariables() {
      this.initialized = (this.initialized || 0) + 1;
    },
  });

  try {
    panel.toggleAllSwitches();

    assert.equal(actions.length, 1);
    assert.ok(actions[0].message.includes("\n"));
    assert.equal(actions[0].width, 450);

    await actions[0].actions[1].action();

    assert.equal(values.get(1), true);
    assert.equal(values.get(2), true);
    assert.equal(panel.filteredTableItems[0].value, true);
    assert.equal(panel.filteredTableItems[0].lockValue, true);
    assert.equal(panel.writes, 1);
    assert.equal(panel.initialized, 1);

    // 全部已开启时，确认框按钮改为关闭
    panel.allSwitchOn = true;
    panel.toggleAllSwitches();
    assert.equal(actions.length, 2);
    await actions[1].actions[1].action();
    assert.equal(values.get(1), false);
  } finally {
    ConfirmDialog.show = originalShow;
    ConfirmDialog.close = originalClose;
  }
});

/* ------------------------------------------------------------- VariableSettingPanel */

function makeVariablePanel(overrides = {}) {
  return makePanel(VariableSettingPanel, {
    search: "",
    excludeNameless: true,
    tableItems: [],
    jsonDialog: { show: false, id: 0, name: "", text: "", error: "" },
    ...overrides,
  });
}

test("VariableSettingPanel：名字表 / 读写 / 复杂值判断与预览", () => {
  const panel = makeVariablePanel();

  globalThis.$dataSystem = { variables: ["", "Gold", "Party"] };
  assert.deepEqual(panel.getNames(), ["", "Gold", "Party"]);

  globalThis.$dataSystem = { variables: null };
  assert.deepEqual(panel.getNames(), []);

  const writes = [];
  globalThis.$gameVariables = {
    value: (id) => `v${id}`,
    setValue: (id, value) => writes.push([id, value]),
  };

  assert.equal(panel.readValue(2), "v2");
  panel.writeValue(2, "x");
  assert.deepEqual(writes, [[2, "x"]]);

  assert.equal(panel.isComplexValue(null), false);
  assert.equal(panel.isComplexValue("x"), false);
  assert.equal(panel.isComplexValue([]), true);
  assert.equal(panel.isComplexValue({}), true);

  const object = { a: 1 };
  assert.equal(panel.markValueForDisplay(object), object);
  assert.equal(panel.markValueForDisplay(1), 1);

  assert.equal(panel.formatValuePreview({ a: 1 }), '{"a":1}');
  assert.equal(panel.formatValuePreview("x".repeat(100)).length, 80);
  assert.equal(panel.formatValuePreview("x".repeat(100)).endsWith("..."), true);
  assert.equal(panel.formatValuePreview(undefined), "undefined");

  const circular = {};
  circular.self = circular;
  assert.equal(panel.formatValuePreview(circular), "[object Object]");

  assert.equal(panel.formatValueForSearch({ A: 1 }), '{"a":1}');
  assert.equal(panel.formatValueForSearch("AbC"), "abc");
  assert.equal(panel.formatValueForSearch(circular), "[object object]");
});

test("VariableSettingPanel.filteredTableItems：按名称 / 值搜索并隐藏无名项", () => {
  const panel = makeVariablePanel({
    tableItems: [
      { id: 0, name: "", value: "" },
      { id: 1, name: "", value: "secret" },
      { id: 2, name: "Gold", value: 100 },
      { id: 3, name: "Party", value: { members: ["A"] } },
    ],
  });

  assert.deepEqual(
    VariableSettingPanel.computed.filteredTableItems
      .call(panel)
      .map((item) => item.id),
    [2, 3],
  );

  panel.excludeNameless = false;
  assert.deepEqual(
    VariableSettingPanel.computed.filteredTableItems
      .call(panel)
      .map((item) => item.id),
    [0, 1, 2, 3],
  );

  panel.search = "members";
  assert.deepEqual(
    VariableSettingPanel.computed.filteredTableItems
      .call(panel)
      .map((item) => item.id),
    [3],
  );

  panel.search = "gold";
  assert.deepEqual(
    VariableSettingPanel.computed.filteredTableItems
      .call(panel)
      .map((item) => item.id),
    [2],
  );
});

test("VariableSettingPanel.openJsonEditor / closeJsonEditor：对象格式化与异常兜底", () => {
  const panel = makeVariablePanel();
  const item = { id: 2, name: "Party", value: { members: [1, 2] } };

  panel.openJsonEditor(item);

  assert.equal(panel.jsonDialog.show, true);
  assert.equal(panel.jsonDialog.id, 2);
  assert.equal(panel.jsonDialog.name, "Party");
  assert.equal(panel.jsonDialog.text, JSON.stringify(item.value, null, 2));

  panel.openJsonEditor(null);
  assert.equal(panel.jsonDialog.id, 2, "空条目直接忽略");

  const circular = { a: 1 };
  circular.self = circular;
  panel.openJsonEditor({ id: 3, name: "Circular", value: circular });
  assert.equal(panel.jsonDialog.text, "[object Object]");

  panel.closeJsonEditor();
  assert.equal(panel.jsonDialog.show, false);
  assert.equal(panel.jsonDialog.error, "");
});

test("VariableSettingPanel.saveJsonEditor：合法 JSON 写回，非法 JSON 显示错误", () => {
  const writes = [];
  let refreshed = 0;

  globalThis.$gameVariables = {
    value: () => null,
    setValue: (id, value) => writes.push([id, value]),
  };

  const panel = makeVariablePanel({
    tableItems: [{ id: 2, name: "Party", value: null }],
    afterValueChange() {
      refreshed++;
    },
  });

  panel.jsonDialog = {
    show: true,
    id: 2,
    name: "Party",
    text: '{"members":[1,2]}',
    error: "",
  };

  panel.saveJsonEditor();

  assert.deepEqual(writes, [[2, { members: [1, 2] }]]);
  assert.equal(refreshed, 1);
  assert.equal(panel.jsonDialog.show, false);

  panel.jsonDialog = {
    show: true,
    id: 2,
    name: "Party",
    text: "{bad",
    error: "",
  };
  panel.saveJsonEditor();

  assert.equal(writes.length, 1, "非法 JSON 不应写回");
  assert.match(panel.jsonDialog.error, /JSON|格式/);
  assert.equal(panel.jsonDialog.show, true);
});

test("VariableSettingPanel.onItemChange：数字 / 字符串 / 复杂值分别处理", () => {
  const writes = [];
  let refreshed = 0;
  let opened = null;

  const values = { 1: 10, 2: "text", 3: { a: 1 } };
  globalThis.$gameVariables = {
    value: (id) => values[id],
    setValue: (id, value) => writes.push([id, value]),
  };

  const panel = makeVariablePanel({
    afterValueChange() {
      refreshed++;
    },
    openJsonEditor(item) {
      opened = item;
    },
  });

  const numberItem = { id: 1, value: 10 };
  panel.onItemChange(numberItem, "20");
  assert.deepEqual(writes, [[1, 20]]);
  assert.equal(refreshed, 1);

  numberItem.value = "not-number";
  panel.onItemChange(numberItem, "bad");
  assert.equal(writes.length, 1);
  assert.equal(numberItem.value, 10, "非法数字回滚显示");

  const stringItem = { id: 2, value: "text" };
  panel.onItemChange(stringItem, "new text");
  assert.deepEqual(writes, [
    [1, 20],
    [2, "new text"],
  ]);

  const complexItem = { id: 3, value: { a: 1 } };
  panel.onItemChange(complexItem, "ignored");
  assert.equal(opened, complexItem);
  assert.equal(writes.length, 2);

  delete globalThis.$gameVariables;
  panel.onItemChange({ id: 1, value: 10 }, "30");
  assert.equal(writes.length, 2, "数据未就绪时不写回");
});

/* --------------------------------------------------------------- StatsSettingPanel */

function makeStatsPanel(overrides = {}) {
  return makePanel(StatsSettingPanel, {
    selectedTab: null,
    selectedSubTab: "attributes",
    paramNames: [],
    classOptions: [],
    actors: [],
    ...overrides,
  });
}

function makeActor(id = 1) {
  const actor = new globalThis.Game_Actor();

  actor._actorId = id;
  actor._name = `Actor ${id}`;
  actor._nickname = "";
  actor._profile = "";
  actor._classId = 1;
  actor.level = 5;
  actor._paramPlus = [1, 2, 3];
  actor.param = (paramId) => paramId * 10;
  actor.currentExp = () => 123;
  actor.paramBase = (paramId) => paramId * 5;
  actor.paramGrowth = (paramId) => paramId;
  actor.equips = () => [{ params: [1, 2, 3] }, null];
  actor.equipSlots = () => [1, 2];
  actor.currentClass = () => ({ name: "Hero" });
  actor.setName = (name) => {
    actor._name = name;
  };
  actor.setNickname = (nickname) => {
    actor._nickname = nickname;
  };
  actor.setProfile = (profile) => {
    actor._profile = profile;
  };
  actor.changeClass = (classId) => {
    actor._classId = classId;
  };
  actor.changeEquip = (slotId, equip) => {
    actor.lastEquip = { slotId, equip };
  };
  actor.states = () => [];
  actor.isStateAffected = () => false;
  actor.addState = (stateId) => {
    actor.lastAddedState = stateId;
  };
  actor.removeState = (stateId) => {
    actor.lastRemovedState = stateId;
  };
  actor.changeLevel = (level) => {
    actor.level = level;
  };
  actor.changeExp = (exp) => {
    actor.exp = exp;
  };

  return actor;
}

test("StatsSettingPanel.extractActorData：读取等级 / 经验 / 参数", () => {
  const actor = makeActor(2);
  const data = StatsSettingPanel.methods.extractActorData.call(
    makeStatsPanel(),
    actor,
  );

  assert.equal(data._actor, actor);
  assert.equal(data.id, 2);
  assert.equal(data.name, "Actor 2");
  assert.equal(data.godMode, false);
  assert.equal(data.level, 5);
  assert.equal(data.exp, 123);
  assert.deepEqual(data.param, [0, 10, 20]);
});

test("StatsSettingPanel.initializeVariables：队伍未就绪时清空，就绪时保留当前标签", () => {
  const panel = makeStatsPanel({ selectedTab: 1 });

  panel.initializeVariables();
  assert.deepEqual(panel.paramNames, []);
  assert.deepEqual(panel.actors, []);

  const actor = makeActor(1);
  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };
  globalThis.$dataSystem = { terms: { params: ["MHP", "MMP"] } };

  panel.initializeVariables();

  assert.deepEqual(panel.paramNames, ["MHP", "MMP"]);
  assert.equal(panel.actors.length, 1);
  assert.equal(panel.selectedTab, 1);

  const other = makeActor(2);
  globalThis.$gameParty.members = () => [other];
  panel.initializeVariables();
  assert.equal(panel.selectedTab, 2, "当前角色不在队伍里时切到第一个角色");
});

test("StatsSettingPanel.onLevelChange / onExpChange：合法值写回，非法值只刷新", () => {
  const actor = makeActor();
  let refreshed = 0;
  const panel = makeStatsPanel({
    initializeVariables() {
      refreshed++;
    },
  });

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };

  const item = { _actor: actor, level: 5, exp: 0 };

  panel.onLevelChange({ ...item, level: "8" });
  assert.equal(actor.level, 8);

  panel.onLevelChange({ ...item, level: "0" });
  panel.onLevelChange({ ...item, level: "bad" });
  assert.equal(actor.level, 8);

  panel.onExpChange({ ...item, exp: "456" });
  assert.equal(actor.exp, 456);

  panel.onExpChange({ ...item, exp: "-1" });
  panel.onExpChange({ ...item, exp: "bad" });
  assert.equal(actor.exp, 456);
  assert.equal(refreshed, 6);
});

test("StatsSettingPanel.onParamChange：写入扣除基础值 / 装备 / 成长的追加值", () => {
  const actor = makeActor();
  let refreshed = 0;
  const panel = makeStatsPanel({
    initializeVariables() {
      refreshed++;
    },
  });

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };

  const item = { _actor: actor, param: [0, 20, 0] };

  // newVal(20) - base(5) - equip(2) - growth(1) = 12
  panel.onParamChange(item, 1);
  assert.equal(actor._paramPlus[1], 12);

  item.param[1] = "bad";
  panel.onParamChange(item, 1);
  assert.equal(actor._paramPlus[1], 12);
  assert.equal(refreshed, 2);
});

test("StatsSettingPanel.onGodModeChange：切换无敌并刷新", () => {
  const actor = makeActor();
  const calls = [];
  const original = GeneralCheat.toggleGodMode;
  GeneralCheat.toggleGodMode = (value) => calls.push(value);

  const panel = makeStatsPanel({
    initializeVariables() {
      this.refreshed = true;
    },
  });

  try {
    panel.onGodModeChange({ _actor: actor });
  } finally {
    GeneralCheat.toggleGodMode = original;
  }

  assert.deepEqual(calls, [actor]);
  assert.equal(panel.refreshed, true);
});

test("StatsSettingPanel：面板状态保存 / 恢复 selectedTab 与 selectedSubTab", () => {
  const panel = makeStatsPanel({
    selectedTab: 3,
    selectedSubTab: "equipment",
  });

  assert.deepEqual(panel.getPanelStateSnapshot(), {
    selectedTab: 3,
    selectedSubTab: "equipment",
  });

  panel.applyPanelState({ selectedTab: 9, selectedSubTab: "states" });
  assert.equal(panel.selectedTab, 9);
  assert.equal(panel.selectedSubTab, "states");

  panel.applyPanelState({ selectedTab: 1, selectedSubTab: "unknown" });
  assert.equal(panel.selectedSubTab, "attributes");

  assert.equal(StatsSettingPanel.computed.panelStateId.call(panel), "stats");
});

/* --------------------------------------------------------------- SkillSettingPanel */

function makeSkillPanel(overrides = {}) {
  return makePanel(SkillSettingPanel, {
    selectedTab: null,
    allSkills: [],
    actors: [],
    ...overrides,
  });
}

test("SkillSettingPanel.extractSkillData / extractActorData：整理技能与角色数据", () => {
  const panel = makeSkillPanel();

  assert.deepEqual(
    panel.extractSkillData({
      id: 10,
      name: "Fire",
      description: "Burn",
      iconIndex: 3,
    }),
    {
      _skill: {
        id: 10,
        name: "Fire",
        description: "Burn",
        iconIndex: 3,
      },
      id: 10,
      name: "Fire",
      description: "Burn",
      iconIndex: 3,
    },
  );

  assert.deepEqual(
    panel.extractSkillData({ id: 11, name: undefined, description: undefined }),
    {
      _skill: { id: 11, name: undefined, description: undefined },
      id: 11,
      name: "",
      description: "",
      iconIndex: undefined,
    },
  );

  const actor = {
    _actorId: 2,
    _name: "Mage",
    level: 7,
    skills: () => [{ id: 1 }, null, { id: 2 }],
  };
  const data = panel.extractActorData(actor);

  assert.equal(data._actor, actor);
  assert.equal(data.id, 2);
  assert.equal(data.name, "Mage");
  assert.equal(data.level, 7);
  assert.deepEqual(data.learnedSkillIds, [1, 2]);
  assert.deepEqual(data.pagination, { page: 1, itemsPerPage: 5 });
});

test("SkillSettingPanel.getFilteredSkills：只学 / 搜索 / 缓存失效", () => {
  const panel = makeSkillPanel({
    allSkills: [
      { id: 1, name: "Fire", description: "Burn" },
      { id: 2, name: "Ice", description: "Freeze" },
      { id: 3, name: "Cure", description: "Heal" },
    ],
  });

  const actor = {
    id: 1,
    learnedSkillIds: [1, 3],
    onlyLearned: false,
    skillSearch: "",
  };

  const first = panel.getFilteredSkills(actor);
  assert.deepEqual(
    first.map((skill) => [skill.id, skill.isLearned]),
    [
      [1, true],
      [2, false],
      [3, true],
    ],
  );

  assert.equal(panel.getFilteredSkills(actor), first, "条件不变时复用结果");

  actor.onlyLearned = true;
  assert.deepEqual(
    panel.getFilteredSkills(actor).map((skill) => skill.id),
    [1, 3],
  );

  actor.onlyLearned = false;
  actor.skillSearch = "FIRE";
  assert.deepEqual(
    panel.getFilteredSkills(actor).map((skill) => skill.id),
    [1],
  );

  actor.skillSearch = "freeze";
  assert.deepEqual(
    panel.getFilteredSkills(actor).map((skill) => skill.id),
    [2],
  );
});

test("SkillSettingPanel：分页与页码收敛", () => {
  const panel = makeSkillPanel({
    allSkills: Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      name: `Skill ${index + 1}`,
      description: "",
    })),
  });
  const actor = {
    id: 1,
    learnedSkillIds: [],
    onlyLearned: false,
    skillSearch: "",
    pagination: { page: 1, itemsPerPage: 5 },
  };

  assert.equal(panel.totalCountFor(actor), 12);
  assert.equal(panel.pageCountFor(actor), 3);

  panel.jumpToPage(actor, 2);
  assert.equal(actor.pagination.page, 2);

  actor.pagination.page = 99;
  panel.clampActorPage(actor);
  assert.equal(actor.pagination.page, 3);

  assert.doesNotThrow(() => panel.clampActorPage(null));
  assert.doesNotThrow(() => panel.clampActorPage({}));
});

test("SkillSettingPanel.addSkill / removeSkill：学会 / 遗忘后刷新已学列表", () => {
  const panel = makeSkillPanel({
    allSkills: [
      { id: 1, name: "Fire", description: "" },
      { id: 2, name: "Ice", description: "" },
    ],
  });

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [] };

  const skills = [{ id: 1 }];
  const actorObject = {
    isLearnedSkill: (id) => id === 1,
    learnSkill: (id) => skills.push({ id }),
    forgetSkill: (id) => {
      const index = skills.findIndex((skill) => skill.id === id);
      if (index >= 0) {
        skills.splice(index, 1);
      }
    },
    skills: () => skills.slice(),
  };

  const actor = {
    _actor: actorObject,
    id: 1,
    learnedSkillIds: [1],
    pagination: { page: 1, itemsPerPage: 5 },
  };

  // 已学会时不重复学习
  panel.addSkill(actor, { _skill: { id: 1 } });
  assert.deepEqual(actor.learnedSkillIds, [1]);

  panel.addSkill(actor, { _skill: { id: 2 } });
  assert.deepEqual(actor.learnedSkillIds, [1, 2]);

  panel.removeSkill(actor, { _skill: { id: 1 } });
  assert.deepEqual(actor.learnedSkillIds, [2]);

  delete globalThis.$gamePlayer;
  panel.addSkill(actor, { _skill: { id: 3 } });
  assert.deepEqual(actor.learnedSkillIds, [2], "队伍未就绪时不学习");
});

test("SkillSettingPanel：面板状态保存 / 恢复每个角色的筛选与分页", () => {
  const panel = makeSkillPanel({
    selectedTab: 1,
    actors: [
      {
        id: 1,
        onlyLearned: false,
        skillSearch: "",
        pagination: { page: 1, itemsPerPage: 5 },
      },
      {
        id: 2,
        onlyLearned: true,
        skillSearch: "ice",
        pagination: { page: 2, itemsPerPage: 10 },
      },
    ],
  });

  assert.deepEqual(panel.getPanelStateSnapshot(), {
    selectedTab: 1,
    actors: [
      {
        id: 1,
        onlyLearned: false,
        skillSearch: "",
        pagination: { page: 1, itemsPerPage: 5 },
      },
      {
        id: 2,
        onlyLearned: true,
        skillSearch: "ice",
        pagination: { page: 2, itemsPerPage: 10 },
      },
    ],
  });

  panel.applyPanelState({
    selectedTab: 2,
    actors: [
      { id: 1, onlyLearned: true, skillSearch: "fire" },
      { id: 2, pagination: { page: 3 } },
      { id: 99, onlyLearned: true },
    ],
  });

  assert.equal(panel.selectedTab, 2);
  assert.equal(panel.actors[0].onlyLearned, true);
  assert.equal(panel.actors[0].skillSearch, "fire");
  assert.deepEqual(panel.actors[0].pagination, { page: 1, itemsPerPage: 5 });
  assert.deepEqual(panel.actors[1].pagination, { page: 3, itemsPerPage: 10 });

  panel.applyPanelState({ selectedTab: 2 });
  assert.deepEqual(panel.actors, [
    {
      id: 1,
      onlyLearned: true,
      skillSearch: "fire",
      pagination: { page: 1, itemsPerPage: 5 },
    },
    {
      id: 2,
      onlyLearned: true,
      skillSearch: "ice",
      pagination: { page: 3, itemsPerPage: 10 },
    },
  ]);
});

test("SkillSettingPanel.initializeVariables：过滤空技能并保留已有筛选状态", () => {
  const existing = {
    id: 1,
    onlyLearned: true,
    skillSearch: "fire",
    pagination: { page: 2, itemsPerPage: 10 },
  };
  const panel = makeSkillPanel({ selectedTab: 1, actors: [existing] });

  const actor = {
    _actorId: 1,
    _name: "Mage",
    level: 3,
    skills: () => [{ id: 1 }],
  };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };
  globalThis.$dataSkills = [
    { id: 1, name: "Fire", description: "" },
    null,
    { id: 2, name: "", description: "" },
  ];

  try {
    panel.initializeVariables();
  } finally {
    delete globalThis.$dataSkills;
  }

  assert.equal(panel.allSkills.length, 1);
  assert.equal(panel.actors.length, 1);
  assert.equal(panel.actors[0].onlyLearned, true);
  assert.equal(panel.actors[0].skillSearch, "fire");
  assert.deepEqual(panel.actors[0].pagination, {
    page: 2,
    itemsPerPage: 10,
  });

  delete globalThis.$gamePlayer;
  panel.initializeVariables();
  assert.deepEqual(panel.allSkills, []);
  assert.deepEqual(panel.actors, []);
});

/* -------------------------------------------------------------- HealthSettingPanel */

test("HealthSettingPanel.initializeVariables：队伍未就绪时清空并同步开关", () => {
  const panel = makePanel(HealthSettingPanel);

  panel.initializeVariables();
  assert.deepEqual(panel.enemy, []);
  assert.deepEqual(panel.party, []);
  assert.equal(panel.disableRandomEncounter, false);

  const enemy = { id: 1 };
  const member = { id: 2 };
  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [member] };
  globalThis.$gameTroop = { members: () => [enemy] };
  BattleCheat.disableRandomEncounter = true;

  try {
    panel.initializeVariables();
  } finally {
    BattleCheat.disableRandomEncounter = false;
  }

  assert.deepEqual(panel.enemy, [enemy]);
  assert.deepEqual(panel.party, [member]);
  assert.equal(panel.disableRandomEncounter, true);
});

test("HealthSettingPanel.onDetailChange：只写回有效 HP / MP 并刷新", () => {
  const calls = [];
  const member = {
    setHp: (hp) => calls.push(["hp", hp]),
    setMp: (mp) => calls.push(["mp", mp]),
  };

  const panel = makePanel(HealthSettingPanel, {
    initializeVariables() {
      this.refreshed = true;
    },
  });

  panel.onDetailChange([
    { _member: member, hp: { hp: "50" }, mp: { mp: "20" } },
    { _member: null, hp: { hp: 1 }, mp: { mp: 1 } },
    { _member: member, hp: { hp: "bad" }, mp: { mp: "bad" } },
  ]);

  assert.deepEqual(calls, [
    ["hp", 50],
    ["mp", 20],
  ]);
  assert.equal(panel.refreshed, true);

  panel.refreshed = false;
  panel.onDetailChange("not-array");
  assert.equal(panel.refreshed, false);
});

test("HealthSettingPanel：按钮方法转调 BattleCheat 并刷新", () => {
  const calls = [];
  const originals = {};

  for (const name of [
    "recoverAllEnemy",
    "recoverAllParty",
    "fillTpAllEnemy",
    "fillTpAllParty",
    "changeAllEnemyHealth",
    "changeAllPartyHealth",
    "encounterBattle",
    "victory",
    "defeat",
    "escape",
    "abort",
    "toggleDisableRandomEncounter",
  ]) {
    originals[name] = BattleCheat[name];
    BattleCheat[name] = (...args) => calls.push([name, ...args]);
  }

  const panel = makePanel(HealthSettingPanel, {
    initializeVariables() {
      this.refreshed = (this.refreshed || 0) + 1;
    },
  });

  try {
    panel.recoverAllEnemy();
    panel.recoverAllParty();
    panel.fillTpAllEnemy();
    panel.fillTpAllParty();
    panel.changeAllEnemyHealth(1);
    panel.changeAllPartyHealth(2);
    panel.encounterBattle();
    panel.victory();
    panel.defeat();
    panel.escape();
    panel.abort();
    panel.onDisableRandomEncounterChange();
  } finally {
    Object.assign(BattleCheat, originals);
  }

  assert.deepEqual(calls, [
    ["recoverAllEnemy"],
    ["recoverAllParty"],
    ["fillTpAllEnemy"],
    ["fillTpAllParty"],
    ["changeAllEnemyHealth", 1],
    ["changeAllPartyHealth", 2],
    ["encounterBattle"],
    ["victory"],
    ["defeat"],
    ["escape"],
    ["abort"],
    ["toggleDisableRandomEncounter"],
  ]);
  assert.equal(panel.refreshed, 7);
});

test("设置类面板 data / created / panelStateId 默认值", () => {
  const switches = SwitchSettingPanel.data.call({});
  assert.equal(switches.lockKind, "switch");
  assert.deepEqual(
    switches.tableHeaders.map((header) => header.key),
    ["name", "value", "lock"],
  );
  assert.equal(SwitchSettingPanel.computed.panelStateId.call({}), "switches");
  assert.deepEqual(
    SwitchSettingPanel.computed.switchNames.call({ names: ["a", "b"] }),
    ["a", "b"],
  );

  const variables = VariableSettingPanel.data.call({});
  assert.equal(variables.lockKind, "variable");
  assert.deepEqual(
    variables.tableHeaders.map((header) => header.key),
    ["name", "value", "lock"],
  );
  assert.deepEqual(variables.jsonDialog, {
    show: false,
    id: 0,
    name: "",
    text: "",
    error: "",
  });
  assert.equal(
    VariableSettingPanel.computed.panelStateId.call({}),
    "variables",
  );
  assert.deepEqual(
    VariableSettingPanel.computed.variableNames.call({ names: ["x"] }),
    ["x"],
  );

  const skills = SkillSettingPanel.data.call({});
  assert.equal(skills.selectedTab, null);
  assert.deepEqual(skills.actors, []);
  assert.deepEqual(skills.allSkills, []);
  assert.deepEqual(
    skills.skillHeaders.map((header) => header.key),
    ["isLearned", "name", "description", "actions"],
  );
  assert.ok(Array.isArray(skills.itemsPerPageOptions));
  assert.equal(SkillSettingPanel.computed.panelStateId.call({}), "skills");

  let skillInitialized = 0;
  SkillSettingPanel.created.call({
    initializeVariables() {
      skillInitialized++;
    },
  });
  assert.equal(skillInitialized, 1);

  const stats = StatsSettingPanel.data.call({});
  assert.deepEqual(stats, {
    selectedTab: null,
    selectedSubTab: "attributes",
    paramNames: [],
    classOptions: [],
    actors: [],
  });
  assert.equal(StatsSettingPanel.computed.panelStateId.call({}), "stats");

  let statsInitialized = 0;
  StatsSettingPanel.created.call({
    initializeVariables() {
      statsInitialized++;
    },
  });
  assert.equal(statsInitialized, 1);
});

test("StatsSettingPanel 非法职业 / 状态输入不写游戏数据", () => {
  const actor = {
    setName() {},
    setNickname() {},
    setProfile() {},
    changeClass() {},
    addState() {},
    removeState() {},
    forceChangeEquip() {},
  };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };
  globalThis.$dataClasses = [null, { id: 1, name: "Hero" }];
  globalThis.$dataStates = [null, { id: 1, name: "Poison" }];

  let refreshed = 0;
  const panel = {
    ...StatsSettingPanel.methods,
    initializeVariables() {
      refreshed++;
    },
  };

  const item = { _actor: actor, classId: 1 };

  // 与当前职业相同 / 非法 id / 数据库中不存在的职业：只刷新
  panel.onClassChange(item, 1);
  panel.onClassChange(item, 0);
  panel.onClassChange(item, 99);
  assert.equal(refreshed, 3);

  // 非法状态 id / 数据库中不存在的状态：不处理
  panel.onAddState({ _actor: actor, stateToAdd: 0 });
  panel.onAddState({ _actor: actor, stateToAdd: 99 });
  panel.onRemoveState({ _actor: actor }, 0);
  assert.equal(refreshed, 3);
});
