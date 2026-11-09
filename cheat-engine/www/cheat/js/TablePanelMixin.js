// @ts-check
// 表格类面板的公共状态：搜索词、分页、以及面板状态的默认持久化实现。
//
// 之前 8 个面板各写一份 search / pagination / totalCount / pageCount /
// getPanelStateSnapshot / applyPanelState / jumpToPage。这里统一收口，
// 面板只需要：
//   - 提供 `filteredTableItems`（或自己覆盖 `totalCount`）；
//   - 用 `panelStateExtraKeys` 声明除 search / pagination 外要记住的字段。
import {
  getItemsPerPageOptions,
  getPageCount,
  paginationWatcherMixin,
} from "./PaginationHelper.js";
import { panelStateMixin } from "./PanelState.js";

export const tablePanelMixin = {
  mixins: [panelStateMixin, paginationWatcherMixin],

  data() {
    return {
      search: "",
      pagination: { page: 1, itemsPerPage: 5 },
      // 除 search / pagination 之外，还需要写进 panel-state.json 的字段名
      panelStateExtraKeys: [],
    };
  },

  computed: {
    // 每次语言变化后重新生成，「全部」选项不会停留在旧语言。
    itemsPerPageOptions() {
      return getItemsPerPageOptions();
    },

    // 默认取 filteredTableItems 的长度；过滤结果叫别的名字的面板
    // （filteredMaps / filteredShortcuts / filteredEntries）自行覆盖。
    totalCount() {
      return Array.isArray(this.filteredTableItems)
        ? this.filteredTableItems.length
        : 0;
    },

    pageCount() {
      return getPageCount(this.totalCount, this.pagination.itemsPerPage);
    },
  },

  methods: {
    jumpToPage(page) {
      this.pagination.page = page;
    },

    getPanelStateSnapshot() {
      const snapshot = {
        search: this.search,
        pagination: this.pagination,
      };

      for (const key of this.panelStateExtraKeys) {
        snapshot[key] = this[key];
      }

      return snapshot;
    },

    applyPanelState(state) {
      if (typeof state.search === "string") {
        this.search = state.search;
      }

      if (state.pagination && typeof state.pagination === "object") {
        this.pagination = { ...this.pagination, ...state.pagination };
      }

      for (const key of this.panelStateExtraKeys) {
        if (Object.hasOwnProperty.call(state, key)) {
          this[key] = state[key];
        }
      }
    },
  },
};
