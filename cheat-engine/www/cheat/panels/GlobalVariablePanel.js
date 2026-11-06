// @ts-check
import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { Alert } from "../js/AlertHelper.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { KeyValueStorage } from "../js/KeyValueStorage.js";
import { getCheatSettingsPath } from "../js/SettingsPath.js";
import { paginate } from "../js/PaginationHelper.js";
import { t } from "../js/strings.js";
import { tablePanelMixin } from "../js/TablePanelMixin.js";
import { markRaw } from "../libs/vue.js";
import {
  ROOT_FILTERS,
  SEARCH_LIMIT_REASONS,
  SEARCH_LIMITS,
  deleteChildValue,
  formatPathText,
  getChildValue,
  getRootNamesByFilter,
  invalidateRootScanCache,
  parseValueByKind,
  resolvePathValue,
  scanRootGlobalsCached,
  searchGlobalTree,
  setChildValue,
  toJsonText,
} from "../js/GlobalObjectHelper.js";
import {
  buildBreadcrumbItems,
  buildEntries as buildEntryRows,
  entriesShallowEqual,
  filterEntries,
  findPageOfKey as findEntryPage,
} from "../js/GlobalVariableRows.js";

// 搜索上限的模块级缓存：设置文件只在第一次真正需要时同步读一次，
// 之后重复打开面板都复用内存里的值，不再走 fs.readFileSync。
let cachedSearchLimits = null;

function nowMs() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : 0;
}

// 轻量耗时统计：在 DevTools Performance 面板里能看到对应的 measure，
// 用于对比优化前后的点击耗时构成。
function measureFrom(name, startMs) {
  if (
    !startMs ||
    typeof performance === "undefined" ||
    typeof performance.measure !== "function"
  ) {
    return;
  }

  try {
    performance.measure(name, startMs);
  } catch (error) {
    // 忽略异常，统计不影响功能
  }
}

export default {
  name: "GlobalVariablePanel",

  mixins: [tablePanelMixin],

  components: { PaginationFooter, RefreshButton, SearchField },

  template: `
<v-card flat class="ma-0 pa-0">
    <div class="d-flex align-center">
        <search-field
            ref="searchField"
            v-model="search"
            :label="t('globalVariable.searchPlaceholder')"
            clearable
            prepend-icon="mdi-magnify">
            <template #append-inner>
                <v-tooltip location="bottom">
                    <template #activator="{ props }">
                        <v-btn
                            v-bind="props"
                            icon
                            size="x-small"
                            :color="deepSearch ? 'amber' : 'grey-lighten-1'"
                            @click="toggleDeepSearch">
                            <v-icon size="small">mdi-file-search-outline</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ deepSearch ? t("globalVariable.deepSearchOff") : t("globalVariable.deepSearchOn") }}</span>
                </v-tooltip>
            </template>
        </search-field>
        <refresh-button
            btn-class="ml-2"
            @click="reloadAll">
        </refresh-button>
        <v-tooltip location="bottom">
            <template #activator="{ props }">
                <v-btn
                    v-bind="props"
                    color="teal"
                    size="small"
                    icon
                    class="ml-2"
                    @click="openSearchLimits">
                    <v-icon>mdi-tune-variant</v-icon>
                </v-btn>
            </template>
            <span>{{ t("globalVariable.limitsTooltip") }}</span>
        </v-tooltip>
    </div>

    <div class="d-flex align-center flex-wrap ga-1 mt-1">
        <v-btn
            icon
            size="x-small"
            variant="text"
            :disabled="path.length === 0"
            @click="goUp">
            <v-icon size="small">mdi-arrow-up-bold</v-icon>
        </v-btn>
        <template v-for="(item, idx) in breadcrumbItems" :key="idx">
            <v-icon v-if="idx > 0" size="x-small" color="grey">mdi-chevron-right</v-icon>
            <a
                class="text-body-small global-var-link"
                :class="idx === breadcrumbItems.length - 1 ? 'font-weight-bold text-amber-lighten-2' : 'text-grey-lighten-1'"
                @click="onBreadcrumbClick(item)">
                {{ item.label }}
            </a>
        </template>
    </div>

    <div class="d-flex align-center flex-wrap ga-2 mt-1 mb-1">
        <v-btn-toggle
            v-if="isRoot"
            v-model="rootFilter"
            density="compact"
            variant="outlined"
            divided
            mandatory>
            <v-btn size="x-small" value="all">{{ t("globalVariable.filterAll") }}</v-btn>
            <v-btn size="x-small" value="rpg">{{ t("globalVariable.filterRpg") }}</v-btn>
            <v-btn size="x-small" value="plugin">{{ t("globalVariable.filterPlugin") }} ({{ pluginCount }})</v-btn>
        </v-btn-toggle>
        <v-spacer></v-spacer>
        <v-checkbox
            v-model="autoRefresh"
            density="compact"
            hide-details
            :label="t('globalVariable.autoRefresh')">
        </v-checkbox>
        <v-select
            v-model="refreshIntervalMs"
            :items="refreshIntervalOptions"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 100px;"
            :disabled="!autoRefresh">
        </v-select>
        <v-tooltip location="bottom">
            <template #activator="{ props }">
                <v-btn
                    v-bind="props"
                    size="x-small"
                    color="teal"
                    variant="text"
                    @click="openJsonAdd(null)">
                    <v-icon size="small" class="mr-1">mdi-plus</v-icon>
                    <span>{{ currentContainerLabel }}</span>
                </v-btn>
            </template>
            <span>{{ t("globalVariable.addInLayer") }}</span>
        </v-tooltip>
    </div>
    <div
        class="d-flex px-1 py-1 text-body-small text-grey-lighten-1 font-weight-bold"
        v-if="!searchActive">
        <div style="width: 40%;">{{ t("globalVariable.nameHeader") }}</div>
        <div style="width: 14%;">{{ t("globalVariable.typeHeader") }}</div>
        <div class="flex-grow-1">{{ t("globalVariable.valueHeader") }}</div>
        <div style="width: 96px; text-align: right;">{{ t("globalVariable.actionsHeader") }}</div>
    </div>

    <div v-if="!searchActive" class="hide-scrollbar" style="max-height: 290px; overflow-y: auto;">
        <div
            v-for="(item, idx) in pagedEntries"
            :key="rowKey(item, idx)"
            ref="row"
            class="d-flex align-center px-1 py-1 global-var-row"
            :class="{ 'global-var-row-highlight': isHighlighted(item) }">
            <div class="d-flex align-center" style="width: 40%; min-width: 0;">
                <v-icon
                    size="small"
                    class="mr-1"
                    :color="item.isContainer ? 'amber' : 'grey-lighten-1'">
                    {{ item.icon }}
                </v-icon>
                <span
                    class="text-body-medium text-truncate"
                    :class="{ 'global-var-name-link': item.isContainer }"
                    :title="item.name"
                    @click="enterEntry(item)">
                    {{ item.name }}
                </span>
                <v-chip
                    v-if="item.isPlugin"
                    size="x-small"
                    color="indigo"
                    label
                    class="ml-1">
                    {{ t("common.plugin") }}
                </v-chip>
            </div>
            <div style="width: 14%;">
                <span class="text-body-small text-grey-lighten-1">{{ item.typeText }}</span>
            </div>
            <div class="flex-grow-1 d-flex align-center" style="min-width: 0;">
                <template v-if="item.kind === 'boolean'">
                    <v-checkbox
                        :model-value="item.boolValue"
                        density="compact"
                        hide-details
                        @update:model-value="(value) => onBoolInput(item, value)"
                        @keydown.stop>
                    </v-checkbox>
                    <span class="text-body-small text-grey-lighten-1">{{ item.preview }}</span>
                </template>
                <template v-else-if="item.isEditable">
                    <v-text-field
                        :model-value="item.valueText"
                        density="compact"
                        hide-details
                        variant="solo"
                        bg-color="grey-darken-3"
                        class="inline-field"
                        style="width: 150px;"
                        @change="onValueInput(item, $event.target.value)"
                        @focus="$event.target.select()"
                        @keydown.stop>
                    </v-text-field>
                </template>
                <template v-else>
                    <span class="text-body-small text-grey-lighten-1 text-truncate">{{ item.preview }}</span>
                </template>
            </div>
            <div class="d-flex align-center justify-end" style="width: 96px;">
                <v-btn
                    v-if="item.isContainer"
                    :title="t('globalVariable.enter', { name: item.name })"
                    icon
                    size="x-small"
                    color="amber"
                    @click.stop="enterEntry(item)">
                    <v-icon size="small">mdi-arrow-right-bold</v-icon>
                </v-btn>
                <v-btn
                    v-if="item.isContainer"
                    :title="t('globalVariable.editJson')"
                    icon
                    size="x-small"
                    color="light-blue"
                    @click.stop="openJsonEditor(item)">
                    <v-icon size="small">mdi-code-json</v-icon>
                </v-btn>
                <v-btn
                    v-if="item.isContainer"
                    :title="t('globalVariable.addChild', { name: item.name })"
                    icon
                    size="x-small"
                    color="teal"
                    @click.stop="openJsonAdd(item)">
                    <v-icon size="small">mdi-plus</v-icon>
                </v-btn>
                <v-btn
                    v-if="!item.isRoot"
                    :title="t('globalVariable.delete')"
                    icon
                    size="x-small"
                    color="red"
                    @click.stop="confirmDeleteEntry(item)">
                    <v-icon size="small">mdi-delete</v-icon>
                </v-btn>
            </div>
        </div>

        <div v-if="pagedEntries.length === 0" class="pa-3 text-body-small text-grey-lighten-1">
            <div v-if="entriesLoading">{{ t("globalVariable.loadingEntries") }}</div>
            <div v-else-if="containerError">{{ containerError }}</div>
            <div v-else-if="search">
                {{ t("globalVariable.noMatchHere", { search: search }) }}
                <v-btn size="x-small" color="amber" variant="text" @click="toggleDeepSearch">{{ t("globalVariable.deepSearchButton") }}</v-btn>
            </div>
            <div v-else>{{ t("globalVariable.emptyContainer") }}</div>
        </div>
    </div>
    <div v-if="searchActive" class="mt-2">
        <div class="text-body-small text-grey-lighten-1 mb-1">
            {{ t("globalVariable.deepSearchResults", { count: deepSearchResults.length }) }}
            <span v-if="deepSearchTruncated">{{ t("globalVariable.truncated", { reason: deepSearchLimitReason || t("globalVariable.limitDefault") }) }}</span>
        </div>
        <div class="hide-scrollbar" style="max-height: 290px; overflow-y: auto;">
            <div
                v-for="(result, idx) in deepSearchResults"
                :key="'deep-' + idx"
                class="d-flex align-center px-1 py-1 global-var-deep-row">
                <v-icon
                    size="small"
                    class="mr-1"
                    :color="result.isContainer ? 'amber' : 'grey-lighten-1'">
                    {{ result.icon }}
                </v-icon>
                <div class="flex-grow-1" style="min-width: 0;">
                    <div class="text-body-small text-truncate" :title="result.pathText">
                        {{ result.pathText }}
                    </div>
                    <div class="text-body-small text-grey-lighten-1 text-truncate">
                        {{ result.typeText }} · {{ result.preview }}
                    </div>
                </div>
                <v-btn
                    icon
                    size="x-small"
                    color="amber"
                    :title="t('globalVariable.jumpToEntry')"
                    @click.stop="jumpToSearchResult(result)">
                    <v-icon size="small">mdi-target</v-icon>
                </v-btn>
            </div>
            <div v-if="deepSearchResults.length === 0" class="pa-3 text-body-small text-grey-lighten-1">
                {{ deepSearching ? t("globalVariable.searching") : t("globalVariable.noDeepMatch", { depth: searchLimits.maxDepth }) }}
            </div>
        </div>
    </div>

    <pagination-footer
        v-else
        v-model:page="pagination.page"
        v-model:items-per-page="pagination.itemsPerPage"
        :total="totalCount"
        :page-count="pageCount"
        :items-per-page-options="itemsPerPageOptions"
        :show-pagination="showPagination"
        select-width="96px"
        wrapper-class="mt-1"
        @jump="jumpToPage">
    </pagination-footer>
    <v-dialog v-model="jsonDialog.show" max-width="720" persistent>
        <v-card
            @keydown.stop
            @keyup.stop
            @keypress.stop>
            <v-card-title class="d-flex align-center">
                <v-btn icon size="small" @click="closeJsonDialog">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <span class="text-title-large ml-2">{{ jsonDialog.title }}</span>
                <v-spacer></v-spacer>
            </v-card-title>
            <v-card-text>
                <v-text-field
                    v-if="jsonDialog.requireKey"
                    v-model="jsonDialog.keyText"
                    :label="t('globalVariable.propertyName')"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mb-2"
                    @keydown.stop>
                </v-text-field>
                <v-textarea
                    v-model="jsonDialog.text"
                    variant="outlined"
                    rows="14"
                    auto-grow
                    hide-details
                    style="font-family: monospace; font-size: 12px;"
                    @keydown.stop
                    @keyup.stop
                    @keypress.stop>
                </v-textarea>
                <div v-if="jsonDialog.error" class="text-red-lighten-1 text-body-small mt-2">
                    {{ jsonDialog.error }}
                </div>
                <div class="text-body-small text-grey-lighten-1 mt-2">
                    {{ t("globalVariable.jsonFormatHint") }}
                </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="closeJsonDialog">{{ t("common.cancel") }}</v-btn>
                <v-btn color="primary" @click="submitJsonDialog">{{ t("common.save") }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
    <v-dialog v-model="limitsDialog.show" max-width="560" persistent>
        <v-card
            @keydown.stop
            @keyup.stop
            @keypress.stop>
            <v-card-title class="d-flex align-center">
                <v-btn icon size="small" @click="limitsDialog.show = false">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <span class="text-title-large ml-2">{{ t("globalVariable.limitsTitle") }}</span>
                <v-spacer></v-spacer>
            </v-card-title>
            <v-card-text>
                <v-row dense>
                    <v-col cols="6">
                        <v-text-field
                            v-model.number="limitsDialog.maxDepth"
                            type="number"
                            min="1"
                            :label="t('globalVariable.maxDepth')"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @keydown.stop>
                        </v-text-field>
                    </v-col>
                    <v-col cols="6">
                        <v-text-field
                            v-model.number="limitsDialog.maxKeysPerNode"
                            type="number"
                            min="1"
                            :label="t('globalVariable.maxKeysPerNode')"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @keydown.stop>
                        </v-text-field>
                    </v-col>
                    <v-col cols="6">
                        <v-text-field
                            v-model.number="limitsDialog.maxResults"
                            type="number"
                            min="1"
                            :label="t('globalVariable.maxResults')"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @keydown.stop>
                        </v-text-field>
                    </v-col>
                    <v-col cols="6">
                        <v-text-field
                            v-model.number="limitsDialog.maxNodes"
                            type="number"
                            min="1"
                            :label="t('globalVariable.maxNodes')"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @keydown.stop>
                        </v-text-field>
                    </v-col>
                    <v-col cols="6">
                        <v-text-field
                            v-model.number="limitsDialog.maxTimeMs"
                            type="number"
                            min="1"
                            :label="t('globalVariable.maxTimeMs')"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @keydown.stop>
                        </v-text-field>
                    </v-col>
                </v-row>
                <div class="text-body-small text-grey-lighten-1 mt-3">
                    {{ t("globalVariable.limitsHint") }}
                </div>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" @click="resetSearchLimits">{{ t("common.restoreDefault") }}</v-btn>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="limitsDialog.show = false">{{ t("common.cancel") }}</v-btn>
                <v-btn color="primary" @click="saveSearchLimits">{{ t("common.save") }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</v-card>
    `,

  data() {
    return {
      // 搜索
      deepSearch: false,
      searchTimer: null,
      deepSearchResults: [],
      deepSearchTruncated: false,
      deepSearchLimitReason: "",
      deepSearching: false,

      // 深度搜索上限（可在对话框里修改并持久化）
      searchLimits: { ...SEARCH_LIMITS },
      limitsDialog: { show: false, ...SEARCH_LIMITS },
      limitStorage: null,

      // 顶层筛选（取值与 ROOT_FILTERS 相同：all / rpg / plugin）
      rootFilter: ROOT_FILTERS.all,
      rootScan: { rpg: [], plugin: [] },
      pluginNameMap: {},

      // 当前所在层
      path: [],
      container: null,
      containerError: "",
      entries: [],
      highlightKey: null,

      // 初始加载（设置文件读取 / window 扫描 / 构建列表）推迟到首帧之后，
      // 点击「全局变量」时只做状态初始化与骨架渲染
      entriesLoading: true,
      initialLoadPending: false,
      initialLoaded: false,
      initialIdleHandle: null,
      initialLoadTimer: null,

      // 自动刷新
      autoRefresh: true,
      refreshIntervalMs: 2000,
      refreshIntervalOptions: [
        { title: t("common.seconds", { count: 1 }), value: 1000 },
        { title: t("common.seconds", { count: 2 }), value: 2000 },
        { title: t("common.seconds", { count: 5 }), value: 5000 },
      ],
      refreshTimer: null,

      // 分页
      pagination: { page: 1, itemsPerPage: 50 },
      itemsPerPageOptions: [
        10,
        20,
        50,
        100,
        { title: t("common.all"), value: -1 },
      ],
      panelStateExtraKeys: ["rootFilter", "autoRefresh", "refreshIntervalMs"],

      // JSON 编辑对话框
      jsonDialog: {
        show: false,
        mode: "edit",
        title: "",
        keyText: "",
        requireKey: false,
        text: "",
        error: "",
        targetKey: null,
      },
    };
  },

  created() {
    this.limitStorage = new KeyValueStorage(
      getCheatSettingsPath("global-search.json"),
    );
    this.container = markRaw(window);
    // 注意：设置文件读取 / window 扫描 / 构建列表都不在 created 里做，
    // 见 scheduleInitialLoad —— 重活推迟到首帧之后的空闲任务。
  },

  mounted() {
    // 兜底：即使没有被 keep-alive 缓存（activated 不触发）也能完成初始加载
    this.scheduleInitialLoad();
  },

  activated() {
    if (this.initialLoaded) {
      // 切回本面板：同步刷新当前层并恢复自动刷新
      this.refresh(true);
      this.restartAutoRefresh();
    } else {
      // 首次挂载（mounted 已经调度过，这里是幂等兜底）或加载被取消后切回
      this.scheduleInitialLoad();
    }
  },

  deactivated() {
    // 面板被缓存隐藏：暂停自动刷新，取消尚未执行的搜索 / 初始加载
    this.stopAutoRefresh();
    this.clearSearchTimer();
    this.cancelDeepSearch();
    this.cancelInitialLoad();
  },

  beforeUnmount() {
    this.stopAutoRefresh();
    this.clearSearchTimer();
    this.cancelDeepSearch();
    this.cancelInitialLoad();
  },

  watch: {
    search() {
      this.scheduleSearch(!this.__restoringPanelState);
    },

    deepSearch() {
      this.deepSearchResults = [];
      this.deepSearchTruncated = false;
      this.deepSearchLimitReason = "";
      this.scheduleSearch(!this.__restoringPanelState);
    },

    rootFilter() {
      // 恢复面板状态时不要用 navigateTo 清掉刚恢复的搜索词 / 分页
      if (this.isRoot && !this.__restoringPanelState) {
        this.navigateTo([], {});
      }
    },

    autoRefresh() {
      this.restartAutoRefresh();
    },

    refreshIntervalMs() {
      this.restartAutoRefresh();
    },
  },

  computed: {
    panelStateId() {
      return "global-variables";
    },

    isRoot() {
      return this.path.length === 0;
    },

    pluginCount() {
      return this.rootScan.plugin.length;
    },

    currentContainerLabel() {
      return Array.isArray(this.container)
        ? t("globalVariable.addElement")
        : t("globalVariable.addProperty");
    },

    breadcrumbItems() {
      return buildBreadcrumbItems(this.path, t("globalVariable.title"));
    },

    // 深度搜索生效时，用搜索结果替换当前层列表
    searchActive() {
      return this.deepSearch && String(this.search || "").trim() !== "";
    },

    filteredEntries() {
      return filterEntries(this.entries, this.search);
    },

    // 0 表示「全部」
    effectiveItemsPerPage() {
      const perPage = Number(this.pagination.itemsPerPage);
      return Number.isFinite(perPage) && perPage > 0 ? perPage : 0;
    },

    totalCount() {
      return this.filteredEntries.length;
    },

    pagedEntries() {
      return paginate(
        this.filteredEntries,
        this.pagination.page,
        this.pagination.itemsPerPage,
      );
    },

    showPagination() {
      return this.pageCount > 1;
    },
  },

  methods: {
    t,

    // ---------- 初始加载（推迟到首帧之后） ----------

    // 用空闲回调把「读设置文件 + 扫描 window + 构建列表」挪出点击关键路径：
    // 点击「全局变量」时只同步渲染骨架，列表在首帧之后填充。
    scheduleInitialLoad() {
      if (this.initialLoadPending || this.initialLoaded) {
        return;
      }

      this.initialLoadPending = true;

      const run = () => {
        this.initialIdleHandle = null;
        this.initialLoadTimer = null;

        if (!this.initialLoadPending) {
          // 面板已切走 / 关闭，加载被取消
          return;
        }

        this.initialLoadPending = false;
        this.runInitialLoad();
      };

      if (typeof window.requestIdleCallback === "function") {
        this.initialIdleHandle = window.requestIdleCallback(run, {
          timeout: 100,
        });
      } else {
        this.initialLoadTimer = window.setTimeout(run, 0);
      }
    },

    cancelInitialLoad() {
      if (
        this.initialIdleHandle !== null &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(this.initialIdleHandle);
      }

      if (this.initialLoadTimer !== null) {
        window.clearTimeout(this.initialLoadTimer);
      }

      this.initialIdleHandle = null;
      this.initialLoadTimer = null;
      this.initialLoadPending = false;
    },

    runInitialLoad() {
      const startedAt = nowMs();

      try {
        this.loadSearchLimits();
        this.reloadRootGlobals();
        this.initialLoaded = true;
        this.rebuildEntries();
        this.restartAutoRefresh();

        // 加载期间用户已经在搜索框输入了内容时补一次深度搜索
        if (this.searchActive) {
          this.scheduleSearch();
        }
      } catch (error) {
        this.containerError = t("globalVariable.initFailed", {
          message: String((error && error.message) || error),
        });
      } finally {
        this.entriesLoading = false;
        measureFrom("GlobalVariablePanel.initialLoad", startedAt);
      }
    },

    reloadRootGlobals(force = false) {
      const startedAt = nowMs();

      if (force) {
        invalidateRootScanCache();
      }

      this.rootScan = scanRootGlobalsCached(window);

      const map = {};
      this.rootScan.plugin.forEach((name) => {
        map[name] = true;
      });
      this.pluginNameMap = map;
      measureFrom("GlobalVariablePanel.rootScan", startedAt);
    },

    reloadAll() {
      this.reloadRootGlobals(true);
      this.rebuildEntries();
      Alert.success(t("globalVariable.reloaded"));
    },

    // 把当前路径解析成真实对象（window 为根）
    resolveContainer() {
      const result = resolvePathValue(window, this.path);

      if (!result.ok) {
        this.containerError = t("globalVariable.pathUnreadable", {
          message: result.message,
        });
        this.container = null;
        return false;
      }

      // 属性可能在游戏运行时被 delete / 置空。markRaw(null/undefined)
      // 会直接抛 TypeError，自动刷新每个周期都会中断，列表静默冻结。
      const value = result.value;

      if (
        value === null ||
        (typeof value !== "object" && typeof value !== "function")
      ) {
        this.containerError = t("globalVariable.pathEmpty");
        this.container = null;
        return false;
      }

      this.containerError = "";
      this.container = markRaw(value);
      return true;
    },

    rebuildEntries() {
      if (!this.resolveContainer()) {
        if (this.entries.length > 0) {
          this.entries = [];
        }
        return;
      }

      const next = this.buildEntries();

      // 值没有变化时复用旧数组：自动刷新每 2 秒跑一次，
      // 直接整体替换会触发整列表的全量 diff 与重渲染。
      if (entriesShallowEqual(this.entries, next)) {
        return;
      }

      this.entries = next;
    },

    buildEntries() {
      return buildEntryRows({
        container: this.container,
        atRoot: this.path.length === 0,
        rootScan: this.rootScan,
        rootFilter: this.rootFilter,
        pluginNameMap: this.pluginNameMap,
      });
    },

    // ---------- 导航 ----------

    navigateTo(newPath, options = {}) {
      this.path = Array.isArray(newPath) ? newPath.slice() : [];
      this.rebuildEntries();

      // 先清空搜索，再按「未过滤」的列表算页码。
      // 之前顺序反了：用带搜索词的 filteredEntries 算页，清空后列表变长，
      // 高亮目标经常不在当前页。
      this.search = "";
      this.deepSearchResults = [];
      this.deepSearchTruncated = false;
      this.deepSearchLimitReason = "";

      const highlightKey = options.highlightKey;
      this.highlightKey =
        highlightKey === undefined || highlightKey === null
          ? null
          : String(highlightKey);

      const page =
        this.highlightKey === null ? 1 : this.findPageOfKey(this.highlightKey);

      // 清空搜索会触发 watcher 把分页重置到第 1 页；分页定位放到下一次
      // tick。滚动还要再等一帧，否则 $refs.row 仍是旧页的 DOM。
      this.$nextTick(() => {
        this.pagination.page = page;

        if (this.highlightKey !== null) {
          this.$nextTick(() => this.scrollToHighlight());
        }
      });
    },

    goUp() {
      if (this.path.length === 0) {
        return;
      }

      this.navigateTo(this.path.slice(0, -1));
    },

    onBreadcrumbClick(item) {
      this.navigateTo(item.path);
    },

    enterEntry(entry) {
      if (!entry || !entry.isContainer) {
        return;
      }

      this.navigateTo([...this.path, entry.key]);
    },

    // 重新读取当前层的值（force=true 时忽略输入框焦点保护）
    refresh(force = false) {
      if (!force && this.isEditingInput()) {
        return;
      }

      this.rebuildEntries();
    },

    // ---------- 修改值 ----------

    // 是否正在输入框里打字（避免自动刷新覆盖用户输入）
    isEditingInput() {
      const root = this.$el;
      const active = document.activeElement;

      if (!root || !active || typeof root.contains !== "function") {
        return false;
      }

      if (!root.contains(active)) {
        return false;
      }

      // 搜索框本身不算「正在编辑值」：焦点停在搜索框时自动刷新不应暂停，
      // 否则游戏变量变化后列表会静默停止更新。
      const searchField = this.$refs.searchField;
      const searchRoot = searchField && (searchField.$el || searchField);

      if (
        searchRoot &&
        typeof searchRoot.contains === "function" &&
        searchRoot.contains(active)
      ) {
        return false;
      }

      const tagName = active.tagName;
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        /** @type {HTMLElement} */ (active).isContentEditable === true
      );
    },

    onValueInput(entry, text) {
      const parsed = parseValueByKind(text, entry.kind);

      if (!parsed.ok) {
        Alert.warn(
          t("globalVariable.modifyFailed", { message: parsed.message }),
        );
        this.refresh(true);
        return;
      }

      this.applyValue(entry, parsed.value);
    },

    onBoolInput(entry, value) {
      this.applyValue(entry, value === true);
    },

    applyValue(entry, value) {
      if (!this.container) {
        return;
      }

      const result = setChildValue(this.container, entry.key, value);

      if (!result.ok) {
        Alert.error(
          t("globalVariable.modifyFailed", { message: result.message }),
        );
        this.refresh(true);
        return;
      }

      this.refresh(true);
    },

    // ---------- JSON 编辑 / 新增 ----------

    openJsonEditor(entry) {
      if (!entry || !entry.isContainer || !this.container) {
        return;
      }

      const child = getChildValue(this.container, entry.key);

      if (!child.ok) {
        Alert.error(t("globalVariable.readFailed", { message: child.message }));
        return;
      }

      const json = toJsonText(child.value);

      if (!json.ok) {
        Alert.error(json.message);
        return;
      }

      this.jsonDialog = {
        show: true,
        mode: "edit",
        title: t("globalVariable.editJsonTitle", {
          path: formatPathText([...this.path, entry.key]),
        }),
        keyText: "",
        requireKey: false,
        text: json.text,
        error: "",
        targetKey: entry.key,
      };
    },

    openJsonAdd(entry) {
      if (!this.container) {
        return;
      }

      let targetLabel =
        this.path.length === 0 ? "window" : formatPathText(this.path);
      let isArray = Array.isArray(this.container);
      const targetKey = entry ? entry.key : null;

      if (entry) {
        const child = getChildValue(this.container, entry.key);

        if (!child.ok) {
          Alert.error(
            t("globalVariable.readFailed", { message: child.message }),
          );
          return;
        }

        targetLabel = formatPathText([...this.path, entry.key]);
        isArray = Array.isArray(child.value);
      }

      this.jsonDialog = {
        show: true,
        mode: "add",
        title: t("globalVariable.addTitle", {
          kind: isArray
            ? t("globalVariable.addElement")
            : t("globalVariable.addProperty"),
          path: targetLabel,
        }),
        keyText: "",
        requireKey: !isArray,
        text: isArray ? "null" : t("globalVariable.newValueText"),
        error: "",
        targetKey,
      };
    },

    closeJsonDialog() {
      this.jsonDialog.show = false;
      this.jsonDialog.error = "";
    },

    // 新增时写入哪个对象（targetKey 为 null 表示当前层）
    resolveDialogTargetContainer() {
      const dialog = this.jsonDialog;

      if (dialog.mode === "add" && dialog.targetKey !== null) {
        const child = getChildValue(this.container, dialog.targetKey);

        if (!child.ok) {
          return { ok: false, message: child.message };
        }

        return { ok: true, value: child.value };
      }

      return { ok: true, value: this.container };
    },

    submitJsonDialog() {
      const dialog = this.jsonDialog;
      dialog.error = "";

      if (!this.container) {
        dialog.error = t("globalVariable.layerNotWritable");
        return;
      }

      const resolved = this.resolveDialogTargetContainer();

      if (!resolved.ok) {
        dialog.error = t("globalVariable.readFailed", {
          message: resolved.message,
        });
        return;
      }

      const targetContainer = resolved.value;
      let parsed;

      try {
        parsed = JSON.parse(dialog.text);
      } catch (error) {
        dialog.error = t("globalVariable.jsonParseFailed", {
          message: String((error && error.message) || error),
        });
        return;
      }

      let key = dialog.targetKey;

      if (dialog.mode === "add") {
        if (Array.isArray(targetContainer)) {
          key = targetContainer.length;
        } else {
          key = String(dialog.keyText || "").trim();

          if (!key) {
            dialog.error = t("globalVariable.keyRequired");
            return;
          }
        }
      }

      const result = setChildValue(targetContainer, key, parsed);

      if (!result.ok) {
        dialog.error = t("globalVariable.writeFailed", {
          message: result.message,
        });
        return;
      }

      dialog.show = false;
      this.rebuildEntries();
      Alert.success(t("globalVariable.saved"));
    },

    // ---------- 删除属性 ----------

    confirmDeleteEntry(entry) {
      if (!entry || entry.isRoot) {
        return;
      }

      const self = this;
      const label = formatPathText([...this.path, entry.key]);

      ConfirmDialog.show({
        width: 460,
        message: t("globalVariable.deleteConfirm", { label }),
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: "mdi-delete",
            color: "red",
            label: t("common.delete"),
            action() {
              self.deleteEntry(entry);
              ConfirmDialog.close();
            },
          },
        ],
      });
    },

    deleteEntry(entry) {
      if (!this.container) {
        return;
      }

      const result = deleteChildValue(this.container, entry.key);

      if (!result.ok) {
        Alert.error(
          t("globalVariable.deleteFailed", { message: result.message }),
        );
        return;
      }

      this.rebuildEntries();
      Alert.success(t("globalVariable.deleted", { name: entry.name }));
    },

    // ---------- 搜索 ----------

    toggleDeepSearch() {
      this.deepSearch = !this.deepSearch;
    },

    scheduleSearch(resetPage = true) {
      if (resetPage) {
        this.pagination.page = 1;
      }

      this.clearSearchTimer();

      if (!this.searchActive) {
        this.cancelDeepSearch();
        this.deepSearchResults = [];
        this.deepSearchTruncated = false;
        this.deepSearchLimitReason = "";
        return;
      }

      this.searchTimer = window.setTimeout(() => {
        this.runDeepSearch(this.search);
      }, 300);
    },

    // 取消尚未开始 / 正在等待让出的深度搜索。
    // searchGlobalTree 是同步的，无法中途打断，只能让结果在返回后被丢弃。
    cancelDeepSearch() {
      this.__deepSearchToken = (this.__deepSearchToken || 0) + 1;
      this.deepSearching = false;
    },

    // 深度搜索的起点：在根层只搜索当前筛选出的全局变量，
    // 避免遍历 window 上的浏览器 / NW.js 宿主对象（会直接搞崩进程）。
    buildSearchRoot() {
      if (!this.isRoot) {
        return this.container || window;
      }

      const root = {};
      getRootNamesByFilter(this.rootScan, this.rootFilter).forEach((name) => {
        const child = getChildValue(window, name);
        if (child.ok) {
          root[name] = child.value;
        }
      });

      return root;
    },

    async runDeepSearch(keyword) {
      if (!this.searchActive) {
        return;
      }

      const token = (this.__deepSearchToken || 0) + 1;
      this.__deepSearchToken = token;
      this.deepSearching = true;

      // 先让出一帧让「搜索中...」渲染出来。searchGlobalTree 是同步的，
      // 对较大的全局对象树最长会阻塞 2 秒，无法在扫描过程中更新 UI。
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (token !== this.__deepSearchToken) {
        // 已有更新的搜索接管，deepSearching 由它负责
        return;
      }

      if (!this.searchActive) {
        this.deepSearching = false;
        return;
      }

      try {
        const { results, truncated, reason } = searchGlobalTree(
          this.buildSearchRoot(),
          keyword,
          { basePath: this.path.slice(), ...this.searchLimits },
        );

        this.deepSearchResults = results;
        this.deepSearchTruncated = truncated;
        this.deepSearchLimitReason = truncated
          ? t(SEARCH_LIMIT_REASONS[reason] || "globalVariable.limitDefault")
          : "";
      } catch (error) {
        this.deepSearchResults = [];
        this.deepSearchTruncated = false;
        this.deepSearchLimitReason = "";
        Alert.error(
          t("globalVariable.searchFailed", { message: String(error) }),
        );
      } finally {
        if (token === this.__deepSearchToken) {
          this.deepSearching = false;
        }
      }
    },

    // ---------- 深度搜索上限设置 ----------

    loadSearchLimits() {
      if (cachedSearchLimits) {
        this.searchLimits = { ...cachedSearchLimits };
        return;
      }

      try {
        const raw = this.limitStorage.getItem("limits");

        if (!raw) {
          cachedSearchLimits = { ...SEARCH_LIMITS };
          this.searchLimits = { ...cachedSearchLimits };
          return;
        }

        const saved = JSON.parse(raw);
        const merged = { ...SEARCH_LIMITS };

        Object.keys(merged).forEach((key) => {
          const value = Number(saved[key]);
          if (Number.isFinite(value) && value > 0) {
            merged[key] = value;
          }
        });

        cachedSearchLimits = merged;
        this.searchLimits = { ...merged };
      } catch (error) {
        cachedSearchLimits = { ...SEARCH_LIMITS };
        this.searchLimits = { ...cachedSearchLimits };
      }
    },

    openSearchLimits() {
      this.limitsDialog = { show: true, ...this.searchLimits };
    },

    resetSearchLimits() {
      this.limitsDialog = { show: true, ...SEARCH_LIMITS };
    },

    saveSearchLimits() {
      const next = { ...SEARCH_LIMITS };

      Object.keys(next).forEach((key) => {
        const value = Math.floor(Number(this.limitsDialog[key]));
        if (Number.isFinite(value) && value > 0) {
          next[key] = value;
        }
      });

      this.searchLimits = next;
      this.limitsDialog = { show: false, ...next };
      cachedSearchLimits = { ...next };

      try {
        this.limitStorage.setItem("limits", JSON.stringify(next));
      } catch (error) {
        Alert.warn(t("globalVariable.saveLimitsFailed"));
      }

      this.scheduleSearch();
    },

    clearSearchTimer() {
      if (this.searchTimer) {
        window.clearTimeout(this.searchTimer);
        this.searchTimer = null;
      }
    },

    jumpToSearchResult(result) {
      if (!result) {
        return;
      }

      // navigateTo 会清空搜索并重新定位分页 / 高亮
      this.navigateTo(result.path.slice(0, -1), {
        highlightKey: result.path[result.path.length - 1],
      });
    },

    // ---------- 自动刷新 ----------

    restartAutoRefresh() {
      this.stopAutoRefresh();

      if (!this.autoRefresh) {
        return;
      }

      const interval = Number(this.refreshIntervalMs);
      if (!Number.isFinite(interval) || interval <= 0) {
        return;
      }

      this.refreshTimer = window.setInterval(() => {
        if (this.jsonDialog.show) {
          return;
        }

        this.refresh(false);
      }, interval);
    },

    stopAutoRefresh() {
      if (!this.refreshTimer) {
        return;
      }

      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    },

    // ---------- 分页 / 列表行辅助 ----------

    findPageOfKey(key) {
      return findEntryPage(
        this.filteredEntries,
        key,
        this.effectiveItemsPerPage,
      );
    },

    scrollToHighlight() {
      if (this.highlightKey === null) {
        return;
      }

      const index = this.pagedEntries.findIndex(
        (item) => String(item.key) === String(this.highlightKey),
      );

      if (index < 0) {
        return;
      }

      const rowRefs = this.$refs.row;
      const rows = Array.isArray(rowRefs) ? rowRefs : rowRefs ? [rowRefs] : [];
      const row = rows[index];
      const element = row && row.$el ? row.$el : row;

      if (element && typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },

    rowKey(item, index) {
      return `${String(item.key)}-${index}`;
    },

    isHighlighted(item) {
      return (
        this.highlightKey !== null && String(item.key) === this.highlightKey
      );
    },
  },
};
