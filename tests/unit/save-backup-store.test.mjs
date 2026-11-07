import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SaveBackupCheat } from "../../cheat-engine/www/cheat/js/SaveBackupHelper.js";

globalThis.require = createRequire(import.meta.url);

const cwd = process.cwd();
const dirs = [];

function withTempCwd(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-backup-store-"));
  dirs.push(dir);
  process.chdir(dir);

  try {
    return callback();
  } finally {
    process.chdir(cwd);
  }
}

after(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function backupDir() {
  return `${process.cwd()}/www/cheat-settings/save-backups`;
}

function meta(id, slot = 1) {
  return {
    id,
    slot,
    kind: "manual",
    label: id,
    createdAt: 1,
    mapId: 0,
    mapName: "",
  };
}

test("ensureBackupDir / writeIndex / readIndex：索引往返", () => {
  withTempCwd(() => {
    const dir = SaveBackupCheat.ensureBackupDir();
    assert.equal(path.resolve(dir), path.resolve(backupDir()));
    assert.equal(fs.statSync(dir).isDirectory(), true);

    assert.deepEqual(SaveBackupCheat.readIndex(), []);

    const entries = [meta("manual-s1-a"), meta("manual-s2-b", 2)];
    SaveBackupCheat.writeIndex(entries);

    assert.deepEqual(SaveBackupCheat.readIndex(), entries);
  });
});

test("readIndex：索引损坏时从 <id>.json 元数据重建", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    SaveBackupCheat.writeMeta(meta("manual-s1-a"));
    SaveBackupCheat.writeMeta(meta("auto-s2-b", 2));

    fs.rmSync(path.join(backupDir(), "index.json"), { force: true });

    const rebuilt = SaveBackupCheat.readIndex();
    assert.deepEqual(rebuilt.map((entry) => entry.id).sort(), [
      "auto-s2-b",
      "manual-s1-a",
    ]);

    // 重建结果应写回索引
    const written = JSON.parse(
      fs.readFileSync(path.join(backupDir(), "index.json"), "utf8"),
    );
    assert.equal(written.length, 2);
  });
});

test("readIndex：过滤坏条目并补回缺失的元数据", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();
    SaveBackupCheat.writeMeta(meta("manual-s1-good"));
    SaveBackupCheat.writeMeta({ id: "manual-s2-bad", slot: 0 });

    SaveBackupCheat.writeIndex([
      meta("manual-s1-good"),
      { id: "../evil", slot: 1 },
      { id: "manual-s3-bad", slot: 0 },
      null,
    ]);

    const entries = SaveBackupCheat.readIndex();

    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["manual-s1-good"],
    );
  });
});

test("writeMeta / readMeta：元数据往返与索引兜底", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    const entry = meta("manual-s1-meta");
    SaveBackupCheat.writeMeta(entry);

    assert.deepEqual(SaveBackupCheat.readMeta(entry.id), entry);

    fs.rmSync(path.join(backupDir(), `${entry.id}.json`), { force: true });
    SaveBackupCheat.writeIndex([entry]);

    const recovered = SaveBackupCheat.readMeta(entry.id);
    assert.equal(recovered.id, entry.id);
    assert.equal(recovered.recovered, true);

    assert.equal(SaveBackupCheat.readMeta("missing-s1-x"), null);
    assert.equal(SaveBackupCheat.readMeta("../evil"), null);
  });
});

test("getPayloadPath / isSafeSaveExt：阻止路径穿越与非法扩展名", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    assert.throws(() => SaveBackupCheat.getPayloadPath("../evil"), /ID 无效/);

    const fallback = SaveBackupCheat.getPayloadPath("manual-s1-x");
    assert.ok(
      fallback.endsWith(".rpgsave") || fallback.endsWith(".rmmzsave"),
      `意外扩展名: ${fallback}`,
    );

    const custom = SaveBackupCheat.getPayloadPath("manual-s1-y", {
      codec: "base64",
      saveExt: ".rmmzsave",
    });
    assert.ok(custom.endsWith(".rmmzsave"));

    const unsafe = SaveBackupCheat.getPayloadPath("manual-s1-z", {
      saveExt: "/../../evil",
    });
    assert.equal(unsafe.includes("evil"), false);
    assert.ok(unsafe.endsWith(".rpgsave") || unsafe.endsWith(".rmmzsave"));

    assert.equal(SaveBackupCheat.isSafeSaveExt(".rpgsave"), true);
    assert.equal(SaveBackupCheat.isSafeSaveExt(".rmmzsave"), true);
    assert.equal(SaveBackupCheat.isSafeSaveExt("rpgsave"), false);
    assert.equal(SaveBackupCheat.isSafeSaveExt(".a/b"), false);
    assert.equal(SaveBackupCheat.isSafeSaveExt(".toolongextensionx"), false);
  });
});

test("writePayload / readPayload：按存档编码往返", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    const entry = meta("manual-s1-payload");
    const data = { system: { _playtime: 1 }, party: { _gold: 5 } };

    SaveBackupCheat.writePayload(entry, JSON.stringify(data));

    assert.equal(fs.existsSync(entry.payloadFile), true);
    assert.ok(entry.payloadSize > 0);
    assert.deepEqual(JSON.parse(SaveBackupCheat.readPayload(entry)), data);

    // 元数据文件也应该同步写入
    assert.deepEqual(SaveBackupCheat.readMeta(entry.id), entry);
  });
});

test("readPayload：载荷缺失 / 解码失败时抛错", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    const missing = meta("manual-s1-missing");
    assert.throws(
      () => SaveBackupCheat.readPayload(missing),
      /快照数据|不存在|丢失|缺失/,
    );

    const broken = meta("manual-s1-broken");
    broken.codec = "base64";
    broken.saveExt = ".rpgsave";
    fs.writeFileSync(
      path.join(backupDir(), `${broken.id}.rpgsave`),
      "not-valid-base64!!!",
      "utf8",
    );
    broken.payloadFile = path.join(backupDir(), `${broken.id}.rpgsave`);

    assert.throws(() => SaveBackupCheat.readPayload(broken));
  });
});

test("findPayloadPath：忽略越界 payloadFile，按候选扩展名回退", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    const entry = meta("manual-s1-fallback");
    const file = path.join(backupDir(), `${entry.id}.rpgsave`);
    fs.writeFileSync(file, "x", "utf8");

    entry.payloadFile = path.join(process.cwd(), "..", "evil.rpgsave");
    assert.equal(
      path.resolve(SaveBackupCheat.findPayloadPath(entry)),
      path.resolve(file),
    );

    assert.equal(SaveBackupCheat.findPayloadPath(null), null);
    assert.equal(SaveBackupCheat.findPayloadPath({ id: "../evil" }), null);
  });
});

test("readIndex 结构异常 / JSON 损坏时回退重建", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();
    const indexFile = path.join(backupDir(), "index.json");

    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      fs.writeFileSync(indexFile, JSON.stringify({ not: "array" }), "utf8");
      assert.deepEqual(SaveBackupCheat.readIndex(), []);

      fs.writeFileSync(indexFile, "{bad json", "utf8");
      assert.deepEqual(SaveBackupCheat.readIndex(), []);
    } finally {
      console.warn = originalWarn;
    }
  });
});

test("rebuildIndexFromMetas 扫描目录失败时返回空", () => {
  const originalRequireFs = SaveBackupCheat.requireFs;
  const originalWarn = console.warn;
  console.warn = () => {};

  SaveBackupCheat.requireFs = () => ({
    existsSync: () => true,
    readFileSync: () => "{bad",
    readdirSync() {
      throw new Error("permission denied");
    },
  });

  try {
    assert.deepEqual(SaveBackupCheat.readIndex(), []);
  } finally {
    SaveBackupCheat.requireFs = originalRequireFs;
    console.warn = originalWarn;
  }
});

test("rebuildIndexFromMetas 跳过非法 id / 损坏 / 不匹配 / 非法槽位", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();
    const dir = backupDir();

    fs.writeFileSync(
      path.join(dir, "valid.json"),
      JSON.stringify(meta("valid")),
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "broken.json"), "{bad", "utf8");
    fs.writeFileSync(
      path.join(dir, "wrong.json"),
      JSON.stringify(meta("other")),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "slot0.json"),
      JSON.stringify(meta("slot0", 0)),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "bad id.json"),
      JSON.stringify(meta("bad id")),
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "notes.txt"), "ignored", "utf8");

    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      const entries = SaveBackupCheat.readIndex();
      assert.deepEqual(
        entries.map((entry) => entry.id),
        ["valid"],
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});

test("isPathInsideBackupDir 依赖缺失时返回 false", () => {
  const originalRequire = globalThis.require;
  globalThis.require = undefined;

  try {
    assert.equal(
      SaveBackupCheat.isPathInsideBackupDir(`${backupDir()}/x.json`),
      false,
    );
  } finally {
    globalThis.require = originalRequire;
  }
});

test("getSnapshotCodec 在 MZ + pako 下返回 pako", () => {
  withTempCwd(() => {
    const originalUtils = globalThis.Utils;
    const originalPako = globalThis.pako;

    globalThis.Utils = { isNwjs: () => true, RPGMAKER_NAME: "MZ" };
    globalThis.pako = { deflate() {}, inflate() {} };
    SaveBackupCheat.pakoCache = undefined;

    try {
      assert.equal(SaveBackupCheat.getSnapshotCodec(), "pako");
      assert.equal(SaveBackupCheat.getPayloadExtension("pako"), ".rmmzsave");
    } finally {
      SaveBackupCheat.pakoCache = undefined;
      globalThis.Utils = originalUtils;

      if (originalPako === undefined) {
        delete globalThis.pako;
      } else {
        globalThis.pako = originalPako;
      }
    }
  });
});

test("writePayload 压缩结果为空时抛错", () => {
  withTempCwd(() => {
    const originalEncode = SaveBackupCheat.encodePayloadText;
    SaveBackupCheat.encodePayloadText = () => "";

    try {
      assert.throws(
        () => SaveBackupCheat.writePayload(meta("manual-s1-a"), "{}"),
        /压缩|compress/i,
      );
    } finally {
      SaveBackupCheat.encodePayloadText = originalEncode;
    }
  });
});

test("isPathInsideBackupDir：目录内接受、目录外拒绝", () => {
  withTempCwd(() => {
    SaveBackupCheat.ensureBackupDir();

    assert.equal(
      SaveBackupCheat.isPathInsideBackupDir(
        path.join(backupDir(), "manual-s1-a.rpgsave"),
      ),
      true,
    );
    assert.equal(SaveBackupCheat.isPathInsideBackupDir(backupDir()), true);
    assert.equal(
      SaveBackupCheat.isPathInsideBackupDir(
        path.join(process.cwd(), "..", "evil.json"),
      ),
      false,
    );
    assert.equal(SaveBackupCheat.isPathInsideBackupDir(""), false);
    assert.equal(SaveBackupCheat.isPathInsideBackupDir(null), false);
  });
});
