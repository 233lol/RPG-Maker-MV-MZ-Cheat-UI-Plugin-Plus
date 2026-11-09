// @ts-check
import { subscribeGameData } from "./GameDataState.js";

/**
 * 面板通用 mixin：游戏数据变化后自动刷新。
 *
 * 组件只要有 `initializeVariables()` 或 `reload()` 就会被调用；
 * 50ms 防抖用于合并「读档时 setupNewGame + extractSaveContents + 地图加载」
 * 这类连续事件。
 */
export const gameDataWatcherMixin = {
  created() {
    this.__gameDataRefreshTimer = null;
    this.__gameDataUnsubscribe = null;
    this.__gameDataDirty = false;
    // 默认活跃：没有 activated/deactivated 的嵌套组件（例如物品表格）
    // 仍保持原来的订阅行为。
    this.__gameDataActive = true;
    this.__gameDataHasActivated = false;

    this.__gameDataUnsubscribe = subscribeGameData(() => {
      if (!this.__gameDataActive) {
        // 面板被 keep-alive 隐藏时只记一笔，重新激活时再刷新一次。
        this.__gameDataDirty = true;
        return;
      }

      this.__scheduleGameDataRefresh();
    });
  },

  activated() {
    this.__gameDataHasActivated = true;
    this.__gameDataActive = true;

    if (this.__gameDataDirty) {
      this.__gameDataDirty = false;
      this.__scheduleGameDataRefresh();
    }
  },

  deactivated() {
    // 子组件不会收到 deactivated；只有真正被 keep-alive 缓存的面板才暂停。
    if (!this.__gameDataHasActivated) {
      return;
    }

    // 防抖还没执行就切走时，把这次变化记成 dirty，切回后再补刷新。
    if (this.__gameDataRefreshTimer) {
      this.__gameDataDirty = true;
    }

    this.__gameDataActive = false;
    this.__clearGameDataRefreshTimer();
  },

  beforeUnmount() {
    this.__clearGameDataRefreshTimer();
    this.__gameDataDirty = false;

    if (this.__gameDataUnsubscribe) {
      this.__gameDataUnsubscribe();
      this.__gameDataUnsubscribe = null;
    }
  },

  methods: {
    __clearGameDataRefreshTimer() {
      if (this.__gameDataRefreshTimer) {
        clearTimeout(this.__gameDataRefreshTimer);
        this.__gameDataRefreshTimer = null;
      }
    },

    __scheduleGameDataRefresh() {
      this.__clearGameDataRefreshTimer();

      this.__gameDataRefreshTimer = setTimeout(() => {
        this.__gameDataRefreshTimer = null;
        this.__refreshFromGameData();
      }, 50);
    },

    __refreshFromGameData() {
      try {
        let result = null;

        if (typeof this.initializeVariables === "function") {
          result = this.initializeVariables();
        } else if (typeof this.reload === "function") {
          result = this.reload();
        }

        // 面板的 initializeVariables / reload 可能是 async；同步 try/catch
        // 抓不到 rejection，这里补一层 warn，避免未处理的 Promise 异常。
        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            console.warn("[cheat plugin] 游戏数据变化后刷新面板失败", error);
          });
        }
      } catch (error) {
        console.warn("[cheat plugin] 游戏数据变化后刷新面板失败", error);
      }
    },
  },
};
