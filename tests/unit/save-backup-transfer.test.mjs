import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SaveBackupCheat } from "../../cheat-engine/www/cheat/js/SaveBackupHelper.js";

const originalRequire = globalThis.require;
const originalCwd = process.cwd();
const tempDirs = [];

globalThis.require = createRequire(import.meta.url);

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-transfer-"));
  tempDirs.push(dir);
  return dir;
}

function withTempCwd(callback) {
  const dir = tempDir();
  process.chdir(dir);

  try {
    return callback(dir);
  } finally {
    process.chdir(originalCwd);
  }
}

after(() => {
  globalThis.require = originalRequire;
  process.chdir(originalCwd);

  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function saveText(mapId = 1, playtimeFrames = 600) {
  return JSON.stringify({
    system: { _framesOnSave: playtimeFrames },
    party: { _gold: 100 },
    actors: [],
    switches: [],
    variables: [],
    player: { map: { _mapId: mapId } },
  });
}

function seedBackup(id, slot, data, kind = "manual") {
  const meta = {
    id,
    slot,
    kind,
    createdAt: 1700000000000,
    label: id,
    mapId: 1,
    mapName: "Map 1",
    savefileTime: 0,
    savefileTimeText: "",
    playtimeFrames: 600,
    playtime: "00:00:10",
  };

  SaveBackupCheat.writePayload(meta, data);

  const entries = SaveBackupCheat.readIndex().filter(
    (entry) => entry.id !== id,
  );
  entries.push(meta);
  SaveBackupCheat.writeIndex(entries);

  return meta;
}

test("exportBackups：导出全部快照并包含原始数据", () => {
  withTempCwd(() => {
    seedBackup("manual-s1-a", 1, saveText(1));
    seedBackup("auto-s2-b", 2, saveText(2), "auto");

    const file = SaveBackupCheat.exportBackups();
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));

    assert.equal(payload.format, "cheat-save-backups");
    assert.equal(payload.version, 1);
    assert.ok(Number.isFinite(payload.exportedAt));
    assert.equal(payload.backups.length, 2);

    const first = payload.backups.find(
      (item) => item.meta.id === "manual-s1-a",
    );
    assert.equal(first.data, saveText(1));
    assert.equal(first.meta.slot, 1);
  });
});

test("exportAll / exportSelected：只导出选中的快照", () => {
  withTempCwd(() => {
    seedBackup("manual-s1-a", 1, saveText(1));
    seedBackup("manual-s2-b", 2, saveText(2));

    const all = JSON.parse(
      fs.readFileSync(SaveBackupCheat.exportAll(), "utf8"),
    );
    assert.equal(all.backups.length, 2);

    const selected = JSON.parse(
      fs.readFileSync(SaveBackupCheat.exportSelected(["manual-s1-a"]), "utf8"),
    );
    assert.deepEqual(
      selected.backups.map((item) => item.meta.id),
      ["manual-s1-a"],
    );
  });
});

test("exportSelected：没有命中任何快照时抛错而不是写出空文件", () => {
  withTempCwd(() => {
    seedBackup("manual-s1-a", 1, saveText(1));

    assert.throws(
      () => SaveBackupCheat.exportSelected(["missing-s1-x"]),
      /选择|选中|selected/i,
    );
  });
});

test("importFromJson：导入有效快照并跳过坏条目", () => {
  withTempCwd(() => {
    const imported = {
      format: "cheat-save-backups",
      version: 1,
      exportedAt: Date.now(),
      backups: [
        {
          meta: {
            id: "manual-s1-source",
            slot: 2,
            kind: "manual",
            label: "导入的存档",
            createdAt: 1700000000000,
            mapId: 3,
            mapName: "Cave",
            playtimeFrames: 1200,
            playtime: "00:00:20",
          },
          data: saveText(3, 1200),
        },
        // 缺少 meta
        { data: saveText(1) },
        // 非法槽位
        { meta: { slot: 0 }, data: saveText(1) },
        // 存档数据结构无效
        { meta: { slot: 3 }, data: JSON.stringify({ hello: "world" }) },
      ],
    };

    const result = SaveBackupCheat.importFromJson(JSON.stringify(imported));

    assert.deepEqual(result, { added: 1, skipped: 3 });

    const entries = SaveBackupCheat.readIndex();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].slot, 2);
    assert.equal(entries[0].label, "导入的存档");
    assert.equal(entries[0].mapId, 3);
    assert.equal(entries[0].playtimeFrames, 1200);
    assert.match(entries[0].id, /^manual-s2-/);

    assert.equal(SaveBackupCheat.readPayload(entries[0]), saveText(3, 1200));
  });
});

test("importFromJson：自动快照保留 saveCount，kind 仅接受已知值", () => {
  withTempCwd(() => {
    const imported = {
      format: "cheat-save-backups",
      version: 1,
      backups: [
        {
          meta: {
            slot: 1,
            kind: "auto",
            saveCount: 7,
            label: "自动",
            createdAt: 1,
          },
          data: saveText(1),
        },
        {
          meta: {
            slot: 2,
            kind: "unknown-kind",
            label: "未知类型",
            createdAt: 1,
          },
          data: saveText(2),
        },
      ],
    };

    const result = SaveBackupCheat.importFromJson(JSON.stringify(imported));
    assert.deepEqual(result, { added: 2, skipped: 0 });

    const entries = SaveBackupCheat.readIndex().sort((a, b) => a.slot - b.slot);
    assert.equal(entries[0].kind, "auto");
    assert.equal(entries[0].saveCount, 7);
    assert.equal(entries[1].kind, "manual");
  });
});

test("importFromJson：拒绝损坏 JSON、未知格式与不支持的版本", () => {
  withTempCwd(() => {
    assert.throws(
      () => SaveBackupCheat.importFromJson("{not json"),
      /JSON|json|格式/i,
    );

    assert.throws(
      () =>
        SaveBackupCheat.importFromJson(
          JSON.stringify({ format: "something-else", backups: [] }),
        ),
      /文件|file|插件/i,
    );

    assert.throws(
      () =>
        SaveBackupCheat.importFromJson(
          JSON.stringify({
            format: "cheat-save-backups",
            version: 999,
            backups: [],
          }),
        ),
      /版本|version/i,
    );
  });
});

test("importFromJson / exportBackups：非本地环境直接拒绝", () => {
  withTempCwd(() => {
    const original = globalThis.require;
    globalThis.require = undefined;

    try {
      assert.equal(SaveBackupCheat.isLocalMode(), false);
      assert.throws(() => SaveBackupCheat.exportBackups(), /nw\.js|NW\.js/i);
      assert.throws(
        () =>
          SaveBackupCheat.importFromJson(
            JSON.stringify({
              format: "cheat-save-backups",
              version: 1,
              backups: [],
            }),
          ),
        /nw\.js|NW\.js/i,
      );
    } finally {
      globalThis.require = original;
    }
  });
});

test("exportBackups：读取失败的单条快照仍会导出（data 为 null）", () => {
  withTempCwd(() => {
    const meta = seedBackup("manual-s1-a", 1, saveText(1));
    fs.rmSync(meta.payloadFile, { force: true });

    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      const payload = JSON.parse(
        fs.readFileSync(SaveBackupCheat.exportBackups(), "utf8"),
      );

      assert.equal(payload.backups.length, 1);
      assert.equal(payload.backups[0].data, null);
    } finally {
      console.warn = originalWarn;
    }
  });
});
