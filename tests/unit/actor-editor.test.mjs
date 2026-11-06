import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import StatsSettingPanel from "../../cheat-engine/www/cheat/panels/StatsSettingPanel.js";
import PartyPanel from "../../cheat-engine/www/cheat/panels/PartyPanel.js";
import { getClassOptions } from "../../cheat-engine/www/cheat/js/actor/actors.js";
import {
  getEquipItem,
  getEquipOptions,
  getEquipSlotName,
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
