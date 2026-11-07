import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SaveBackupCodec } from "../../cheat-engine/www/cheat/js/save-backup/codec.js";

const originalCwd = process.cwd();
const originalRequire = globalThis.require;
const tempDirs = [];

function resetCodec() {
  SaveBackupCodec.lzStringCache = undefined;
  SaveBackupCodec.pakoCache = undefined;
  delete globalThis.LZString;
  delete globalThis.pako;
  globalThis.require = originalRequire;
}

function makeFakeLZString(prefix = "LZ:") {
  return {
    compressToBase64(text) {
      return prefix + Buffer.from(String(text), "utf8").toString("base64");
    },
    decompressFromBase64(raw) {
      if (typeof raw !== "string" || !raw.startsWith(prefix)) {
        return null;
      }
      return Buffer.from(raw.slice(prefix.length), "base64").toString("utf8");
    },
  };
}

function makeFakePako(prefix = "PAKO:") {
  return {
    deflate(text) {
      return prefix + Buffer.from(String(text), "utf8").toString("base64");
    },
    inflate(raw) {
      if (typeof raw !== "string" || !raw.startsWith(prefix)) {
        throw new Error("not pako");
      }
      return Buffer.from(raw.slice(prefix.length), "base64").toString("utf8");
    },
  };
}

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-codec-"));
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

function captureWarnings() {
  const original = console.warn;
  const warnings = [];

  console.warn = (...args) => warnings.push(args);

  return {
    warnings,
    restore() {
      console.warn = original;
    },
  };
}

afterEach(() => {
  resetCodec();
});

test.after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("getLZString / getPako：优先使用全局对象并缓存结果", () => {
  resetCodec();

  const lz = makeFakeLZString();
  const pako = makeFakePako();

  globalThis.LZString = lz;
  globalThis.pako = pako;

  assert.equal(SaveBackupCodec.getLZString(), lz);
  assert.equal(SaveBackupCodec.getPako(), pako);

  // 缓存后即使全局被替换也继续返回首次解析到的对象
  globalThis.LZString = makeFakeLZString("OTHER:");
  globalThis.pako = makeFakePako("OTHER:");

  assert.equal(SaveBackupCodec.getLZString(), lz);
  assert.equal(SaveBackupCodec.getPako(), pako);
});

test("encodePayloadText：pako / lzstring / base64 三种编码", () => {
  resetCodec();

  globalThis.LZString = makeFakeLZString();
  globalThis.pako = makeFakePako();

  assert.equal(
    SaveBackupCodec.encodePayloadText('{"a":1}', "pako"),
    "PAKO:eyJhIjoxfQ==",
  );
  assert.equal(
    SaveBackupCodec.encodePayloadText('{"a":1}', "lzstring"),
    "LZ:eyJhIjoxfQ==",
  );

  const base64 = SaveBackupCodec.encodePayloadText("你好", "base64");
  assert.equal(Buffer.from(base64, "base64").toString("utf8"), "你好");
});

test("decodePayloadText：明文 JSON 直接返回", () => {
  resetCodec();

  assert.equal(SaveBackupCodec.decodePayloadText('{"a":1}'), '{"a":1}');
  assert.equal(SaveBackupCodec.decodePayloadText("  [1,2]"), "  [1,2]");
  assert.equal(SaveBackupCodec.decodePayloadText(null), null);
  assert.equal(SaveBackupCodec.decodePayloadText(""), null);
});

test("decodePayloadText：按 codec 解 pako / lzstring", () => {
  resetCodec();

  globalThis.LZString = makeFakeLZString();
  globalThis.pako = makeFakePako();

  assert.equal(
    SaveBackupCodec.decodePayloadText("PAKO:eyJhIjoxfQ==", "pako"),
    '{"a":1}',
  );
  assert.equal(
    SaveBackupCodec.decodePayloadText("LZ:eyJhIjoxfQ==", "lzstring"),
    '{"a":1}',
  );
});

test("decodePayloadText：未指定 codec 时依次尝试 pako 与 LZString", () => {
  resetCodec();

  globalThis.pako = {
    inflate() {
      throw new Error("not pako");
    },
  };
  globalThis.LZString = makeFakeLZString();

  assert.equal(SaveBackupCodec.decodePayloadText("LZ:eyJhIjoxfQ=="), '{"a":1}');
});

test("decodePayloadText：最后回退到 UTF-8 安全的 base64", () => {
  resetCodec();

  const base64 = Buffer.from('{"name":"中文"}', "utf8").toString("base64");

  assert.equal(
    SaveBackupCodec.decodePayloadText(base64, "base64"),
    '{"name":"中文"}',
  );
});

test("decodePayloadText：无法识别的内容返回 null 并记录警告", () => {
  resetCodec();

  const warnings = captureWarnings();

  try {
    assert.equal(
      SaveBackupCodec.decodePayloadText("not-a-valid-payload"),
      null,
    );
    assert.ok(warnings.warnings.length >= 1);
  } finally {
    warnings.restore();
  }
});

test("encodePayloadText：缺少压缩库时返回 null 并警告", () => {
  resetCodec();

  const warnings = captureWarnings();

  try {
    withTempCwd(() => {
      assert.equal(SaveBackupCodec.encodePayloadText("{}", "pako"), null);
      assert.equal(SaveBackupCodec.encodePayloadText("{}", "lzstring"), null);
    });

    assert.ok(warnings.warnings.length >= 2);
  } finally {
    warnings.restore();
  }
});

test("encodeSaveText / decodeSaveText：兼容旧调用，自动探测编码", () => {
  resetCodec();

  globalThis.LZString = makeFakeLZString();
  SaveBackupCodec.lzStringCache = undefined;

  const originalGetSnapshotCodec = SaveBackupCodec.getSnapshotCodec;
  SaveBackupCodec.getSnapshotCodec = () => "lzstring";

  try {
    const encoded = SaveBackupCodec.encodeSaveText('{"a":1}');
    assert.equal(encoded, "LZ:eyJhIjoxfQ==");
    assert.equal(SaveBackupCodec.decodeSaveText(encoded), '{"a":1}');
  } finally {
    if (originalGetSnapshotCodec) {
      SaveBackupCodec.getSnapshotCodec = originalGetSnapshotCodec;
    } else {
      delete SaveBackupCodec.getSnapshotCodec;
    }
  }
});

test("resolveLZString / resolvePako：nw.js 下按游戏目录加载 CommonJS 模块", () => {
  resetCodec();

  withTempCwd((dir) => {
    const libs = path.join(dir, "js", "libs");
    fs.mkdirSync(libs, { recursive: true });
    fs.writeFileSync(
      path.join(libs, "lz-string.js"),
      "module.exports = { compressToBase64: (t) => 'LZ:' + t, decompressFromBase64: (t) => t.slice(3) };",
    );
    fs.writeFileSync(
      path.join(libs, "pako.min.js"),
      "module.exports = { deflate: (t) => 'PAKO:' + t, inflate: (t) => t.slice(5) };",
    );

    globalThis.require = createRequire(path.join(dir, "entry.js"));

    const lz = SaveBackupCodec.getLZString();
    const pako = SaveBackupCodec.getPako();

    assert.equal(lz.compressToBase64('{"a":1}'), 'LZ:{"a":1}');
    assert.equal(lz.decompressFromBase64('LZ:{"a":1}'), '{"a":1}');
    assert.equal(pako.deflate('{"a":1}'), 'PAKO:{"a":1}');
    assert.equal(pako.inflate('PAKO:{"a":1}'), '{"a":1}');
  });
});

test("resolvePako / resolveLZString 读取全局对象抛错时降级", () => {
  resetCodec();

  Object.defineProperty(globalThis, "pako", {
    configurable: true,
    get() {
      throw new Error("pako getter broken");
    },
  });
  Object.defineProperty(globalThis, "LZString", {
    configurable: true,
    get() {
      throw new Error("LZString getter broken");
    },
  });

  try {
    assert.equal(SaveBackupCodec.resolvePako(), null);
    assert.equal(SaveBackupCodec.resolveLZString(), null);
  } finally {
    delete globalThis.pako;
    delete globalThis.LZString;
  }
});

test("resolvePako / resolveLZString 在 require 抛错时返回 null", () => {
  resetCodec();
  globalThis.require = () => {
    throw new Error("require unavailable");
  };

  assert.equal(SaveBackupCodec.resolvePako(), null);
  assert.equal(SaveBackupCodec.resolveLZString(), null);
});

test("resolveLZString 回退到相对路径模块", () => {
  resetCodec();
  const fakeLz = makeFakeLZString();

  globalThis.require = (name) => {
    if (name === "fs") {
      return { existsSync: () => false };
    }
    if (name === "path") {
      return { resolve: (...parts) => parts.join("/") };
    }
    if (name.includes("lz-string")) {
      return fakeLz;
    }
    return {};
  };

  assert.equal(SaveBackupCodec.getLZString(), fakeLz);
});

test("decodePayloadText 遇到非字符串解压结果 / 解压抛错时返回 null", () => {
  resetCodec();
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    globalThis.pako = {
      deflate: (text) => text,
      inflate: () => 123,
    };
    SaveBackupCodec.pakoCache = undefined;
    assert.equal(SaveBackupCodec.decodePayloadText("abc", "pako"), null);

    globalThis.LZString = {
      decompressFromBase64() {
        throw new Error("lz broken");
      },
    };
    SaveBackupCodec.lzStringCache = undefined;
    assert.equal(SaveBackupCodec.decodePayloadText("abc", "lzstring"), null);
  } finally {
    console.warn = originalWarn;
  }
});
