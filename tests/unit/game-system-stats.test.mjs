import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAY_TIME_MAX_SECONDS,
  framesToSeconds,
  formatPlaytime,
  parseStatInteger,
  readGameStats,
  readPlaytimeSeconds,
  secondsToFrames,
  writeCounters,
  writeGold,
  writePlaytime,
  writeSteps,
} from "../../cheat-engine/www/cheat/js/game-system/stats.js";

test("parseStatInteger：非负整数与范围", () => {
  assert.equal(parseStatInteger(0), 0);
  assert.equal(parseStatInteger("7"), 7);
  assert.equal(parseStatInteger(3.9), 3);
  assert.equal(parseStatInteger(-1), null);
  assert.equal(parseStatInteger("abc"), null);
  assert.equal(parseStatInteger(""), null);
  assert.equal(parseStatInteger("   "), null);
  assert.equal(parseStatInteger(null), null);
  assert.equal(parseStatInteger(undefined), null);
  assert.equal(parseStatInteger(5, { min: 6, max: 10 }), null);
  assert.equal(parseStatInteger(11, { min: 6, max: 10 }), null);
  assert.equal(parseStatInteger(6, { min: 6, max: 10 }), 6);
});

test("帧与秒换算 / 时长格式化", () => {
  assert.equal(framesToSeconds(0), 0);
  assert.equal(framesToSeconds(59), 0);
  assert.equal(framesToSeconds(60), 1);
  assert.equal(framesToSeconds(3661 * 60), 3661);
  assert.equal(framesToSeconds(-30), 0);
  assert.equal(framesToSeconds("abc"), 0);

  assert.equal(secondsToFrames(0), 0);
  assert.equal(secondsToFrames(1), 60);
  assert.equal(secondsToFrames(2.9), 120);
  assert.equal(secondsToFrames(-1), 0);
  assert.equal(secondsToFrames("abc"), 0);

  assert.equal(formatPlaytime(0), "00:00:00");
  assert.equal(formatPlaytime(59), "00:00:59");
  assert.equal(formatPlaytime(60), "00:01:00");
  assert.equal(formatPlaytime(3661), "01:01:01");
  assert.equal(formatPlaytime(360000), "100:00:00");
  assert.equal(formatPlaytime(-1), "00:00:00");
});

test("readPlaytimeSeconds：优先引擎方法，回退 Graphics", () => {
  assert.equal(
    readPlaytimeSeconds({ playtime: () => 42 }, { frameCount: 600 }),
    42,
  );
  assert.equal(readPlaytimeSeconds({}, { frameCount: 600 }), 10);
  assert.equal(readPlaytimeSeconds(null, { frameCount: 120 }), 2);
  assert.equal(
    readPlaytimeSeconds(
      {
        playtime() {
          throw new Error("broken");
        },
      },
      { frameCount: 180 },
    ),
    3,
  );
  assert.equal(readPlaytimeSeconds(null, null), 0);
});

test("readGameStats：汇总引擎状态", () => {
  const stats = readGameStats({
    gameSystem: {
      playtime: () => 125,
      _saveCount: 3,
      _battleCount: 8,
      _winCount: 6,
      _escapeCount: 2,
    },
    gameParty: {
      members: () => [{}, {}],
      _steps: 34,
      _gold: 500,
    },
    gameMap: {
      mapId: () => 3,
      displayName: () => "Town",
    },
    gamePlayer: { x: 4, y: 5 },
    dataMapInfos: [],
    graphics: { frameCount: 7500 },
    utils: { RPGMAKER_NAME: "MZ" },
  });

  assert.deepEqual(stats, {
    playtimeSeconds: 125,
    playtimeText: "00:02:05",
    steps: 34,
    saveCount: 3,
    battleCount: 8,
    winCount: 6,
    escapeCount: 2,
    gold: 500,
    mapId: 3,
    mapName: "Town",
    playerX: 4,
    playerY: 5,
    partySize: 2,
    engine: "MZ",
  });
});

test("readGameStats：缺失 / 异常对象时安全降级", () => {
  assert.deepEqual(readGameStats(), {
    playtimeSeconds: 0,
    playtimeText: "00:00:00",
    steps: 0,
    saveCount: 0,
    battleCount: 0,
    winCount: 0,
    escapeCount: 0,
    gold: 0,
    mapId: 0,
    mapName: "",
    playerX: 0,
    playerY: 0,
    partySize: 0,
    engine: "",
  });

  const stats = readGameStats({
    gameSystem: {
      playtime() {
        throw new Error("broken");
      },
    },
    gameParty: {
      members() {
        throw new Error("broken");
      },
    },
    gameMap: {
      mapId: () => -1,
      displayName() {
        throw new Error("broken");
      },
    },
    gamePlayer: { x: "6", y: "7" },
    dataMapInfos: { 2: { name: "Fallback" } },
  });

  assert.equal(stats.mapId, 0);
  assert.equal(stats.mapName, "");
  assert.equal(stats.playerX, 6);
  assert.equal(stats.playerY, 7);
  assert.equal(stats.partySize, 0);
  assert.equal(stats.playtimeSeconds, 0);
});

test("readGameStats：兼容旧版 _actors，并吞掉异常 getter / 方法", () => {
  const stats = readGameStats({
    gameParty: { _actors: [1, 2, 3] },
    gameMap: {
      mapId() {
        throw new Error("broken");
      },
    },
  });

  assert.equal(stats.partySize, 3, "没有 members() 时应回退 _actors");
  assert.equal(stats.mapId, 0, "mapId 抛错时应回退 0");

  const throwingParty = Object.defineProperty({}, "_steps", {
    get() {
      throw new Error("broken");
    },
  });

  assert.equal(
    readGameStats({ gameParty: throwingParty }).steps,
    0,
    "字段 getter 抛错时应回退 0",
  );
});

test("readGameStats：displayName 为空时回退 dataMapInfos", () => {
  const stats = readGameStats({
    gameMap: { mapId: () => 2, displayName: () => "" },
    dataMapInfos: { 2: { name: "Forest" } },
  });

  assert.equal(stats.mapName, "Forest");
});

test("writePlaytime：优先写 Graphics.frameCount，非法值拒绝", () => {
  const graphics = { frameCount: 0 };
  const gameSystem = { _framesOnSave: 0 };

  assert.deepEqual(writePlaytime(gameSystem, graphics, 125), { ok: true });
  assert.equal(graphics.frameCount, 7500);
  assert.equal(gameSystem._framesOnSave, 0);

  assert.equal(writePlaytime(gameSystem, graphics, -1).ok, false);
  assert.equal(
    writePlaytime(gameSystem, graphics, PLAY_TIME_MAX_SECONDS + 1).ok,
    false,
  );

  // MV / MZ 的 Graphics 是函数对象（静态类），必须同样支持
  const functionGraphics = function Graphics() {};
  functionGraphics.frameCount = 0;
  assert.deepEqual(writePlaytime(gameSystem, functionGraphics, 3), {
    ok: true,
  });
  assert.equal(functionGraphics.frameCount, 180);

  const fallback = { _framesOnSave: 0 };
  assert.deepEqual(writePlaytime(fallback, null, 2), { ok: true });
  assert.equal(fallback._framesOnSave, 120);

  assert.equal(writePlaytime(null, null, 1).ok, false);

  const frozen = Object.freeze({});
  assert.equal(writePlaytime(frozen, null, 1).ok, false);
});

test("writePlaytime：Graphics 写入抛错时回退 _framesOnSave", () => {
  const graphics = {};

  Object.defineProperty(graphics, "frameCount", {
    set() {
      throw new Error("readonly");
    },
  });

  const gameSystem = { _framesOnSave: 0 };

  assert.deepEqual(writePlaytime(gameSystem, graphics, 2), { ok: true });
  assert.equal(gameSystem._framesOnSave, 120);
});

test("writeSteps：写入 _steps 并拒绝非法值", () => {
  const gameParty = { _steps: 1 };

  assert.deepEqual(writeSteps(gameParty, 42), { ok: true });
  assert.equal(gameParty._steps, 42);
  assert.equal(writeSteps(gameParty, -1).ok, false);
  assert.equal(writeSteps(gameParty, "abc").ok, false);
  assert.equal(writeSteps(null, 1).ok, false);
  assert.equal(writeSteps(Object.freeze({}), 1).ok, false);
});

test("writeCounters：批量写入并校验", () => {
  const gameSystem = {};
  const result = writeCounters(gameSystem, {
    saveCount: 1,
    battleCount: 2,
    winCount: 3,
    escapeCount: 4,
  });

  assert.deepEqual(result, {
    ok: true,
    changed: ["saveCount", "battleCount", "winCount", "escapeCount"],
  });
  assert.equal(gameSystem._saveCount, 1);
  assert.equal(gameSystem._battleCount, 2);
  assert.equal(gameSystem._winCount, 3);
  assert.equal(gameSystem._escapeCount, 4);

  assert.equal(writeCounters(gameSystem, { battleCount: -1 }).ok, false);
  assert.equal(writeCounters(null, { battleCount: 1 }).ok, false);
  assert.equal(writeCounters(Object.freeze({}), { battleCount: 1 }).ok, false);
});

test("writeGold：按差值增减，回退到直接赋值", () => {
  const calls = [];
  const gameParty = {
    _gold: 10,
    gainGold(value) {
      calls.push(["gain", value]);
      this._gold += value;
    },
    loseGold(value) {
      calls.push(["lose", value]);
      this._gold -= value;
    },
  };

  assert.deepEqual(writeGold(gameParty, 30), { ok: true });
  assert.deepEqual(calls, [["gain", 20]]);
  assert.equal(gameParty._gold, 30);

  assert.deepEqual(writeGold(gameParty, 5), { ok: true });
  assert.deepEqual(calls, [
    ["gain", 20],
    ["lose", 25],
  ]);
  assert.equal(gameParty._gold, 5);

  assert.deepEqual(writeGold(gameParty, 5), { ok: true });

  const fallback = { _gold: 1 };
  assert.deepEqual(writeGold(fallback, 9), { ok: true });
  assert.equal(fallback._gold, 9);

  assert.equal(writeGold(gameParty, -1).ok, false);
  assert.equal(writeGold(null, 1).ok, false);
  assert.equal(writeGold(Object.freeze({ _gold: 1 }), 2).ok, false);
});
