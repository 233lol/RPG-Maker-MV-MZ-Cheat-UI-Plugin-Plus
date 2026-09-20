import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// 默认生产构建（压缩）；`node tools/build-shiki.mjs dev` 生成未压缩版本，
// 并内联 sourcemap，便于调试时定位 Shiki 内部代码。
const useDev = process.argv[2] === "dev";

const entry = path.join(rootDir, "tools", "shiki.bundle.ts");
const outfile = path.join(
  rootDir,
  "cheat-engine",
  "www",
  "cheat",
  "libs",
  "shiki.bundle.mjs",
);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: !useDev,
  sourcemap: useDev ? "inline" : false,
  logLevel: "info",
});

console.log(`Wrote ${outfile} (${useDev ? "dev" : "prod"})`);
