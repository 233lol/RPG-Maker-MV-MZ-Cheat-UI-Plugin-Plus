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

export function getCheatSettingsDir() {
  return isMZEngine() ? "./cheat-settings" : "./www/cheat-settings";
}

export function getCheatSettingsPath(name) {
  return `${getCheatSettingsDir()}/${String(name)}`;
}

function copyDirectory(source, target) {
  const fs = require("fs");
  const path = require("path");

  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

// 只在 MZ 下执行，且新目录不存在时才迁移，避免覆盖用户已经使用的新设置。
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
    const root = process.cwd();
    const legacyDir = path.join(root, "www", "cheat-settings");
    const nextDir = path.join(root, "cheat-settings");

    if (!fs.existsSync(legacyDir) || fs.existsSync(nextDir)) {
      return false;
    }

    fs.mkdirSync(path.dirname(nextDir), { recursive: true });

    try {
      fs.renameSync(legacyDir, nextDir);
    } catch (renameError) {
      // 跨盘 / 权限问题：退化成复制后删除
      copyDirectory(legacyDir, nextDir);
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }

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
