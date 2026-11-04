import { KeyValueStorage } from "./KeyValueStorage.js";
import { getCheatSettingsPath } from "./SettingsPath.js";

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

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function valuesEqual(a, b) {
  if (a === b) {
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

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (error) {
    return false;
  }
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
    this.switchLocks = sanitizeLocks(this.readStorage(this.switchStorage));
    this.variableLocks = sanitizeLocks(this.readStorage(this.variableStorage));
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

  static hasAnyLock() {
    this.ensureLoaded();

    return (
      Object.values(this.switchLocks).some((lock) => lock.lockEnabled) ||
      Object.values(this.variableLocks).some((lock) => lock.lockEnabled)
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

    this.timer = window.setInterval(() => {
      this.applyAllLocks();
    }, LOCK_INTERVAL_MS);
  }

  static stop() {
    if (!this.timer) {
      return;
    }

    window.clearInterval(this.timer);
    this.timer = null;
  }

  static applyAllLocks() {
    if (!this.hasAnyLock()) {
      this.stop();
      return;
    }

    this.applySwitchLocks();
    this.applyVariableLocks();
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
