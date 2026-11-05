/**
 * 统一的游戏数据状态层。
 *
 * 面板不再各自猜测「什么时候该刷新」，而是订阅这里：
 * - 新游戏 / 读档完成
 * - 战斗结束
 * - 地图切换完成
 *
 * 事件只在数据可能变化时触发，不轮询。面板通过 `gameDataWatcherMixin`
 * 自动调用自己的 `initializeVariables()` / `reload()`。
 */

const listeners = new Set();

let version = 0;
let installed = false;

/**
 * 订阅游戏数据变化。
 *
 * @param {(reason: string, version: number) => void} listener
 * @returns {() => void} 取消订阅
 */
export function subscribeGameData(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  installGameDataHooks();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * 当前数据版本号。每次通知递增，便于调试 / 面板做轻量比较。
 *
 * @returns {number}
 */
export function getGameDataVersion() {
  return version;
}

/**
 * 主动通知游戏数据已变化。
 *
 * @param {string} reason
 */
export function notifyGameDataChanged(reason = "manual") {
  version++;

  for (const listener of listeners) {
    try {
      listener(reason, version);
    } catch (error) {
      console.warn("[cheat plugin] 游戏数据监听器执行失败", error);
    }
  }
}

function wrapMethod(target, name, after) {
  if (!target || typeof target[name] !== "function") {
    return false;
  }

  const original = target[name];
  if (original.__cheatGameDataWrapped) {
    return true;
  }

  const wrapped = function (...args) {
    const result = original.apply(this, args);
    after(result);
    return result;
  };

  wrapped.__cheatGameDataWrapped = true;
  target[name] = wrapped;

  return true;
}

/**
 * 安装引擎钩子。重复调用是幂等的。
 */
export function installGameDataHooks() {
  if (installed) {
    return true;
  }

  installed = true;

  if (typeof DataManager !== "undefined" && DataManager) {
    wrapMethod(DataManager, "setupNewGame", () =>
      notifyGameDataChanged("new-game"),
    );
    wrapMethod(DataManager, "extractSaveContents", () =>
      notifyGameDataChanged("load-game"),
    );
  }

  if (
    typeof BattleManager !== "undefined" &&
    BattleManager &&
    typeof BattleManager.endBattle === "function"
  ) {
    wrapMethod(BattleManager, "endBattle", () =>
      notifyGameDataChanged("battle-end"),
    );
  }

  if (
    typeof Scene_Map !== "undefined" &&
    Scene_Map.prototype &&
    typeof Scene_Map.prototype.onMapLoaded === "function"
  ) {
    wrapMethod(Scene_Map.prototype, "onMapLoaded", () =>
      notifyGameDataChanged("map-loaded"),
    );
  }

  return installed;
}
