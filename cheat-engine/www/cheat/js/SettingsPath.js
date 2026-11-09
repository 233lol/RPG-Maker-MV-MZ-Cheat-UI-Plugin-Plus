// @ts-check
// MV 与 MZ 的游戏根目录布局不同：
//   MV：<游戏根>/www/index.html，所以设置放在 <游戏根>/www/cheat-settings
//   MZ：<游戏根>/index.html，   所以设置放在 <游戏根>/cheat-settings
// 所有需要落盘的功能都必须通过这里取路径，避免 MZ 下多出一层 www/。
//
// 这个模块会在自身加载时做一次 MZ 旧目录迁移（www/cheat-settings -> cheat-settings），
// 因为 GlobalShortcut / CheatHelper 等模块在 import 阶段就会读取设置文件，
// 迁移必须早于它们执行。

export function isMZEngine() {
  try {
    if (typeof Utils !== "undefined" && Utils.RPGMAKER_NAME) {
      return Utils.RPGMAKER_NAME === "MZ";
    }
  } catch (error) {
    // 继续按 API 探测
  }

  try {
    return (
      typeof DataManager !== "undefined" &&
      typeof DataManager.makeSavename === "function"
    );
  } catch (error) {
    return false;
  }
}

// 游戏根目录。不能依赖 process.cwd()：Windows 快捷方式的「起始位置」、
// Steam / 第三方启动器或插件里的 chdir 都可能把 cwd 指到别处，
// 导致设置写到游戏目录之外，迁移也找不到旧数据。
export function getAppRoot() {
  try {
    if (
      typeof nw !== "undefined" &&
      nw &&
      nw.App &&
      typeof nw.App.startPath === "string" &&
      nw.App.startPath.length > 0
    ) {
      return nw.App.startPath.replace(/[\\/]+$/, "");
    }
  } catch (error) {
    // 继续用 cwd 兜底
  }

  try {
    if (typeof process !== "undefined" && typeof process.cwd === "function") {
      const cwd = process.cwd();

      if (typeof cwd === "string" && cwd.length > 0) {
        return cwd;
      }
    }
  } catch (error) {
    // 浏览器 / 沙箱环境
  }

  return ".";
}

export function getCheatSettingsDir() {
  const sub = isMZEngine() ? "cheat-settings" : "www/cheat-settings";
  const root = getAppRoot();

  return root === "." || root === "" ? `./${sub}` : `${root}/${sub}`;
}

export function getCheatSettingsPath(name) {
  return `${getCheatSettingsDir()}/${String(name)}`;
}

// 只复制目标目录里不存在的条目，用于「迁移中断后下次继续补」。
// 已存在的新设置不会被旧目录覆盖。
function copyDirectoryMissing(source, target) {
  const fs = require("fs");
  const path = require("path");

  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryMissing(from, to);
    } else if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to);
    }
  }
}

// 只在 MZ 下执行。新目录不存在时整体迁移；已存在时只补缺失文件，
// 避免覆盖用户已经使用的新设置，也能在迁移中断后继续补。
// 浏览器环境没有 fs，直接跳过。
export function migrateLegacySettings() {
  if (!isMZEngine()) {
    return false;
  }

  try {
    if (typeof require !== "function" || typeof process === "undefined") {
      return false;
    }

    const fs = require("fs");
    const path = require("path");
    const root = getAppRoot();
    const legacyDir = path.join(root, "www", "cheat-settings");
    const nextDir = path.join(root, "cheat-settings");

    if (!fs.existsSync(legacyDir)) {
      return false;
    }

    if (fs.existsSync(nextDir)) {
      if (!fs.statSync(nextDir).isDirectory()) {
        console.warn(
          "[cheat plugin] cheat-settings 已存在但不是目录，跳过旧设置迁移",
        );
        return false;
      }

      // 新目录已存在（可能是上次迁移中断留下的半成品）：
      // 只补缺失文件，既不丢旧数据，也不覆盖用户已经使用的新设置。
      copyDirectoryMissing(legacyDir, nextDir);
    } else {
      fs.mkdirSync(path.dirname(nextDir), { recursive: true });

      try {
        fs.renameSync(legacyDir, nextDir);
      } catch (renameError) {
        // 跨盘 / 权限问题：退化成复制后删除
        copyDirectoryMissing(legacyDir, nextDir);
      }
    }

    // 复制成功后才删除旧目录；中途失败时旧目录保留，下次启动继续补。
    fs.rmSync(legacyDir, { recursive: true, force: true });

    // 迁移后如果 www/ 里已经没有别的东西，顺手删掉空目录。
    try {
      const legacyParent = path.dirname(legacyDir);
      if (fs.readdirSync(legacyParent).length === 0) {
        fs.rmdirSync(legacyParent);
      }
    } catch (cleanupError) {
      // 非空 / 权限问题都忽略
    }

    return true;
  } catch (error) {
    console.warn("[cheat plugin] 迁移旧版 cheat-settings 失败", error);
    return false;
  }
}

// 模块加载时立即执行，早于 GlobalShortcut / CheatHelper 的初始化。
try {
  migrateLegacySettings();
} catch (error) {
  // 迁移失败不影响正常读写
}
