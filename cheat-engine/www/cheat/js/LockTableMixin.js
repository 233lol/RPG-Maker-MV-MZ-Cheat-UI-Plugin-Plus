// 开关 / 变量面板的公共逻辑：列表构建、锁定状态、批量锁定、锁定表持久化。
//
// 这两个面板原本是逐字复制的两份实现（约 400 行重复）。真正的差异收敛成
// 几个适配方法，由面板提供：
//   lockKind              "switch" | "variable"
//   isDataReady()         游戏数据是否就绪（静默判断）
//   requireDataReady(msg) 就绪检查 + 提示
//   getNames()            引擎里的名字表（$dataSystem.switches / variables）
//   readValue(id)         游戏里的当前值
//   writeValue(id, value) 写回游戏
//   normalizeValue(value) 展示 / 存锁定表前的归一化（变量需要 markRaw）
import { LockService } from "./LockService.js";
import { tablePanelMixin } from "./TablePanelMixin.js";

/**
 * 由表格行构造要写盘的锁定表（纯函数，便于单测）。
 *
 * @param {Array<{ id: number, lockEnabled?: boolean, lockValue?: unknown }>} items
 * @param {boolean} isVariable 变量保留原始类型，开关统一成布尔
 * @returns {Record<string, { lockEnabled: true, lockValue: unknown }>}
 */
export function buildLockPayload(items, isVariable) {
  const payload = {};
  const list = Array.isArray(items) ? items : [];

  for (const item of list) {
    if (!item || !item.lockEnabled) {
      continue;
    }

    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0) {
      continue;
    }

    payload[id] = {
      lockEnabled: true,
      lockValue: isVariable ? item.lockValue : !!item.lockValue,
    };
  }

  return payload;
}

export const lockTableMixin = {
  mixins: [tablePanelMixin],

  mounted() {
    // LockService 每秒会把被锁的值写回游戏，但不会通知面板。
    // 面板必须定期把锁定行的显示值同步回来，否则会一直显示旧值。
    this.__lockSyncTimer = window.setInterval(() => {
      this.syncLockedRows();
    }, 1000);
  },

  beforeUnmount() {
    if (this.__lockSyncTimer) {
      window.clearInterval(this.__lockSyncTimer);
      this.__lockSyncTimer = null;
    }
  },

  data() {
    return {
      lockKind: "switch",
      lockLabel: "开关",
      excludeNameless: true,
      // e2e / 调试读取的名字表（面板通过 computed 暴露成 switchNames 等）
      names: [],
      tableItems: [],
      persistedLockMap: {},
      panelStateExtraKeys: ["excludeNameless"],
    };
  },

  created() {
    LockService.ensureLoaded();
    this.readPersistedLocks();
    this.initializeVariables();
  },

  computed: {
    allFilteredLocked() {
      const lockableItems = this.filteredTableItems.filter(
        (item) => item.id > 0,
      );

      if (lockableItems.length === 0) {
        return false;
      }

      return lockableItems.every((item) => !!item.lockEnabled);
    },
  },

  methods: {
    isVariableLock() {
      return this.lockKind === "variable";
    },

    // 开关永远是布尔值；变量保留原始类型（对象 / 数组 / 字符串 / 数字）
    normalizeLockValue(value) {
      return this.isVariableLock() ? value : !!value;
    },

    async initializeVariables() {
      if (!this.isDataReady() || typeof $dataSystem === "undefined") {
        this.tableItems = [];
        return;
      }

      const previousLocks = this.getLockMapById();
      this.names = await this.getNames();

      this.tableItems = this.names.map((name, id) => {
        const savedLock = previousLocks.get(id);
        const current = this.normalizeValue(this.readValue(id));

        return {
          id,
          name,
          value: current,
          lockEnabled: savedLock ? savedLock.lockEnabled : false,
          lockValue: savedLock ? savedLock.lockValue : current,
        };
      });
    },

    readPersistedLocks() {
      this.persistedLockMap = this.isVariableLock()
        ? LockService.getVariableLocks()
        : LockService.getSwitchLocks();
    },

    writePersistedLocks() {
      const payload = buildLockPayload(this.tableItems, this.isVariableLock());

      this.persistedLockMap = payload;

      if (this.isVariableLock()) {
        LockService.setVariableLocks(payload);
      } else {
        LockService.setSwitchLocks(payload);
      }
    },

    // 重新构建 tableItems 时用来保留「哪些项被锁定 / 锁的值是多少」。
    getLockMapById() {
      const map = new Map();

      if (this.tableItems.length > 0) {
        this.tableItems.forEach((item) => {
          map.set(item.id, {
            lockEnabled: !!item.lockEnabled,
            lockValue: this.normalizeLockValue(item.lockValue),
          });
        });
        return map;
      }

      Object.keys(this.persistedLockMap || {}).forEach((idText) => {
        const id = Number(idText);
        if (!Number.isInteger(id)) {
          return;
        }

        const lockItem = this.persistedLockMap[idText] || {};
        map.set(id, {
          lockEnabled: !!lockItem.lockEnabled,
          lockValue: this.normalizeLockValue(lockItem.lockValue),
        });
      });

      return map;
    },

    lockValueOf(id) {
      return this.normalizeValue(this.readValue(id));
    },

    applyLock(item) {
      if (!item || !item.lockEnabled) {
        return;
      }

      if (this.isVariableLock()) {
        LockService.applyVariableLock(item.id);
      } else {
        LockService.applySwitchLock(item.id);
      }

      item.value = this.normalizeValue(this.readValue(item.id));
    },

    toggleItemLock(item) {
      if (!this.requireDataReady(`锁定${this.lockLabel}`)) return;

      // buildLockPayload / LockService 都会跳过 id <= 0（第 0 号是占位），
      // 这里不拦就会得到「图标显示已锁定但实际不生效」的假状态。
      if (!item || !Number.isInteger(item.id) || item.id <= 0) {
        return;
      }

      item.lockEnabled = !item.lockEnabled;
      if (item.lockEnabled) {
        item.lockValue = this.lockValueOf(item.id);
        this.applyLock(item);
      }

      this.writePersistedLocks();
    },

    toggleAllFilteredLocks() {
      if (!this.requireDataReady(`批量锁定${this.lockLabel}`)) return;

      const targetLockEnabled = !this.allFilteredLocked;

      this.filteredTableItems.forEach((item) => {
        if (item.id <= 0) {
          return;
        }

        item.lockEnabled = targetLockEnabled;
        if (targetLockEnabled) {
          item.lockValue = this.lockValueOf(item.id);
          this.applyLock(item);
        }
      });

      this.writePersistedLocks();
    },

    // 只同步「已锁定」的行：未锁定的行可能正在被用户编辑，
    // 不能每秒用游戏值覆盖输入框。
    syncLockedRows() {
      if (!Array.isArray(this.tableItems) || this.tableItems.length === 0) {
        return;
      }

      if (!this.isDataReady() || !LockService.hasAnyLock()) {
        return;
      }

      for (const item of this.tableItems) {
        if (!item || !item.lockEnabled) {
          continue;
        }

        const value = this.normalizeValue(this.readValue(item.id));

        if (!Object.is(item.value, value)) {
          item.value = value;
        }
      }
    },

    // 值被修改后刷新显示；锁定时把新值同步进锁定表
    afterValueChange(item) {
      item.value = this.normalizeValue(this.readValue(item.id));

      if (item.lockEnabled) {
        item.lockValue = this.lockValueOf(item.id);
        this.writePersistedLocks();
      }
    },
  },
};
