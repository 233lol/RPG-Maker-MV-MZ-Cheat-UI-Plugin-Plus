import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NwGame,
  backupCheatSettings,
  backupSaveGlobals,
  detectGameType,
  installCheat,
  resolveNwExecutable,
} from "./lib/nw.mjs";
import { createRunner } from "./lib/runner.mjs";
import { installTestApi } from "./specs/helpers.mjs";
import { registerCore } from "./specs/core.mjs";
import { registerGameplay } from "./specs/gameplay.mjs";
import { registerSaveBackup } from "./specs/save-backup.mjs";
import { registerPackaging } from "./specs/packaging.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    mode: "all",
    skipPackaging: false,
    nwPath: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "mv" || arg === "mz" || arg === "all") {
      args.mode = arg;
    } else if (arg === "--skip-packaging") {
      args.skipPackaging = true;
    } else if (arg === "--nw") {
      args.nwPath = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`用法: node tests/run.mjs [mv|mz|all] [选项]

选项:
  --skip-packaging   不运行压缩包结构测试
  --nw <path>        指定 nw.js 可执行文件（默认自动查找 nwjs-sdk）
  --help             显示帮助

环境变量:
  NWJS_PATH          nw.js 可执行文件路径（与 --nw 等价）
  NW_TEST_GPU=1      使用真实 GPU（默认使用 SwiftShader 软件 WebGL）
  NWJS_ARGS          额外传给 nw.js 的参数
  NW_TEST_KEEP_PROFILE=1  测试结束后保留临时用户目录`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nwPath = args.nwPath || resolveNwExecutable();

  console.log(`nw.js: ${nwPath}`);

  const gameDirs = [];

  for (const type of ["mv", "mz"]) {
    if (args.mode !== "all" && args.mode !== type) continue;

    const gameDir = path.join(repoRoot, type);

    try {
      const detected = detectGameType(gameDir);
      if (detected !== type) {
        throw new Error(`目录 ${type} 实际检测为 ${detected}`);
      }
      gameDirs.push({ type, gameDir });
    } catch (error) {
      console.error(
        `跳过 ${type}: ${error.message}\n` +
          `请把用于测试的游戏放到 ${gameDir}（MV 需要 www/index.html，MZ 需要 index.html）`,
      );
    }
  }

  if (gameDirs.length === 0) {
    console.error("没有可测试的游戏目录。");
    process.exit(1);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const { type, gameDir } of gameDirs) {
    console.log(`\n准备测试 ${type.toUpperCase()}: ${gameDir}`);

    installCheat(repoRoot, gameDir, type);
    const settingsBackup = backupCheatSettings(gameDir, type);
    const globalsBackup = backupSaveGlobals(gameDir, type);
    const game = new NwGame({ repoRoot, gameDir, type, nwPath });
    const runner = createRunner(`${type.toUpperCase()} 无头测试`);
    const state = {};

    try {
      await game.start();
      await game.evaluate(installTestApi);
      await game.waitFor(() => window.__cheatTest && window.__cheatTest.main(), {
        timeout: 10000,
        label: "测试 API 安装",
      });

      registerCore({ test: runner.test, page: game, type, state });
      registerGameplay({ test: runner.test, page: game, type, state });
      registerSaveBackup({ test: runner.test, page: game, type, state });

      const result = await runner.run();
      totalPassed += result.passed;
      totalFailed += result.failed;

      const errors = game.getPageErrors();

      if (errors.exceptions.length > 0) {
        console.log("\n页面未捕获异常（供排查）:");
        for (const exception of errors.exceptions) {
          console.log(`  - ${String(exception).split(/\r?\n/)[0]}`);
        }
      }

      if (errors.consoleErrors.length > 0) {
        console.log("\n页面 console.error（供排查）:");
        for (const error of errors.consoleErrors.slice(0, 10)) {
          console.log(`  - ${String(error).split(/\r?\n/)[0]}`);
        }
      }
    } catch (error) {
      totalFailed += 1;
      console.error(`\n[FAIL] ${type.toUpperCase()} 启动 / 运行失败`);
      console.error(error && error.stack ? error.stack : String(error));

      const errors = game.getPageErrors();

      if (errors.exceptions.length > 0) {
        console.error("\n页面未捕获异常:");
        for (const exception of errors.exceptions) {
          console.error(String(exception));
        }
      }

      if (errors.consoleErrors.length > 0) {
        console.error("\n页面 console.error:");
        for (const error of errors.consoleErrors.slice(0, 20)) {
          console.error(String(error));
        }
      }

      if (errors.output.length > 0) {
        console.error("\nnw.js 输出（最后 40 行）:");
        console.error(errors.output.slice(-40).join("\n"));
      }
    } finally {
      await game.close();
      settingsBackup.restore();
      globalsBackup.restore();
    }
  }

  if (!args.skipPackaging) {
    const runner = createRunner("压缩包结构测试");

    registerPackaging({ test: runner.test, repoRoot });

    const result = await runner.run();
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log(
    `\n=== 总计: ${totalPassed} 通过, ${totalFailed} 失败, ${totalPassed + totalFailed} 项 ===`,
  );

  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
