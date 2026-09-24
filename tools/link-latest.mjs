// 维护 <type>-latest.zip（由 Makefile 调用，替代 POSIX `ln -s -f`）。
// 优先创建符号链接（与原 ln 行为一致）；Windows 未开启开发者模式 / 非管理员
// 时创建符号链接会 EPERM，此时退化为复制（对使用方等价）。
import fs from "node:fs";

const [target, link] = process.argv.slice(2);

if (!target || !link) {
  console.error("usage: link-latest.mjs <target> <link>");
  process.exit(1);
}

try {
  fs.lstatSync(target);
} catch (e) {
  console.error(`link-latest: target not found: ${target}`);
  process.exit(1);
}

// 移除旧的 link（文件 / 符号链接均覆盖），等价于 ln -f
try {
  fs.rmSync(link, { force: true });
} catch (e) {
  // 忽略：后续尝试直接覆盖
}

try {
  fs.symlinkSync(target, link, "file");
  console.log(`symlink ${link} -> ${target}`);
} catch (e) {
  fs.copyFileSync(target, link);
  console.log(`copied ${target} -> ${link} (symlink unavailable: ${e.code})`);
}
