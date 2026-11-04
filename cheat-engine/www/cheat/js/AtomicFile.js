// 原子写文件：先写同目录临时文件，再 rename 覆盖目标。
// 崩溃 / 断电时最多留下一个临时文件，不会把原文件写成半截 JSON。

export function writeTextAtomic(filePath, text, encoding = "utf-8") {
  const fs = require("fs");
  const path = require("path");
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2, 8)}.tmp`;

  try {
    fs.writeFileSync(tmpFile, text, encoding);
    fs.renameSync(tmpFile, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch (cleanupError) {
      // 清不掉临时文件不影响主流程
    }

    throw error;
  }
}

export function writeJsonAtomic(filePath, value, space = 2) {
  writeTextAtomic(filePath, JSON.stringify(value, null, space), "utf-8");
}
