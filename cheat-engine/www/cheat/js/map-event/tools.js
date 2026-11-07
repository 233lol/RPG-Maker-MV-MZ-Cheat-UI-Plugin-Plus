// @ts-check
/**
 * 地图事件工具的纯逻辑：
 *   - 独立开关（A-D）的键名 / 读写
 *   - 事件下拉列表
 *   - 公共事件下拉列表与校验
 *
 * RPG Maker MV / MZ 都用 `$gameSelfSwitches.value([mapId, eventId, "A"])`
 * 读写独立开关，`$gameTemp.reserveCommonEvent(id)` 排队执行公共事件。
 */

export const SELF_SWITCH_KEYS = ["A", "B", "C", "D"];

const SELF_SWITCH_KEY_SET = new Set(SELF_SWITCH_KEYS);

/**
 * @param {unknown} value
 * @returns {"A" | "B" | "C" | "D" | null}
 */
export function normalizeSelfSwitchKey(value) {
  const key = String(value || "").toUpperCase();
  return SELF_SWITCH_KEY_SET.has(key)
    ? /** @type {"A" | "B" | "C" | "D"} */ (key)
    : null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeSelfSwitchValue(value) {
  return value === true;
}

/**
 * @param {unknown} mapId
 * @param {unknown} eventId
 * @param {unknown} key
 * @returns {[number, number, string] | null}
 */
export function selfSwitchTarget(mapId, eventId, key) {
  const map = Number(mapId);
  const event = Number(eventId);
  const letter = normalizeSelfSwitchKey(key);

  if (!Number.isInteger(map) || map <= 0) {
    return null;
  }

  if (!Number.isInteger(event) || event <= 0) {
    return null;
  }

  if (!letter) {
    return null;
  }

  return [map, event, letter];
}

/**
 * @param {any} selfSwitches
 * @param {unknown} mapId
 * @param {unknown} eventId
 * @param {unknown} key
 * @returns {boolean}
 */
export function readSelfSwitchValue(selfSwitches, mapId, eventId, key) {
  const target = selfSwitchTarget(mapId, eventId, key);

  if (!target || !selfSwitches || typeof selfSwitches.value !== "function") {
    return false;
  }

  try {
    return !!selfSwitches.value(target);
  } catch (error) {
    return false;
  }
}

/**
 * @param {any} selfSwitches
 * @param {unknown} mapId
 * @param {unknown} eventId
 * @param {unknown} key
 * @param {unknown} value
 * @returns {boolean}
 */
export function writeSelfSwitchValue(selfSwitches, mapId, eventId, key, value) {
  const target = selfSwitchTarget(mapId, eventId, key);

  if (!target || !selfSwitches || typeof selfSwitches.setValue !== "function") {
    return false;
  }

  try {
    selfSwitches.setValue(target, normalizeSelfSwitchValue(value));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 读取一个事件的 A-D 四个独立开关。
 *
 * @param {any} selfSwitches
 * @param {unknown} mapId
 * @param {unknown} eventId
 * @returns {{ A: boolean, B: boolean, C: boolean, D: boolean }}
 */
export function readSelfSwitchState(selfSwitches, mapId, eventId) {
  /** @type {{ A: boolean, B: boolean, C: boolean, D: boolean }} */
  const state = { A: false, B: false, C: false, D: false };

  for (const key of SELF_SWITCH_KEYS) {
    state[key] = readSelfSwitchValue(selfSwitches, mapId, eventId, key);
  }

  return state;
}

/**
 * 把地图事件整理成下拉列表项。兼容 `$dataMap.events`（静态数据）
 * 和 `$gameMap.events()`（运行时事件，带 eventId()）。
 *
 * @param {unknown} events
 * @returns {Array<{ id: number, name: string, title: string, x: number, y: number }>}
 */
export function buildEventOptions(events) {
  if (!Array.isArray(events)) {
    return [];
  }

  const options = [];

  for (let index = 0; index < events.length; index++) {
    const event = events[index];

    if (!event) {
      continue;
    }

    const rawId =
      typeof event.eventId === "function" ? event.eventId() : event.id;

    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0) {
      continue;
    }

    const name = String(event.name || "").trim();
    const x = Number(event.x ?? event._x);
    const y = Number(event.y ?? event._y);
    const title = `${id}: ${name || "(unnamed)"}`;

    options.push({
      id,
      name,
      title,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    });
  }

  return options;
}

/**
 * @param {unknown} dataCommonEvents
 * @param {unknown} keyword
 * @returns {Array<{ id: number, name: string, title: string }>}
 */
export function buildCommonEventOptions(dataCommonEvents, keyword = "") {
  if (!Array.isArray(dataCommonEvents)) {
    return [];
  }

  const search = String(keyword || "")
    .trim()
    .toLowerCase();
  const options = [];

  for (let id = 1; id < dataCommonEvents.length; id++) {
    const event = dataCommonEvents[id];

    if (!event || typeof event !== "object") {
      continue;
    }

    const name = String(event.name || "").trim();

    if (!name) {
      continue;
    }

    if (search && !`${id} ${name}`.toLowerCase().includes(search)) {
      continue;
    }

    options.push({ id, name, title: `${id}: ${name}` });
  }

  return options;
}

/**
 * @param {unknown} dataCommonEvents
 * @param {unknown} id
 * @returns {{ id: number, name: string, title: string } | null}
 */
export function resolveCommonEvent(dataCommonEvents, id) {
  const numericId = Number(id);

  if (
    !Array.isArray(dataCommonEvents) ||
    !Number.isInteger(numericId) ||
    numericId <= 0 ||
    numericId >= dataCommonEvents.length
  ) {
    return null;
  }

  const event = dataCommonEvents[numericId];

  if (!event || typeof event !== "object") {
    return null;
  }

  const name = String(event.name || "").trim();

  if (!name) {
    return null;
  }

  return { id: numericId, name, title: `${numericId}: ${name}` };
}
