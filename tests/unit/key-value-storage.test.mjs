import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.require = createRequire(import.meta.url);

function setNwjs(enabled) {
  globalThis.Utils = { isNwjs: () => enabled };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cheat-kv-"));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("KeyValueStorage：读写 JSON 文件并原子落盘", async () => {
  const dir = tempDir();
  const file = path.join(dir, "kv.json");

  try {
    setNwjs(true);

    const { KeyValueStorage } =
      await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");
    const storage = new KeyValueStorage(file);

    assert.equal(storage.getItem("missing"), undefined);

    storage.setItem("a", "1");
    storage.setItem("b", "世界");

    assert.equal(storage.getItem("a"), "1");
    assert.equal(storage.getItem("b"), "世界");
    assert.deepEqual(readJson(file), { a: "1", b: "世界" });
    assert.deepEqual(fs.readdirSync(dir), ["kv.json"]);
  } finally {
    setNwjs(false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("KeyValueStorage：写入前重新读盘合并外部修改", async () => {
  const dir = tempDir();
  const file = path.join(dir, "merge.json");

  try {
    setNwjs(true);

    const { KeyValueStorage } =
      await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");
    const storage = new KeyValueStorage(file);

    storage.setItem("a", "1");

    // 模拟另一个游戏实例 / 外部编辑器写入新 key
    fs.writeFileSync(
      file,
      JSON.stringify({ a: "1", external: "kept" }),
      "utf8",
    );

    storage.setItem("b", "2");

    assert.deepEqual(readJson(file), {
      a: "1",
      external: "kept",
      b: "2",
    });
  } finally {
    setNwjs(false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("KeyValueStorage：缓存不感知外部改动，但写回时不用旧缓存覆盖磁盘", async () => {
  const dir = tempDir();
  const file = path.join(dir, "stale.json");

  try {
    setNwjs(true);

    const { KeyValueStorage } =
      await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");
    const storage = new KeyValueStorage(file);

    storage.setItem("a", "1");
    fs.writeFileSync(file, JSON.stringify({ a: "changed" }), "utf8");

    assert.equal(storage.getItem("a"), "1", "读取应命中模块级缓存");

    storage.setItem("b", "2");

    assert.deepEqual(readJson(file), { a: "changed", b: "2" });
    assert.equal(storage.getItem("a"), "changed");
  } finally {
    setNwjs(false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("KeyValueStorage：损坏 JSON 被隔离为 .corrupt-* 后按空数据继续", async () => {
  const dir = tempDir();
  const file = path.join(dir, "broken.json");

  try {
    setNwjs(true);

    const { KeyValueStorage } =
      await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");

    fs.writeFileSync(file, "{bad json", "utf8");

    const storage = new KeyValueStorage(file);
    const value = storage.getItem("a");

    assert.equal(value, undefined);
    assert.equal(fs.existsSync(file), false);

    const backups = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith("broken.json.corrupt-"));
    assert.equal(backups.length, 1);
    assert.match(fs.readFileSync(path.join(dir, backups[0]), "utf8"), /bad/);

    storage.setItem("a", "1");
    assert.deepEqual(readJson(file), { a: "1" });
  } finally {
    setNwjs(false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("KeyValueStorage：顶层不是对象时同样隔离", async () => {
  const dir = tempDir();
  const file = path.join(dir, "array.json");

  try {
    setNwjs(true);

    const { KeyValueStorage } =
      await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");

    fs.writeFileSync(file, "[]", "utf8");

    const storage = new KeyValueStorage(file);
    assert.equal(storage.getItem("a"), undefined);

    assert.equal(
      fs
        .readdirSync(dir)
        .some((name) => name.startsWith("array.json.corrupt-")),
      true,
    );
  } finally {
    setNwjs(false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("KeyValueStorage：非 nw.js 时按文件路径隔离 localStorage key", async () => {
  const store = new Map();
  let warned = false;

  globalThis.window = {};
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };

  try {
    setNwjs(false);

    const { KeyValueStorage } =
      await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");
    const first = new KeyValueStorage("/game/a.json");
    const second = new KeyValueStorage("/game/b.json");

    first.setItem("data", "A");
    second.setItem("data", "B");

    assert.equal(store.get("/game/a.json:data"), "A");
    assert.equal(store.get("/game/b.json:data"), "B");
    assert.equal(first.getItem("data"), "A");
    assert.equal(second.getItem("data"), "B");

    store.set("legacy", "old");
    const originalWarn = console.warn;
    console.warn = () => {
      warned = true;
    };

    try {
      assert.equal(first.getItem("legacy"), null);
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warned, true, "读取旧版未隔离 key 时应提示");
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    setNwjs(false);
  }
});

test("KeyValueStorage：构造后才进入 nw.js 环境也能补上 fs", async () => {
  const dir = tempDir();
  const file = path.join(dir, "late.json");

  try {
    setNwjs(false);

    const { KeyValueStorage } =
      await import("../../cheat-engine/www/cheat/js/KeyValueStorage.js");
    const storage = new KeyValueStorage(file);

    assert.equal(storage.fileSystem, undefined);

    setNwjs(true);
    storage.setItem("a", "1");

    assert.deepEqual(readJson(file), { a: "1" });
  } finally {
    setNwjs(false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
