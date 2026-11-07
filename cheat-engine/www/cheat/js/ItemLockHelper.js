// @ts-check
/**
 * 物品 / 武器 / 防具锁定的纯逻辑。
 *
 * 物品不像开关 / 变量那样有稳定的数字 ID 入口，必须同时区分类型
 * （item / weapon / armor）和数据库 ID，因此锁定键使用 `kind:id`：
 *   item:1、weapon:12、armor:3
 *
 * 数量是「当前持有数」，用 `$gameParty.numItems(item)` 读取、
 * `$gameParty.gainItem(item, diff)` 写回。两套引擎都提供这两个公开 API。
 */

export const ITEM_KINDS = ["item", "weapon", "armor"];

const ITEM_KIND_SET = new Set(ITEM_KINDS);
const ITEM_LOCK_KEY_RE = /^(item|weapon|armor):([1-9]\d*)$/;

/**
 * @param {unknown} kind
 * @param {unknown} id
 * @returns {string | null}
 */
export function itemLockKey(kind, id) {
  const kindText = String(kind || "");
  const numericId = Number(id);

  if (!ITEM_KIND_SET.has(kindText)) {
    return null;
  }

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return `${kindText}:${numericId}`;
}

/**
 * @param {unknown} key
 * @returns {{ kind: string, id: number } | null}
 */
export function parseItemLockKey(key) {
  const match = ITEM_LOCK_KEY_RE.exec(String(key || ""));

  if (!match) {
    return null;
  }

  return { kind: match[1], id: Number(match[2]) };
}

/**
 * 数量归一化成非负整数；非法值回退到 fallback（默认 0）。
 *
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeItemAmount(value, fallback = 0) {
  const numeric = Math.floor(Number(value));

  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return numeric;
}

/**
 * 清理磁盘上的锁定表：键必须是合法 kind:id，值必须是开启状态的合法数量。
 *
 * @param {unknown} raw
 * @returns {Record<string, { lockEnabled: true, lockValue: number }>}
 */
export function sanitizeItemLocks(raw) {
  /** @type {Record<string, { lockEnabled: true, lockValue: number }>} */
  const result = {};

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }

  for (const [key, lock] of Object.entries(raw)) {
    const parsed = parseItemLockKey(key);

    if (!parsed || !lock || typeof lock !== "object" || !lock.lockEnabled) {
      continue;
    }

    const amount = Math.floor(Number(lock.lockValue));

    if (!Number.isFinite(amount) || amount < 0) {
      continue;
    }

    result[key] = { lockEnabled: true, lockValue: amount };
  }

  return result;
}

/**
 * 由表格行构造要写盘的锁定表（纯函数）。
 *
 * @param {Array<{ kind?: string, id?: number, lockEnabled?: boolean, lockValue?: unknown }>} rows
 * @returns {Record<string, { lockEnabled: true, lockValue: number }>}
 */
export function buildItemLocksPayload(rows) {
  /** @type {Record<string, { lockEnabled: true, lockValue: number }>} */
  const payload = {};
  const list = Array.isArray(rows) ? rows : [];

  for (const row of list) {
    if (!row || !row.lockEnabled) {
      continue;
    }

    const key = itemLockKey(row.kind, row.id);

    if (!key) {
      continue;
    }

    payload[key] = {
      lockEnabled: true,
      lockValue: normalizeItemAmount(row.lockValue, 0),
    };
  }

  return payload;
}

/**
 * 从引擎数据库里取出 item 对象。tables 用显式参数传入，方便单测。
 *
 * @param {{ items?: unknown, weapons?: unknown, armors?: unknown }} tables
 * @param {unknown} kind
 * @param {unknown} id
 * @returns {any | null}
 */
export function resolveItemData(tables, kind, id) {
  const kindText = String(kind || "");
  const numericId = Number(id);

  if (!ITEM_KIND_SET.has(kindText)) {
    return null;
  }

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  const table =
    kindText === "item"
      ? tables && tables.items
      : kindText === "weapon"
        ? tables && tables.weapons
        : tables && tables.armors;

  if (!Array.isArray(table)) {
    return null;
  }

  return table[numericId] || null;
}
