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

function assertPackagedPath(files, archivePath, label) {
  assert.ok(
    files[archivePath],
    `${label} 引用的 ${archivePath} 不在压缩包里`,
  );
}

function extractQuotedStrings(source) {
  return [...source.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
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

    // MV 的 main.js 通过 PluginManager.loadScript("../../cheat/...") 加载入口，
    // 路径基准是 www/js/plugins/，必须解析到压缩包里的 www/cheat/...
    const mainText = files["www/js/main.js"].toString("utf8");
    const loadScriptMatch = mainText.match(
      /PluginManager\.loadScript\(\s*["']([^"']+)["']\s*\)/,
    );
    assert.ok(loadScriptMatch, "MV main.js 没有 PluginManager.loadScript 入口");

    const entryPath = path.posix.normalize(
      `www/js/plugins/${loadScriptMatch[1]}`,
    );
    assertPackagedPath(files, entryPath, "MV main.js");
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

    // MZ 的 scriptUrls 相对 index.html（压缩包根目录）解析，逐项校验，
    // 避免出现 ../../cheat/... 这种在 nw.js 虚拟根目录下“碰巧能跑”、
    // 但浏览器部署会失效的路径。
    const mainText = files["js/main.js"].toString("utf8");
    const scriptUrlsMatch = mainText.match(
      /const\s+scriptUrls\s*=\s*\[([\s\S]*?)\];/,
    );
    assert.ok(scriptUrlsMatch, "MZ main.js 没有 scriptUrls");

    const scriptUrls = extractQuotedStrings(scriptUrlsMatch[1]);

    assert.ok(
      scriptUrls.includes("cheat/init/import.js"),
      "MZ main.js 没有入口 cheat/init/import.js",
    );

    for (const url of scriptUrls) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        continue; // 绝对 URL，例如 http(s) / data
      }

      const normalized = path.posix.normalize(url);

      assert.ok(
        !normalized.startsWith("..") && !path.posix.isAbsolute(normalized),
        `MZ scriptUrls ${url} 解析到了压缩包外部: ${normalized}`,
      );

      // 游戏自己的 js/libs/* 不在作弊包里；只校验作弊入口必须存在。
      if (normalized.startsWith("cheat/")) {
        assertPackagedPath(files, normalized, `MZ scriptUrls ${url}`);
      }
    }
  });
}
