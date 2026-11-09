// @ts-check
import PageJump from "./PageJump.js";
import {
  getItemsPerPageOptions,
  getPageBounds,
} from "../js/PaginationHelper.js";
import { t } from "../js/strings.js";

// 统一的表格底部分页栏。
//
// 各面板原本各自复制了一份「每页 N 条 / 当前范围 / 页码 / 跳转」的模板，
// 这里集中在一处，避免修改分页行为时漏改某个面板。
export default {
  name: "PaginationFooter",

  components: { PageJump },

  props: {
    total: {
      type: Number,
      default: 0,
    },
    page: {
      type: Number,
      default: 1,
    },
    itemsPerPage: {
      type: Number,
      default: 5,
    },
    // 某些面板（例如技能按角色分页）的页数不是从 total 直接算出来的。
    pageCount: {
      type: Number,
      default: null,
    },
    itemsPerPageOptions: {
      type: Array,
      default: () => [],
    },
    totalVisible: {
      type: Number,
      default: 5,
    },
    showPageSize: {
      type: Boolean,
      default: true,
    },
    showRange: {
      type: Boolean,
      default: true,
    },
    showPagination: {
      type: Boolean,
      default: true,
    },
    selectWidth: {
      type: String,
      default: "90px",
    },
    wrapperClass: {
      type: String,
      default: "pa-2",
    },
  },

  emits: ["update:page", "update:itemsPerPage", "jump"],

  computed: {
    perPageLabel() {
      return t("common.perPage");
    },

    resolvedItemsPerPageOptions() {
      return this.itemsPerPageOptions.length > 0
        ? this.itemsPerPageOptions
        : getItemsPerPageOptions();
    },

    bounds() {
      return getPageBounds(this.total, this.page, this.itemsPerPage);
    },

    resolvedPageCount() {
      // Vue unwraps computed getters at runtime; plain TS sees this.bounds as
      // the getter function, so narrow it manually for the property access.
      const bounds = /** @type {ReturnType<typeof getPageBounds>} */ (
        /** @type {any} */ (this.bounds)
      );
      return this.pageCount == null ? bounds.pageCount : this.pageCount;
    },

    rangeText() {
      const bounds = /** @type {ReturnType<typeof getPageBounds>} */ (
        /** @type {any} */ (this.bounds)
      );
      return `${bounds.start}-${bounds.stop} / ${this.total}`;
    },
  },

  template: `
<div :class="['d-flex', 'align-center', 'justify-space-between', wrapperClass]">
    <div v-if="showPageSize" class="d-flex align-center">
        <span class="text-body-small mr-2">{{ perPageLabel }}</span>
        <v-select
            :model-value="itemsPerPage"
            :items="resolvedItemsPerPageOptions"
            density="compact"
            hide-details
            variant="outlined"
            :style="{ width: selectWidth }"
            @update:model-value="$emit('update:itemsPerPage', $event)">
        </v-select>
    </div>
    <div v-else-if="showRange" class="text-body-small text-no-wrap">
        {{ rangeText }}
    </div>

    <div class="d-flex align-center ga-2">
        <span v-if="showPageSize && showRange" class="text-body-small text-no-wrap">
            {{ rangeText }}
        </span>
        <v-pagination
            v-if="showPagination"
            :model-value="page"
            :length="resolvedPageCount"
            density="compact"
            :total-visible="totalVisible"
            size="small"
            @update:model-value="$emit('update:page', $event)">
        </v-pagination>
        <page-jump
            v-if="showPagination"
            :page="page"
            :page-count="resolvedPageCount"
            @jump="$emit('jump', $event)">
        </page-jump>
    </div>
</div>
    `,
};
