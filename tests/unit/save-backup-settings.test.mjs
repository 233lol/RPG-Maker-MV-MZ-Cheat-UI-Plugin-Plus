import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SaveBackupCheat } from "../../cheat-engine/www/cheat/js/SaveBackupHelper.js";

globalThis.require = createRequire(import.meta.url);

const tempDirs = [];
const originalGetSettingsPath = SaveBackupCheat.getSettingsPath;

function makeSettingsFile(contents = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-backup-settings-"));
  const file = path.join(dir, "config.json");
  tempDirs.push(dir);

  if (contents !== null) {
    fs.writeFileSync(file, contents, "utf8");
  }

  SaveBackupCheat.getSettingsPath = () => file;
  return file;
}

afterEach(() => {
  SaveBackupCheat.getSettingsPath = originalGetSettingsPath;
  delete globalThis.$gameSystem;
  delete globalThis.DataManager;
  delete globalThis.SaveBackupSettingsTest;

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("getDefaultSettings：自动快照默认关闭", () => {
  assert.deepEqual(SaveBackupCheat.getDefaultSettings(), {
    autoOnSave: false,
    autoSaveInterval: 1,
    autoKeep: 5,
  });
});

test("getSettings：文件缺失 / 损坏 / 非对象时使用默认值", () => {
  makeSettingsFile();
  assert.deepEqual(SaveBackupCheat.getSettings(), {
    autoOnSave: false,
    autoSaveInterval: 1,
    autoKeep: 5,
  });

  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    makeSettingsFile("{bad");
    assert.deepEqual(SaveBackupCheat.getSettings(), {
      autoOnSave: false,
      autoSaveInterval: 1,
      autoKeep: 5,
    });

    makeSettingsFile("[]");
    assert.deepEqual(SaveBackupCheat.getSettings(), {
      autoOnSave: false,
      autoSaveInterval: 1,
      autoKeep: 5,
    });
  } finally {
    console.warn = originalWarn;
  }
});

test("getSettings：字段类型与范围收敛", () => {
  makeSettingsFile(
    JSON.stringify({
      autoOnSave: "yes",
      autoSaveInterval: 100,
      autoKeep: "3",
    }),
  );

  assert.deepEqual(SaveBackupCheat.getSettings(), {
    autoOnSave: false,
    autoSaveInterval: 100,
    autoKeep: 3,
  });

  makeSettingsFile(
    JSON.stringify({
      autoOnSave: true,
      autoSaveInterval: 0,
      autoKeep: 101,
    }),
  );

  assert.deepEqual(SaveBackupCheat.getSettings(), {
    autoOnSave: true,
    autoSaveInterval: 1,
    autoKeep: 5,
  });

  makeSettingsFile(
    JSON.stringify({
      autoSaveInterval: 1.5,
      autoKeep: Number.NaN,
    }),
  );

  assert.deepEqual(SaveBackupCheat.getSettings(), {
    autoOnSave: false,
    autoSaveInterval: 1,
    autoKeep: 5,
  });
});

test("writeSettings：合并补丁并原子写入", () => {
  const file = makeSettingsFile();

  const next = SaveBackupCheat.writeSettings({ autoOnSave: true });

  assert.deepEqual(next, {
    autoOnSave: true,
    autoSaveInterval: 1,
    autoKeep: 5,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), next);

  SaveBackupCheat.writeSettings({ autoKeep: 2 });
  assert.deepEqual(SaveBackupCheat.getSettings(), {
    autoOnSave: true,
    autoSaveInterval: 1,
    autoKeep: 2,
  });
});

test("isAutoOnSaveEnabled / getSaveCount：读取引擎状态", () => {
  makeSettingsFile(JSON.stringify({ autoOnSave: true }));

  assert.equal(SaveBackupCheat.isAutoOnSaveEnabled(), true);

  assert.equal(SaveBackupCheat.getSaveCount(), 0);

  globalThis.$gameSystem = { _saveCount: 7 };
  assert.equal(SaveBackupCheat.getSaveCount(), 7);

  globalThis.$gameSystem = { _saveCount: "8" };
  assert.equal(SaveBackupCheat.getSaveCount(), 8);

  globalThis.$gameSystem = { _saveCount: "bad" };
  assert.equal(SaveBackupCheat.getSaveCount(), 0);

  globalThis.$gameSystem = {
    get _saveCount() {
      throw new Error("boom");
    },
  };
  assert.equal(SaveBackupCheat.getSaveCount(), 0);
});

test("markAutoSnapshot：只记录正整数槽位", () => {
  const marker = SaveBackupCheat.getAutoSnapshotMarker();
  marker.clear();

  SaveBackupCheat.markAutoSnapshot(1, 3);
  SaveBackupCheat.markAutoSnapshot("2", "4");
  SaveBackupCheat.markAutoSnapshot(0, 5);
  SaveBackupCheat.markAutoSnapshot(-1, 6);
  SaveBackupCheat.markAutoSnapshot(1.5, 7);
  SaveBackupCheat.markAutoSnapshot("x", 8);

  assert.deepEqual(
    [...marker.entries()],
    [
      [1, 3],
      [2, 4],
    ],
  );
});

test("onGameSave：关闭 / 非法槽位 / 节流 / 去重", () => {
  makeSettingsFile(JSON.stringify({ autoOnSave: false }));

  const created = [];
  const originalCreateSnapshot = SaveBackupCheat.createSnapshot;
  SaveBackupCheat.createSnapshot = (slot, kind, label) => {
    const meta = { id: `${kind}-${slot}-${created.length}`, slot, kind, label };
    created.push(meta);
    return meta;
  };

  const marker = SaveBackupCheat.getAutoSnapshotMarker();
  marker.clear();

  try {
    assert.equal(SaveBackupCheat.onGameSave(1), null, "开关关闭时不应留档");
    assert.equal(SaveBackupCheat.onGameSave(0), null);
    assert.equal(SaveBackupCheat.onGameSave("x"), null);

    SaveBackupCheat.writeSettings({
      autoOnSave: true,
      autoSaveInterval: 2,
      autoKeep: 5,
    });

    globalThis.$gameSystem = { _saveCount: 3 };
    assert.equal(SaveBackupCheat.onGameSave(1), null, "非整数倍存档应跳过");

    globalThis.$gameSystem = { _saveCount: 4 };
    const first = SaveBackupCheat.onGameSave(1);
    assert.ok(first);
    assert.equal(created.length, 1);

    assert.equal(SaveBackupCheat.onGameSave(1), null, "同一次存档不应重复留档");
    assert.equal(created.length, 1);

    globalThis.$gameSystem = { _saveCount: 6 };
    assert.ok(SaveBackupCheat.onGameSave(1));
    assert.equal(created.length, 2);

    // _saveCount 为 0 时无法去重，但也不应报错
    globalThis.$gameSystem = { _saveCount: 0 };
    assert.ok(SaveBackupCheat.onGameSave(2));
    assert.ok(SaveBackupCheat.onGameSave(2));
    assert.equal(created.length, 4);
  } finally {
    SaveBackupCheat.createSnapshot = originalCreateSnapshot;
    marker.clear();
  }
});

test("onGameSave：快照失败只警告，不影响存档流程", () => {
  makeSettingsFile(
    JSON.stringify({ autoOnSave: true, autoSaveInterval: 1, autoKeep: 5 }),
  );

  const originalCreateSnapshot = SaveBackupCheat.createSnapshot;
  const originalWarn = console.warn;
  const warnings = [];

  SaveBackupCheat.createSnapshot = () => {
    throw new Error("snapshot failed");
  };
  console.warn = (...args) => warnings.push(args);
  globalThis.$gameSystem = { _saveCount: 1 };

  try {
    assert.equal(SaveBackupCheat.onGameSave(1), null);
    assert.equal(warnings.length, 1);
  } finally {
    SaveBackupCheat.createSnapshot = originalCreateSnapshot;
    console.warn = originalWarn;
  }
});

test("installAutoSnapshotResetHooks：新游戏 / 读档后清空去重标记", () => {
  const calls = [];

  globalThis.DataManager = {
    setupNewGame() {
      calls.push("new");
    },
    extractSaveContents() {
      calls.push("load");
    },
  };

  const marker = SaveBackupCheat.getAutoSnapshotMarker();
  marker.clear();

  try {
    assert.equal(SaveBackupCheat.installAutoSnapshotResetHooks(), true);

    marker.set(1, 3);
    globalThis.DataManager.setupNewGame();
    assert.equal(marker.size, 0);

    marker.set(2, 4);
    globalThis.DataManager.extractSaveContents();
    assert.equal(marker.size, 0);
    assert.deepEqual(calls, ["new", "load"]);

    // 幂等：重复安装不会叠加包装
    SaveBackupCheat.installAutoSnapshotResetHooks();
    marker.set(1, 3);
    globalThis.DataManager.setupNewGame();
    assert.deepEqual(calls, ["new", "load", "new"]);
    assert.equal(marker.size, 0);
  } finally {
    marker.clear();
  }
});

test("installSaveHook：MV 同步结果与失败结果", () => {
  const originalOnGameSave = SaveBackupCheat.onGameSave;
  const originalSaveHookInstalled = SaveBackupCheat.saveHookInstalled;
  const originalSaveHookOriginal = SaveBackupCheat.saveHookOriginal;
  const calls = [];

  SaveBackupCheat.onGameSave = (slot) => calls.push(slot);
  SaveBackupCheat.saveHookInstalled = false;

  try {
    globalThis.DataManager = {
      saveGame() {
        return true;
      },
    };

    assert.equal(SaveBackupCheat.installSaveHook(), true);
    assert.equal(SaveBackupCheat.installSaveHook(), false, "只应包装一次");

    assert.equal(globalThis.DataManager.saveGame(1), true);
    assert.deepEqual(calls, [1]);

    globalThis.DataManager.saveGame = function () {
      return false;
    };
    // 已安装的包装器仍指向原来的 saveGame，这里直接替换模拟失败场景
    SaveBackupCheat.saveHookInstalled = false;
    SaveBackupCheat.saveHookOriginal = undefined;
    SaveBackupCheat.installSaveHook();

    assert.equal(globalThis.DataManager.saveGame(2), false);
    assert.deepEqual(calls, [1], "MV 返回 false 时不应留档");
  } finally {
    SaveBackupCheat.onGameSave = originalOnGameSave;
    SaveBackupCheat.saveHookInstalled = originalSaveHookInstalled;
    SaveBackupCheat.saveHookOriginal = originalSaveHookOriginal;
  }
});

test("installSaveHook：MZ Promise 完成后才留档，失败则跳过", async () => {
  const originalOnGameSave = SaveBackupCheat.onGameSave;
  const originalSaveHookInstalled = SaveBackupCheat.saveHookInstalled;
  const originalSaveHookOriginal = SaveBackupCheat.saveHookOriginal;
  const calls = [];

  SaveBackupCheat.onGameSave = (slot) => calls.push(slot);
  SaveBackupCheat.saveHookInstalled = false;

  try {
    globalThis.DataManager = {
      saveGame() {
        return Promise.resolve(true);
      },
    };

    SaveBackupCheat.installSaveHook();
    await globalThis.DataManager.saveGame(3);

    assert.deepEqual(calls, [3]);

    SaveBackupCheat.saveHookInstalled = false;
    SaveBackupCheat.saveHookOriginal = undefined;
    globalThis.DataManager.saveGame = () => Promise.reject(new Error("disk"));

    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      await assert.rejects(globalThis.DataManager.saveGame(4), /disk/);
    } finally {
      console.warn = originalWarn;
    }

    assert.deepEqual(calls, [3], "MZ 存档失败时不应留档");
  } finally {
    SaveBackupCheat.onGameSave = originalOnGameSave;
    SaveBackupCheat.saveHookInstalled = originalSaveHookInstalled;
    SaveBackupCheat.saveHookOriginal = originalSaveHookOriginal;
  }
});

test("getSettings / writeSettings non-local mode fallback and reject", () => {
  const originalIsLocalMode = SaveBackupCheat.isLocalMode;
  SaveBackupCheat.isLocalMode = () => false;

  try {
    assert.deepEqual(SaveBackupCheat.getSettings(), {
      autoOnSave: false,
      autoSaveInterval: 1,
      autoKeep: 5,
    });
    assert.throws(
      () => SaveBackupCheat.writeSettings({ autoKeep: 3 }),
      /nw\.js/i,
    );
  } finally {
    SaveBackupCheat.isLocalMode = originalIsLocalMode;
  }
});

test("installSaveHook skips when DataManager has no saveGame", () => {
  const originalSaveHookInstalled = SaveBackupCheat.saveHookInstalled;
  const originalSaveHookOriginal = SaveBackupCheat.saveHookOriginal;
  SaveBackupCheat.saveHookInstalled = false;

  try {
    assert.equal(SaveBackupCheat.installSaveHook(), false);

    globalThis.DataManager = {};
    assert.equal(SaveBackupCheat.installSaveHook(), false);
    assert.equal(SaveBackupCheat.saveHookInstalled, false);

    globalThis.DataManager = { saveGame: null };
    assert.equal(SaveBackupCheat.installSaveHook(), false);
  } finally {
    SaveBackupCheat.saveHookInstalled = originalSaveHookInstalled;
    SaveBackupCheat.saveHookOriginal = originalSaveHookOriginal;
  }
});

test("installSaveHook warns when then getter throws", () => {
  const originalOnGameSave = SaveBackupCheat.onGameSave;
  const originalSaveHookInstalled = SaveBackupCheat.saveHookInstalled;
  const originalSaveHookOriginal = SaveBackupCheat.saveHookOriginal;

  SaveBackupCheat.onGameSave = () => {};
  SaveBackupCheat.saveHookInstalled = false;
  delete SaveBackupCheat.saveHookOriginal;

  globalThis.DataManager = {
    saveGame() {
      return Object.defineProperty({}, "then", {
        get() {
          throw new Error("then getter broken");
        },
      });
    },
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    assert.equal(SaveBackupCheat.installSaveHook(), true);
    assert.doesNotThrow(() => globalThis.DataManager.saveGame(1));
    assert.equal(warnings.length, 1);
  } finally {
    SaveBackupCheat.onGameSave = originalOnGameSave;
    SaveBackupCheat.saveHookInstalled = originalSaveHookInstalled;
    SaveBackupCheat.saveHookOriginal = originalSaveHookOriginal;
    console.warn = originalWarn;
  }
});
