// @ts-check
/**
 * 游戏统计面板的纯逻辑。
 *
 * MV / MZ 的数据位置：
 *   - 游玩时长：`Game_System.prototype.playtime()`，实现在线时读 `Graphics.frameCount`
 *   - 步数：`$gameParty._steps`
 *   - 存档 / 战斗 / 胜利 / 逃跑次数：`$gameSystem._saveCount` 等
 *
 * 这里不直接访问全局变量，而是把对象当参数传入，方便单测。
 */

export const PLAY_TIME_MAX_SECONDS = 359999; // 99:59:59

const COUNTER_KEYS = ["saveCount", "battleCount", "winCount", "escapeCount"];

/**
 * 解析非负整数；越界 / 非数字返回 null。
 *
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [options]
 * @returns {number | null}
 */
export function parseStatInteger(value, options = {}) {
  // 输入框清空 / 只输入空格时 Number("") 会变成 0，
  // 不能把「清空」误当成「归零」。
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const min = Number.isFinite(options.min) ? Number(options.min) : 0;
  const max = Number.isFinite(options.max)
    ? Number(options.max)
    : Number.MAX_SAFE_INTEGER;
  const numeric = Math.floor(Number(value));

  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    return null;
  }

  return numeric;
}

/**
 * @param {unknown} frames
 * @returns {number}
 */
export function framesToSeconds(frames) {
  const numeric = Number(frames);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.floor(numeric / 60);
}

/**
 * @param {unknown} seconds
 * @returns {number}
 */
export function secondsToFrames(seconds) {
  const numeric = Number(seconds);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.floor(numeric) * 60;
}

/**
 * @param {unknown} seconds
 * @returns {string}
 */
export function formatPlaytime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const secs = total % 60;

  return [hours, minutes, secs]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/**
 * @param {any} target
 * @param {string} method
 * @param {number} fallback
 * @returns {number}
 */
function callNumber(target, method, fallback = 0) {
  try {
    if (target && typeof target[method] === "function") {
      const value = Number(target[method]());
      return Number.isFinite(value) ? value : fallback;
    }
  } catch (error) {
    // ignore
  }

  return fallback;
}

/**
 * @param {any} target
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function readNumber(target, key, fallback = 0) {
  try {
    const value = Number(target && target[key]);
    return Number.isFinite(value) ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

/**
 * @param {any} gameSystem
 * @param {any} graphics
 * @returns {number}
 */
export function readPlaytimeSeconds(gameSystem, graphics) {
  try {
    if (gameSystem && typeof gameSystem.playtime === "function") {
      const value = Number(gameSystem.playtime());

      if (Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
      }
    }
  } catch (error) {
    // 回退到 Graphics.frameCount
  }

  return framesToSeconds(graphics && graphics.frameCount);
}

/**
 * @param {{
 *   gameSystem?: any,
 *   gameParty?: any,
 *   gameMap?: any,
 *   gamePlayer?: any,
 *   dataMapInfos?: any,
 *   graphics?: any,
 *   utils?: any,
 * }} env
 */
export function readGameStats(env = {}) {
  const {
    gameSystem,
    gameParty,
    gameMap,
    gamePlayer,
    dataMapInfos,
    graphics,
    utils,
  } = env;

  const mapId = Math.max(0, Math.floor(callNumber(gameMap, "mapId", 0)));
  let mapName = "";

  try {
    if (gameMap && typeof gameMap.displayName === "function") {
      mapName = String(gameMap.displayName() || "");
    }
  } catch (error) {
    mapName = "";
  }

  if (!mapName && dataMapInfos && dataMapInfos[mapId]) {
    mapName = String(dataMapInfos[mapId].name || "");
  }

  let partySize = 0;

  try {
    if (gameParty && typeof gameParty.members === "function") {
      partySize = gameParty.members().length;
    } else if (gameParty && Array.isArray(gameParty._actors)) {
      partySize = gameParty._actors.length;
    }
  } catch (error) {
    partySize = 0;
  }

  const playtimeSeconds = readPlaytimeSeconds(gameSystem, graphics);

  return {
    playtimeSeconds,
    playtimeText: formatPlaytime(playtimeSeconds),
    steps: Math.max(0, Math.floor(readNumber(gameParty, "_steps", 0))),
    saveCount: Math.max(0, Math.floor(readNumber(gameSystem, "_saveCount", 0))),
    battleCount: Math.max(
      0,
      Math.floor(readNumber(gameSystem, "_battleCount", 0)),
    ),
    winCount: Math.max(0, Math.floor(readNumber(gameSystem, "_winCount", 0))),
    escapeCount: Math.max(
      0,
      Math.floor(readNumber(gameSystem, "_escapeCount", 0)),
    ),
    gold: Math.max(0, Math.floor(readNumber(gameParty, "_gold", 0))),
    mapId,
    mapName,
    playerX: Math.floor(readNumber(gamePlayer, "x", 0)),
    playerY: Math.floor(readNumber(gamePlayer, "y", 0)),
    partySize,
    engine: String((utils && utils.RPGMAKER_NAME) || ""),
  };
}

/**
 * 修改当前游玩时长。在线时 `Game_System.playtime()` 读 Graphics.frameCount，
 * 所以优先改它；没有 Graphics 时退回 `_framesOnSave`（读档 / 存档头会用）。
 *
 * @param {any} gameSystem
 * @param {any} graphics
 * @param {unknown} seconds
 * @returns {{ ok: boolean, message?: string }}
 */
export function writePlaytime(gameSystem, graphics, seconds) {
  const value = parseStatInteger(seconds, {
    min: 0,
    max: PLAY_TIME_MAX_SECONDS,
  });

  if (value === null) {
    return { ok: false, message: "invalid playtime" };
  }

  const frames = secondsToFrames(value);

  try {
    // MV / MZ 的 Graphics 是「静态类」（函数对象），不是普通对象。
    // 只判断 typeof === "object" 会漏掉它，然后错误地退回 _framesOnSave。
    if (
      graphics &&
      (typeof graphics === "object" || typeof graphics === "function")
    ) {
      graphics.frameCount = frames;
      return { ok: true };
    }
  } catch (error) {
    // 回退到 _framesOnSave
  }

  if (!gameSystem || typeof gameSystem !== "object") {
    return { ok: false, message: "game system is not available" };
  }

  try {
    gameSystem._framesOnSave = frames;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: String((error && error.message) || error),
    };
  }
}

/**
 * @param {any} gameParty
 * @param {unknown} steps
 * @returns {{ ok: boolean, message?: string }}
 */
export function writeSteps(gameParty, steps) {
  const value = parseStatInteger(steps);

  if (value === null) {
    return { ok: false, message: "invalid steps" };
  }

  if (!gameParty || typeof gameParty !== "object") {
    return { ok: false, message: "game party is not available" };
  }

  try {
    gameParty._steps = value;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: String((error && error.message) || error),
    };
  }
}

/**
 * @param {any} gameSystem
 * @param {Partial<Record<"saveCount"|"battleCount"|"winCount"|"escapeCount", unknown>>} patch
 * @returns {{ ok: boolean, message?: string, changed?: string[] }}
 */
export function writeCounters(gameSystem, patch) {
  if (!gameSystem || typeof gameSystem !== "object") {
    return { ok: false, message: "game system is not available" };
  }

  const next = {};
  const changed = [];

  for (const key of COUNTER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, key)) {
      continue;
    }

    const value = parseStatInteger(patch[key]);

    if (value === null) {
      return { ok: false, message: `invalid ${key}` };
    }

    next[`_${key}`] = value;
    changed.push(key);
  }

  try {
    Object.assign(gameSystem, next);
    return { ok: true, changed };
  } catch (error) {
    return {
      ok: false,
      message: String((error && error.message) || error),
    };
  }
}

/**
 * @param {any} gameParty
 * @param {unknown} gold
 * @returns {{ ok: boolean, message?: string }}
 */
export function writeGold(gameParty, gold) {
  const value = parseStatInteger(gold);

  if (value === null) {
    return { ok: false, message: "invalid gold" };
  }

  if (!gameParty || typeof gameParty !== "object") {
    return { ok: false, message: "game party is not available" };
  }

  const current = Math.max(0, Math.floor(readNumber(gameParty, "_gold", 0)));
  const diff = value - current;

  if (diff === 0) {
    return { ok: true };
  }

  try {
    if (diff > 0 && typeof gameParty.gainGold === "function") {
      gameParty.gainGold(diff);
    } else if (diff < 0 && typeof gameParty.loseGold === "function") {
      gameParty.loseGold(-diff);
    } else {
      gameParty._gold = value;
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: String((error && error.message) || error),
    };
  }
}

export { COUNTER_KEYS };
