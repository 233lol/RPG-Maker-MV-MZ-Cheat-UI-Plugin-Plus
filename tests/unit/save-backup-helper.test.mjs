import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalCwd = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-save-helper-"));

globalThis.require = createRequire(import.meta.url);
globalThis.Utils = {
  isNwjs: () => true,
  RPGMAKER_NAME: "MV",
};

process.chdir(tempRoot);

const { SaveBackupCheat } =
  await import("../../cheat-engine/www/cheat/js/SaveBackupHelper.js");

const originalMethods = {
  writeSaveText: SaveBackupCheat.writeSaveText,
  updateGlobalInfoAfterRestore: SaveBackupCheat.updateGlobalInfoAfterRestore,
  hasSave: SaveBackupCheat.hasSave,
  maxSavefiles: SaveBackupCheat.maxSavefiles,
  getLoadedSlot: SaveBackupCheat.getLoadedSlot,
  getSaveCount: SaveBackupCheat.getSaveCount,
  backupCurrentSave: SaveBackupCheat.backupCurrentSave,
  isLocalMode: SaveBackupCheat.isLocalMode,
  getSaveFilePath: SaveBackupCheat.getSaveFilePath,
  requireFs: SaveBackupCheat.requireFs,
  findPayloadPath: SaveBackupCheat.findPayloadPath,
  readSaveText: SaveBackupCheat.readSaveText,
  readIndex: SaveBackupCheat.readIndex,
  writeMeta: SaveBackupCheat.writeMeta,
  writeIndex: SaveBackupCheat.writeIndex,
};

function resetGlobals() {
  for (const name of [
    "$gameSystem",
    "$dataSystem",
    "$dataMapInfos",
    "DataManager",
    "pako",
    "LZString",
  ]) {
    delete globalThis[name];
  }

  globalThis.Utils = {
    isNwjs: () => true,
    RPGMAKER_NAME: "MV",
  };

  SaveBackupCheat.lzStringCache = undefined;
  SaveBackupCheat.pakoCache = undefined;
  globalThis.StorageManager = {};
}

function withTempCwd(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-save-case-"));
  process.chdir(dir);

  try {
    return callback(dir);
  } finally {
    process.chdir(tempRoot);
  }
}

function saveText(mapId = 1, frames = 600) {
  return JSON.stringify({
    system: { _framesOnSave: frames },
    party: { _gold: 10 },
    actors: [],
    switches: [],
    variables: [],
    player: { map: { _mapId: mapId } },
  });
}

function writeSaveFile(slot, text = saveText()) {
  const dir = path.join(process.cwd(), "www", "save");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `file${slot}.rpgsave`);
  fs.writeFileSync(file, text, "utf8");
  return file;
}

function backupDir() {
  return path.join(process.cwd(), "www", "cheat-settings", "save-backups");
}

function silenceWarn(callback) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    const result = callback();
    return { result, warnings };
  } finally {
    console.warn = original;
  }
}

afterEach(() => {
  resetGlobals();
  Object.assign(SaveBackupCheat, originalMethods);
});

test.after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("SaveBackupCheat：环境探测 / 存档命名 / 最大槽位", () => {
  assert.equal(SaveBackupCheat.getMaxImportBytes(), 64 * 1024 * 1024);
  assert.equal(SaveBackupCheat.isLocalMode(), true);
  assert.equal(SaveBackupCheat.isMZ(), false);

  assert.equal(SaveBackupCheat.getSaveName(3), "file3");

  globalThis.DataManager = {
    makeSavename: (slot) => `mv-${slot}`,
  };
  assert.equal(SaveBackupCheat.getSaveName(3), "mv-3");

  globalThis.DataManager = {
    makeSaveName: (slot) => `mz-${slot}`,
  };
  assert.equal(SaveBackupCheat.getSaveName(3), "mz-3");

  globalThis.DataManager = {
    makeSavename() {
      throw new Error("not ready");
    },
  };
  assert.equal(SaveBackupCheat.getSaveName(2), "file2");

  assert.equal(SaveBackupCheat.maxSavefiles(), 0);
  globalThis.DataManager = { maxSavefiles: () => 20 };
  assert.equal(SaveBackupCheat.maxSavefiles(), 20);
  globalThis.DataManager = { _maxSavefiles: 10 };
  assert.equal(SaveBackupCheat.maxSavefiles(), 10);
  globalThis.DataManager = { _maxSavefiles: 0 };
  assert.equal(SaveBackupCheat.maxSavefiles(), 0);
  globalThis.DataManager = {
    maxSavefiles() {
      throw new Error("bad");
    },
  };
  assert.equal(SaveBackupCheat.maxSavefiles(), 0);

  globalThis.Utils.RPGMAKER_NAME = "MZ";
  assert.equal(SaveBackupCheat.isMZ(), true);
});

test("SaveBackupCheat.getLoadedSlot / getPlaytimeText：按优先级从引擎读取", () => {
  assert.equal(SaveBackupCheat.getLoadedSlot(), -1);
  assert.equal(SaveBackupCheat.getPlaytimeText(), "");

  globalThis.$gameSystem = { _savefileId: 3 };
  assert.equal(SaveBackupCheat.getLoadedSlot(), 3);
  globalThis.$gameSystem = { _savefileId: 0 };
  globalThis.DataManager = { _lastAccessedId: 2 };
  assert.equal(SaveBackupCheat.getLoadedSlot(), 2);

  globalThis.$gameSystem = {
    playtimeText() {
      return "01:02:03";
    },
  };
  assert.equal(SaveBackupCheat.getPlaytimeText(), "01:02:03");

  globalThis.$gameSystem = {
    playtimeText() {
      throw new Error("not ready");
    },
  };
  assert.equal(SaveBackupCheat.getPlaytimeText(), "");
});

test("SaveBackupCheat.readSavefileInfo：兼容 MV 帧数与 MZ 时长字符串", () => {
  assert.equal(SaveBackupCheat.readSavefileInfo(1), null);

  globalThis.DataManager = {
    loadSavefileInfo: () => ({
      playtime: 3600,
      timestamp: 1700000000000,
    }),
  };

  const mv = SaveBackupCheat.readSavefileInfo(1);
  assert.equal(mv.playtimeFrames, 3600);
  assert.equal(mv.playtimeText, "00:01:00");
  assert.equal(mv.timestamp, 1700000000000);
  assert.ok(mv.timestampText.length > 0);

  globalThis.DataManager = {
    savefileInfo: () => ({ playtime: "02:03:04", timestamp: "bad" }),
  };

  const mz = SaveBackupCheat.readSavefileInfo(2);
  assert.equal(mz.playtimeText, "02:03:04");
  assert.equal(mz.playtimeFrames, 0);
  assert.equal(mz.timestamp, 0);
  assert.equal(mz.timestampText, "");

  globalThis.DataManager = { loadSavefileInfo: () => null };
  assert.equal(SaveBackupCheat.readSavefileInfo(1), null);

  globalThis.DataManager = {
    loadSavefileInfo() {
      throw new Error("disk error");
    },
  };
  const { result, warnings } = silenceWarn(() =>
    SaveBackupCheat.readSavefileInfo(1),
  );
  assert.equal(result, null);
  assert.equal(warnings.length, 1);
});

test("SaveBackupCheat.hasSave：优先 DataManager，其次本地文件", () => {
  assert.equal(SaveBackupCheat.hasSave(0), false);
  assert.equal(SaveBackupCheat.hasSave("bad"), false);

  globalThis.DataManager = { savefileExists: (slot) => slot === 1 };
  assert.equal(SaveBackupCheat.hasSave(1), true);
  assert.equal(SaveBackupCheat.hasSave(2), false);

  delete globalThis.DataManager;
  withTempCwd(() => {
    globalThis.StorageManager = {
      localFileExists: (slot) => slot === 2,
    };
    assert.equal(SaveBackupCheat.hasSave(2), true);

    globalThis.StorageManager = {};

    writeSaveFile(3);
    assert.equal(SaveBackupCheat.hasSave(3), true);
    assert.equal(SaveBackupCheat.hasSave(4), false);
  });
});

test("SaveBackupCheat.getSaveFilePath：localFilePath / filePath / 目录兜底", () => {
  withTempCwd((dir) => {
    globalThis.StorageManager = {
      localFilePath: (slot) => (slot === 1 ? `${dir}/file1.rpgsave` : ""),
      filePath: (name) => `${dir}/${name}.rmmzsave`,
    };

    assert.equal(SaveBackupCheat.getSaveFilePath(1), `${dir}/file1.rpgsave`);
    assert.equal(SaveBackupCheat.getSaveFilePath(2), `${dir}/file2.rmmzsave`);

    globalThis.StorageManager = {};
    assert.equal(
      SaveBackupCheat.getSaveFilePath(3),
      path.join(dir, "www", "save", "file3.rpgsave"),
    );

    globalThis.Utils.RPGMAKER_NAME = "MZ";
    assert.equal(
      SaveBackupCheat.getSaveFilePath(4),
      path.join(dir, "save", "file4.rmmzsave"),
    );
  });
});

test("SaveBackupCheat.readSaveText / decodeEngineSaveText：读取明文存档并校验槽位", () => {
  assert.equal(SaveBackupCheat.readSaveText(0), null);
  assert.equal(SaveBackupCheat.decodeEngineSaveText(""), null);

  withTempCwd(() => {
    writeSaveFile(1, '{"ok":1}');

    assert.equal(SaveBackupCheat.readSaveText(1), '{"ok":1}');
    assert.equal(SaveBackupCheat.readSaveText(2), null);

    fs.writeFileSync(
      SaveBackupCheat.getSaveFilePath(1),
      "not-a-known-compression",
      "utf8",
    );

    const { result, warnings } = silenceWarn(() =>
      SaveBackupCheat.readSaveText(1),
    );
    assert.equal(result, null);
    assert.ok(warnings.length >= 1);
  });
});

test("SaveBackupCheat.writeSaveText：MV 交给引擎，非法参数抛错", () => {
  for (const slot of [0, -1, 1.5, "x"]) {
    assert.throws(() => SaveBackupCheat.writeSaveText(slot, "{}"), /槽|slot/i);
  }

  assert.throws(() => SaveBackupCheat.writeSaveText(1, ""), /空|empty/i);
  assert.throws(() => SaveBackupCheat.writeSaveText(1, null), /空|empty/i);

  const calls = [];
  globalThis.StorageManager = {
    saveToLocalFile: (slot, text) => calls.push([slot, text]),
  };

  SaveBackupCheat.writeSaveText(2, '{"ok":1}');
  assert.deepEqual(calls, [[2, '{"ok":1}']]);
});

test("SaveBackupCheat.writeSaveText：MZ 使用 pako 原子写盘", () => {
  globalThis.Utils.RPGMAKER_NAME = "MZ";
  globalThis.pako = {
    deflate: (text) => `PAKO:${text}`,
  };

  withTempCwd((dir) => {
    const target = path.join(dir, "file1.rmmzsave");
    globalThis.StorageManager = {
      filePath: () => target,
    };

    SaveBackupCheat.writeSaveText(1, '{"ok":1}');

    assert.equal(fs.readFileSync(target, "utf8"), 'PAKO:{"ok":1}');
    assert.equal(fs.existsSync(`${target}.tmp`), false);
  });
});

test("SaveBackupCheat.createSnapshot / readPayload / listBackups / getStats", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(4, 1200));

    const meta = SaveBackupCheat.createSnapshot(1, "manual", "我的存档");

    assert.equal(meta.slot, 1);
    assert.equal(meta.kind, "manual");
    assert.equal(meta.label, "我的存档");
    assert.equal(meta.mapId, 4);
    assert.equal(meta.playtimeFrames, 1200);
    assert.equal(meta.playtime, "00:00:20");
    assert.equal(meta.codec, "base64");
    assert.equal(meta.saveExt, ".rpgsave");

    const entries = SaveBackupCheat.readIndex();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, meta.id);
    assert.equal(SaveBackupCheat.readPayload(meta), saveText(4, 1200));

    const list = SaveBackupCheat.listBackups();
    assert.equal(list.length, 1);
    assert.equal(list[0].exists, true);
    assert.equal(list[0].payloadFile, meta.payloadFile);
    assert.equal(list[0].sizeText, SaveBackupCheat.formatBytes(meta.sizeBytes));

    const stats = SaveBackupCheat.getStats();
    assert.deepEqual(stats, {
      count: 1,
      autoCount: 0,
      manualCount: 1,
      missingCount: 0,
      bytes: meta.sizeBytes,
    });

    fs.rmSync(meta.payloadFile, { force: true });

    const missing = SaveBackupCheat.listBackups()[0];
    assert.equal(missing.exists, false);
    assert.equal(missing.sizeText, "文件丢失");

    const missingStats = SaveBackupCheat.getStats();
    assert.equal(missingStats.missingCount, 1);
    assert.equal(missingStats.bytes, 0);
  });
});

test("SaveBackupCheat.createSnapshot：非法槽位 / 无存档 / 非本地模式", () => {
  withTempCwd(() => {
    assert.throws(() => SaveBackupCheat.createSnapshot(0), /槽|slot/i);
    assert.throws(() => SaveBackupCheat.createSnapshot(1), /存档|save/i);

    const original = globalThis.require;
    globalThis.require = undefined;

    try {
      assert.throws(() => SaveBackupCheat.createSnapshot(1), /nw\.js/i);
    } finally {
      globalThis.require = original;
    }
  });
});

test("SaveBackupCheat.pruneAutoBackups：按槽位保留最近 N 份自动快照", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    SaveBackupCheat.writeSettings({ autoKeep: 10 });

    const first = SaveBackupCheat.createSnapshot(1, "auto");
    const second = SaveBackupCheat.createSnapshot(1, "auto");
    const third = SaveBackupCheat.createSnapshot(1, "auto");
    const manual = SaveBackupCheat.createSnapshot(1, "manual");

    SaveBackupCheat.writeSettings({ autoKeep: 2 });

    const entries = SaveBackupCheat.readIndex();
    const now = Date.now();
    for (const [index, entry] of entries.entries()) {
      entry.createdAt = now + index;
    }
    SaveBackupCheat.writeIndex(entries);

    const removed = SaveBackupCheat.pruneAutoBackups(1);

    assert.equal(removed, 1);

    const remaining = SaveBackupCheat.readIndex();
    assert.equal(remaining.length, 3);
    assert.equal(
      remaining.some((entry) => entry.id === first.id),
      false,
      "最旧的自动快照应被删除",
    );
    assert.ok(remaining.some((entry) => entry.id === second.id));
    assert.ok(remaining.some((entry) => entry.id === third.id));
    assert.ok(remaining.some((entry) => entry.id === manual.id));
    assert.equal(fs.existsSync(first.payloadFile), false);
  });
});

test("SaveBackupCheat.renameBackup / deleteBackup / clearBackups", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    const manual = SaveBackupCheat.createSnapshot(1, "manual");
    const auto = SaveBackupCheat.createSnapshot(1, "auto");

    assert.equal(
      SaveBackupCheat.renameBackup(manual.id, "  新名字  "),
      "新名字",
    );
    assert.equal(SaveBackupCheat.readMeta(manual.id).label, "新名字");
    assert.equal(
      SaveBackupCheat.readIndex().find((item) => item.id === manual.id).label,
      "新名字",
    );
    assert.throws(
      () => SaveBackupCheat.renameBackup("missing", "x"),
      /不存在|missing/i,
    );

    SaveBackupCheat.deleteBackup(manual.id);
    assert.equal(SaveBackupCheat.readIndex().length, 1);
    assert.equal(fs.existsSync(manual.payloadFile), false);
    assert.throws(
      () => SaveBackupCheat.deleteBackup(manual.id),
      /不存在|missing/i,
    );

    const cleared = SaveBackupCheat.clearBackups("auto");
    assert.equal(cleared, 1);
    assert.deepEqual(SaveBackupCheat.readIndex(), []);
    assert.equal(SaveBackupCheat.clearBackups(), 0);
    assert.ok(auto.id);
  });
});

test("SaveBackupCheat.findNewestAutoSnapshot / backupCurrentSave：三态结果", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    SaveBackupCheat.writeSettings({ autoKeep: 5 });

    assert.equal(SaveBackupCheat.findNewestAutoSnapshot(0), null);
    assert.equal(SaveBackupCheat.findNewestAutoSnapshot(1), null);

    const auto = SaveBackupCheat.createSnapshot(1, "auto");

    assert.equal(SaveBackupCheat.findNewestAutoSnapshot(1).id, auto.id);

    SaveBackupCheat.hasSave = (slot) => slot === 1;

    const noSave = SaveBackupCheat.backupCurrentSave(9);
    assert.equal(noSave.status, "skipped");
    assert.equal(noSave.reason, "no-save");

    // saveCount 与最近自动快照一致时去重
    auto.saveCount = 5;
    SaveBackupCheat.writeIndex([auto]);
    SaveBackupCheat.getSaveCount = () => 5;

    const deduped = SaveBackupCheat.backupCurrentSave(1);
    assert.equal(deduped.status, "skipped");
    assert.equal(deduped.reason, "deduped");
    assert.equal(deduped.snapshot.id, auto.id);

    SaveBackupCheat.getSaveCount = () => 6;
    const created = SaveBackupCheat.backupCurrentSave(1);
    assert.equal(created.status, "created");
    assert.equal(created.snapshot.kind, "auto");
  });
});

test("SaveBackupCheat.restoreBackup：同槽位还原、目标槽位校验与损坏快照", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(1, 600));
    const meta = SaveBackupCheat.createSnapshot(1, "manual");

    const writes = [];
    SaveBackupCheat.writeSaveText = (slot, text) => writes.push([slot, text]);
    SaveBackupCheat.updateGlobalInfoAfterRestore = () => {};
    SaveBackupCheat.hasSave = () => false;
    SaveBackupCheat.maxSavefiles = () => 10;
    SaveBackupCheat.getLoadedSlot = () => -1;

    const result = SaveBackupCheat.restoreBackup(meta.id);

    assert.equal(result.slot, 1);
    assert.equal(result.sourceSlot, 1);
    assert.equal(result.isSameSlot, true);
    assert.deepEqual(writes, [[1, saveText(1, 600)]]);
    assert.equal(SaveBackupCheat.readMeta(meta.id).restoreCount, 1);

    assert.throws(
      () => SaveBackupCheat.restoreBackup(meta.id, 0),
      /目标|target|槽位/i,
    );
    assert.throws(
      () => SaveBackupCheat.restoreBackup(meta.id, 99),
      /目标|target|槽位/i,
    );
    assert.throws(
      () => SaveBackupCheat.restoreBackup("missing"),
      /不存在|missing/i,
    );

    const broken = SaveBackupCheat.readMeta(meta.id);
    SaveBackupCheat.writePayload(broken, JSON.stringify({ hello: "world" }));

    assert.throws(
      () => SaveBackupCheat.restoreBackup(meta.id),
      /存档结构|structure|system/i,
    );
  });
});

test("SaveBackupCheat.restoreBackup：覆盖前备份失败则中止", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    const meta = SaveBackupCheat.createSnapshot(1, "manual");

    SaveBackupCheat.hasSave = () => true;
    SaveBackupCheat.backupCurrentSave = () => ({
      status: "failed",
      error: new Error("no space"),
    });

    assert.throws(
      () => SaveBackupCheat.restoreBackup(meta.id),
      /中止|abort|备份/i,
    );
  });
});

test("SaveBackupCheat.updateGlobalInfoAfterRestore：MV / MZ 分支", async () => {
  const text = saveText(2, 1800);

  let savedInfo = null;
  globalThis.$dataSystem = { gameTitle: "My Game" };
  globalThis.DataManager = {
    _globalId: 7,
    loadGlobalInfo: () => [
      null,
      { title: "Source", characters: ["Actor"], faces: [] },
    ],
    saveGlobalInfo: (info) => {
      savedInfo = info;
    },
  };

  SaveBackupCheat.updateGlobalInfoAfterRestore(2, 1, text);

  assert.equal(savedInfo[2].globalId, 7);
  assert.equal(savedInfo[2].title, "Source");
  assert.deepEqual(savedInfo[2].characters, ["Actor"]);
  assert.equal(savedInfo[2].playtime, "00:00:30");
  assert.ok(savedInfo[2].timestamp > 0);

  // 源槽位不存在时不继承目标槽位旧元数据
  globalThis.DataManager.loadGlobalInfo = () => [null, null, { title: "Old" }];
  SaveBackupCheat.updateGlobalInfoAfterRestore(2, 9, text);
  assert.equal(savedInfo[2].title, "My Game");

  // MZ：_globalInfo 数组 + saveGlobalInfo 返回 Promise
  globalThis.Utils.RPGMAKER_NAME = "MZ";
  let mzInfo;
  globalThis.DataManager = {
    _globalInfo: [],
    saveGlobalInfo: () => Promise.reject(new Error("write failed")),
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    SaveBackupCheat.updateGlobalInfoAfterRestore(1, 0, text);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    console.warn = originalWarn;
  }

  mzInfo = globalThis.DataManager._globalInfo;
  assert.equal(mzInfo[1].title, "My Game");
  assert.equal(mzInfo[1].playtime, "00:00:30");
  assert.deepEqual(mzInfo[1].characters, []);
  assert.equal(warnings.length, 1);
});

test("SaveBackupCheat.copySaveFileToLocal：复制引擎存档到快照目录", () => {
  withTempCwd(() => {
    const source = writeSaveFile(1, "save-bytes");

    const target = SaveBackupCheat.copySaveFileToLocal(1);

    assert.ok(target.startsWith(backupDir()));
    assert.match(target, /save1-.*\.rpgsave$/);
    assert.equal(fs.readFileSync(target, "utf8"), "save-bytes");

    assert.throws(() => SaveBackupCheat.copySaveFileToLocal(2), /存档|save/i);

    const original = globalThis.require;
    globalThis.require = undefined;

    try {
      assert.throws(() => SaveBackupCheat.copySaveFileToLocal(1), /nw\.js/i);
    } finally {
      globalThis.require = original;
    }

    assert.ok(source);
  });
});

test("SaveBackupCheat.isSnapshotPresent / getGameVersion", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    const meta = SaveBackupCheat.createSnapshot(1, "manual");

    assert.equal(SaveBackupCheat.isSnapshotPresent(meta), true);
    assert.equal(SaveBackupCheat.isSnapshotPresent(null), false);

    fs.rmSync(meta.payloadFile, { force: true });
    assert.equal(SaveBackupCheat.isSnapshotPresent(meta), false);

    globalThis.$dataSystem = { versionId: 123 };
    assert.equal(SaveBackupCheat.getGameVersion(), "123");
    globalThis.$dataSystem = { versionId: { bad: true } };
    assert.equal(SaveBackupCheat.getGameVersion(), "");
    delete globalThis.$dataSystem;
    assert.equal(SaveBackupCheat.getGameVersion(), "");
  });
});

/* ------------------------------------------------------- 元数据回填 */

function patchIndexEntry(id, patch) {
  const entries = SaveBackupCheat.readIndex();
  const entry = entries.find((item) => item.id === id);

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete entry[key];
    } else {
      entry[key] = value;
    }
  }

  SaveBackupCheat.writeIndex(entries);
  return entry;
}

function findIndexEntry(id) {
  return SaveBackupCheat.readIndex().find((item) => item.id === id);
}

test("SaveBackupCheat.backfillFromSavefileInfo：用存档头补时长 / 存档时间", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(4, 1200));
    const snapshot = SaveBackupCheat.createSnapshot(1, "manual");

    // 模拟早期版本建立的快照：没有时长 / 存档时间字段
    patchIndexEntry(snapshot.id, {
      playtimeFrames: undefined,
      playtime: undefined,
      savefileTime: undefined,
      savefileTimeText: undefined,
    });

    globalThis.DataManager = {
      loadSavefileInfo: (slot) => ({
        playtime: slot === 1 ? 3600 : 0,
        timestamp: 1700000000000,
      }),
    };

    const patched = SaveBackupCheat.backfillFromSavefileInfo();
    const entry = findIndexEntry(snapshot.id);

    assert.ok(patched >= 1);
    assert.equal(entry.playtimeFrames, 3600);
    assert.equal(entry.playtime, "00:01:00");
    assert.equal(entry.savefileTime, 1700000000000);
    assert.equal(
      entry.savefileTimeText,
      SaveBackupCheat.formatDateTime(1700000000000),
    );
    assert.equal(entry.backfillChecked, true);

    // 元数据文件也同步更新，下次重建索引不会丢
    const meta = SaveBackupCheat.readMeta(snapshot.id);
    assert.equal(meta.playtimeFrames, 3600);
    assert.equal(meta.savefileTime, 1700000000000);
  });
});

test("SaveBackupCheat.backfillFromSavefileInfo：跳过已补过 / 字段齐全 / 非当前存档", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(4, 1200));
    const checked = SaveBackupCheat.createSnapshot(1, "manual");
    patchIndexEntry(checked.id, {
      backfillChecked: true,
      playtimeFrames: undefined,
      playtime: undefined,
      savefileTime: undefined,
      savefileTimeText: undefined,
    });

    writeSaveFile(2, saveText(5, 600));
    const completeSnapshot = SaveBackupCheat.createSnapshot(2, "manual");
    // 时长 / 存档时间都已有记录，不需要回填
    patchIndexEntry(completeSnapshot.id, {
      savefileTime: 1700000000000,
      savefileTimeText: "2023-11-15 06:13:20",
    });

    writeSaveFile(3, saveText(6, 600));
    const stale = SaveBackupCheat.createSnapshot(3, "manual");
    patchIndexEntry(stale.id, {
      playtimeFrames: undefined,
      playtime: undefined,
      savefileTime: undefined,
      savefileTimeText: undefined,
      // 快照建立很久以后又保存过档，不能拿现在的存档头回填旧快照
      createdAt: Date.now() - 60 * 60 * 1000,
    });

    globalThis.DataManager = {
      loadSavefileInfo: () => ({ playtime: 9999, timestamp: 1700000000000 }),
    };

    SaveBackupCheat.backfillFromSavefileInfo();

    assert.equal(findIndexEntry(checked.id).backfillChecked, true);
    assert.equal(findIndexEntry(checked.id).playtimeFrames, undefined);

    const complete = findIndexEntry(
      SaveBackupCheat.readIndex().find((item) => item.slot === 2).id,
    );
    assert.equal(complete.playtimeFrames, 600);
    assert.equal(complete.backfillChecked, undefined);

    const staleEntry = findIndexEntry(stale.id);
    assert.equal(staleEntry.playtimeFrames, undefined);
    assert.equal(staleEntry.backfillChecked, undefined);
  });
});

test("SaveBackupCheat.backfillFromSavefileInfo：非本地模式 / 读不到存档头 / 非法槽位", () => {
  withTempCwd(() => {
    assert.equal(SaveBackupCheat.backfillFromSavefileInfo(), 0);

    const originalRequire = globalThis.require;
    globalThis.require = undefined;

    try {
      assert.equal(SaveBackupCheat.backfillFromSavefileInfo(), 0);
    } finally {
      globalThis.require = originalRequire;
    }

    // 索引里混入非法槽位 / 读不到存档头的条目：不报错、不写字段
    writeSaveFile(1);
    const real = SaveBackupCheat.createSnapshot(1, "manual");
    patchIndexEntry(real.id, {
      playtimeFrames: undefined,
      playtime: undefined,
      savefileTime: undefined,
      savefileTimeText: undefined,
      // 关掉载荷回填，专注验证「读不到存档头」这一条路径
      payloadBackfillChecked: true,
    });
    const originalIndex = SaveBackupCheat.readIndex();
    originalIndex.push({ id: "invalid-slot", slot: 0 });
    SaveBackupCheat.writeIndex(originalIndex);
    delete globalThis.DataManager;

    assert.doesNotThrow(() => SaveBackupCheat.backfillFromSavefileInfo());
    assert.equal(findIndexEntry(real.id).playtimeFrames, undefined);
  });
});

test("SaveBackupCheat.backfillMapFromIndex：从快照载荷补地图 / 时长", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(9, 900));
    const snapshot = SaveBackupCheat.createSnapshot(1, "manual");

    patchIndexEntry(snapshot.id, {
      mapId: 0,
      mapName: "",
      playtimeFrames: undefined,
      playtime: undefined,
    });
    globalThis.$dataMapInfos = { 9: { name: "王城" } };

    const entries = SaveBackupCheat.readIndex();
    assert.equal(SaveBackupCheat.backfillMapFromIndex(entries), true);

    const updated = entries.find((item) => item.id === snapshot.id);
    const meta = SaveBackupCheat.readMeta(snapshot.id);

    assert.equal(updated.mapId, 9);
    assert.equal(updated.mapName, "王城");
    assert.equal(updated.playtimeFrames, 900);
    assert.equal(updated.playtime, "00:00:15");
    assert.equal(updated.payloadBackfillChecked, true);
    assert.equal(meta.mapId, 9);
    assert.equal(meta.playtimeFrames, 900);
    assert.equal(meta.payloadBackfillChecked, true);
  });
});

test("SaveBackupCheat.backfillMapFromIndex：顶层 map._mapId / 存档头时长优先", () => {
  withTempCwd(() => {
    // 直接写一份只有顶层 map 的旧式载荷
    writeSaveFile(
      1,
      JSON.stringify({
        system: { _framesOnSave: 300 },
        party: { _gold: 0 },
        map: { _mapId: 12 },
      }),
    );
    const snapshot = SaveBackupCheat.createSnapshot(1, "manual");
    patchIndexEntry(snapshot.id, {
      mapId: 0,
      mapName: "",
      playtimeFrames: undefined,
      playtime: undefined,
    });

    // 存档头给出更长的权威时长时，不能被 _framesOnSave 覆盖
    globalThis.DataManager = {
      loadSavefileInfo: () => ({ playtime: 900, timestamp: 0 }),
    };
    SaveBackupCheat.backfillFromSavefileInfo();

    const entry = findIndexEntry(snapshot.id);
    assert.equal(entry.mapId, 12);
    assert.equal(entry.playtimeFrames, 900);
  });
});

test("SaveBackupCheat.backfillMapFromIndex：跳过已检查 / 字段齐全 / 载荷缺失", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    const checked = SaveBackupCheat.createSnapshot(1, "manual");
    patchIndexEntry(checked.id, {
      mapId: 0,
      mapName: "",
      payloadBackfillChecked: true,
    });

    writeSaveFile(2);
    const complete = SaveBackupCheat.createSnapshot(2, "manual");

    writeSaveFile(3);
    const missing = SaveBackupCheat.createSnapshot(3, "manual");
    patchIndexEntry(missing.id, { mapId: 0, mapName: "" });
    fs.rmSync(missing.payloadFile, { force: true });

    const entries = SaveBackupCheat.readIndex();
    const untouched = complete.id;

    assert.equal(SaveBackupCheat.backfillMapFromIndex(entries), false);
    assert.equal(findIndexEntry(checked.id).mapId, 0);
    assert.equal(findIndexEntry(untouched).mapId, 1);
  });
});

test("SaveBackupCheat.backfillMapFromIndex：载荷无法解析时只警告不标记", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    const snapshot = SaveBackupCheat.createSnapshot(1, "manual");
    patchIndexEntry(snapshot.id, { mapId: 0, mapName: "" });

    // 覆盖载荷内容为不可解析的文本
    fs.writeFileSync(snapshot.payloadFile, "not-json", "utf8");

    const { result, warnings } = silenceWarn(() =>
      SaveBackupCheat.backfillMapFromIndex(SaveBackupCheat.readIndex()),
    );

    assert.equal(result, false);
    assert.equal(findIndexEntry(snapshot.id).payloadBackfillChecked, undefined);
    assert.ok(warnings.length > 0);
  });
});

test("SaveBackupCheat.getLoadedSlot / getPlaytimeText 防御异常", () => {
  globalThis.$gameSystem = { _savefileId: 0 };
  globalThis.DataManager = {
    get _lastAccessedId() {
      throw new Error("broken");
    },
  };

  assert.equal(SaveBackupCheat.getLoadedSlot(), -1);

  globalThis.$gameSystem = null;
  assert.equal(SaveBackupCheat.getPlaytimeText(), "");
});

test("SaveBackupCheat.hasSave 支持 web storage 与异常回退", () => {
  const originalRequire = globalThis.require;
  globalThis.require = undefined;

  try {
    globalThis.StorageManager = {
      webStorageExists: (slot) => slot === 3,
    };
    assert.equal(SaveBackupCheat.hasSave(3), true);
    assert.equal(SaveBackupCheat.hasSave(4), false);

    globalThis.StorageManager = {
      webStorageExists() {
        throw new Error("storage broken");
      },
    };
    const { result, warnings } = silenceWarn(() => SaveBackupCheat.hasSave(1));
    assert.equal(result, false);
    assert.equal(warnings.length, 1);
  } finally {
    globalThis.require = originalRequire;
  }
});

test("SaveBackupCheat.getSaveFilePath 路径接口抛错时回退或返回 null", () => {
  withTempCwd((dir) => {
    globalThis.StorageManager = {
      localFilePath() {
        throw new Error("localFilePath broken");
      },
      filePath() {
        throw new Error("filePath broken");
      },
    };

    const { result, warnings } = silenceWarn(() =>
      SaveBackupCheat.getSaveFilePath(2),
    );
    assert.equal(result, path.join(dir, "www", "save", "file2.rpgsave"));
    assert.equal(warnings.length, 2);

    const originalRequire = globalThis.require;
    globalThis.require = undefined;

    try {
      assert.equal(SaveBackupCheat.getSaveFilePath(1), null);
    } finally {
      globalThis.require = originalRequire;
    }
  });
});

test("SaveBackupCheat.readSaveText 浏览器 / MZ / 异常分支", () => {
  SaveBackupCheat.isLocalMode = () => false;

  globalThis.Utils.RPGMAKER_NAME = "MZ";
  assert.equal(SaveBackupCheat.readSaveText(1), null);

  globalThis.Utils.RPGMAKER_NAME = "MV";
  globalThis.StorageManager = {
    loadFromWebStorage: (slot) => `web-${slot}`,
  };
  assert.equal(SaveBackupCheat.readSaveText(2), "web-2");

  globalThis.StorageManager = {
    loadFromWebStorage() {
      throw new Error("web storage broken");
    },
  };
  const { result, warnings } = silenceWarn(() =>
    SaveBackupCheat.readSaveText(3),
  );
  assert.equal(result, null);
  assert.equal(warnings.length, 1);
});

test("SaveBackupCheat.writeSaveText 缺失 pako / 未知路径 / 浏览器分支", () => {
  SaveBackupCheat.isLocalMode = () => true;
  globalThis.Utils.RPGMAKER_NAME = "MZ";

  const originalPako = globalThis.pako;
  delete globalThis.pako;

  try {
    assert.throws(() => SaveBackupCheat.writeSaveText(1, "{}"), /pako|压缩/i);
  } finally {
    if (originalPako !== undefined) {
      globalThis.pako = originalPako;
    }
  }

  SaveBackupCheat.getSaveFilePath = () => null;
  SaveBackupCheat.pakoCache = undefined;
  globalThis.pako = { deflate: (text) => text };

  try {
    assert.throws(
      () => SaveBackupCheat.writeSaveText(1, "{}"),
      /路径|path|unknown/i,
    );
  } finally {
    delete globalThis.pako;
  }

  SaveBackupCheat.isLocalMode = () => false;
  assert.throws(
    () => SaveBackupCheat.writeSaveText(1, "{}"),
    /浏览器|browser|不支持/i,
  );

  globalThis.Utils.RPGMAKER_NAME = "MV";
  const calls = [];
  globalThis.StorageManager = {
    saveToWebStorage: (slot, text) => calls.push([slot, text]),
  };
  SaveBackupCheat.writeSaveText(4, '{"ok":1}');
  assert.deepEqual(calls, [[4, '{"ok":1}']]);
});

test("SaveBackupCheat.isSnapshotPresent / listBackups 异常时降级", () => {
  SaveBackupCheat.requireFs = () => {
    throw new Error("fs unavailable");
  };

  assert.equal(SaveBackupCheat.isSnapshotPresent({ id: "a" }), false);
  SaveBackupCheat.requireFs = originalMethods.requireFs;

  withTempCwd(() => {
    writeSaveFile(1);
    SaveBackupCheat.createSnapshot(1, "manual");

    SaveBackupCheat.findPayloadPath = () => {
      throw new Error("payload lookup failed");
    };

    const { result, warnings } = silenceWarn(() =>
      SaveBackupCheat.listBackups(),
    );
    assert.deepEqual(result, []);
    assert.equal(warnings.length, 1);
  });
});

test("SaveBackupCheat.getStats 非本地模式返回零统计", () => {
  SaveBackupCheat.isLocalMode = () => false;

  assert.deepEqual(SaveBackupCheat.getStats(), {
    count: 0,
    autoCount: 0,
    manualCount: 0,
    missingCount: 0,
    bytes: 0,
  });
  assert.deepEqual(SaveBackupCheat.listBackups(), []);
  assert.equal(SaveBackupCheat.backfillFromSavefileInfo(), 0);
});

test("SaveBackupCheat.rename / delete / clear 非本地模式拒绝", () => {
  withTempCwd(() => {
    writeSaveFile(1);
    const meta = SaveBackupCheat.createSnapshot(1, "manual");

    SaveBackupCheat.isLocalMode = () => false;

    assert.throws(() => SaveBackupCheat.renameBackup(meta.id, "x"), /nw\.js/i);
    assert.throws(() => SaveBackupCheat.deleteBackup(meta.id), /nw\.js/i);
    assert.throws(() => SaveBackupCheat.clearBackups(), /nw\.js/i);
  });
});

test("SaveBackupCheat.updateGlobalInfoAfterRestore 全局信息缺失时安全返回", () => {
  globalThis.Utils.RPGMAKER_NAME = "MZ";
  globalThis.DataManager = { _globalInfo: null };
  assert.doesNotThrow(() =>
    SaveBackupCheat.updateGlobalInfoAfterRestore(1, 1, saveText()),
  );

  globalThis.Utils.RPGMAKER_NAME = "MV";
  globalThis.DataManager = {};
  assert.doesNotThrow(() =>
    SaveBackupCheat.updateGlobalInfoAfterRestore(1, 1, saveText()),
  );

  globalThis.DataManager = {
    loadGlobalInfo() {
      throw new Error("global broken");
    },
  };

  const { warnings } = silenceWarn(() =>
    SaveBackupCheat.updateGlobalInfoAfterRestore(1, 1, saveText()),
  );
  assert.equal(warnings.length, 1);
});

test("SaveBackupCheat.touchBackup 快照不存在时安全返回", () => {
  assert.doesNotThrow(() => SaveBackupCheat.touchBackup("missing"));
});

test("SaveBackupCheat.isLocalMode returns false when requireFs throws", () => {
  const originalRequireFs = SaveBackupCheat.requireFs;
  SaveBackupCheat.requireFs = () => {
    throw new Error("fs unavailable");
  };

  try {
    assert.equal(SaveBackupCheat.isLocalMode(), false);
  } finally {
    SaveBackupCheat.requireFs = originalRequireFs;
  }
});

test("SaveBackupCheat.writeSaveText MZ rename failure cleans temp file", () => {
  withTempCwd(() => {
    globalThis.Utils.RPGMAKER_NAME = "MZ";
    globalThis.pako = { deflate: (text) => `PAKO:${text}` };

    const target = path.join(process.cwd(), "target.rmmzsave");
    fs.mkdirSync(target);
    globalThis.StorageManager = { filePath: () => target };

    assert.throws(() => SaveBackupCheat.writeSaveText(1, '{"ok":1}'));
    assert.equal(
      fs
        .readdirSync(process.cwd())
        .some((name) => name.includes(".cheat-") && name.endsWith(".tmp")),
      false,
    );
  });
});

test("SaveBackupCheat.getSaveFilePath returns null when require path fails", () => {
  const originalRequire = globalThis.require;
  const originalIsLocalMode = SaveBackupCheat.isLocalMode;

  globalThis.require = () => {
    throw new Error("require broken");
  };
  SaveBackupCheat.isLocalMode = () => true;
  globalThis.StorageManager = {};

  try {
    assert.equal(SaveBackupCheat.getSaveFilePath(1), null);
  } finally {
    globalThis.require = originalRequire;
    SaveBackupCheat.isLocalMode = originalIsLocalMode;
  }
});

test("SaveBackupCheat.listBackups sorts equal timestamps by id", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    const make = (id) => ({
      id,
      slot: 1,
      kind: "manual",
      label: id,
      createdAt: 5,
      mapId: 1,
      mapName: "Start",
      sizeBytes: 10,
    });

    SaveBackupCheat.writeIndex([make("a"), make("b")]);

    assert.deepEqual(
      SaveBackupCheat.listBackups().map((entry) => entry.id),
      ["b", "a"],
    );
  });
});

test("SaveBackupCheat.removeSnapshotFiles reports unlink failures", () => {
  const originalRequireFs = SaveBackupCheat.requireFs;
  const dir = path.join(process.cwd(), "www", "cheat-settings", "save-backups");
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  SaveBackupCheat.requireFs = () => ({
    existsSync: () => true,
    unlinkSync() {
      throw new Error("locked file");
    },
  });

  try {
    assert.doesNotThrow(() =>
      SaveBackupCheat.removeSnapshotFiles({
        id: "manual-s1-a",
        payloadFile: path.join(dir, "manual-s1-a.rpgsave"),
      }),
    );
  } finally {
    SaveBackupCheat.requireFs = originalRequireFs;
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 2);
});

test("SaveBackupCheat.backupCurrentSave reports snapshot failures", () => {
  const originalCreateSnapshot = SaveBackupCheat.createSnapshot;
  SaveBackupCheat.hasSave = () => true;
  SaveBackupCheat.createSnapshot = () => {
    throw new Error("no space");
  };

  try {
    const { result, warnings } = silenceWarn(() =>
      SaveBackupCheat.backupCurrentSave(1),
    );

    assert.equal(result.status, "failed");
    assert.match(String(result.error), /no space/);
    assert.equal(warnings.length, 1);
  } finally {
    SaveBackupCheat.createSnapshot = originalCreateSnapshot;
  }
});

test("SaveBackupCheat.restoreBackup shows loaded-slot dialog", async () => {
  const { ConfirmDialog } =
    await import("../../cheat-engine/www/cheat/js/DialogHelper.js");
  const originalShow = ConfirmDialog.show;
  const originalClose = ConfirmDialog.close;
  const dialogs = [];

  ConfirmDialog.show = (options) => dialogs.push(options);
  ConfirmDialog.close = () => {};

  try {
    withTempCwd(() => {
      writeSaveFile(1, saveText(1, 600));
      const meta = SaveBackupCheat.createSnapshot(1, "manual");

      SaveBackupCheat.writeSaveText = () => {};
      SaveBackupCheat.updateGlobalInfoAfterRestore = () => {};
      SaveBackupCheat.hasSave = () => true;
      SaveBackupCheat.backupCurrentSave = () => ({ status: "created" });
      SaveBackupCheat.getLoadedSlot = () => 1;
      SaveBackupCheat.maxSavefiles = () => 10;

      SaveBackupCheat.restoreBackup(meta.id);

      assert.equal(dialogs.length, 1);
      assert.equal(dialogs[0].width, 480);
      assert.equal(dialogs[0].actions.length, 1);
    });
  } finally {
    ConfirmDialog.show = originalShow;
    ConfirmDialog.close = originalClose;
  }
});

test("SaveBackupCheat.restoreBackup to other slot reports success", async () => {
  const { Alert } =
    await import("../../cheat-engine/www/cheat/js/AlertHelper.js");
  const messages = [];
  Alert.setHandler((level, msg) => messages.push({ level, msg }));

  try {
    withTempCwd(() => {
      writeSaveFile(1, saveText(1, 600));
      const meta = SaveBackupCheat.createSnapshot(1, "manual");

      SaveBackupCheat.writeSaveText = () => {};
      SaveBackupCheat.updateGlobalInfoAfterRestore = () => {};
      SaveBackupCheat.hasSave = () => false;
      SaveBackupCheat.getLoadedSlot = () => -1;
      SaveBackupCheat.maxSavefiles = () => 10;

      const result = SaveBackupCheat.restoreBackup(meta.id, 2);
      assert.equal(result.slot, 2);
      assert.equal(result.sourceSlot, 1);
      assert.equal(result.isSameSlot, false);
      assert.equal(messages.at(-1).level, "success");
    });
  } finally {
    Alert.handler = null;
  }
});

test("SaveBackupCheat.restoreBackup rejects invalid source slot metadata", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();
    SaveBackupCheat.writeMeta({
      id: "manual-s0-a",
      slot: 0,
      kind: "manual",
      label: "",
      createdAt: 1,
      mapId: 0,
      mapName: "",
    });

    assert.throws(
      () => SaveBackupCheat.restoreBackup("manual-s0-a"),
      /槽|slot/i,
    );
  });
});

test("SaveBackupCheat.updateGlobalInfoAfterRestore uses _playtime", () => {
  globalThis.Utils.RPGMAKER_NAME = "MZ";
  globalThis.DataManager = {
    _globalInfo: [],
    saveGlobalInfo() {},
  };

  globalThis.$dataSystem = { gameTitle: "Test Game" };
  assert.equal(SaveBackupCheat.isMZ(), true);
  SaveBackupCheat.updateGlobalInfoAfterRestore(
    1,
    1,
    JSON.stringify({ system: { _playtime: 600 } }),
  );

  assert.equal(globalThis.DataManager._globalInfo[1].playtime, "00:00:10");
});

test("SaveBackupCheat.writeSaveText ignores temp cleanup failures", () => {
  withTempCwd(() => {
    globalThis.Utils.RPGMAKER_NAME = "MZ";
    globalThis.pako = { deflate: (text) => `PAKO:${text}` };

    const target = path.join(process.cwd(), "target.rmmzsave");
    fs.mkdirSync(target);
    globalThis.StorageManager = { filePath: () => target };

    const originalRequireFs = SaveBackupCheat.requireFs;
    SaveBackupCheat.requireFs = () => ({
      ...fs,
      existsSync: () => true,
      writeFileSync: (...args) => fs.writeFileSync(...args),
      renameSync: () => {
        throw new Error("rename failed");
      },
      unlinkSync: () => {
        throw new Error("cleanup failed");
      },
    });

    try {
      assert.throws(
        () => SaveBackupCheat.writeSaveText(1, '{"ok":1}'),
        /rename failed/,
      );
    } finally {
      SaveBackupCheat.requireFs = originalRequireFs;
    }
  });
});

test("SaveBackupCheat.backfillFromSavefileInfo caches same-save checks", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(1, 600));
    const now = Date.now();

    SaveBackupCheat.writeIndex([
      { id: "auto-s1-a", slot: 1, kind: "auto", createdAt: now },
      { id: "auto-s1-b", slot: 1, kind: "auto", createdAt: now },
    ]);

    globalThis.DataManager = {
      loadSavefileInfo: () => ({ playtime: 3600, timestamp: 1700000000000 }),
    };

    assert.ok(SaveBackupCheat.backfillFromSavefileInfo() >= 2);
    const entries = SaveBackupCheat.readIndex();
    assert.equal(
      entries.every((entry) => entry.backfillChecked),
      true,
    );
    assert.equal(entries[0].playtimeFrames, 3600);
  });
});

test("SaveBackupCheat.backfillFromSavefileInfo ignores stat failures", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(1, 600));
    const now = Date.now();
    SaveBackupCheat.writeIndex([
      { id: "auto-s1-a", slot: 1, kind: "auto", createdAt: now },
    ]);

    globalThis.DataManager = {
      loadSavefileInfo: () => ({ playtime: 3600, timestamp: 1 }),
    };

    const originalRequireFs = SaveBackupCheat.requireFs;
    SaveBackupCheat.requireFs = () => ({
      ...fs,
      statSync: () => {
        throw new Error("stat failed");
      },
    });

    try {
      SaveBackupCheat.backfillFromSavefileInfo();
    } finally {
      SaveBackupCheat.requireFs = originalRequireFs;
    }

    assert.equal(SaveBackupCheat.readIndex()[0].backfillChecked, undefined);
  });
});

test("SaveBackupCheat.backfillFromSavefileInfo skips invalid slots", () => {
  SaveBackupCheat.isLocalMode = () => true;
  SaveBackupCheat.readIndex = () => [
    { id: "bad-slot", slot: 0, createdAt: Date.now() },
  ];
  globalThis.DataManager = {
    loadSavefileInfo: () => ({ playtime: 1, timestamp: 1 }),
  };

  assert.equal(SaveBackupCheat.backfillFromSavefileInfo(), 0);
});

test("SaveBackupCheat.backfillFromSavefileInfo warns on meta / index write failures", () => {
  withTempCwd(() => {
    writeSaveFile(1, saveText(1, 600));
    const now = Date.now();
    const entries = [
      { id: "auto-s1-a", slot: 1, kind: "auto", createdAt: now },
    ];
    SaveBackupCheat.writeIndex(entries);

    globalThis.DataManager = {
      loadSavefileInfo: () => ({ playtime: 3600, timestamp: 1 }),
    };

    const originalWriteMeta = SaveBackupCheat.writeMeta;
    const originalWriteIndex = SaveBackupCheat.writeIndex;
    const originalReadIndex = SaveBackupCheat.readIndex;
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);

    SaveBackupCheat.writeMeta = () => {
      throw new Error("meta write failed");
    };

    try {
      const patched = SaveBackupCheat.backfillFromSavefileInfo();
      assert.ok(patched >= 1);
    } finally {
      SaveBackupCheat.writeMeta = originalWriteMeta;
    }

    assert.equal(warnings.length, 1);

    SaveBackupCheat.writeIndex(entries);
    SaveBackupCheat.writeIndex = () => {
      throw new Error("index write failed");
    };
    SaveBackupCheat.readIndex = () => [
      { id: "auto-s1-b", slot: 1, kind: "auto", createdAt: now },
    ];

    try {
      assert.doesNotThrow(() => SaveBackupCheat.backfillFromSavefileInfo());
    } finally {
      SaveBackupCheat.writeIndex = originalWriteIndex;
      SaveBackupCheat.readIndex = originalReadIndex;
      console.warn = originalWarn;
    }
  });
});

test("SaveBackupCheat.backfillMapFromIndex skips missing payloads and non-object saves", () => {
  withTempCwd(() => {
    assert.equal(
      SaveBackupCheat.backfillMapFromIndex([
        { id: "missing", slot: 1, mapId: 0 },
        { id: "bad-slot", slot: 0, mapId: 0 },
      ]),
      false,
    );

    writeSaveFile(1, saveText(1, 60));
    const meta = SaveBackupCheat.createSnapshot(1, "manual");
    SaveBackupCheat.writePayload(meta, "123");

    const index = SaveBackupCheat.readIndex();
    const entry = index.find((item) => item.id === meta.id);
    entry.mapId = 0;
    entry.mapName = "";
    entry.playtimeFrames = 0;
    entry.playtime = "";

    assert.equal(SaveBackupCheat.backfillMapFromIndex([entry]), false);
  });
});

test("SaveBackupCheat.removeSnapshotFiles skips paths outside backup dir", () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    assert.doesNotThrow(() =>
      SaveBackupCheat.removeSnapshotFiles({
        id: "manual-s1-a",
        payloadFile: path.join(process.cwd(), "outside.rpgsave"),
      }),
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(warnings.length >= 1);
});

test("SaveBackupCheat.touchBackup warns on index failures", () => {
  const originalReadIndex = SaveBackupCheat.readIndex;
  SaveBackupCheat.readIndex = () => {
    throw new Error("index broken");
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    assert.doesNotThrow(() => SaveBackupCheat.touchBackup("x"));
  } finally {
    SaveBackupCheat.readIndex = originalReadIndex;
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
});
