// 清理构建产物（由 Makefile 调用，替代 POSIX `rm -f`）。
// 参数为文件路径或简单通配模式（* / ?），在 cmd.exe 与 POSIX shell 下行为一致：
// 两种 shell 对引号内的通配符都不会展开，统一交给本脚本处理。
// 文件缺失不视为错误（对应原 `-rm -f` 的容错语义）。
import fs from "node:fs";

const patterns = process.argv.slice(2);

if (!patterns.length) {
  console.error("usage: clean.mjs <path-or-glob>...");
  process.exit(1);
}

function expand(pattern) {
  if (!/[*?]/.test(pattern)) {
    return [pattern];
  }

  const norm = pattern.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  const dir = slash >= 0 ? norm.slice(0, slash) : "";
  const base = norm.slice(slash + 1);
  const re = new RegExp(
    "^" +
      base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") +
      "$",
  );

  let entries;
  try {
    entries = fs.readdirSync(dir || ".");
  } catch (e) {
    return [];
  }

  return entries.filter((e) => re.test(e)).map((e) => (dir ? `${dir}/${e}` : e));
}

let removed = 0;
for (const pattern of patterns) {
  for (const file of expand(pattern)) {
    try {
      fs.lstatSync(file);
    } catch (e) {
      continue; // 不存在 → 跳过
    }

    try {
      fs.rmSync(file, { force: true, recursive: true });
      removed++;
    } catch (e) {
      console.warn(`clean: can't remove ${file}: ${e.message}`);
    }
  }
}

console.log(`clean: removed ${removed} entr${removed === 1 ? "y" : "ies"}`);
