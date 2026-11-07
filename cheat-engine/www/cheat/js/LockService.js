// @ts-check
import { KeyValueStorage } from "./KeyValueStorage.js";
import { getCheatSettingsPath } from "./SettingsPath.js";
import {
  itemLockKey,
  normalizeItemAmount,
  parseItemLockKey,
  resolveItemData,
  sanitizeItemLocks,
} from "./ItemLockHelper.js";

// 开关 / 变量锁定的全局服务。
//
// 之前锁定逻辑写在面板组件的 setInterval 里：一关面板（或关掉作弊窗口）
// 定时器就被清掉，锁定实际只维持到离开面板为止，但磁盘上的锁记录还在，
// 下次打开面板又显示「已锁定」——状态和真实行为不一致。
//
// 这里把状态 + 定时器都搬到模块级：面板只负责编辑，服务负责持续生效。
// 面板卸载不会停止锁定；没有启用任何锁时定时器自动停掉，避免空转。

const LOCK_INTERVAL_MS = 1000;

function cloneValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  // JSON 深拷贝会把 Date 变成字符串、Map/Set 变成 {}、undefined/NaN 丢失，
  // 锁定值一旦被改写就会把游戏变量改坏。优先用 structuredClone 保留类型。
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (error) {
      // 含函数 / DOM / 原生对象时无法克隆，退回 JSON
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }

  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) {
      return false;
    }

    for (const [key, value] of a) {
      if (!b.has(key) || !valuesEqual(value, b.get(key))) {
        return false;
      }
    }

    return true;
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) {
      return false;
    }

    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }

    return true;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !valuesEqual(a[key], b[key])
    ) {
      return false;
    }
  }

  return true;
}

function sanitizeLocks(raw) {
  const ret = {};

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ret;
  }

  for (const [idText, lock] of Object.entries(raw)) {
    const id = Number(idText);

    if (!Number.isInteger(id) || id <= 0) {
      continue;
    }

    if (!lock || typeof lock !== "object" || !lock.lockEnabled) {
      continue;
    }

    ret[id] = {
      lockEnabled: true,
      // 变量可能是数组 / 对象：拷贝一份，避免游戏原地修改后锁的目标跟着变。
      lockValue: cloneValue(lock.lockValue),
    };
  }

  return ret;
}

function getItemTables() {
  return {
    items: typeof $dataItems !== "undefined" ? $dataItems : null,
    weapons: typeof $dataWeapons !== "undefined" ? $dataWeapons : null,
    armors: typeof $dataArmors !== "undefined" ? $dataArmors : null,
  };
}

function getPartyItemCount(item) {
  if (
    typeof $gameParty === "undefined" ||
    !$gameParty ||
    typeof $gameParty.numItems !== "function"
  ) {
    return null;
  }

  try {
    const count = Number($gameParty.numItems(item));
    return Number.isInteger(count) && count >= 0 ? count : null;
  } catch (error) {
    return null;
  }
}

function getPartyItemMax(item) {
  if (
    typeof $gameParty !== "undefined" &&
    $gameParty &&
    typeof $gameParty.maxItems === "function"
  ) {
    try {
      const max = Math.floor(Number($gameParty.maxItems(item)));
      if (Number.isInteger(max) && max >= 0) {
        return max;
      }
    } catch (error) {
      // 落到默认值
    }
  }

  return 99;
}

export class LockService {
  static ensureLoaded() {
    if (this.loaded) {
      return this;
    }

    this.loaded = true;
    this.switchStorage = new KeyValueStorage(
      getCheatSettingsPath("switch-locks.json"),
    );
    this.variableStorage = new KeyValueStorage(
      getCheatSettingsPath("variable-locks.json"),
    );
    this.itemStorage = new KeyValueStorage(
      getCheatSettingsPath("item-locks.json"),
    );
    this.switchLocks = sanitizeLocks(this.readStorage(this.switchStorage));
    this.variableLocks = sanitizeLocks(this.readStorage(this.variableStorage));
    this.itemLocks = sanitizeItemLocks(this.readStorage(this.itemStorage));
    this.schedule();

    return this;
  }

  static readStorage(storage) {
    try {
      const raw = storage.getItem("data");
      if (!raw) {
        return {};
      }

      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch (error) {
      console.warn("[cheat plugin] 读取锁定设置失败，按空设置处理", error);
      return {};
    }
  }

  static writeStorage(storage, locks) {
    try {
      storage.setItem("data", JSON.stringify(locks));
    } catch (error) {
      console.warn("[cheat plugin] 写入锁定设置失败", error);
    }
  }

  static getSwitchLocks() {
    this.ensureLoaded();
    return this.switchLocks;
  }

  static getVariableLocks() {
    this.ensureLoaded();
    return this.variableLocks;
  }

  static getItemLocks() {
    this.ensureLoaded();
    return this.itemLocks;
  }

  // 面板用完整表数据重建锁定表，一次写入磁盘。
  static setSwitchLocks(locks) {
    this.ensureLoaded();
    this.switchLocks = sanitizeLocks(locks);
    this.writeStorage(this.switchStorage, this.switchLocks);
    this.schedule();
    this.applySwitchLocks();
    return this.switchLocks;
  }

  static setVariableLocks(locks) {
    this.ensureLoaded();
    this.variableLocks = sanitizeLocks(locks);
    this.writeStorage(this.variableStorage, this.variableLocks);
    this.schedule();
    this.applyVariableLocks();
    return this.variableLocks;
  }

  static setItemLocks(locks) {
    this.ensureLoaded();
    this.itemLocks = sanitizeItemLocks(locks);
    this.writeStorage(this.itemStorage, this.itemLocks);
    this.schedule();
    this.applyItemLocks();
    return this.itemLocks;
  }

  static hasAnyLock() {
    this.ensureLoaded();

    return (
      Object.values(this.switchLocks).some((lock) => lock.lockEnabled) ||
      Object.values(this.variableLocks).some((lock) => lock.lockEnabled) ||
      Object.values(this.itemLocks).some((lock) => lock.lockEnabled)
    );
  }

  static schedule() {
    if (this.hasAnyLock()) {
      this.start();
    } else {
      this.stop();
    }
  }

  static start() {
    if (this.timer) {
      return;
    }

    // 单元测试 / 非浏览器沙箱没有 window，锁仍然会在 setXxxLocks 时立即应用一次；
    // 这里直接跳过定时器，避免 ReferenceError。
    if (
      typeof window === "undefined" ||
      typeof window.setInterval !== "function"
    ) {
      return;
    }

    this.timer = window.setInterval(() => {
      this.applyAllLocks();
    }, LOCK_INTERVAL_MS);
  }

  static stop() {
    if (!this.timer) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      typeof window.clearInterval === "function"
    ) {
      window.clearInterval(this.timer);
    }

    this.timer = null;
  }

  static applyAllLocks() {
    if (!this.hasAnyLock()) {
      this.stop();
      return;
    }

    this.applySwitchLocks();
    this.applyVariableLocks();
    this.applyItemLocks();
  }

  static applySwitchLocks() {
    if (typeof $gameSwitches === "undefined" || !$gameSwitches) {
      return false;
    }

    let changed = false;

    for (const [idText, lock] of Object.entries(this.switchLocks)) {
      const id = Number(idText);

      if (!Number.isInteger(id) || id <= 0 || !lock.lockEnabled) {
        continue;
      }

      const target = !!lock.lockValue;

      if (!!$gameSwitches.value(id) !== target) {
        $gameSwitches.setValue(id, target);
        changed = true;
      }
    }

    return changed;
  }

  static applyVariableLocks() {
    if (typeof $gameVariables === "undefined" || !$gameVariables) {
      return false;
    }

    let changed = false;

    for (const [idText, lock] of Object.entries(this.variableLocks)) {
      const id = Number(idText);

      if (!Number.isInteger(id) || id <= 0 || !lock.lockEnabled) {
        continue;
      }

      const current = $gameVariables.value(id);

      if (!valuesEqual(current, lock.lockValue)) {
        $gameVariables.setValue(id, cloneValue(lock.lockValue));
        changed = true;
      }
    }

    return changed;
  }

  static applyItemLocks() {
    this.ensureLoaded();
    return this.applyItemLocksFor(Object.keys(this.itemLocks || {}));
  }

  static applyItemLock(kind, id) {
    this.ensureLoaded();
    const key = itemLockKey(kind, id);
    return key ? this.applyItemLocksFor([key]) : false;
  }

  static applyItemLocksFor(keys) {
    if (
      typeof $gameParty === "undefined" ||
      !$gameParty ||
      typeof $gameParty.gainItem !== "function"
    ) {
      return false;
    }

    const tables = getItemTables();
    let changed = false;

    for (const rawKey of keys) {
      const parsed = parseItemLockKey(rawKey);

      if (!parsed) {
        continue;
      }

      const lock = this.itemLocks[rawKey];

      if (!lock || !lock.lockEnabled) {
        continue;
      }

      const item = resolveItemData(tables, parsed.kind, parsed.id);

      if (!item) {
        continue;
      }

      const current = getPartyItemCount(item);

      if (current === null) {
        continue;
      }

      // 引擎的背包上限（MV / MZ 默认 99）会截断 gainItem。
      // 不在这里按上限收敛的话，锁 999 会每秒写一次、永远不相等。
      const max = getPartyItemMax(item);
      const target = Math.min(normalizeItemAmount(lock.lockValue, 0), max);

      if (current === target) {
        continue;
      }

      try {
        $gameParty.gainItem(item, target - current);
        changed = true;
      } catch (error) {
        console.warn("[cheat plugin] 应用物品锁定失败", error);
      }
    }

    return changed;
  }

  static applySwitchLock(id) {
    this.ensureLoaded();
    return this.applySwitchLocksFor([id]);
  }

  static applyVariableLock(id) {
    this.ensureLoaded();
    return this.applyVariableLocksFor([id]);
  }

  static applySwitchLocksFor(ids) {
    if (typeof $gameSwitches === "undefined" || !$gameSwitches) {
      return false;
    }

    let changed = false;

    for (const rawId of ids) {
      const id = Number(rawId);
      const lock = this.switchLocks[id];

      if (!lock || !lock.lockEnabled) {
        continue;
      }

      const target = !!lock.lockValue;

      if (!!$gameSwitches.value(id) !== target) {
        $gameSwitches.setValue(id, target);
        changed = true;
      }
    }

    return changed;
  }

  static applyVariableLocksFor(ids) {
    if (typeof $gameVariables === "undefined" || !$gameVariables) {
      return false;
    }

    let changed = false;

    for (const rawId of ids) {
      const id = Number(rawId);
      const lock = this.variableLocks[id];

      if (!lock || !lock.lockEnabled) {
        continue;
      }

      const current = $gameVariables.value(id);

      if (!valuesEqual(current, lock.lockValue)) {
        $gameVariables.setValue(id, cloneValue(lock.lockValue));
        changed = true;
      }
    }

    return changed;
  }
}

// 模块加载即恢复锁定（此时游戏数据可能还没创建，定时器里会自行跳过）。
LockService.ensureLoaded();
