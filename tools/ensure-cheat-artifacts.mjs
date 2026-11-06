// 单元测试和 tsc 会 import 一些构建期生成的文件（vue.js / version.js 等）。
// 新克隆仓库或执行 `make clean` 后这些 gitignore 的文件不存在，直接跑
// `pnpm test:unit` / `pnpm typecheck` 会 ERR_MODULE_NOT_FOUND。
//
// 这里只补齐缺失的文件；已经存在的文件（包括 `make dev` 生成的开发构建）
// 保持不动，避免把调试用的 dev 版本悄悄换成生产版本。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getHash() {
  try {
    return (
      execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim() || "unknown"
    );
  } catch (error) {
    return "unknown";
  }
}

function run(script, args = []) {
  execFileSync(process.execPath, [path.join(root, "tools", script), ...args], {
    cwd: root,
    stdio: "inherit",
  });
}

const artifacts = [
  {
    files: ["cheat-engine/www/cheat/version.js"],
    script: "gen-version.mjs",
    args: [getHash()],
  },
  {
    files: ["cheat-engine/www/cheat/libs/vue.js"],
    script: "copy-vue.mjs",
  },
  {
    files: ["cheat-engine/www/cheat/libs/vuetify.js"],
    script: "build-vuetify.mjs",
  },
  {
    files: ["cheat-engine/www/cheat/libs/shiki.bundle.mjs"],
    script: "build-shiki.mjs",
  },
  {
    files: [
      "cheat-engine/www/cheat/css/vuetify.css",
      "cheat-engine/www/cheat/css/materialdesignicons.css",
      "cheat-engine/www/cheat/fonts/materialdesignicons-webfont.woff2",
    ],
    script: "copy-vendor-assets.mjs",
  },
];

for (const { files, script, args = [] } of artifacts) {
  const missing = files.filter(
    (relativePath) => !existsSync(path.join(root, relativePath)),
  );

  if (missing.length === 0) {
    continue;
  }

  console.log(`[ensure-artifacts] 缺少 ${missing.join(", ")}，正在生成...`);
  mkdirSync(path.dirname(path.join(root, files[0])), { recursive: true });
  run(script, args);
}
