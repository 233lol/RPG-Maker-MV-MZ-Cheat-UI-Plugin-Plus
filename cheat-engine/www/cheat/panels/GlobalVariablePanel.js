import PageJump from "../components/PageJump.js";
import { Alert } from "../js/AlertHelper.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { KeyValueStorage } from "../js/KeyValueStorage.js";
import { markRaw } from "../libs/vue.js";
import {
  ROOT_FILTERS,
  SEARCH_LIMIT_REASONS,
  SEARCH_LIMITS,
  createEntry,
  deleteChildValue,
  formatPathText,
  getChildValue,
  getContainerKeys,
  getRootNamesByFilter,
  isHiddenKind,
  parseValueByKind,
  resolvePathValue,
  scanRootGlobals,
  searchGlobalTree,
  setChildValue,
  toJsonText,
} from "../js/GlobalObjectHelper.js";

export default {
  name: "GlobalVariablePanel",

  components: { PageJump },

  template: `
<v-card flat class="ma-0 pa-0">
    <div class="d-flex align-center">
        <v-text-field
            label="搜索变量名 / 值..."
            variant="solo"
            bg-color="grey-darken-3"
            v-model="search"
            density="compact"
            hide-details
            clearable
            class="flex-grow-1"
            @focus="$event.target.select()"
            @keydown.stop>
            <template #prepend-inner>
                <v-icon size="small">mdi-magnify</v-icon>
            </template>
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
                    <span>{{ deepSearch ? '关闭深度搜索（只搜索当前层）' : '深度搜索（递归搜索所有嵌套变量）' }}</span>
                </v-tooltip>
            </template>
        </v-text-field>
        <v-tooltip location="bottom">
            <template #activator="{ props }">
                <v-btn
                    v-bind="props"
                    color="pink"
                    size="small"
                    icon
                    class="ml-2"
                    @click="reloadAll">
                    <v-icon>mdi-refresh</v-icon>
                </v-btn>
            </template>
            <span>重新加载游戏数据</span>
        </v-tooltip>
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
            <span>深度搜索上限设置</span>
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
            <v-btn size="x-small" value="all">全部</v-btn>
            <v-btn size="x-small" value="rpg">游戏内置</v-btn>
            <v-btn size="x-small" value="plugin">插件 ({{ pluginCount }})</v-btn>
        </v-btn-toggle>
        <v-spacer></v-spacer>
        <v-checkbox
            v-model="autoRefresh"
            density="compact"
            hide-details
            label="自动刷新">
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
            <span>在当前层新增一个属性 / 元素（JSON）</span>
        </v-tooltip>
    </div>
    <div
        class="d-flex px-1 py-1 text-body-small text-grey-lighten-1 font-weight-bold"
        v-if="!searchActive">
        <div style="width: 40%;">名称</div>
        <div style="width: 14%;">类型</div>
        <div class="flex-grow-1">值</div>
        <div style="width: 96px; text-align: right;">操作</div>
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
                    插件
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
                    :title="'进入 ' + item.name"
                    icon
                    size="x-small"
                    color="amber"
                    @click.stop="enterEntry(item)">
                    <v-icon size="small">mdi-arrow-right-bold</v-icon>
                </v-btn>
                <v-btn
                    v-if="item.isContainer"
                    title="编辑 JSON"
                    icon
                    size="x-small"
                    color="light-blue"
                    @click.stop="openJsonEditor(item)">
                    <v-icon size="small">mdi-code-json</v-icon>
                </v-btn>
                <v-btn
                    v-if="item.isContainer"
                    :title="'在 ' + item.name + ' 内新增属性 / 元素'"
                    icon
                    size="x-small"
                    color="teal"
                    @click.stop="openJsonAdd(item)">
                    <v-icon size="small">mdi-plus</v-icon>
                </v-btn>
                <v-btn
                    v-if="!item.isRoot"
                    title="删除"
                    icon
                    size="x-small"
                    color="red"
                    @click.stop="confirmDeleteEntry(item)">
                    <v-icon size="small">mdi-delete</v-icon>
                </v-btn>
            </div>
        </div>

        <div v-if="pagedEntries.length === 0" class="pa-3 text-body-small text-grey-lighten-1">
            <div v-if="containerError">{{ containerError }}</div>
            <div v-else-if="search">
                「{{ search }}」在当前层没有匹配项
                <v-btn size="x-small" color="amber" variant="text" @click="toggleDeepSearch">深度搜索</v-btn>
            </div>
            <div v-else>（没有可显示的属性）</div>
        </div>
    </div>
    <div v-if="searchActive" class="mt-2">
        <div class="text-body-small text-grey-lighten-1 mb-1">
            深度搜索结果 {{ deepSearchResults.length }} 项
            <span v-if="deepSearchTruncated">（{{ deepSearchLimitReason || '已达到搜索上限' }}，结果可能不完整）</span>
        </div>
        <div class="hide-scrollbar" style="max-height: 290px; overflow-y: auto;">
            <div
                v-for="(result, idx) in deepSearchResults"
                :key="'deep-' + idx"
                class="d-flex align-center px-1 py-1"
                style="border-bottom: 1px solid rgba(255,255,255,0.08);">
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
                <v-btn icon size="x-small" color="amber" @click.stop="jumpToSearchResult(result)">
                    <v-icon size="small">mdi-target</v-icon>
                </v-btn>
            </div>
            <div v-if="deepSearchResults.length === 0" class="pa-3 text-body-small text-grey-lighten-1">
                {{ deepSearching ? '搜索中...' : '没有匹配的嵌套变量（最多搜索 ' + searchLimits.maxDepth + ' 层）' }}
            </div>
        </div>
    </div>

    <div v-else class="d-flex align-center justify-space-between mt-1">
        <div class="d-flex align-center">
            <span class="text-body-small mr-2">每页</span>
            <v-select
                v-model="pagination.itemsPerPage"
                :items="itemsPerPageOptions"
                density="compact"
                hide-details
                variant="outlined"
                style="width: 96px;">
            </v-select>
        </div>
        <div class="d-flex align-center ga-2">
            <span class="text-body-small text-no-wrap">{{ paginationStart }}-{{ paginationStop }} / {{ totalCount }}</span>
            <v-pagination
                v-if="showPagination"
                v-model="pagination.page"
                :length="pageCount"
                density="compact"
                :total-visible="5"
                size="small">
            </v-pagination>
            <page-jump
                v-if="showPagination"
                :page="pagination.page"
                :page-count="pageCount"
                @jump="jumpToPage">
            </page-jump>
        </div>
    </div>
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
                    label="属性名"
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
                    支持 JSON 格式（数字 / 字符串 / 布尔 / null / 数组 / 对象）
                </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="closeJsonDialog">取消</v-btn>
                <v-btn color="primary" @click="submitJsonDialog">保存</v-btn>
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
                <span class="text-title-large ml-2">深度搜索上限</span>
                <v-spacer></v-spacer>
            </v-card-title>
            <v-card-text>
                <v-row dense>
                    <v-col cols="6">
                        <v-text-field
                            v-model.number="limitsDialog.maxDepth"
                            type="number"
                            min="1"
                            label="最大深度"
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
                            label="每层最大属性数"
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
                            label="最大结果数"
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
                            label="最大节点数"
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
                            label="最大耗时(ms)"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @keydown.stop>
                        </v-text-field>
                    </v-col>
                </v-row>
                <div class="text-body-small text-grey-lighten-1 mt-3">
                    数值越大搜索越完整，但越慢、越占内存。搜索被截断时结果上方会提示原因。
                </div>
            </v-card-text>
            <v-card-actions>
                <v-btn variant="text" @click="resetSearchLimits">恢复默认</v-btn>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="limitsDialog.show = false">取消</v-btn>
                <v-btn color="primary" @click="saveSearchLimits">保存</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</v-card>
    `,

  data() {
    return {
      // 搜索
      search: "",
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

      // 自动刷新
      autoRefresh: true,
      refreshIntervalMs: 2000,
      refreshIntervalOptions: [
        { title: "1 秒", value: 1000 },
        { title: "2 秒", value: 2000 },
        { title: "5 秒", value: 5000 },
      ],
      refreshTimer: null,

      // 分页
      pagination: { page: 1, itemsPerPage: 50 },
      itemsPerPageOptions: [10, 20, 50, 100, { title: "全部", value: -1 }],

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
      "./www/cheat-settings/global-search.json",
    );
    this.loadSearchLimits();
    this.container = markRaw(window);
    this.reloadRootGlobals();
    this.navigateTo([], {});
    this.restartAutoRefresh();
  },

  beforeUnmount() {
    this.stopAutoRefresh();
    this.clearSearchTimer();
  },

  watch: {
    search() {
      this.scheduleSearch();
    },

    deepSearch() {
      this.deepSearchResults = [];
      this.deepSearchTruncated = false;
      this.deepSearchLimitReason = "";
      this.scheduleSearch();
    },

    rootFilter() {
      if (this.isRoot) {
        this.navigateTo([], {});
      }
    },

    autoRefresh() {
      this.restartAutoRefresh();
    },

    refreshIntervalMs() {
      this.restartAutoRefresh();
    },

    pageCount(value) {
      if (this.pagination.page > value) {
        this.pagination.page = value;
      }
    },
  },

  computed: {
    isRoot() {
      return this.path.length === 0;
    },

    pluginCount() {
      return this.rootScan.plugin.length;
    },

    currentContainerLabel() {
      return Array.isArray(this.container) ? "新增元素" : "新增属性";
    },

    breadcrumbItems() {
      const items = [{ label: "全局变量", path: [] }];

      this.path.forEach((key, index) => {
        items.push({
          label: String(key),
          path: this.path.slice(0, index + 1),
        });
      });

      return items;
    },

    // 深度搜索生效时，用搜索结果替换当前层列表
    searchActive() {
      return this.deepSearch && String(this.search || "").trim() !== "";
    },

    filteredEntries() {
      const keyword = String(this.search || "")
        .trim()
        .toLowerCase();

      if (!keyword) {
        return this.entries;
      }

      return this.entries.filter((item) => this.entryMatches(item, keyword));
    },

    // 0 表示「全部」
    effectiveItemsPerPage() {
      const perPage = Number(this.pagination.itemsPerPage);
      return Number.isFinite(perPage) && perPage > 0 ? perPage : 0;
    },

    totalCount() {
      return this.filteredEntries.length;
    },

    pageCount() {
      if (this.effectiveItemsPerPage <= 0) {
        return 1;
      }

      return Math.ceil(this.totalCount / this.effectiveItemsPerPage) || 1;
    },

    pagedEntries() {
      if (this.effectiveItemsPerPage <= 0) {
        return this.filteredEntries;
      }

      const start = (this.pagination.page - 1) * this.effectiveItemsPerPage;
      return this.filteredEntries.slice(
        start,
        start + this.effectiveItemsPerPage,
      );
    },

    showPagination() {
      return this.pageCount > 1;
    },

    paginationStart() {
      if (this.totalCount === 0) {
        return 0;
      }

      if (this.effectiveItemsPerPage <= 0) {
        return 1;
      }

      return (this.pagination.page - 1) * this.effectiveItemsPerPage + 1;
    },

    paginationStop() {
      if (this.effectiveItemsPerPage <= 0) {
        return this.totalCount;
      }

      return Math.min(
        this.pagination.page * this.effectiveItemsPerPage,
        this.totalCount,
      );
    },
  },

  methods: {
    reloadRootGlobals() {
      this.rootScan = scanRootGlobals(window);

      const map = {};
      this.rootScan.plugin.forEach((name) => {
        map[name] = true;
      });
      this.pluginNameMap = map;
    },

    reloadAll() {
      this.reloadRootGlobals();
      this.rebuildEntries();
      Alert.success("已重新加载游戏数据");
    },

    // 把当前路径解析成真实对象（window 为根）
    resolveContainer() {
      const result = resolvePathValue(window, this.path);

      if (!result.ok) {
        this.containerError = `无法读取该路径: ${result.message}`;
        this.container = null;
        return false;
      }

      this.containerError = "";
      this.container = markRaw(result.value);
      return true;
    },

    rebuildEntries() {
      if (!this.resolveContainer()) {
        this.entries = [];
        return;
      }

      this.entries = this.buildEntries();
    },

    buildEntries() {
      const container = this.container;

      if (container === null || container === undefined) {
        return [];
      }

      const atRoot = this.path.length === 0;
      const keys = atRoot
        ? getRootNamesByFilter(this.rootScan, this.rootFilter)
        : getContainerKeys(container);

      return keys
        .map((key) => {
          const entry = createEntry(container, key, atRoot);

          if (atRoot) {
            entry.isPlugin = !!this.pluginNameMap[key];
          }

          return entry;
        })
        .filter((entry) => !isHiddenKind(entry.kind));
    },

    // ---------- 导航 ----------

    navigateTo(newPath, options = {}) {
      this.path = Array.isArray(newPath) ? newPath.slice() : [];
      this.rebuildEntries();

      const highlightKey = options.highlightKey;
      this.highlightKey =
        highlightKey === undefined || highlightKey === null
          ? null
          : String(highlightKey);

      const page =
        this.highlightKey === null
          ? 1
          : this.findPageOfKey(this.highlightKey);

      // 切换层级后清空搜索框与搜索结果，避免新层级里的变量被搜索词过滤。
      // 清空搜索会触发 watcher 把分页重置到第 1 页，
      // 因此分页定位与高亮滚动放到下一次 tick 执行。
      this.search = "";
      this.deepSearchResults = [];
      this.deepSearchTruncated = false;
      this.deepSearchLimitReason = "";

      this.$nextTick(() => {
        this.pagination.page = page;

        if (this.highlightKey !== null) {
          this.scrollToHighlight();
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

      const tagName = active.tagName;
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        active.isContentEditable === true
      );
    },

    onValueInput(entry, text) {
      const parsed = parseValueByKind(text, entry.kind);

      if (!parsed.ok) {
        Alert.warn(`修改失败: ${parsed.message}`);
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
        Alert.error(`修改失败: ${result.message}`);
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
        Alert.error(`读取失败: ${child.message}`);
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
        title: `编辑 JSON: ${formatPathText([...this.path, entry.key])}`,
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
          Alert.error(`读取失败: ${child.message}`);
          return;
        }

        targetLabel = formatPathText([...this.path, entry.key]);
        isArray = Array.isArray(child.value);
      }

      this.jsonDialog = {
        show: true,
        mode: "add",
        title: `新增${isArray ? "元素" : "属性"}: ${targetLabel}`,
        keyText: "",
        requireKey: !isArray,
        text: isArray ? "null" : '"值"',
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
        dialog.error = "当前层无法写入";
        return;
      }

      const resolved = this.resolveDialogTargetContainer();

      if (!resolved.ok) {
        dialog.error = `读取失败: ${resolved.message}`;
        return;
      }

      const targetContainer = resolved.value;
      let parsed;

      try {
        parsed = JSON.parse(dialog.text);
      } catch (error) {
        dialog.error = `JSON 解析失败: ${String(
          (error && error.message) || error,
        )}`;
        return;
      }

      let key = dialog.targetKey;

      if (dialog.mode === "add") {
        if (Array.isArray(targetContainer)) {
          key = targetContainer.length;
        } else {
          key = String(dialog.keyText || "").trim();

          if (!key) {
            dialog.error = "请输入属性名";
            return;
          }
        }
      }

      const result = setChildValue(targetContainer, key, parsed);

      if (!result.ok) {
        dialog.error = `写入失败: ${result.message}`;
        return;
      }

      dialog.show = false;
      this.rebuildEntries();
      Alert.success("已保存");
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
        message: `确定删除 ${label} ？\n(警告: 可能导致游戏或存档异常)`,
        actions: [
          {
            icon: "mdi-close",
            label: "取消",
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: "mdi-delete",
            color: "red",
            label: "删除",
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
        Alert.error(`删除失败: ${result.message}`);
        return;
      }

      this.rebuildEntries();
      Alert.success(`已删除 ${entry.name}`);
    },

    // ---------- 搜索 ----------

    toggleDeepSearch() {
      this.deepSearch = !this.deepSearch;
    },

    scheduleSearch() {
      this.pagination.page = 1;
      this.clearSearchTimer();

      if (!this.searchActive) {
        this.deepSearchResults = [];
        this.deepSearchTruncated = false;
        this.deepSearchLimitReason = "";
        return;
      }

      this.searchTimer = window.setTimeout(() => {
        this.runDeepSearch(this.search);
      }, 300);
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

    runDeepSearch(keyword) {
      if (!this.searchActive) {
        return;
      }

      this.deepSearching = true;

      try {
        const { results, truncated, reason } = searchGlobalTree(
          this.buildSearchRoot(),
          keyword,
          { basePath: this.path.slice(), ...this.searchLimits },
        );

        this.deepSearchResults = results;
        this.deepSearchTruncated = truncated;
        this.deepSearchLimitReason = truncated
          ? SEARCH_LIMIT_REASONS[reason] || ""
          : "";
      } catch (error) {
        this.deepSearchResults = [];
        this.deepSearchTruncated = false;
        this.deepSearchLimitReason = "";
        Alert.error(`搜索失败: ${String(error)}`);
      } finally {
        this.deepSearching = false;
      }
    },

    // ---------- 深度搜索上限设置 ----------

    loadSearchLimits() {
      try {
        const raw = this.limitStorage.getItem("limits");
        if (!raw) {
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

        this.searchLimits = merged;
      } catch (error) {
        this.searchLimits = { ...SEARCH_LIMITS };
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

      try {
        this.limitStorage.setItem("limits", JSON.stringify(next));
      } catch (error) {
        Alert.warn("保存搜索上限失败");
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

    jumpToPage(page) {
      this.pagination.page = page;
    },

    findPageOfKey(key) {
      const perPage = this.effectiveItemsPerPage;

      if (perPage <= 0) {
        return 1;
      }

      const index = this.filteredEntries.findIndex(
        (item) => String(item.key) === String(key),
      );

      if (index < 0) {
        return 1;
      }

      return Math.floor(index / perPage) + 1;
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

    entryMatches(item, keyword) {
      return (
        String(item.name || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.preview || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.typeText || "")
          .toLowerCase()
          .includes(keyword)
      );
    },
  },
};
