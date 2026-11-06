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
