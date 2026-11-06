import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

// The cheat sources run in nw.js, where `require` is a global. Expose the ESM
// equivalent so the same code can be exercised under `node --test`.
globalThis.require = createRequire(import.meta.url);

const { writeJsonAtomic, writeTextAtomic } =
  await import("../../cheat-engine/www/cheat/js/AtomicFile.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cheat-atomic-"));
}

test("writeTextAtomic：自动建目录并写入 UTF-8 文本", () => {
  const dir = tempDir();
  const file = path.join(dir, "nested", "a.txt");

  try {
    writeTextAtomic(file, "你好\nworld");

    assert.equal(fs.readFileSync(file, "utf8"), "你好\nworld");
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["a.txt"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeJsonAtomic：序列化并保留缩进", () => {
  const dir = tempDir();
  const file = path.join(dir, "data.json");

  try {
    writeJsonAtomic(file, { a: 1, b: [2, 3] });

    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
      a: 1,
      b: [2, 3],
    });
    assert.match(fs.readFileSync(file, "utf8"), /\n {2}"a": 1/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeTextAtomic：写入失败时清理临时文件并抛错", () => {
  const dir = tempDir();
  const blocker = path.join(dir, "blocker");

  try {
    // 让目标路径的「父目录」是一个普通文件，mkdir / 写入必然失败。
    fs.writeFileSync(blocker, "not a directory");

    const target = path.join(blocker, "a.txt");

    assert.throws(() => writeTextAtomic(target, "x"));
    assert.deepEqual(fs.readdirSync(dir), ["blocker"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeTextAtomic：清理一天前的同前缀临时文件，保留新文件", () => {
  const dir = tempDir();
  const target = path.join(dir, "data.json");
  const oldTemp = `${target}.111.old.tmp`;
  const newTemp = `${target}.222.new.tmp`;
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    fs.writeFileSync(oldTemp, "old");
    fs.writeFileSync(newTemp, "new");
    fs.utimesSync(oldTemp, (now - 2 * day) / 1000, (now - 2 * day) / 1000);
    fs.utimesSync(newTemp, now / 1000, now / 1000);

    writeTextAtomic(target, "ok");

    assert.equal(fs.readFileSync(target, "utf8"), "ok");
    assert.equal(fs.existsSync(oldTemp), false);
    assert.equal(fs.existsSync(newTemp), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
