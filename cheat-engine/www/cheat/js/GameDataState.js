// @ts-check
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
 *
 * 引擎全局对象还没创建时（例如在被延迟加载的模块里调用）返回 false，
 * 之后任意一次调用都会补装，不会出现「先调一次就永久放弃」的情况。
 */
export function installGameDataHooks() {
  // 不再用一次性 installed 标志：首次调用时某些引擎对象可能还没创建，
  // 只要有一个包装成功就永久放弃会导致 Scene_Map 等钩子永远补不上。
  // wrapMethod 自身用 __cheatGameDataWrapped 去重，重复调用是安全的。
  let wrappedAny = false;

  const wrap = (target, name, reason) => {
    if (wrapMethod(target, name, () => notifyGameDataChanged(reason))) {
      wrappedAny = true;
    }
  };

  if (typeof DataManager !== "undefined" && DataManager) {
    wrap(DataManager, "setupNewGame", "new-game");
    wrap(DataManager, "extractSaveContents", "load-game");
  }

  if (typeof BattleManager !== "undefined" && BattleManager) {
    wrap(BattleManager, "endBattle", "battle-end");
  }

  if (typeof Scene_Map !== "undefined" && Scene_Map.prototype) {
    wrap(Scene_Map.prototype, "onMapLoaded", "map-loaded");
  }

  return wrappedAny;
}
