import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import GameSystemPanel from "../../cheat-engine/www/cheat/panels/GameSystemPanel.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";
import { ConfirmDialog } from "../../cheat-engine/www/cheat/js/DialogHelper.js";

const GAME_GLOBALS = [
  "$gamePlayer",
  "$gameParty",
  "$gameMap",
  "$gameSystem",
  "$dataMapInfos",
  "Graphics",
  "Utils",
];

const originalShow = ConfirmDialog.show;

afterEach(() => {
  for (const name of GAME_GLOBALS) delete globalThis[name];
  Alert.handler = null;
  Alert.pending = [];
  ConfirmDialog.show = originalShow;
});

function makePanel(overrides = {}) {
  return {
    ...GameSystemPanel.data(),
    ...GameSystemPanel.methods,
    ...overrides,
  };
}

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

function installReadyGame(overrides = {}) {
  globalThis.$gamePlayer = { x: 4, y: 5 };
  globalThis.$gameParty = {
    members: () => [{}, {}],
    _steps: 34,
    _gold: 500,
    gainGold(value) {
      this._gold += value;
    },
    loseGold(value) {
      this._gold -= value;
    },
  };
  globalThis.$gameMap = {
    mapId: () => 3,
    displayName: () => "Town",
  };
  globalThis.$gameSystem = {
    playtime: () => Math.floor(globalThis.Graphics.frameCount / 60),
    _saveCount: 3,
    _battleCount: 8,
    _winCount: 6,
    _escapeCount: 2,
    ...overrides.gameSystem,
  };
  globalThis.$dataMapInfos = [];
  globalThis.Graphics = { frameCount: 7500, ...overrides.graphics };
  globalThis.Utils = { RPGMAKER_NAME: "MZ", ...overrides.utils };
}

test("GameSystemPanel.initializeVariables：游戏未就绪时只显示提示", () => {
  const panel = makePanel({
    ready: true,
    playtimeSeconds: 99,
  });

  panel.initializeVariables();

  assert.equal(panel.ready, false);
  assert.equal(panel.playtimeSeconds, 99, "未就绪时不覆盖缓存值");
});

test("GameSystemPanel.initializeVariables：读取全部统计字段", () => {
  installReadyGame();

  const panel = makePanel();
  panel.initializeVariables();

  assert.equal(panel.ready, true);
  assert.equal(panel.playtimeSeconds, 125);
  assert.equal(panel.playtimeText, "00:02:05");
  assert.equal(panel.steps, 34);
  assert.equal(panel.saveCount, 3);
  assert.equal(panel.battleCount, 8);
  assert.equal(panel.winCount, 6);
  assert.equal(panel.escapeCount, 2);
  assert.equal(panel.gold, 500);
  assert.equal(panel.mapId, 3);
  assert.equal(panel.mapName, "Town");
  assert.equal(panel.playerX, 4);
  assert.equal(panel.playerY, 5);
  assert.equal(panel.partySize, 2);
  assert.equal(panel.engine, "MZ");
});

test("GameSystemPanel：只读文案 computed", () => {
  const panel = makePanel({ mapId: 0, mapName: "" });
  assert.equal(GameSystemPanel.computed.mapText.call(panel), "不在地图中");
  assert.equal(GameSystemPanel.computed.engineText.call(panel), "未知");

  panel.mapId = 3;
  panel.mapName = "Town";
  panel.playerX = 4;
  panel.playerY = 5;
  panel.engine = "MV";

  assert.equal(GameSystemPanel.computed.mapText.call(panel), "#3 · Town");
  assert.equal(GameSystemPanel.computed.positionText.call(panel), "4, 5");
  assert.equal(GameSystemPanel.computed.engineText.call(panel), "MV");

  panel.mapName = "";
  assert.equal(GameSystemPanel.computed.mapText.call(panel), "#3 · 未知");
});

test("GameSystemPanel.onPlaytimeChange：写入秒数并刷新显示", () => {
  const alerts = captureAlerts();
  installReadyGame();

  const panel = makePanel();
  panel.initializeVariables();

  panel.playtimeSeconds = 10;
  panel.onPlaytimeChange();

  assert.equal(globalThis.Graphics.frameCount, 600);
  assert.equal(alerts.at(-1).level, "success");
  assert.equal(panel.playtimeSeconds, 10);
  assert.equal(panel.playtimeText, "00:00:10");

  panel.playtimeSeconds = -1;
  panel.onPlaytimeChange();
  assert.equal(alerts.at(-1).level, "warn");
  assert.equal(panel.playtimeSeconds, 10, "非法输入回滚到游戏值");
});

test("GameSystemPanel.onStepsChange / onCounterChange / onGoldChange：写回并刷新", () => {
  const alerts = captureAlerts();
  installReadyGame();

  const panel = makePanel();
  panel.initializeVariables();

  panel.steps = 55;
  panel.onStepsChange();
  assert.equal(globalThis.$gameParty._steps, 55);
  assert.equal(alerts.at(-1).level, "success");

  panel.battleCount = 9;
  panel.onCounterChange("battleCount");
  assert.equal(globalThis.$gameSystem._battleCount, 9);
  assert.equal(alerts.at(-1).level, "success");

  panel.gold = 800;
  panel.onGoldChange();
  assert.equal(globalThis.$gameParty._gold, 800);
  assert.equal(alerts.at(-1).level, "success");

  panel.steps = "bad";
  panel.onStepsChange();
  assert.equal(alerts.at(-1).level, "warn");
  assert.equal(globalThis.$gameParty._steps, 55);
});

test("GameSystemPanel：写入失败时提示错误", () => {
  const alerts = captureAlerts();
  installReadyGame();
  Object.freeze(globalThis.$gameSystem);

  const panel = makePanel();
  panel.initializeVariables();

  panel.battleCount = 10;
  panel.onCounterChange("battleCount");

  assert.equal(alerts.at(-1).level, "error");
  assert.match(alerts.at(-1).msg, /战斗次数|battle/i);
});

test("GameSystemPanel.confirmResetCounters / resetCounters", () => {
  const alerts = captureAlerts();
  installReadyGame();

  const panel = makePanel();
  panel.initializeVariables();

  const dialogs = [];
  ConfirmDialog.show = (options) => dialogs.push(options);

  panel.confirmResetCounters();
  assert.equal(dialogs.length, 1);

  dialogs[0].actions.at(-1).action();

  assert.equal(globalThis.$gameSystem._saveCount, 0);
  assert.equal(globalThis.$gameSystem._battleCount, 0);
  assert.equal(globalThis.$gameSystem._winCount, 0);
  assert.equal(globalThis.$gameSystem._escapeCount, 0);
  assert.equal(alerts.at(-1).level, "success");
});

test("GameSystemPanel：各项写入失败与非法输入都有提示", () => {
  const alerts = captureAlerts();

  // 游玩时长：Graphics 和 _framesOnSave 都写不进去
  installReadyGame();
  Object.freeze(globalThis.Graphics);
  Object.freeze(globalThis.$gameSystem);

  let panel = makePanel();
  panel.initializeVariables();
  panel.playtimeSeconds = 5;
  panel.onPlaytimeChange();
  assert.equal(alerts.at(-1).level, "error");
  assert.match(alerts.at(-1).msg, /游玩时长|playtime/i);

  // 步数
  installReadyGame();
  Object.freeze(globalThis.$gameParty);
  panel = makePanel();
  panel.initializeVariables();
  panel.steps = 10;
  panel.onStepsChange();
  assert.equal(alerts.at(-1).level, "error");

  // 金币
  installReadyGame();
  Object.freeze(globalThis.$gameParty);
  panel = makePanel();
  panel.initializeVariables();
  panel.gold = 1;
  panel.onGoldChange();
  assert.equal(alerts.at(-1).level, "error");

  // 重置计数
  installReadyGame();
  Object.freeze(globalThis.$gameSystem);
  panel = makePanel();
  panel.initializeVariables();
  panel.resetCounters();
  assert.equal(alerts.at(-1).level, "error");

  // 计数 / 金币的非法输入
  installReadyGame();
  panel = makePanel();
  panel.initializeVariables();

  panel.saveCount = "bad";
  panel.onCounterChange("saveCount");
  assert.equal(alerts.at(-1).level, "warn");

  panel.gold = "bad";
  panel.onGoldChange();
  assert.equal(alerts.at(-1).level, "warn");

  // 未知计数键也能给出提示，而不是抛错
  panel.unknownCount = "bad";
  panel.onCounterChange("unknownCount");
  assert.equal(alerts.at(-1).level, "warn");
});

test("GameSystemPanel.getGameEnv：缺少全局对象时返回 null", () => {
  const panel = makePanel();
  const env = panel.getGameEnv();

  assert.deepEqual(env, {
    gameSystem: null,
    gameParty: null,
    gameMap: null,
    gamePlayer: null,
    dataMapInfos: null,
    graphics: null,
    utils: null,
  });
});
