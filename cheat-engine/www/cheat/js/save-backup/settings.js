// @ts-check
/**
 * 存档时间机器的设置与「存档后自动快照」钩子。
 */

import { writeJsonAtomic } from "../AtomicFile.js";
import {
  BACKUP_KIND_AUTO,
  DEFAULT_AUTO_KEEP,
  WARN_NO_NWJS,
  getBackupDir,
} from "./constants.js";

export class SaveBackupSettings {
  /* --------------------------------------------------------- 设置 + 自动快照 */

  /** @this {SaveBackupApi} */
  static getSettingsPath() {
    return `${getBackupDir()}/config.json`;
  }

  /** @this {SaveBackupApi} */
  static getDefaultSettings() {
    return {
      // 默认关闭：不主动往玩家硬盘里写东西，需要的人在面板上一键打开。
      // 「还原前快照」不受这个开关影响，始终保留（否则还原就没有退路了）。
      autoOnSave: false,
      // 每 N 次存档留一份（1 = 每次存档都留）
      autoSaveInterval: 1,
      // 同一个存档槽保留的自动快照份数
      autoKeep: DEFAULT_AUTO_KEEP,
    };
  }

  /** @this {SaveBackupApi} */
  static getSettings() {
    const defaults = this.getDefaultSettings();

    if (!this.isLocalMode()) {
      return defaults;
    }

    try {
      const fs = this.requireFs();
      const file = this.getSettingsPath();

      if (!fs.existsSync(file)) {
        return defaults;
      }

      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        console.warn("[cheat plugin] 快照设置结构异常，已用默认值");
        return defaults;
      }

      const interval = Number(parsed.autoSaveInterval);

      return {
        autoOnSave: parsed.autoOnSave === true,
        autoSaveInterval:
          Number.isInteger(interval) && interval >= 1 && interval <= 100
            ? interval
            : defaults.autoSaveInterval,
        autoKeep:
          Number.isInteger(Number(parsed.autoKeep)) &&
          Number(parsed.autoKeep) >= 1 &&
          Number(parsed.autoKeep) <= 100
            ? Number(parsed.autoKeep)
            : defaults.autoKeep,
      };
    } catch (error) {
      // 设置读不出来不能连累存档本身
      console.warn("[cheat plugin] 读取快照设置失败，已用默认值", error);
      return defaults;
    }
  }

  /** @this {SaveBackupApi} */
  static writeSettings(patch) {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const next = { ...this.getSettings(), ...(patch || {}) };

    writeJsonAtomic(this.getSettingsPath(), next);

    return next;
  }

  /** @this {SaveBackupApi} */
  static isAutoOnSaveEnabled() {
    return this.getSettings().autoOnSave === true;
  }

  // $gameSystem._saveCount：引擎自己维护的存档次数，用来判断
  // 「这份快照对应第几次存档」以及去重。读不到时返回 0。
  /** @this {SaveBackupApi} */
  static getSaveCount() {
    try {
      const value = Number($gameSystem && $gameSystem._saveCount);
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  /** @this {SaveBackupApi} */
  static getAutoSnapshotMarker() {
    if (!this.autoSnapshotMarker) {
      this.autoSnapshotMarker = new Map();
    }

    return this.autoSnapshotMarker;
  }

  // 记录「这个槽位已经因为第 saveCount 次存档留过档了」。
  // 存档后钩子与还原前快照共用这份记录，保证同一次存档不会留两份。
  /** @this {SaveBackupApi} */
  static markAutoSnapshot(slot, saveCount) {
    const key = Number(slot);

    if (!Number.isInteger(key) || key < 1) {
      return;
    }

    this.getAutoSnapshotMarker().set(key, Number(saveCount) || 0);
  }

  // 由 DataManager.saveGame 的钩子调用。
  // 除了设置开关，还有两道保险：
  //  1. 用 $gameSystem._saveCount 去重 —— 保证「一次存档 = 最多一份快照」，
  //     存档流程内部再调一次 saveGame 也不会重复留档；
  //  2. 按 autoSaveInterval 节流，给「每次存档都留太占地方」的玩家一个旋钮。
  /** @this {SaveBackupApi} */
  static onGameSave(savefileId) {
    const slot = Number(savefileId);

    if (!this.isLocalMode() || !Number.isInteger(slot) || slot < 1) {
      return null;
    }

    // 新游戏 / 读档后 _saveCount 会回退或从 0 重新递增，
    // 必须在第一次存档时确保 reset 钩子已安装，避免旧标记误伤。
    this.installAutoSnapshotResetHooks();

    const settings = this.getSettings();

    if (!settings.autoOnSave) {
      return null;
    }

    // 存档后引擎的存档头已经写好，这里读到的时长 / 时间就是刚存下的那份
    const saveCount = this.getSaveCount();

    // _saveCount 为 0（自动存档插件没调 onBeforeSave 等）时无法区分
    // 「同一次存档」，不做去重，否则同槽位之后的所有自动快照都会被跳过。
    if (
      Number.isInteger(saveCount) &&
      saveCount > 0 &&
      this.getAutoSnapshotMarker().get(slot) === saveCount
    ) {
      return null;
    }

    // 节流：只在「存档次数是 N 的整数倍」时留档（N=1 即每次都留）。
    // 注意这里的语义是「每 N 次存档留一份」而不是「开启后每 N 次」，
    // 所以换 N 之后触发点会跟着变。
    if (saveCount > 0 && saveCount % settings.autoSaveInterval !== 0) {
      return null;
    }

    try {
      const meta = this.createSnapshot(slot, BACKUP_KIND_AUTO, "", {
        saveCount: saveCount,
      });

      this.markAutoSnapshot(slot, saveCount);

      return meta;
    } catch (error) {
      // 自动快照失败绝不能影响游戏本身的存档流程
      console.warn(
        "[cheat plugin] 存档后自动快照失败（不影响游戏存档）",
        error,
      );
      return null;
    }
  }

  // 新游戏 / 读档后清空去重标记。否则读一个旧档再玩到相同 _saveCount 时，
  // 会被上一周目留下的标记误判为「已经留过快照」而静默跳过自动备份。
  /** @this {SaveBackupApi} */
  static installAutoSnapshotResetHooks() {
    if (typeof DataManager === "undefined" || !DataManager) {
      return false;
    }

    const host = this;

    const wrap = (name) => {
      const original = DataManager[name];

      if (typeof original !== "function" || original.__cheatAutoSnapshotReset) {
        return;
      }

      const wrapped = function (...args) {
        const result = original.apply(this, args);
        host.getAutoSnapshotMarker().clear();
        return result;
      };

      wrapped.__cheatAutoSnapshotReset = true;
      DataManager[name] = wrapped;
    };

    wrap("setupNewGame");
    wrap("extractSaveContents");

    return true;
  }

  // 接管引擎的存档函数。只在能拿到 DataManager 时执行，且只包一层。
  /** @this {SaveBackupApi} */
  static installSaveHook() {
    if (this.saveHookInstalled) {
      return false;
    }

    if (typeof DataManager === "undefined" || !DataManager) {
      return false;
    }

    if (typeof DataManager.saveGame !== "function") {
      return false;
    }

    const original = DataManager.saveGame;
    // 保存钩子内部不能再依赖 `this`：DataManager.saveGame 被游戏调用时
    // this 是 DataManager，而 onGameSave 在 SaveBackupCheat 上。
    const host = this;

    DataManager.saveGame = function (savefileId) {
      const result = original.apply(this, arguments);

      const afterSave = () => {
        try {
          host.onGameSave(savefileId);
        } catch (error) {
          console.warn(
            "[cheat plugin] 存档后自动快照异常（不影响游戏存档）",
            error,
          );
        }
      };

      try {
        if (result && typeof result.then === "function") {
          // MZ：DataManager.saveGame 返回 Promise，必须等文件真正写完再快照
          result.then(afterSave, (error) => {
            console.warn("[cheat plugin] MZ 存档失败，跳过自动快照", error);
          });
        } else if (result !== false) {
          // MV：同步返回 true / false
          afterSave();
        }
      } catch (error) {
        console.warn(
          "[cheat plugin] 存档后自动快照异常（不影响游戏存档）",
          error,
        );
      }

      return result;
    };

    this.saveHookOriginal = original;
    this.saveHookInstalled = true;

    this.installAutoSnapshotResetHooks();

    return true;
  }
}
