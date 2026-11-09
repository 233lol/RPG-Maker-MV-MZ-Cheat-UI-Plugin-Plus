import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const cheatRoot = path.join(repoRoot, "cheat-engine", "www", "cheat");

// Files that intentionally do not carry `// @ts-check` yet:
// - vendor bundles / generated version file are excluded for the same reason
//   as in jsconfig.json.
const UNTYPED_ALLOWLIST = new Set([]);

const IGNORED_PREFIXES = ["libs/"];
const IGNORED_FILES = new Set(["version.js"]);

function collectJsFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.endsWith(".js")) {
      files.push(full);
    }
  }

  return files;
}

function relativeToCheat(file) {
  return path.relative(cheatRoot, file).split(path.sep).join("/");
}

test("源码类型覆盖：除 allowlist 外所有运行时 JS 都启用 @ts-check", () => {
  const files = collectJsFiles(cheatRoot);
  const missing = [];
  const staleAllowlist = new Set(UNTYPED_ALLOWLIST);

  for (const file of files) {
    const rel = relativeToCheat(file);

    if (IGNORED_FILES.has(rel)) {
      continue;
    }

    if (IGNORED_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
      continue;
    }

    const source = readFileSync(file, "utf8");
    const typed = /^\s*\/\/\s*@ts-check\b/m.test(source);

    if (UNTYPED_ALLOWLIST.has(rel)) {
      staleAllowlist.delete(rel);

      assert.equal(
        typed,
        false,
        `${rel} 已经启用 @ts-check，请从 type-coverage.test.mjs 的 allowlist 移除`,
      );
      continue;
    }

    if (!typed) {
      missing.push(rel);
    }
  }

  assert.deepEqual(
    missing,
    [],
    `以下文件缺少 // @ts-check：\n${missing.join("\n")}`,
  );
  assert.deepEqual(
    [...staleAllowlist],
    [],
    "allowlist 里的文件已不存在，请更新 type-coverage.test.mjs",
  );
});

test("源码类型覆盖：jsconfig 包含 types/ 下的环境声明", () => {
  const jsconfig = JSON.parse(
    readFileSync(path.join(repoRoot, "jsconfig.json"), "utf8"),
  );

  assert.ok(
    jsconfig.include.includes("types/**/*.d.ts"),
    "jsconfig.json 需要包含 types/**/*.d.ts",
  );
  assert.equal(
    jsconfig.compilerOptions.checkJs,
    false,
    "继续使用逐文件 @ts-check，避免未迁移的面板一次性报错",
  );
});
