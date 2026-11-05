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
      if (typeof this.initializeVariables === "function") {
        this.initializeVariables();
        return;
      }

      if (typeof this.reload === "function") {
        this.reload();
      }
    },
  },
};
