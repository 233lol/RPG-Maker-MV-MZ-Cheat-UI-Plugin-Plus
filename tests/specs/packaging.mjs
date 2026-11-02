import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";

function pack(repoRoot, type) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `cheat-pack-${type}-`));
  const zipPath = path.join(tempDir, `${type}.zip`);

  try {
    execFileSync(
      process.execPath,
      [path.join(repoRoot, "tools", "pack.mjs"), type, zipPath],
      { cwd: repoRoot, stdio: "pipe" },
    );

    const entries = unzipSync(readFileSync(zipPath));
    const files = {};

    for (const [name, bytes] of Object.entries(entries)) {
      files[name] = Buffer.from(bytes);
    }

    return files;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function registerPackaging({ test, repoRoot }) {
  test("打包：MV 压缩包结构与初始化 main.js 正确", () => {
    const files = pack(repoRoot, "mv");
    const names = Object.keys(files);

    assert.ok(
      names.every((name) => name.startsWith("www/")),
      "MV 压缩包内所有文件都应位于 www/ 下",
    );
    assert.ok(names.includes("www/cheat/init/import.js"));
    assert.ok(names.includes("www/js/main.js"));
    assert.ok(names.includes("www/cheat/libs/vue.js"));
    assert.ok(names.includes("www/cheat/libs/vuetify.js"));
    assert.ok(names.includes("www/cheat/libs/shiki.bundle.mjs"));
    assert.ok(names.includes("www/cheat/css/vuetify.css"));
    assert.ok(
      names.includes("www/cheat/fonts/materialdesignicons-webfont.woff2"),
    );
    assert.ok(
      !names.some((name) => name.endsWith(".gitkeep")),
      "压缩包里不应包含 .gitkeep",
    );

    const expectedMain = readFileSync(
      path.join(
        repoRoot,
        "cheat-engine",
        "www",
        "_cheat_initialize",
        "mv",
        "js",
        "main.js",
      ),
    );

    assert.deepEqual(files["www/js/main.js"], expectedMain);
  });

  test("打包：MZ 压缩包结构与初始化 main.js 正确", () => {
    const files = pack(repoRoot, "mz");
    const names = Object.keys(files);

    assert.ok(
      names.every((name) => !name.startsWith("www/")),
      "MZ 压缩包不应有 www/ 前缀",
    );
    assert.ok(names.includes("cheat/init/import.js"));
    assert.ok(names.includes("js/main.js"));
    assert.ok(names.includes("cheat/libs/vue.js"));
    assert.ok(names.includes("cheat/libs/vuetify.js"));
    assert.ok(names.includes("cheat/libs/shiki.bundle.mjs"));
    assert.ok(names.includes("cheat/css/vuetify.css"));
    assert.ok(names.includes("cheat/fonts/materialdesignicons-webfont.woff2"));
    assert.ok(
      !names.some((name) => name.endsWith(".gitkeep")),
      "压缩包里不应包含 .gitkeep",
    );

    const expectedMain = readFileSync(
      path.join(
        repoRoot,
        "cheat-engine",
        "www",
        "_cheat_initialize",
        "mz",
        "js",
        "main.js",
      ),
    );

    assert.deepEqual(files["js/main.js"], expectedMain);
  });
}
