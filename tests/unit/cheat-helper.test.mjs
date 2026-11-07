import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";

const originalCwd = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-helper-"));

globalThis.require = createRequire(import.meta.url);
globalThis.Utils = {
  isNwjs: () => true,
  RPGMAKER_NAME: "MV",
};

process.chdir(tempDir);

function installFakeTimers() {
  const timers = new Map();
  let nextId = 1;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, ms });
    return id;
  };

  globalThis.clearInterval = (id) => {
    timers.delete(id);
  };

  return {
    timers,
    restore() {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    },
  };
}

// 模块加载时的 initialize() 会注册两个 500ms 重试定时器。测试里不需要真的跑，
// 用假定时器吞掉，避免留下活跃 handle。
const bootstrapTimers = installFakeTimers();
const {
  GeneralCheat,
  GameSpeedCheat,
  SpeedCheat,
  SceneCheat,
  BattleCheat,
  MessageCheat,
} = await import("../../cheat-engine/www/cheat/js/CheatHelper.js");
bootstrapTimers.restore();

const { KeyValueStorage } =
  await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");
const { getCheatSettingsPath } =
  await import("../../cheat-engine/www/cheat/js/SettingsPath.js");

class Game_Actor {
  constructor(actorId) {
    this._actorId = actorId;
    this.mhp = 100;
    this.mmp = 50;
    this.hp = 10;
    this.mp = 5;
    this.tp = 0;
    this.paidSkillCost = false;
  }

  gainHp(value) {
    this.hp += value;
  }

  setHp(value) {
    this.hp = value;
  }

  gainMp(value) {
    this.mp += value;
  }

  setMp(value) {
    this.mp = value;
  }

  gainTp(value) {
    this.tp += value;
  }

  setTp(value) {
    this.tp = value;
  }

  maxTp() {
    return 100;
  }

  paySkillCost() {
    this.paidSkillCost = true;
  }
}

globalThis.Game_Actor = Game_Actor;

function clearGameGlobals() {
  for (const name of [
    "$gamePlayer",
    "$gameParty",
    "$gameMap",
    "$gameSystem",
    "$gameTroop",
    "$gameActors",
    "$dataSystem",
    "$dataMapInfos",
    "SceneManager",
    "Scene_Title",
    "Scene_Boot",
    "Scene_Map",
    "Scene_Save",
    "Scene_Load",
    "Scene_Battle",
    "BattleManager",
    "DataManager",
    "Window_Message",
    "Window_ScrollText",
    "Window_BattleLog",
  ]) {
    delete globalThis[name];
  }
}

function makeGameReady(overrides = {}) {
  globalThis.$gamePlayer = {
    _through: false,
    _encounterCount: 10,
    _moveSpeed: 4,
    moveSpeed() {
      return this._moveSpeed;
    },
    setMoveSpeed(value) {
      this._moveSpeed = value;
    },
    canEncounter() {
      return true;
    },
    canPass() {
      return true;
    },
    setPosition() {},
    center() {},
    makeEncounterCount() {},
    reserveTransfer() {},
    direction() {
      return 2;
    },
    ...overrides,
  };
  globalThis.$gameParty = {
    _gold: 100,
    _members: [],
    members() {
      return this._members;
    },
    gainGold(amount) {
      this._gold += amount;
    },
    loseGold(amount) {
      this._gold -= amount;
    },
  };
  globalThis.$gameMap = {};
  globalThis.$gameSystem = {};
}

function resetStatics() {
  GeneralCheat.godModeMap = undefined;
  GeneralCheat.godModeInterval = undefined;

  GameSpeedCheat.rate = undefined;
  GameSpeedCheat.sceneOption = undefined;
  GameSpeedCheat.isApplied = undefined;
  GameSpeedCheat.origin_SceneManager_updateScene = undefined;
  GameSpeedCheat._sceneOptions = undefined;

  SpeedCheat.fixed = undefined;

  BattleCheat.disableRandomEncounter = false;
  BattleCheat.canEncounterBackups = undefined;

  MessageCheat.__initialized = false;
  MessageCheat.skip = false;
  MessageCheat.gameSpeedBackup = null;

  Alert.handler = null;
  Alert.pending = [];
}

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

beforeEach(() => {
  clearGameGlobals();
  resetStatics();
});

after(() => {
  clearGameGlobals();
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
  Alert.handler = null;
  Alert.pending = [];
});

/* --------------------------------------------------------------- GeneralCheat */

test("GeneralCheat.getGodModeData：只接受 Game_Actor 实例，并按 actorId 复用条目", () => {
  assert.equal(GeneralCheat.getGodModeData({}), null);
  assert.equal(GeneralCheat.getGodModeData(null), null);

  const first = new Game_Actor(1);
  const second = new Game_Actor(1);

  const data = GeneralCheat.getGodModeData(first);
  assert.equal(data.actor, first);
  assert.equal(data.actorId, 1);
  assert.equal(data.godMode, false);

  // 同一个 actorId 的新实例会替换旧实例，避免把补丁继续挂在已销毁的角色上
  const replacement = GeneralCheat.getGodModeData(second);
  assert.equal(replacement.actor, second);

  assert.equal(GeneralCheat.getGodModeMap().get(1), replacement);
  assert.equal(GeneralCheat.getGodModeData(first).actor, first);
});

test("GeneralCheat：开启无敌会接管伤害/消耗并在关闭时完整还原", () => {
  makeGameReady();

  const timers = installFakeTimers();
  const actor = new Game_Actor(1);
  const originals = {
    gainHp: actor.gainHp,
    setHp: actor.setHp,
    gainMp: actor.gainMp,
    setMp: actor.setMp,
    gainTp: actor.gainTp,
    setTp: actor.setTp,
    paySkillCost: actor.paySkillCost,
  };

  try {
    GeneralCheat.godModeOn(actor);

    assert.equal(GeneralCheat.isGodMode(actor), true);
    assert.deepEqual(GeneralCheat.getGodModeOnActorIds(), [1]);
    assert.notEqual(actor.gainHp, originals.gainHp);
    assert.equal(timers.timers.size, 1, "应启动共享回血定时器");

    actor.gainHp(-5);
    assert.equal(actor.hp, actor.mhp + 10, "受到的伤害会变成等量治疗");

    actor.setHp(1);
    assert.equal(actor.hp, actor.mhp);

    actor.gainMp(-1);
    assert.equal(actor.mp, actor.mmp + 5, "消耗的 MP 会变成等量回复");

    actor.setMp(1);
    assert.equal(actor.mp, actor.mmp);

    actor.gainTp(-1);
    assert.equal(actor.tp, actor.maxTp());

    actor.setTp(1);
    assert.equal(actor.tp, actor.maxTp());

    actor.paySkillCost();
    assert.equal(actor.paidSkillCost, false, "无敌时技能消耗应被忽略");

    const timer = [...timers.timers.values()][0];
    actor.hp = 1;
    actor.mp = 1;
    actor.tp = 0;
    timer.fn();
    assert.ok(actor.hp > 1);
    assert.ok(actor.mp > 1);
    assert.ok(actor.tp > 0);

    GeneralCheat.godModeOff(actor);

    assert.equal(GeneralCheat.isGodMode(actor), false);
    assert.equal(actor.gainHp, originals.gainHp);
    assert.equal(actor.setHp, originals.setHp);
    assert.equal(actor.gainMp, originals.gainMp);
    assert.equal(actor.setMp, originals.setMp);
    assert.equal(actor.gainTp, originals.gainTp);
    assert.equal(actor.setTp, originals.setTp);
    assert.equal(actor.paySkillCost, originals.paySkillCost);
    assert.equal(actor.gainHP_bkup, undefined);
    assert.equal(actor.paySkillCost_bkup, undefined);
    assert.equal(timers.timers.size, 0);
  } finally {
    timers.restore();
  }
});

test("GeneralCheat：重复开启不会二次包装，关闭未开启的角色是空操作", () => {
  makeGameReady();

  const timers = installFakeTimers();
  const actor = new Game_Actor(1);

  try {
    GeneralCheat.godModeOn(actor);
    const patched = actor.gainHp;
    GeneralCheat.godModeOn(actor);
    assert.equal(actor.gainHp, patched);

    GeneralCheat.godModeOff(actor);
    const restored = actor.gainHp;
    GeneralCheat.godModeOff(actor);
    assert.equal(actor.gainHp, restored);

    GeneralCheat.godModeOn({});
    assert.equal(GeneralCheat.getGodModeMap().size, 1);
  } finally {
    timers.restore();
  }
});

test("GeneralCheat：读档后旧角色实例的条目会被清理", () => {
  makeGameReady();

  const timers = installFakeTimers();
  const oldActor = new Game_Actor(1);
  const newActor = new Game_Actor(1);

  try {
    GeneralCheat.godModeOn(oldActor);
    globalThis.$gameActors = {
      actor(id) {
        return id === 1 ? newActor : null;
      },
    };

    assert.deepEqual(GeneralCheat.getGodModeActors(), []);
    assert.equal(GeneralCheat.getGodModeMap().has(1), false);
  } finally {
    timers.restore();
  }
});

test("GeneralCheat.syncGodModeInterval：没有无敌角色时停止定时器", () => {
  const timers = installFakeTimers();

  try {
    const handle = setInterval(() => {}, 1000);
    GeneralCheat.godModeInterval = handle;
    GeneralCheat.syncGodModeInterval();

    assert.equal(GeneralCheat.godModeInterval, undefined);
    assert.equal(timers.timers.size, 0);
  } finally {
    timers.restore();
  }
});

/* --------------------------------------------------------------- GameSpeedCheat */

function makeSceneManager(options = {}) {
  const calls = { updateScene: 0, updateInputData: 0, changeScene: 0 };

  globalThis.SceneManager = {
    _scene: options.scene || null,
    updateScene() {
      calls.updateScene++;
    },
    updateInputData() {
      calls.updateInputData++;
    },
    changeScene() {
      calls.changeScene++;
    },
  };

  return calls;
}

test("GameSpeedCheat：默认倍率 / 场景选项与战斗场景判断", () => {
  assert.equal(GameSpeedCheat.getRate(), 1);
  assert.equal(
    GameSpeedCheat.getSceneOption(),
    GameSpeedCheat.sceneOptions().all,
  );
  assert.equal(GameSpeedCheat.sceneOptions().all(), true);

  class Scene_Battle {}
  globalThis.Scene_Battle = Scene_Battle;

  globalThis.SceneManager = { _scene: new Scene_Battle() };
  assert.equal(GameSpeedCheat.sceneOptions().battle(), true);

  globalThis.SceneManager = { _scene: {} };
  assert.equal(GameSpeedCheat.sceneOptions().battle(), false);
});

test("GameSpeedCheat.setGameSpeed：非法倍率回退到 1，不包装 updateScene", () => {
  const calls = makeSceneManager();

  GameSpeedCheat.setGameSpeed(Number.NaN);
  assert.equal(GameSpeedCheat.getRate(), 1);
  assert.equal(GameSpeedCheat.isApplied, undefined);

  GameSpeedCheat.setGameSpeed(0);
  assert.equal(GameSpeedCheat.getRate(), 1);
  assert.equal(calls.updateScene, 0);

  GameSpeedCheat.setGameSpeed(-2);
  assert.equal(GameSpeedCheat.getRate(), 1);
});

test("GameSpeedCheat.setGameSpeed：按累计步进复制 updateScene，并可还原", () => {
  const calls = makeSceneManager();
  const original = SceneManager.updateScene;

  GameSpeedCheat.setGameSpeed(2, GameSpeedCheat.sceneOptions().all);

  assert.equal(GameSpeedCheat.isApplied, true);
  assert.notEqual(SceneManager.updateScene, original);

  const context = { name: "scene" };
  SceneManager.updateScene.call(context);
  assert.equal(calls.updateScene, 2);
  assert.equal(calls.updateInputData, 1);
  assert.equal(calls.changeScene, 1);

  SceneManager.updateScene.call(context);
  assert.equal(calls.updateScene, 4);

  GameSpeedCheat.removeApplied();
  assert.equal(SceneManager.updateScene, original);
  assert.equal(GameSpeedCheat.isApplied, false);
});

test("GameSpeedCheat.setGameSpeed：帧率不足 1 时会跨帧累计；场景过滤关闭时不加速", () => {
  const calls = makeSceneManager();
  const original = SceneManager.updateScene;

  GameSpeedCheat.setGameSpeed(0.5, GameSpeedCheat.sceneOptions().all);
  SceneManager.updateScene.call({});
  assert.equal(calls.updateScene, 0);

  SceneManager.updateScene.call({});
  assert.equal(calls.updateScene, 1);

  GameSpeedCheat.removeApplied();
  assert.equal(SceneManager.updateScene, original);

  GameSpeedCheat.setGameSpeed(2, () => false);
  SceneManager.updateScene.call({});
  assert.equal(calls.updateScene, 2);
});

test("GameSpeedCheat.__writeSettings / __readSettings：合法配置恢复倍率", () => {
  makeSceneManager();

  const storage = new KeyValueStorage(getCheatSettingsPath("gameSpeed.json"));

  GameSpeedCheat.__writeSettings(2, GameSpeedCheat.sceneOptions().all);

  const raw = JSON.parse(storage.getItem("data"));
  assert.equal(raw.rate, 2);
  assert.equal(raw.sceneOption, "all");

  resetStatics();
  GameSpeedCheat.__readSettings();

  assert.equal(GameSpeedCheat.getRate(), 2);
  assert.equal(
    GameSpeedCheat.getSceneOption(),
    GameSpeedCheat.sceneOptions().all,
  );
  assert.equal(GameSpeedCheat.isApplied, true);

  GameSpeedCheat.removeApplied();
});

test("GameSpeedCheat.__readSettings：拒绝损坏 / 越界倍率与原型污染选项", () => {
  makeSceneManager();

  const storage = new KeyValueStorage(getCheatSettingsPath("gameSpeed.json"));

  for (const data of [
    { rate: 0, sceneOption: "all" },
    { rate: 11, sceneOption: "all" },
    { rate: "2", sceneOption: "all" },
    { rate: Number.NaN, sceneOption: "all" },
    { notRate: true },
  ]) {
    resetStatics();
    storage.setItem("data", JSON.stringify(data));
    GameSpeedCheat.__readSettings();

    assert.equal(GameSpeedCheat.getRate(), 1, JSON.stringify(data));
    assert.equal(GameSpeedCheat.isApplied, undefined);
  }

  resetStatics();
  storage.setItem(
    "data",
    JSON.stringify({ rate: 2, sceneOption: "__proto__" }),
  );
  GameSpeedCheat.__readSettings();

  assert.equal(GameSpeedCheat.getRate(), 2);
  assert.equal(
    GameSpeedCheat.getSceneOption(),
    GameSpeedCheat.sceneOptions().all,
  );

  GameSpeedCheat.removeApplied();
});

/* ------------------------------------------------------------------- SpeedCheat */

test("SpeedCheat：单次设置与固定速度定时器", () => {
  makeGameReady();

  const timers = installFakeTimers();

  try {
    SpeedCheat.setSpeed(7);
    assert.equal($gamePlayer.moveSpeed(), 7);
    assert.equal(SpeedCheat.isFixed(), false);

    SpeedCheat.setSpeed(8, true);
    assert.equal($gamePlayer.moveSpeed(), 8);
    assert.equal(SpeedCheat.isFixed(), true);
    assert.equal(timers.timers.size, 1);

    const timer = [...timers.timers.values()][0];
    $gamePlayer._moveSpeed = 4;
    timer.fn();
    assert.equal($gamePlayer.moveSpeed(), 8);

    SpeedCheat.removeFixSpeedInterval();
    assert.equal(SpeedCheat.isFixed(), false);
    assert.equal(timers.timers.size, 0);

    // 重复移除是安全的
    SpeedCheat.removeFixSpeedInterval();
  } finally {
    timers.restore();
  }
});

test("SpeedCheat：游戏未就绪时只提示，不写角色速度", () => {
  const alerts = captureAlerts();

  SpeedCheat.setSpeed(7);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].level, "warn");
});

test("SpeedCheat.__readSettings / __writeSettings：校验范围与固定速度", () => {
  makeGameReady();

  const timers = installFakeTimers();

  try {
    const storage = new KeyValueStorage(getCheatSettingsPath("speed.json"));

    SpeedCheat.__writeSettings(6, true);
    resetStatics();
    SpeedCheat.__readSettings();

    assert.equal(SpeedCheat.isFixed(), true);
    assert.equal(timers.timers.size, 1);

    SpeedCheat.removeFixSpeedInterval();

    for (const data of [
      { speed: 0, fixed: true },
      { speed: 11, fixed: true },
      { speed: "6", fixed: true },
      { speed: Number.POSITIVE_INFINITY, fixed: true },
      { fixed: true },
    ]) {
      resetStatics();
      storage.setItem("data", JSON.stringify(data));
      SpeedCheat.__readSettings();

      assert.equal(SpeedCheat.isFixed(), false, JSON.stringify(data));
      assert.equal(timers.timers.size, 0);
    }
  } finally {
    timers.restore();
  }
});

/* ------------------------------------------------------------------- SceneCheat */

function makeSceneClasses() {
  class Scene_Title {}
  class Scene_Map {}
  class Scene_Save {}
  class Scene_Load {}

  globalThis.Scene_Title = Scene_Title;
  globalThis.Scene_Map = Scene_Map;
  globalThis.Scene_Save = Scene_Save;
  globalThis.Scene_Load = Scene_Load;

  const calls = { goto: [], push: [], pop: 0 };
  globalThis.SceneManager = {
    _scene: null,
    goto(scene) {
      calls.goto.push(scene);
    },
    push(scene) {
      calls.push.push(scene);
    },
    pop() {
      calls.pop++;
    },
  };

  return { Scene_Title, Scene_Map, Scene_Save, Scene_Load, calls };
}

test("SceneCheat：标题 / 存档 / 读档场景切换", () => {
  const scenes = makeSceneClasses();

  SceneCheat.gotoTitle();
  assert.deepEqual(scenes.calls.goto, [scenes.Scene_Title]);

  SceneManager._scene = new scenes.Scene_Save();
  SceneCheat.toggleSaveScene();
  assert.equal(scenes.calls.pop, 1);

  SceneManager._scene = new scenes.Scene_Load();
  SceneCheat.toggleSaveScene();
  assert.equal(scenes.calls.goto.at(-1), scenes.Scene_Save);

  SceneManager._scene = {};
  SceneCheat.toggleSaveScene();
  assert.equal(scenes.calls.push.at(-1), scenes.Scene_Save);

  SceneManager._scene = new scenes.Scene_Load();
  SceneCheat.toggleLoadScene();
  assert.equal(scenes.calls.pop, 2);

  SceneManager._scene = new scenes.Scene_Save();
  SceneCheat.toggleLoadScene();
  assert.equal(scenes.calls.goto.at(-1), scenes.Scene_Load);

  SceneManager._scene = {};
  SceneCheat.toggleLoadScene();
  assert.equal(scenes.calls.push.at(-1), scenes.Scene_Load);
});

test("SceneCheat.quickSave：成功 / 引擎拒绝 / 抛错三种结果", async () => {
  makeGameReady();

  const alerts = captureAlerts();
  let beforeSave = 0;
  let saveCalls = 0;

  globalThis.$gameSystem = {
    onBeforeSave() {
      beforeSave++;
    },
  };

  globalThis.DataManager = {
    async saveGame() {
      saveCalls++;
      return true;
    },
  };

  assert.equal(await SceneCheat.quickSave(2), true);
  assert.equal(beforeSave, 1);
  assert.equal(saveCalls, 1);
  assert.equal(alerts.at(-1).level, "success");

  DataManager.saveGame = async () => false;
  assert.equal(await SceneCheat.quickSave(2), false);
  assert.equal(alerts.at(-1).level, "error");

  DataManager.saveGame = async () => {
    throw new Error("disk full");
  };
  assert.equal(await SceneCheat.quickSave(2), false);
  assert.equal(alerts.at(-1).level, "error");
});

test("SceneCheat.finishLoadIntoMap：补齐淡出、地图重载与 onAfterLoad", () => {
  const scenes = makeSceneClasses();
  const calls = [];

  SceneManager._scene = {
    fadeOutAll() {
      calls.push("fade");
    },
  };
  scenes.Scene_Load.prototype.reloadMapIfUpdated = function () {
    calls.push("reload");
    assert.notEqual(this, undefined);
  };
  globalThis.$gameSystem = {
    onAfterLoad() {
      calls.push("after-load");
    },
  };

  SceneCheat.finishLoadIntoMap();

  assert.deepEqual(calls, ["fade", "reload", "after-load"]);
  assert.equal(scenes.calls.goto.at(-1), scenes.Scene_Map);
});

test("SceneCheat.finishLoadIntoMap：单个收尾步骤失败不影响读档结果", () => {
  const scenes = makeSceneClasses();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    SceneManager._scene = {
      fadeOutAll() {
        throw new Error("fade failed");
      },
    };
    scenes.Scene_Load.prototype.reloadMapIfUpdated = function () {
      throw new Error("reload failed");
    };
    globalThis.$gameSystem = {
      onAfterLoad() {
        throw new Error("after failed");
      },
    };

    SceneCheat.finishLoadIntoMap();

    assert.equal(warnings.length, 3);
    assert.equal(scenes.calls.goto.at(-1), scenes.Scene_Map);
  } finally {
    console.warn = originalWarn;
  }
});

test("SceneCheat.quickLoad：成功时进入地图，失败时提示错误", async () => {
  const scenes = makeSceneClasses();
  const alerts = captureAlerts();
  let afterLoad = 0;
  let reload = 0;

  SceneManager._scene = {
    fadeOutAll() {},
  };
  scenes.Scene_Load.prototype.reloadMapIfUpdated = function () {
    reload++;
  };
  globalThis.$gameSystem = {
    onAfterLoad() {
      afterLoad++;
    },
  };
  globalThis.DataManager = {
    async loadGame() {
      return true;
    },
  };

  assert.equal(await SceneCheat.quickLoad(1), true);
  assert.equal(reload, 1);
  assert.equal(afterLoad, 1);
  assert.equal(scenes.calls.goto.at(-1), scenes.Scene_Map);
  assert.equal(alerts.at(-1).level, "success");

  DataManager.loadGame = async () => false;
  assert.equal(await SceneCheat.quickLoad(1), false);
  assert.equal(alerts.at(-1).level, "error");
});

/* ------------------------------------------------------------------ BattleCheat */

function makeBattleWorld() {
  class Scene_Battle {}
  globalThis.Scene_Battle = Scene_Battle;

  const enemies = [
    {
      mhp: 100,
      mmp: 50,
      hp: 10,
      mp: 5,
      tp: 0,
      restored: [],
      states: [],
      setHp(value) {
        this.hp = value;
      },
      setMp(value) {
        this.mp = value;
      },
      setTp(value) {
        this.tp = value;
      },
      maxTp() {
        return 100;
      },
      deathStateId() {
        return 1;
      },
      addNewState(id) {
        this.states.push(id);
      },
    },
  ];

  const party = [
    {
      mhp: 200,
      mmp: 80,
      hp: 20,
      mp: 10,
      tp: 0,
      states: [],
      setHp(value) {
        this.hp = value;
      },
      setMp(value) {
        this.mp = value;
      },
      setTp(value) {
        this.tp = value;
      },
      maxTp() {
        return 100;
      },
      deathStateId() {
        return 2;
      },
      addNewState(id) {
        this.states.push(id);
      },
    },
  ];

  globalThis.$gameTroop = { members: () => enemies };
  globalThis.$gameParty = { members: () => party, _gold: 0 };
  globalThis.$gameMap = {};
  globalThis.$gameSystem = {};
  globalThis.$gamePlayer = {
    _encounterCount: 10,
    canEncounter() {
      return true;
    },
  };
  globalThis.SceneManager = { _scene: new Scene_Battle() };
  globalThis.BattleManager = {
    _phase: "input",
    _preemptive: false,
    processVictoryCalls: 0,
    processDefeatCalls: 0,
    processEscapeCalls: 0,
    processAbortCalls: 0,
    processVictory() {
      this.processVictoryCalls++;
    },
    processDefeat() {
      this.processDefeatCalls++;
    },
    processEscape() {
      this.processEscapeCalls++;
    },
    processAbort() {
      this.processAbortCalls++;
    },
  };

  return { enemies, party };
}

test("BattleCheat：恢复 / 填充 / 设置全队与敌人的 HP、MP、TP", () => {
  makeBattleWorld();
  const alerts = captureAlerts();

  assert.equal(BattleCheat.recoverAllEnemy(), undefined);
  assert.equal($gameTroop.members()[0].hp, 100);
  assert.equal($gameTroop.members()[0].mp, 50);
  assert.equal($gameTroop.members()[0].tp, 0, "敌人恢复不应补 TP");

  BattleCheat.recoverAllParty();
  assert.equal($gameParty.members()[0].hp, 200);
  assert.equal($gameParty.members()[0].mp, 80);

  BattleCheat.fillTpAllEnemy();
  assert.equal($gameTroop.members()[0].tp, 100);

  BattleCheat.fillTpAllParty();
  assert.equal($gameParty.members()[0].tp, 100);

  BattleCheat.changeAllEnemyHealth(1);
  assert.equal($gameTroop.members()[0].hp, 1);

  BattleCheat.changeAllPartyHealth(2);
  assert.equal($gameParty.members()[0].hp, 2);

  assert.equal(alerts.length, 6);
  assert.ok(alerts.every((item) => item.level === "success"));
});

test("BattleCheat：只有战斗结束前才能执行胜利 / 失败 / 逃跑 / 中止", () => {
  makeBattleWorld();
  const alerts = captureAlerts();

  assert.equal(BattleCheat.canExecuteBattleEndProcess(), true);
  assert.equal(BattleCheat.victory(), true);
  assert.equal($gameTroop.members()[0].states[0], 1);
  assert.equal(BattleManager.processVictoryCalls, 1);

  assert.equal(BattleCheat.defeat(), true);
  assert.equal($gameParty.members()[0].states[0], 2);
  assert.equal(BattleManager.processDefeatCalls, 1);

  let observedPreemptive = null;
  BattleManager.processEscape = function () {
    observedPreemptive = this._preemptive;
  };
  const previous = BattleManager._preemptive;

  assert.equal(BattleCheat.escape(), true);
  assert.equal(observedPreemptive, true);
  assert.equal(BattleManager._preemptive, previous);

  assert.equal(BattleCheat.abort(), true);
  assert.equal(alerts.length, 4);

  BattleManager._phase = "battleEnd";
  assert.equal(BattleCheat.canExecuteBattleEndProcess(), false);
  assert.equal(BattleCheat.victory(), false);
  assert.equal(BattleCheat.defeat(), false);
  assert.equal(BattleCheat.escape(), false);
  assert.equal(BattleCheat.abort(), false);

  SceneManager._scene = {};
  assert.equal(BattleCheat.canExecuteBattleEndProcess(), false);
});

test("BattleCheat：禁止随机遇敌只 patch 当前玩家实例，并可恢复", () => {
  makeBattleWorld();

  const player = $gamePlayer;
  const original = player.canEncounter;

  assert.equal(BattleCheat.applyRandomEncounterPatch(), true);
  assert.equal(player.canEncounter(), false);

  // 重复 patch 不覆盖备份
  BattleCheat.applyRandomEncounterPatch();
  BattleCheat.restoreRandomEncounterPatch();
  assert.equal(player.canEncounter, original);

  assert.equal(BattleCheat.setDisableRandomEncounter(true), true);
  assert.equal(BattleCheat.isDisableRandomEncounter(), true);
  assert.equal(player.canEncounter(), false);

  assert.equal(BattleCheat.toggleDisableRandomEncounter(), true);
  assert.equal(BattleCheat.isDisableRandomEncounter(), false);
  assert.equal(player.canEncounter, original);

  delete globalThis.$gamePlayer;
  assert.equal(BattleCheat.applyRandomEncounterPatch(), false);
  assert.equal(BattleCheat.restoreRandomEncounterPatch(), false);
  assert.equal(BattleCheat.setDisableRandomEncounter(true), false);
});

test("BattleCheat.syncAfterGameChange：读档后把全局开关补到新玩家实例", () => {
  makeBattleWorld();
  BattleCheat.disableRandomEncounter = true;

  const newPlayer = {
    canEncounter() {
      return true;
    },
  };
  globalThis.$gamePlayer = newPlayer;

  BattleCheat.syncAfterGameChange();

  assert.equal(newPlayer.canEncounter(), false);
  assert.equal(BattleCheat.installGameStateHooks(), true);
  assert.equal(BattleCheat.installGameStateHooks(), true);
});

/* ----------------------------------------------------------------- MessageCheat */

function installWindowFakes() {
  class Window_Message {
    constructor() {
      this._showFast = false;
      this._pauseSkip = false;
      this.pause = false;
      this.terminated = false;
      this._textState = null;
      this.showFastCalls = 0;
      this.inputCalls = 0;
    }

    updateShowFast() {
      this.showFastCalls++;
    }

    updateInput() {
      this.inputCalls++;
      return "original";
    }

    terminateMessage() {
      this.terminated = true;
    }
  }

  class Window_ScrollText {
    scrollSpeed() {
      return 2;
    }
  }

  class Window_BattleLog {
    messageSpeed() {
      return 10;
    }
  }

  globalThis.Window_Message = Window_Message;
  globalThis.Window_ScrollText = Window_ScrollText;
  globalThis.Window_BattleLog = Window_BattleLog;

  return { Window_Message, Window_ScrollText, Window_BattleLog };
}

test("MessageCheat.initialize：只包装一次，并可按 skip 状态跳过动画", () => {
  const { Window_Message, Window_ScrollText, Window_BattleLog } =
    installWindowFakes();

  MessageCheat.initialize();
  MessageCheat.initialize();

  assert.equal(MessageCheat.__initialized, true);

  const message = new Window_Message();
  message.updateShowFast();
  assert.equal(message.showFastCalls, 1, "重复 initialize 不应嵌套包装");

  MessageCheat.skip = true;
  message.updateShowFast();
  assert.equal(message._showFast, true);
  assert.equal(message._pauseSkip, true);

  message.pause = true;
  assert.equal(message.updateInput(), true);
  assert.equal(message.pause, false);
  assert.equal(message.terminated, true);

  const messageWithText = new Window_Message();
  MessageCheat.skip = true;
  messageWithText.pause = true;
  messageWithText._textState = {};
  assert.equal(messageWithText.updateInput(), true);
  assert.equal(messageWithText.pause, false);
  assert.equal(messageWithText.terminated, false);

  const scrollText = new Window_ScrollText();
  const battleLog = new Window_BattleLog();

  assert.equal(scrollText.scrollSpeed(), 200);
  assert.equal(battleLog.messageSpeed(), 1);

  MessageCheat.skip = false;
  assert.equal(scrollText.scrollSpeed(), 2);
  assert.equal(battleLog.messageSpeed(), 10);
});

test("MessageCheat.startSkip / stopSkip：合法加速时备份并恢复游戏速度", () => {
  makeSceneManager();

  const originalSetGameSpeed = GameSpeedCheat.setGameSpeed;
  const calls = [];
  GameSpeedCheat.setGameSpeed = (rate, sceneOption) => {
    calls.push({ rate, sceneOption });
  };

  try {
    GameSpeedCheat.rate = 2;
    GameSpeedCheat.sceneOption = GameSpeedCheat.sceneOptions().battle;

    MessageCheat.startSkip(5);

    assert.equal(MessageCheat.skip, true);
    assert.deepEqual(calls[0], {
      rate: 5,
      sceneOption: GameSpeedCheat.sceneOptions().all,
    });
    assert.deepEqual(MessageCheat.gameSpeedBackup, {
      rate: 2,
      sceneOption: GameSpeedCheat.sceneOptions().battle,
    });

    MessageCheat.stopSkip();
    assert.equal(MessageCheat.skip, false);
    assert.deepEqual(calls[1], {
      rate: 2,
      sceneOption: GameSpeedCheat.sceneOptions().battle,
    });
    assert.equal(MessageCheat.gameSpeedBackup, null);

    for (const value of [undefined, null, 0, 1, Number.NaN, "bad"]) {
      MessageCheat.startSkip(value);
      assert.equal(MessageCheat.skip, true, String(value));
      assert.equal(MessageCheat.gameSpeedBackup, null, String(value));
    }

    MessageCheat.stopSkip();
    assert.equal(MessageCheat.skip, false);
  } finally {
    GameSpeedCheat.setGameSpeed = originalSetGameSpeed;
  }
});

test("GeneralCheat not-ready guards return early", () => {
  const alerts = captureAlerts();

  assert.doesNotThrow(() => GeneralCheat.toggleNoClip(true));
  assert.doesNotThrow(() => GeneralCheat.godModeOn(new Game_Actor(1)));
  assert.equal(GeneralCheat.godModeOn(new Game_Actor(1)), undefined);

  const actor = new Game_Actor(1);
  const map = GeneralCheat.getGodModeMap();
  map.set(1, { actor, actorId: 1, godMode: true });
  assert.doesNotThrow(() => GeneralCheat.godModeOff(actor));

  assert.equal(alerts.filter((item) => item.level === "success").length, 0);
});

test("GeneralCheat.getGodModeActors ignores live actor lookup failures", () => {
  const actor = new Game_Actor(1);
  const map = GeneralCheat.getGodModeMap();
  map.set(1, { actor, actorId: 1, godMode: true });
  globalThis.$gameActors = {
    actor() {
      throw new Error("actor lookup failed");
    },
  };

  assert.deepEqual(GeneralCheat.getGodModeActors(), [actor]);
});

test("GeneralCheat.syncGodModeInterval returns when interval exists", () => {
  const actor = new Game_Actor(1);
  const map = GeneralCheat.getGodModeMap();
  map.set(1, { actor, actorId: 1, godMode: true });
  GeneralCheat.godModeInterval = 123;

  assert.doesNotThrow(() => GeneralCheat.syncGodModeInterval());
  assert.equal(GeneralCheat.godModeInterval, 123);
});

test("GeneralCheat.syncGodModeInterval stops itself when actors disappear", () => {
  const fake = installFakeTimers();
  const actor = new Game_Actor(1);
  const map = GeneralCheat.getGodModeMap();
  map.set(1, { actor, actorId: 1, godMode: true });

  try {
    GeneralCheat.syncGodModeInterval();
    const [interval] = [...fake.timers.values()];
    assert.ok(interval);

    map.clear();
    interval.fn();

    assert.equal(GeneralCheat.godModeInterval, undefined);
    assert.equal(fake.timers.size, 0);
  } finally {
    fake.restore();
  }
});

test("GeneralCheat.toggleGodMode dispatches by current state", () => {
  const actor = new Game_Actor(1);
  const originalOn = GeneralCheat.godModeOn;
  const originalOff = GeneralCheat.godModeOff;
  const calls = [];

  GeneralCheat.godModeOn = () => calls.push("on");
  GeneralCheat.godModeOff = () => calls.push("off");

  try {
    GeneralCheat.toggleGodMode(actor);
    const map = GeneralCheat.getGodModeMap();
    map.set(1, { actor, actorId: 1, godMode: true });
    GeneralCheat.toggleGodMode(actor);
  } finally {
    GeneralCheat.godModeOn = originalOn;
    GeneralCheat.godModeOff = originalOff;
  }

  assert.deepEqual(calls, ["on", "off"]);
});

test("GameSpeedCheat / SpeedCheat ignore corrupt settings JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-corrupt-"));
  const previousCwd = process.cwd();
  process.chdir(dir);

  try {
    const gameSpeedFile = getCheatSettingsPath("gameSpeed.json");
    const speedFile = getCheatSettingsPath("speed.json");

    fs.mkdirSync(path.dirname(gameSpeedFile), { recursive: true });
    fs.writeFileSync(
      gameSpeedFile,
      JSON.stringify({ data: "{bad json" }),
      "utf8",
    );
    fs.writeFileSync(speedFile, JSON.stringify({ data: "{bad json" }), "utf8");

    assert.doesNotThrow(() => GameSpeedCheat.__readSettings());
    assert.doesNotThrow(() => SpeedCheat.__readSettings());
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SpeedCheat.setFixSpeedInterval replaces an existing interval", () => {
  const fake = installFakeTimers();
  const originalRemove = SpeedCheat.removeFixSpeedInterval;
  let removed = 0;

  SpeedCheat.removeFixSpeedInterval = () => {
    removed++;
    SpeedCheat.fixed = undefined;
  };

  try {
    SpeedCheat.fixed = 1;
    SpeedCheat.setFixSpeedInterval(4);
  } finally {
    SpeedCheat.removeFixSpeedInterval = originalRemove;
    fake.restore();
  }

  assert.equal(removed, 1);
  assert.equal(typeof SpeedCheat.fixed, "number");
});

test("SceneCheat.quickSave / BattleCheat.encounterBattle not-ready guards", async () => {
  assert.equal(await SceneCheat.quickSave(1), false);
  assert.doesNotThrow(() => BattleCheat.encounterBattle());
});

test("BattleCheat.syncAfterGameChange tolerates hook errors", () => {
  const originalSync = GeneralCheat.syncGodModeInterval;
  const originalWarn = console.warn;
  const warnings = [];

  GeneralCheat.syncGodModeInterval = () => {
    throw new Error("sync failed");
  };
  console.warn = (...args) => warnings.push(args);

  try {
    assert.doesNotThrow(() => BattleCheat.syncAfterGameChange());
  } finally {
    GeneralCheat.syncGodModeInterval = originalSync;
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});
