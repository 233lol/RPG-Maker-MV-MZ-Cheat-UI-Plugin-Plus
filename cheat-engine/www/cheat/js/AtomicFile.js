// 原子写文件：先写同目录临时文件，fsync 后再 rename 覆盖目标。
// rename 保证「可见性」原子，fsync 保证断电后数据块与目录项都已落盘。
// 崩溃 / 断电时最多留下一个临时文件，不会把原文件写成半截 JSON。

// rename 之后再 fsync 父目录，确保目录项本身也持久化。
// Windows 不允许以只读方式打开目录，失败时直接忽略。
function syncDirectory(fs, dir) {
  let fd = null;

  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch (error) {
    // 部分文件系统 / 平台不支持目录 fsync
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (error) {
        // ignore
      }
    }
  }
}

// 每个目录最多每小时扫描一次，避免 save-backups 里文件很多时
// 每次写索引都 readdir 一遍。
const lastCleanupByDir = new Map();
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// 清理进程崩溃后遗留的旧临时文件（只删一天前的同名 *.tmp，
// 不碰其它进程正在写入的新临时文件）。
function cleanupStaleTempFiles(fs, path, filePath) {
  const dir = path.dirname(filePath);
  const now = Date.now();

  if ((lastCleanupByDir.get(dir) || 0) > now - CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupByDir.set(dir, now);

  const prefix = `${path.basename(filePath)}.`;
  const cutoff = now - 24 * 60 * 60 * 1000;
  let names;

  try {
    names = fs.readdirSync(dir);
  } catch (error) {
    return;
  }

  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".tmp")) {
      continue;
    }

    const fullPath = path.join(dir, name);

    try {
      if (fs.statSync(fullPath).mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      // 文件已被别人清掉 / 没有权限，忽略
    }
  }
}

export function writeTextAtomic(filePath, text, encoding = "utf-8") {
  const fs = require("fs");
  const path = require("path");
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  cleanupStaleTempFiles(fs, path, filePath);

  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.${String(
    Math.random(),
  ).slice(2, 8)}.tmp`;

  let fd = null;

  try {
    // wx：排他创建，避免两个写入者撞到同一个临时文件
    fd = fs.openSync(tmpFile, "wx");
    fs.writeFileSync(fd, text, encoding);

    try {
      fs.fsyncSync(fd);
    } catch (error) {
      // 某些文件系统不支持 fsync，继续完成 rename
    }

    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpFile, filePath);
    syncDirectory(fs, dir);
  } catch (error) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (closeError) {
        // ignore
      }
    }

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
