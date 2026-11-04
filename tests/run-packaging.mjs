// 只运行压缩包结构测试：不启动游戏、不需要 nwjs-sdk，
// 适合放进 CI（在 `make` 生成 vendor 文件之后执行）。
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRunner } from "./lib/runner.mjs";
import { registerPackaging } from "./specs/packaging.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const runner = createRunner("Packaging");

registerPackaging({ test: runner.test, repoRoot });

const result = await runner.run();

if (result.failed > 0) {
  process.exitCode = 1;
}
