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
    this.__gameDataUnsubscribe = subscribeGameData(() => {
      if (this.__gameDataRefreshTimer) {
        clearTimeout(this.__gameDataRefreshTimer);
      }

      this.__gameDataRefreshTimer = setTimeout(() => {
        this.__gameDataRefreshTimer = null;
        this.__refreshFromGameData();
      }, 50);
    });
  },

  beforeUnmount() {
    if (this.__gameDataRefreshTimer) {
      clearTimeout(this.__gameDataRefreshTimer);
      this.__gameDataRefreshTimer = null;
    }

    if (this.__gameDataUnsubscribe) {
      this.__gameDataUnsubscribe();
      this.__gameDataUnsubscribe = null;
    }
  },

  methods: {
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
