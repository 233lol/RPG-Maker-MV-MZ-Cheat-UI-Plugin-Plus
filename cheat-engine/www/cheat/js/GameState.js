import { Alert } from "./AlertHelper.js";
import { t } from "./strings.js";

// 统一的游戏数据就绪检查。
//
// 读档 / 新游戏 / MZ 初始化 WASM 的窗口里，$gamePlayer、$gameParty 等
// 可能是 null 或尚未创建。面板 created() 直接取属性会让整个面板挂掉，
// 快捷键也会在游戏还没准备好时操作空对象。
//
// 约定：
//   - isXxxReady() 只判断，不提示，适合 created() 静默降级；
//   - requireXxx() 会给一次非阻塞提示，适合用户主动点击的操作。

function readGlobal(name) {
  try {
    if (typeof globalThis !== "undefined" && globalThis[name] !== undefined) {
      return globalThis[name];
    }
  } catch (error) {
    // 某些沙箱环境访问 globalThis 会抛错
  }

  try {
    return eval(name);
  } catch (error) {
    return undefined;
  }
}

export function getGamePlayer() {
  return readGlobal("$gamePlayer") || null;
}

export function getGameParty() {
  return readGlobal("$gameParty") || null;
}

export function getGameMap() {
  return readGlobal("$gameMap") || null;
}

export function getGameSwitches() {
  return readGlobal("$gameSwitches") || null;
}

export function getGameVariables() {
  return readGlobal("$gameVariables") || null;
}

// 从游戏内返回标题后，MV/MZ 不会销毁 $gamePlayer / $gameParty 等旧实例。
// 只检查四个全局对象会把标题画面误判为「游戏已就绪」，导致快速存档
// 把上一局的旧数据写进磁盘。
function isTitleOrBootScene() {
  try {
    if (typeof SceneManager === "undefined" || !SceneManager._scene) {
      return false;
    }

    const scene = SceneManager._scene;

    if (typeof Scene_Title !== "undefined" && scene instanceof Scene_Title) {
      return true;
    }

    if (typeof Scene_Boot !== "undefined" && scene instanceof Scene_Boot) {
      return true;
    }
  } catch (error) {
    return false;
  }

  return false;
}

export function isGameReady() {
  if (isTitleOrBootScene()) {
    return false;
  }

  return !!(
    getGamePlayer() &&
    getGameParty() &&
    getGameMap() &&
    readGlobal("$gameSystem")
  );
}

export function isPartyReady() {
  return !!(getGameParty() && getGamePlayer());
}

export function isSwitchesReady() {
  return !!getGameSwitches();
}

export function isVariablesReady() {
  return !!getGameVariables();
}

function notifyNotReady(feature) {
  Alert.warn(
    feature
      ? t("gameState.notReadyFeature", { feature })
      : t("gameState.notReady"),
  );
}

export function requireGameReady(feature = "") {
  if (isGameReady()) {
    return true;
  }

  notifyNotReady(feature);
  return false;
}

export function requirePartyReady(feature = "") {
  if (isPartyReady()) {
    return true;
  }

  notifyNotReady(feature);
  return false;
}

export function requireSwitchesReady(feature = "") {
  if (isSwitchesReady()) {
    return true;
  }

  notifyNotReady(feature);
  return false;
}

export function requireVariablesReady(feature = "") {
  if (isVariablesReady()) {
    return true;
  }

  notifyNotReady(feature);
  return false;
}
