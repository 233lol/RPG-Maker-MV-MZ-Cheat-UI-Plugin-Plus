import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import StatsSettingPanel from "../../cheat-engine/www/cheat/panels/StatsSettingPanel.js";
import PartyPanel from "../../cheat-engine/www/cheat/panels/PartyPanel.js";
import { getClassOptions } from "../../cheat-engine/www/cheat/js/actor/actors.js";
import {
  getEquipItem,
  getEquipOptions,
  getEquipSlotName,
  getEquipTypeId,
  getEquipmentRows,
} from "../../cheat-engine/www/cheat/js/actor/equipment.js";
import {
  getActiveStates,
  getAvailableStates,
} from "../../cheat-engine/www/cheat/js/actor/states.js";
import {
  canRemovePartyMember,
  getActorId,
  getAvailableActors,
  getMaxBattleMembers,
  getPartyMemberIds,
  getPartyRows,
  getSwapTargetIndex,
} from "../../cheat-engine/www/cheat/js/actor/party.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";

globalThis.Game_Actor = class Game_Actor {};

afterEach(() => {
  for (const name of [
    "$gamePlayer",
    "$gameParty",
    "$dataSystem",
    "$dataActors",
    "$dataClasses",
    "$dataWeapons",
    "$dataArmors",
    "$dataStates",
  ]) {
    delete globalThis[name];
  }

  Alert.handler = null;
  Alert.pending = [];
});

/* --------------------------------------------------- 异常与降级路径 */

test("equipment / states / party 在引擎对象抛错时安全降级", () => {
  assert.equal(
    getEquipTypeId(
      {
        equipSlots() {
          throw new Error("not ready");
        },
      },
      0,
    ),
    0,
  );

  assert.deepEqual(
    getEquipOptions(
      {
        equipSlots: () => [1],
        canEquip() {
          throw new Error("cannot check");
        },
      },
      0,
      [null, { id: 1, name: "Sword" }],
      [],
    ),
    [{ title: "Sword", value: 1 }],
  );

  assert.deepEqual(
    getEquipmentRows(
      {
        equips() {
          throw new Error("not ready");
        },
      },
      {},
      [],
      [],
    ),
    [],
  );

  assert.deepEqual(getEquipmentRows({ equips: () => null }, {}, [], []), []);

  assert.deepEqual(
    getActiveStates(
      {
        states() {
          throw new Error("not ready");
        },
      },
      [],
    ),
    [],
  );

  assert.deepEqual(getActiveStates({ states: () => "bad" }, []), []);

  assert.deepEqual(
    getAvailableStates(
      {
        isStateAffected() {
          throw new Error("not ready");
        },
      },
      [{ id: 1, name: "Poison" }],
    ),
    [{ title: "Poison", value: 1 }],
  );

  assert.equal(
    getActorId({
      actorId() {
        throw new Error("not ready");
      },
      _actorId: 5,
    }),
    5,
  );

  assert.deepEqual(
    getPartyMemberIds({
      members() {
        throw new Error("not ready");
      },
    }),
    [],
  );

  assert.deepEqual(getPartyMemberIds({ members: () => null }), []);
  assert.equal(
    getMaxBattleMembers({
      maxBattleMembers() {
        throw new Error("not ready");
      },
    }),
    0,
  );

  const rows = getPartyRows(
    {
      members: () => [
        {
          actorId: () => 1,
          currentClass() {
            throw new Error("not ready");
          },
          _classId: 2,
          name: () => "",
          level: 3,
        },
      ],
    },
    [null, { id: 1, name: "Actor 1" }],
    [null, null, { id: 2, name: "Mage" }],
  );

  assert.equal(rows[0].className, "Mage");
  assert.equal(rows[0].name, "");
});

/* --------------------------------------------------------------- equipment */

function makeWeapons() {
  return [
    null,
    { id: 1, name: "Sword", wtypeId: 1 },
    { id: 2, name: "Axe", wtypeId: 2 },
  ];
}

function makeArmors() {
  return [
    null,
    { id: 1, name: "Shield", etypeId: 2 },
    { id: 2, name: "Mail", etypeId: 3 },
  ];
}

function makeEquipActor(overrides = {}) {
  return {
    canEquip: () => true,
    equipSlots: () => [1, 2, 3],
    equips: () => [makeWeapons()[1], null, makeArmors()[2]],
    ...overrides,
  };
}

test("equipment：槽位名优先取 equipSlots + equipTypes，缺失时返回空串", () => {
  const system = { equipTypes: ["", "Weapon", "Shield", "Body"] };
  const actor = makeEquipActor();

  assert.equal(getEquipSlotName(system, actor, 0), "Weapon");
  assert.equal(getEquipSlotName(system, actor, 1), "Shield");
  assert.equal(getEquipSlotName(system, actor, 2), "Body");
  assert.equal(getEquipSlotName({ equipTypes: [] }, actor, 0), "");
});

test("equipment：0 号槽只列武器，其它槽按装备类型过滤", () => {
  const weapons = makeWeapons();
  const armors = makeArmors();
  const actor = {
    equipSlots: () => [1, 2, 3],
    canEquip: () => true,
  };

  assert.deepEqual(getEquipOptions(actor, 0, weapons, armors), [
    { title: "Sword", value: 1 },
    { title: "Axe", value: 2 },
  ]);
  assert.deepEqual(getEquipOptions(actor, 1, weapons, armors), [
    { title: "Shield", value: 1 },
  ]);
  assert.deepEqual(getEquipOptions(actor, 2, weapons, armors), [
    { title: "Mail", value: 2 },
  ]);
});

test("equipment：canEquip 过滤不可装备的武器", () => {
  const actor = {
    equipSlots: () => [1, 2],
    canEquip: (item) => item.id !== 2,
  };

  assert.deepEqual(getEquipOptions(actor, 0, makeWeapons(), makeArmors()), [
    { title: "Sword", value: 1 },
  ]);
});

test("equipment：getEquipItem 区分槽位并支持卸下", () => {
  const weapons = makeWeapons();
  const armors = makeArmors();

  assert.equal(getEquipItem(0, 1, weapons, armors), weapons[1]);
  assert.equal(getEquipItem(1, 1, weapons, armors), armors[1]);
  assert.equal(getEquipItem(1, 1, weapons, armors, 2), armors[1]);
  assert.equal(getEquipItem(1, 1, weapons, armors, 1), weapons[1]);
  assert.equal(getEquipItem(0, 0, weapons, armors), null);
  assert.equal(getEquipItem(0, 999, weapons, armors), null);
});

test("equipment：getEquipmentRows 保留当前装备、生成槽位与选项", () => {
  const actor = makeEquipActor({
    canEquip: () => false,
  });
  const rows = getEquipmentRows(
    actor,
    { equipTypes: ["", "Weapon", "Shield", "Body"] },
    makeWeapons(),
    makeArmors(),
  );

  assert.equal(rows.length, 3);
  assert.equal(rows[0].slotName, "Weapon");
  assert.equal(rows[0].equipId, 1);
  assert.deepEqual(rows[0].options[0], { title: "Sword", value: 1 });
  assert.equal(rows[1].equipId, 0);
  assert.equal(rows[2].slotName, "Body");
  assert.equal(rows[2].equipId, 2);
});

/* --------------------------------------------------------------- states */

test("states：当前状态与可添加状态分开，名字缺失时回退到数据库", () => {
  const dataStates = [
    null,
    { id: 1, name: "Poison" },
    { id: 2, name: "Blind" },
    { id: 3, name: "Sleep" },
  ];
  const actor = {
    states: () => [{ id: 1 }, { id: 2, name: "Blind (custom)" }],
    isStateAffected: (id) => id === 1,
  };

  assert.deepEqual(getActiveStates(actor, dataStates), [
    { id: 1, name: "Poison", iconIndex: 0 },
    { id: 2, name: "Blind (custom)", iconIndex: 0 },
  ]);
  assert.deepEqual(getAvailableStates(actor, dataStates), [
    { title: "Blind", value: 2 },
    { title: "Sleep", value: 3 },
  ]);
});

/* --------------------------------------------------------------- party */

function makePartyActor(id, level = 5, className = "Hero") {
  return {
    _actorId: id,
    _classId: id,
    level,
    actorId: () => id,
    name: () => `Actor ${id}`,
    currentClass: () => ({ name: className }),
  };
}

function makeParty(actors) {
  return {
    members: () => actors,
    maxBattleMembers: () => 4,
    addActor() {},
    removeActor() {},
    swapOrder() {},
  };
}

test("party：读取成员、战斗成员标记、职业与顺序", () => {
  const actors = [
    makePartyActor(1, 10, "Warrior"),
    makePartyActor(2, 7, "Mage"),
  ];
  const party = makeParty(actors);
  const rows = getPartyRows(
    party,
    [null, { id: 1, name: "Actor 1" }, { id: 2, name: "Actor 2" }],
    [null, { id: 1, name: "Warrior" }, { id: 2, name: "Mage" }],
  );

  assert.deepEqual(getPartyMemberIds(party), [1, 2]);
  assert.equal(getMaxBattleMembers(party), 4);
  assert.equal(getActorId(actors[0]), 1);
  assert.deepEqual(
    rows.map((row) => ({
      id: row.id,
      index: row.index,
      className: row.className,
      battleMember: row.battleMember,
      canMoveUp: row.canMoveUp,
      canMoveDown: row.canMoveDown,
    })),
    [
      {
        id: 1,
        index: 0,
        className: "Warrior",
        battleMember: true,
        canMoveUp: false,
        canMoveDown: true,
      },
      {
        id: 2,
        index: 1,
        className: "Mage",
        battleMember: true,
        canMoveUp: true,
        canMoveDown: false,
      },
    ],
  );
});

test("party：可用角色排除已入队成员，最后一名成员不可移除", () => {
  const actors = [makePartyActor(1)];
  const party = makeParty(actors);
  const dataActors = [
    null,
    { id: 1, name: "Actor 1" },
    { id: 2, name: "Actor 2" },
    { id: 3, name: "Actor 3" },
  ];

  assert.deepEqual(getAvailableActors(party, dataActors), [
    { id: 2, name: "Actor 2" },
    { id: 3, name: "Actor 3" },
  ]);
  assert.equal(canRemovePartyMember(party), false);

  party.members = () => [makePartyActor(1), makePartyActor(2)];
  assert.equal(canRemovePartyMember(party), true);
});

test("party：交换目标下标做边界检查", () => {
  assert.equal(getSwapTargetIndex(3, 1, -1), 0);
  assert.equal(getSwapTargetIndex(3, 1, 1), 2);
  assert.equal(getSwapTargetIndex(3, 0, -1), null);
  assert.equal(getSwapTargetIndex(3, 2, 1), null);
  assert.equal(getSwapTargetIndex(0, 0, 1), null);
});

/* --------------------------------------------------------------- actors */

test("actors：职业下拉过滤空项并生成 title/value", () => {
  assert.deepEqual(
    getClassOptions([
      null,
      { id: 1, name: "Warrior" },
      { id: 2, name: "" },
      { id: 0, name: "Invalid" },
    ]),
    [
      { title: "Warrior", value: 1 },
      { title: "#2", value: 2 },
    ],
  );
});

/* --------------------------------------------------------------- Stats panel */

function makeStatsPanel(overrides = {}) {
  return {
    ...StatsSettingPanel.methods,
    selectedTab: 1,
    selectedSubTab: "attributes",
    paramNames: [],
    classOptions: [],
    actors: [],
    initializeVariables() {},
    ...overrides,
  };
}

function makeStatsActor(overrides = {}) {
  const actor = new globalThis.Game_Actor();

  actor._actorId = 1;
  actor._name = "Actor 1";
  actor._nickname = "Nick";
  actor._profile = "Profile";
  actor._classId = 2;
  actor._paramPlus = [0, 0, 0];
  actor.level = 5;
  actor.param = () => 10;
  actor.currentExp = () => 20;
  actor.paramBase = () => 1;
  actor.paramGrowth = () => 0;
  actor.equips = () => [null, null];
  actor.equipSlots = () => [1, 2];
  actor.currentClass = () => ({ name: "Mage" });
  actor.states = () => [];
  actor.isStateAffected = () => false;
  actor.setName = (name) => {
    actor._name = name;
  };
  actor.setNickname = (nickname) => {
    actor._nickname = nickname;
  };
  actor.setProfile = (profile) => {
    actor._profile = profile;
  };
  actor.changeClass = (classId, keepExp) => {
    actor.changedClass = { classId, keepExp };
  };
  actor.changeEquip = (slotId, equip) => {
    actor.changedEquip = { slotId, equip };
  };
  actor.forceChangeEquip = (slotId, equip) => {
    actor.forcedEquip = { slotId, equip };
  };
  actor.addState = (stateId) => {
    actor.addedState = stateId;
  };
  actor.removeState = (stateId) => {
    actor.removedState = stateId;
  };

  return Object.assign(actor, overrides);
}

test("StatsSettingPanel.extractActorData：包含身份、装备与状态", () => {
  globalThis.$dataSystem = { equipTypes: ["", "Weapon", "Shield"] };
  globalThis.$dataWeapons = [null, { id: 1, name: "Sword" }];
  globalThis.$dataArmors = [null, { id: 1, name: "Shield" }];
  globalThis.$dataStates = [null, { id: 1, name: "Poison" }];
  globalThis.$dataClasses = [null, { id: 1, name: "Warrior" }];

  const actor = makeStatsActor({
    equips: () => [{ id: 1, name: "Sword" }, null],
    states: () => [{ id: 1, name: "Poison" }],
  });
  const panel = makeStatsPanel();
  const data = StatsSettingPanel.methods.extractActorData.call(panel, actor);

  assert.equal(data.id, 1);
  assert.equal(data.nickname, "Nick");
  assert.equal(data.profile, "Profile");
  assert.equal(data.classId, 2);
  assert.equal(data.equipment.length, 2);
  assert.deepEqual(data.equipment[0].options[0], { title: "无", value: 0 });
  assert.equal(data.equipment[0].equipId, 1);
  assert.deepEqual(data.activeStates, [
    { id: 1, name: "Poison", iconIndex: 0 },
  ]);
});

test("StatsSettingPanel：身份 / 职业 / 装备 / 状态修改会写回引擎并刷新", () => {
  const actor = makeStatsActor();
  const calls = [];
  const panel = makeStatsPanel({
    initializeVariables() {
      calls.push("refresh");
    },
  });

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };
  globalThis.$dataWeapons = [null, { id: 1, name: "Sword" }];
  globalThis.$dataArmors = [null, { id: 1, name: "Shield" }];

  const item = {
    _actor: actor,
    classId: 2,
    name: "New",
    nickname: "N",
    profile: "P",
  };

  panel.onNameChange(item);
  panel.onNicknameChange(item);
  panel.onProfileChange(item);
  panel.onClassChange(item, 3);
  panel.onEquipChange(item, { slotId: 1 }, 1);
  panel.onAddState({ _actor: actor, stateToAdd: 2 });
  panel.onRemoveState({ _actor: actor }, 2);

  assert.equal(actor._name, "New");
  assert.equal(actor._nickname, "N");
  assert.equal(actor._profile, "P");
  assert.deepEqual(actor.changedClass, { classId: 3, keepExp: true });
  assert.deepEqual(actor.forcedEquip, {
    slotId: 1,
    equip: globalThis.$dataArmors[1],
  });
  assert.equal(actor.changedEquip, undefined);
  assert.equal(actor.addedState, 2);
  assert.equal(actor.removedState, 2);
  assert.equal(calls.length, 7);
});

test("StatsSettingPanel.onEquipChange：缺少 forceChangeEquip 时退回 changeEquip", () => {
  const actor = makeStatsActor();
  delete actor.forceChangeEquip;

  let refreshed = 0;
  const panel = makeStatsPanel({
    initializeVariables() {
      refreshed++;
    },
  });

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };
  globalThis.$dataWeapons = [null, { id: 1, name: "Sword" }];
  globalThis.$dataArmors = [null, { id: 1, name: "Shield" }];

  panel.onEquipChange({ _actor: actor }, { slotId: 1 }, 1);

  assert.deepEqual(actor.changedEquip, {
    slotId: 1,
    equip: globalThis.$dataArmors[1],
  });
  assert.equal(actor.forcedEquip, undefined);
  assert.equal(refreshed, 1);
});

/* --------------------------------------------------------------- Party panel */

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

function makePartyPanel(overrides = {}) {
  return {
    ...PartyPanel.methods,
    partyRows: [],
    availableRows: [],
    battleMemberCount: 0,
    selectedAddId: null,
    ...overrides,
  };
}

test("PartyPanel.initializeVariables：整理队伍、可用角色与战斗人数", () => {
  const actor = makePartyActor(1, 8, "Warrior");
  const party = makeParty([actor]);
  globalThis.$gamePlayer = {};
  globalThis.$gameParty = party;
  globalThis.$dataActors = [
    null,
    { id: 1, name: "Actor 1" },
    { id: 2, name: "Actor 2" },
  ];
  globalThis.$dataClasses = [null, { id: 1, name: "Warrior" }];

  const panel = makePartyPanel();
  panel.initializeVariables();

  assert.equal(panel.partyRows.length, 1);
  assert.equal(panel.partyRows[0].name, "Actor 1");
  assert.equal(panel.battleMemberCount, 4);
  assert.deepEqual(panel.availableRows, [{ id: 2, name: "Actor 2" }]);
  assert.equal(panel.selectedAddId, 2);
});

test("PartyPanel：添加 / 移除 / 移动成员，并保护最后一名成员", () => {
  const actor1 = makePartyActor(1);
  const actor2 = makePartyActor(2);
  const members = [actor1, actor2];
  const calls = [];
  const party = {
    members: () => members,
    maxBattleMembers: () => 1,
    addActor: (id) => calls.push(["add", id]),
    removeActor: (id) => calls.push(["remove", id]),
    swapOrder: (from, to) => calls.push(["swap", from, to]),
  };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = party;
  globalThis.$dataActors = [
    null,
    { id: 1, name: "Actor 1" },
    { id: 2, name: "Actor 2" },
    { id: 3, name: "Actor 3" },
  ];

  const panel = makePartyPanel({
    partyRows: getPartyRows(party, globalThis.$dataActors, []),
    availableRows: [{ id: 3, name: "Actor 3" }],
    selectedAddId: 3,
    initializeVariables() {},
  });

  panel.addMember();
  assert.deepEqual(calls[0], ["add", 3]);
  assert.equal(Alert.pending.length, 1);

  panel.moveMember({ index: 0 }, 1);
  assert.deepEqual(calls[1], ["swap", 0, 1]);

  panel.removeMember({ id: 1, name: "Actor 1" });
  assert.deepEqual(calls[2], ["remove", 1]);

  members.length = 1;
  panel.removeMember({ id: 1, name: "Actor 1" });
  assert.equal(calls.length, 3);
  assert.equal(Alert.pending.length, 3);
});

test("PartyPanel.data / computed / created 展开默认值", () => {
  const data = PartyPanel.data.call({});

  assert.deepEqual(data, {
    partyRows: [],
    availableRows: [],
    battleMemberCount: 0,
    selectedAddId: null,
  });

  assert.equal(PartyPanel.computed.panelStateId.call({}), "party");

  assert.deepEqual(
    PartyPanel.computed.availableOptions.call({
      availableRows: [{ id: 2, name: "Actor 2" }],
    }),
    [{ title: "Actor 2", value: 2 }],
  );

  assert.equal(
    PartyPanel.computed.canRemoveMember.call({ partyRows: [] }),
    false,
  );
  assert.equal(
    PartyPanel.computed.canRemoveMember.call({ partyRows: [{}] }),
    false,
  );
  assert.equal(
    PartyPanel.computed.canRemoveMember.call({ partyRows: [{}, {}] }),
    true,
  );

  let initialized = 0;
  PartyPanel.created.call({
    initializeVariables() {
      initialized++;
    },
  });
  assert.equal(initialized, 1);
});

test("PartyPanel.getPanelStateSnapshot / applyPanelState 保存并恢复当前选中项", () => {
  const panel = { selectedAddId: 9 };

  assert.deepEqual(PartyPanel.methods.getPanelStateSnapshot.call(panel), {
    selectedAddId: 9,
  });

  PartyPanel.methods.applyPanelState.call(panel, { selectedAddId: 3 });
  assert.equal(panel.selectedAddId, 3);

  PartyPanel.methods.applyPanelState.call(panel, {});
  assert.equal(panel.selectedAddId, null);
});

test("PartyPanel.initializeVariables：重置列表并校验选中项", () => {
  const panel = makePartyPanel({
    partyRows: [{}],
    availableRows: [{}],
    battleMemberCount: 4,
    selectedAddId: 1,
  });

  panel.initializeVariables();
  assert.deepEqual(panel.partyRows, []);
  assert.deepEqual(panel.availableRows, []);
  assert.equal(panel.battleMemberCount, 0);

  const actor = makePartyActor(1);
  const party = makeParty([actor]);
  globalThis.$gamePlayer = {};
  globalThis.$gameParty = party;
  globalThis.$dataActors = [null, { id: 1, name: "Actor 1" }];

  panel.selectedAddId = null;
  panel.initializeVariables();
  assert.equal(panel.selectedAddId, null, "可选队员列表为空时选中项为 null");

  const emptyPanel = makePartyPanel({ selectedAddId: 7 });
  emptyPanel.initializeVariables();
  assert.equal(emptyPanel.selectedAddId, null);
});

test("PartyPanel.moveMember：边界 / 不支持函数 / 未加载时告警", () => {
  const calls = [];
  const party = {
    members: () => [],
    maxBattleMembers: () => 4,
    swapOrder: (from, to) => calls.push([from, to]),
  };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = party;
  globalThis.$dataActors = [];

  const panel = makePartyPanel({
    partyRows: [{ index: 0 }, { index: 1 }],
    initializeVariables() {},
  });

  panel.moveMember({ index: 0 }, -1);
  assert.equal(calls.length, 0, "越界时不移动");

  delete party.swapOrder;
  const alerts = captureAlerts();
  panel.moveMember({ index: 0 }, 1);
  assert.equal(calls.length, 0);
  assert.equal(alerts.at(-1).level, "warn");

  delete globalThis.$gamePlayer;
  const before = alerts.length;
  panel.moveMember({ index: 0 }, 1);
  assert.equal(alerts.length, before + 1, "游戏未加载时提示");
});

test("PartyPanel.removeMember / addMember：异常分支", () => {
  const calls = [];
  const party = {
    members: () => [makePartyActor(1)],
    maxBattleMembers: () => 4,
    addActor: (id) => calls.push(["add", id]),
    removeActor: (id) => calls.push(["remove", id]),
  };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = party;
  globalThis.$dataActors = [null, { id: 1, name: "Actor 1" }];

  const alerts = captureAlerts();
  const panel = makePartyPanel({
    partyRows: [{ id: 1, name: "Actor 1" }],
    initializeVariables() {},
  });

  panel.removeMember({ id: 1, name: "Actor 1" });
  assert.equal(calls.length, 0);
  assert.equal(alerts.at(-1).level, "warn", "最后一名队员不能删除");

  panel.selectedAddId = 0;
  panel.addMember();
  assert.equal(calls.length, 0, "无效 id 不添加成员");

  panel.selectedAddId = 3;
  panel.addMember();
  assert.deepEqual(calls.at(-1), ["add", 3]);
  assert.match(alerts.at(-1).msg, /#3/);

  delete globalThis.$gamePlayer;
  const before = alerts.length;
  panel.removeMember({ id: 1, name: "Actor 1" });
  panel.addMember();
  assert.equal(alerts.length, before + 2, "游戏未加载时提示");
});

test("StatsSettingPanel falls back without data tables", () => {
  const actor = makeStatsActor();
  const party = { members: () => [actor], maxBattleMembers: () => 4 };

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = party;
  delete globalThis.$dataSystem;
  delete globalThis.$dataClasses;
  delete globalThis.$dataStates;
  delete globalThis.$dataWeapons;
  delete globalThis.$dataArmors;

  const panel = {
    ...StatsSettingPanel.methods,
    selectedTab: 1,
    selectedSubTab: "bad-tab",
    paramNames: [],
    classOptions: [],
    actors: [],
  };

  panel.initializeVariables();

  assert.deepEqual(panel.paramNames, []);
  assert.deepEqual(panel.classOptions, []);
  assert.equal(panel.selectedSubTab, "attributes");
  assert.equal(panel.actors.length, 1);

  const data = panel.extractActorData(actor);
  assert.deepEqual(data.activeStates, []);
  assert.deepEqual(data.availableStateOptions, []);
  assert.equal(data.equipment.length, 2);
});

test("StatsSettingPanel.onEquipChange refreshes when equipment is unknown", () => {
  const actor = makeStatsActor();
  globalThis.$gamePlayer = {};
  globalThis.$gameParty = { members: () => [actor] };
  globalThis.$dataWeapons = [];
  globalThis.$dataArmors = [];

  let refreshed = 0;
  const panel = makeStatsPanel({
    initializeVariables() {
      refreshed++;
    },
  });

  panel.onEquipChange({ _actor: actor }, { slotId: 0, slotTypeId: 1 }, 99);

  assert.equal(refreshed, 1);
  assert.equal(actor.forcedEquip, undefined);
});
