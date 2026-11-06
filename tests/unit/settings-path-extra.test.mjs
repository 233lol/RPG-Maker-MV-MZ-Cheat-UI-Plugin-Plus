import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// SettingsPath 在 nw.js 里用全局 require 拿 fs/path，Node 测试里补一个等价的。
globalThis.require = createRequire(import.meta.url);

import * as mod from "../../cheat-engine/www/cheat/js/SettingsPath.js";

const originalCwd = process.cwd();
const dirs = [];

function withTempGame() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-settings-extra-"));
  dirs.push(dir);
  process.chdir(dir);
  return dir;
}

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function restoreGlobals() {
  delete globalThis.Utils;
  delete globalThis.DataManager;
  delete globalThis.nw;
}

after(() => {
  process.chdir(originalCwd);
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

afterEach(() => {
  restoreGlobals();
  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd);
  }
});

test("SettingsPath：没有 require（浏览器环境）时迁移直接跳过", () => {
  withTempGame();
  globalThis.Utils = { RPGMAKER_NAME: "MZ" };

  const originalRequire = globalThis.require;
  delete globalThis.require;

  try {
    assert.equal(mod.migrateLegacySettings(), false);
  } finally {
    if (originalRequire !== undefined) {
      globalThis.require = originalRequire;
    }
  }
});

test("SettingsPath：旧目录不存在时不创建新目录", () => {
  const root = withTempGame();
  globalThis.Utils = { RPGMAKER_NAME: "MZ" };

  assert.equal(mod.migrateLegacySettings(), false);
  assert.equal(fs.existsSync(path.join(root, "cheat-settings")), false);
});

test("SettingsPath：rename 失败时退化为复制，并清理旧目录", () => {
  const root = withTempGame();
  writeFile(path.join(root, "www", "cheat-settings", "a.json"), "a");
  writeFile(path.join(root, "www", "cheat-settings", "nested", "b.json"), "b");

  globalThis.Utils = { RPGMAKER_NAME: "MZ" };

  const originalRenameSync = fs.renameSync;
  fs.renameSync = () => {
    throw new Error("EXDEV: cross-device link not permitted");
  };

  try {
    assert.equal(mod.migrateLegacySettings(), true);
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(
    fs.readFileSync(path.join(root, "cheat-settings", "a.json"), "utf8"),
    "a",
  );
  assert.equal(
    fs.readFileSync(
      path.join(root, "cheat-settings", "nested", "b.json"),
      "utf8",
    ),
    "b",
  );
  assert.equal(fs.existsSync(path.join(root, "www", "cheat-settings")), false);
});

test("SettingsPath：迁移过程抛错时吞掉异常并只打警告", () => {
  const root = withTempGame();
  writeFile(path.join(root, "www", "cheat-settings", "a.json"), "a");
  globalThis.Utils = { RPGMAKER_NAME: "MZ" };

  const originalExistsSync = fs.existsSync;
  const originalWarn = console.warn;
  const warnings = [];

  console.warn = (...args) => warnings.push(args);
  fs.existsSync = () => {
    throw new Error("disk unavailable");
  };

  try {
    assert.equal(mod.migrateLegacySettings(), false);
  } finally {
    fs.existsSync = originalExistsSync;
    console.warn = originalWarn;
  }

  assert.ok(
    warnings.some((args) =>
      String(args[0]).includes("迁移旧版 cheat-settings 失败"),
    ),
    "迁移失败应留下一条可追溯的警告",
  );
});

test("SettingsPath.getAppRoot：cwd 为空或抛错时退回当前目录标记 .", () => {
  restoreGlobals();
  globalThis.Utils = { RPGMAKER_NAME: "MV" };

  const originalCwdFn = process.cwd;

  try {
    process.cwd = () => "";
    assert.equal(mod.getAppRoot(), ".");
    assert.equal(mod.getCheatSettingsDir(), "./www/cheat-settings");

    process.cwd = () => {
      throw new Error("cwd unavailable");
    };
    assert.equal(mod.getAppRoot(), ".");
    assert.equal(mod.getCheatSettingsDir(), "./www/cheat-settings");
  } finally {
    process.cwd = originalCwdFn;
  }
});
