import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.require = createRequire(import.meta.url);

const cwd = process.cwd();
const dirs = [];

function withTempGame(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-settings-"));
  dirs.push(dir);
  process.chdir(dir);
  return callback(dir);
}

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function readFile(file) {
  return fs.readFileSync(file, "utf8");
}

test.after(() => {
  process.chdir(cwd);
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("migrateLegacySettings：MZ 旧目录整体迁移到新目录", async () => {
  await withTempGame(async (root) => {
    writeFile(path.join(root, "www", "cheat-settings", "a.json"), "a");
    writeFile(
      path.join(root, "www", "cheat-settings", "nested", "b.json"),
      "b",
    );

    globalThis.Utils = { RPGMAKER_NAME: "MZ" };
    const mod =
      await import("../../cheat-engine/www/cheat/js/SettingsPath.js?mz-rename");

    assert.equal(fs.existsSync(path.join(root, "cheat-settings")), true);
    assert.equal(
      fs.existsSync(path.join(root, "www", "cheat-settings")),
      false,
    );
    assert.equal(readFile(path.join(root, "cheat-settings", "a.json")), "a");
    assert.equal(
      readFile(path.join(root, "cheat-settings", "nested", "b.json")),
      "b",
    );
    // 旧 www/ 里只有 cheat-settings 时会被顺手删掉
    assert.equal(fs.existsSync(path.join(root, "www")), false);
    assert.equal(mod.isMZEngine(), true);
  });
});

test("migrateLegacySettings：新目录已存在时只补缺失文件，不覆盖", async () => {
  await withTempGame(async (root) => {
    writeFile(path.join(root, "www", "cheat-settings", "same.json"), "legacy");
    writeFile(path.join(root, "www", "cheat-settings", "missing.json"), "new");
    writeFile(path.join(root, "cheat-settings", "same.json"), "current");
    writeFile(path.join(root, "www", "keep.txt"), "keep");

    globalThis.Utils = { RPGMAKER_NAME: "MZ" };
    await import("../../cheat-engine/www/cheat/js/SettingsPath.js?mz-merge");

    assert.equal(
      readFile(path.join(root, "cheat-settings", "same.json")),
      "current",
      "迁移不应覆盖新目录里已有的文件",
    );
    assert.equal(
      readFile(path.join(root, "cheat-settings", "missing.json")),
      "new",
    );
    assert.equal(
      fs.existsSync(path.join(root, "www", "cheat-settings")),
      false,
      "迁移完成后旧目录应删除",
    );
    assert.equal(
      readFile(path.join(root, "www", "keep.txt")),
      "keep",
      "www 下还有其它文件时不应删除 www",
    );
  });
});

test("migrateLegacySettings：MV 不执行迁移", async () => {
  await withTempGame(async (root) => {
    writeFile(path.join(root, "www", "cheat-settings", "a.json"), "a");

    globalThis.Utils = { RPGMAKER_NAME: "MV" };
    const mod =
      await import("../../cheat-engine/www/cheat/js/SettingsPath.js?mv-no-migrate");

    assert.equal(mod.isMZEngine(), false);
    assert.equal(
      fs.existsSync(path.join(root, "www", "cheat-settings", "a.json")),
      true,
    );
    assert.equal(fs.existsSync(path.join(root, "cheat-settings")), false);
  });
});

test("migrateLegacySettings：新路径被同名文件占用时跳过并保留旧数据", async () => {
  await withTempGame(async (root) => {
    writeFile(path.join(root, "www", "cheat-settings", "a.json"), "a");
    fs.writeFileSync(path.join(root, "cheat-settings"), "not a directory");

    globalThis.Utils = { RPGMAKER_NAME: "MZ" };
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);

    try {
      const mod =
        await import("../../cheat-engine/www/cheat/js/SettingsPath.js?mz-blocked");

      assert.equal(mod.migrateLegacySettings(), false);
    } finally {
      console.warn = originalWarn;
    }

    assert.ok(warnings.length >= 1);
    assert.equal(
      fs.existsSync(path.join(root, "www", "cheat-settings", "a.json")),
      true,
      "迁移失败时旧目录必须保留",
    );
  });
});
