import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { SaveBackupCheat } from "../../cheat-engine/www/cheat/js/SaveBackupHelper.js";

const STATIC_METHODS = [
  "isLocalMode",
  "readSavefileInfo",
  "readSaveText",
  "getMapInfo",
  "getSaveFilePath",
  "requireFs",
];

const originals = {};

for (const name of STATIC_METHODS) {
  originals[name] = SaveBackupCheat[name];
}

afterEach(() => {
  for (const name of STATIC_METHODS) {
    SaveBackupCheat[name] = originals[name];
  }

  delete globalThis.$dataMapInfos;
  delete globalThis.JsonEx;
});

test("parseAnySaveData：空值 / 对象 / JSON / JsonEx 兜底", () => {
  assert.equal(SaveBackupCheat.parseAnySaveData(""), null);
  assert.equal(SaveBackupCheat.parseAnySaveData(null), null);
  assert.equal(SaveBackupCheat.parseAnySaveData(undefined), null);

  const object = { a: 1 };
  assert.equal(SaveBackupCheat.parseAnySaveData(object), object);

  assert.deepEqual(SaveBackupCheat.parseAnySaveData('{"a":1}'), { a: 1 });
  assert.equal(SaveBackupCheat.parseAnySaveData("not json"), null);

  globalThis.JsonEx = {
    parse(text) {
      assert.equal(text, "wrapped");
      return { wrapped: true };
    },
  };

  assert.deepEqual(SaveBackupCheat.parseAnySaveData("wrapped"), {
    wrapped: true,
  });
});

test("parseSaveMeta 本地模式读取失败时回退到存档头信息", () => {
  SaveBackupCheat.isLocalMode = () => true;
  SaveBackupCheat.readSavefileInfo = () => ({
    timestamp: 1,
    timestampText: "header",
    playtimeFrames: 60,
    playtimeText: "00:00:01",
  });
  SaveBackupCheat.getSaveFilePath = () => "/tmp/save.rpgsave";
  SaveBackupCheat.requireFs = () => ({
    existsSync() {
      return true;
    },
    statSync() {
      throw new Error("stat failed");
    },
  });

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    const meta = SaveBackupCheat.parseSaveMeta(4);
    assert.equal(meta.savefileTimeText, "header");
    assert.equal(meta.playtime, "00:00:01");
    assert.equal(meta.dataSize, 0);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});

test("parseSaveMeta 非本地模式读取失败时忽略存档内容", () => {
  SaveBackupCheat.isLocalMode = () => false;
  SaveBackupCheat.readSavefileInfo = () => null;
  SaveBackupCheat.readSaveText = () => {
    throw new Error("read failed");
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    const meta = SaveBackupCheat.parseSaveMeta(5);
    assert.equal(meta.mapId, 0);
    assert.equal(meta.dataSize, 0);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});

test("parseSaveMeta 地图名抛错时不影响其他字段", () => {
  SaveBackupCheat.isLocalMode = () => false;
  SaveBackupCheat.readSavefileInfo = () => null;
  SaveBackupCheat.readSaveText = () =>
    JSON.stringify({ map: { _mapId: 3 }, system: {} });
  SaveBackupCheat.getMapInfo = () => {
    throw new Error("map data broken");
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    const meta = SaveBackupCheat.parseSaveMeta(6);
    assert.equal(meta.slot, 6);
    assert.equal(meta.mapId, 3);
    assert.equal(meta.mapName, "");
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});

test("parseSaveMeta 保留字符串 saveTime", () => {
  SaveBackupCheat.isLocalMode = () => false;
  SaveBackupCheat.readSavefileInfo = () => null;
  SaveBackupCheat.readSaveText = () =>
    JSON.stringify({ saveTime: "第 3 章", system: {} });

  const meta = SaveBackupCheat.parseSaveMeta(7);
  assert.equal(meta.saveTime, "第 3 章");
  assert.equal(meta.savefileTimeText, "");
});

test("parseAnySaveData JsonEx 解析失败时返回 null 并告警", () => {
  globalThis.JsonEx = {
    parse() {
      throw new Error("bad json");
    },
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    assert.equal(SaveBackupCheat.parseAnySaveData("wrapped"), null);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});

test("validateSaveText 校验空文本 / 非法 JSON / 缺少存档结构", () => {
  assert.throws(() => SaveBackupCheat.validateSaveText(""));
  assert.throws(() => SaveBackupCheat.validateSaveText("   "));
  assert.throws(
    () => SaveBackupCheat.validateSaveText("not json", "标签"),
    /标签/,
  );
  assert.throws(() =>
    SaveBackupCheat.validateSaveText(JSON.stringify({ system: {}, party: {} })),
  );

  const valid = {
    system: { _framesOnSave: 0 },
    party: { _gold: 0 },
    actors: [],
  };
  assert.deepEqual(
    SaveBackupCheat.validateSaveText(JSON.stringify(valid)),
    valid,
  );
});

test("getMapInfo：读取 $dataMapInfos，缺失时返回 null", () => {
  assert.equal(SaveBackupCheat.getMapInfo(1), null);

  globalThis.$dataMapInfos = [null, { name: "Start" }];

  assert.deepEqual(SaveBackupCheat.getMapInfo(1), { name: "Start" });
  assert.equal(SaveBackupCheat.getMapInfo(2), null);
});

test("parseSaveMeta：存档头 + 存档内容合并地图 / 时长 / 时间", () => {
  const text = JSON.stringify({
    player: { map: { _mapId: 3 } },
    system: { _framesOnSave: 7200 },
    saveTime: 123,
  });

  SaveBackupCheat.isLocalMode = () => false;
  SaveBackupCheat.readSavefileInfo = () => ({
    timestamp: 111,
    timestampText: "01-02 03:04:05",
    playtimeFrames: 3600,
    playtimeText: "00:01:00",
  });
  SaveBackupCheat.readSaveText = () => text;
  SaveBackupCheat.getMapInfo = (mapId) =>
    mapId === 3 ? { name: "Cave" } : null;

  const meta = SaveBackupCheat.parseSaveMeta(7);

  assert.equal(meta.slot, 7);
  assert.equal(meta.mapId, 3);
  assert.equal(meta.mapName, "Cave");
  assert.equal(meta.savefileTime, 111);
  assert.equal(meta.savefileTimeText, "01-02 03:04:05");
  assert.equal(meta.playtimeFrames, 3600);
  assert.equal(meta.playtime, "00:01:00");
  assert.equal(meta.dataSize, text.length);
});

test("parseSaveMeta：没有存档头时从顶层 map / _framesOnSave / timestamp 回退", () => {
  const text = JSON.stringify({
    map: { _mapId: 5 },
    system: { _framesOnSave: 7200 },
    timestamp: 456,
  });
  const expectedTime = SaveBackupCheat.formatDateTime(456);

  SaveBackupCheat.isLocalMode = () => false;
  SaveBackupCheat.readSavefileInfo = () => null;
  SaveBackupCheat.readSaveText = () => text;
  SaveBackupCheat.getMapInfo = (mapId) =>
    mapId === 5 ? { name: "Boss" } : null;

  const meta = SaveBackupCheat.parseSaveMeta(1);

  assert.equal(meta.mapId, 5);
  assert.equal(meta.mapName, "Boss");
  assert.equal(meta.playtimeFrames, 7200);
  assert.equal(meta.playtime, "00:02:00");
  assert.equal(meta.savefileTime, 456);
  assert.equal(meta.savefileTimeText, expectedTime);
});

test("parseSaveMeta：存档损坏时只保留存档头信息，不抛错", () => {
  SaveBackupCheat.isLocalMode = () => false;
  SaveBackupCheat.readSavefileInfo = () => ({
    timestamp: 9,
    timestampText: "header",
    playtimeFrames: 60,
    playtimeText: "00:00:01",
  });
  SaveBackupCheat.readSaveText = () => "not json";
  SaveBackupCheat.getMapInfo = () => {
    throw new Error("should not be called");
  };

  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const meta = SaveBackupCheat.parseSaveMeta(2);

    assert.equal(meta.mapId, 0);
    assert.equal(meta.mapName, "");
    assert.equal(meta.savefileTimeText, "header");
    assert.equal(meta.playtime, "00:00:01");
    assert.equal(meta.dataSize, "not json".length);
  } finally {
    console.warn = originalWarn;
  }
});
