import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { LockService } from "../js/LockService.js";
import {
  ITEMS_PER_PAGE_OPTIONS,
  getPageCount,
  paginationWatcherMixin,
} from "../js/PaginationHelper.js";
import { isVariablesReady, requireVariablesReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { panelStateMixin } from "../js/PanelState.js";
import { markRaw } from "../libs/vue.js";

export default {
  name: "VariableSettingPanel",

  mixins: [paginationWatcherMixin, gameDataWatcherMixin, panelStateMixin],

  components: { PaginationFooter, RefreshButton, SearchField },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-data-table
        v-if="tableHeaders"
        density="compact"
        :headers="tableHeaders"
        :items="filteredTableItems"
         v-model:page="pagination.page"
         v-model:items-per-page="pagination.itemsPerPage"
         :items-per-page-options="itemsPerPageOptions">
        <template #top>
            <div class="d-flex align-center">
                <search-field v-model="search"></search-field>
                <refresh-button
                    btn-class="ml-2"
                    @click="initializeVariables">
                </refresh-button>
            </div>
            <div class="d-flex align-center px-3 pt-3 pb-3">
                <v-checkbox
                    v-model="excludeNameless"
                    density="compact"
                    hide-details
                    label="隐藏无名变量">
                </v-checkbox>
                <v-spacer></v-spacer>
                <v-tooltip location="bottom">
                    <template #activator="{ props }">
                        <v-btn
                            color="amber"
                            v-bind="props"
                            icon
                            size="x-small"
                            @click="toggleAllFilteredLocks">
                            <v-icon>{{ allFilteredLocked ? 'mdi-lock-open-variant' : 'mdi-lock' }}</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ allFilteredLocked ? '解锁所有过滤项' : '锁定所有过滤项' }}</span>
                </v-tooltip>
            </div>
        </template>
        <template
            #item.value="{ item }">
            <div
                v-if="isComplexValue(item.value)"
                class="d-flex align-center"
                style="gap: 4px;">
                <span
                    class="text-body-small text-truncate"
                    style="max-width: 130px;"
                    :title="formatValuePreview(item.value)">
                    {{ formatValuePreview(item.value) }}
                </span>
                <v-btn
                    size="x-small"
                    variant="text"
                    color="deep-purple"
                    @click.stop="openJsonEditor(item)">
                    JSON
                </v-btn>
            </div>
            <v-text-field
                v-else
                bg-color="grey-darken-3"
                class="inline-field"
                style="width: 90px;"
                hide-details
                variant="solo"
                :model-value="item.value"
                density="compact"
                @change="onItemChange(item, $event.target.value)"
                @focus="$event.target.select()"
                @keydown.stop>
            </v-text-field>
        </template>
        <template #item.lock="{ item }">
            <v-btn
                icon
                size="x-small"
                :color="item.lockEnabled ? 'amber' : 'grey-lighten-1'"
                @click.stop="toggleItemLock(item)">
                <v-icon>{{ item.lockEnabled ? 'mdi-lock' : 'mdi-lock-open-variant' }}</v-icon>
            </v-btn>
        </template>
         <template #bottom>
             <pagination-footer
                 v-model:page="pagination.page"
                 v-model:items-per-page="pagination.itemsPerPage"
                 :total="totalCount"
                 :page-count="pageCount"
                 :items-per-page-options="[5, 10, 15, 20]"
                 @jump="jumpToPage">
             </pagination-footer>
         </template>
    </v-data-table>

    <v-dialog v-model="jsonDialog.show" max-width="720" persistent>
        <v-card>
            <v-card-title class="d-flex align-center">
                <span class="text-title-medium">编辑变量 {{ jsonDialog.name || jsonDialog.id }}（JSON）</span>
                <v-spacer></v-spacer>
                <v-btn icon size="small" @click="closeJsonEditor">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
            </v-card-title>
            <v-card-text>
                <v-textarea
                    v-model="jsonDialog.text"
                    variant="outlined"
                    auto-grow
                    rows="12"
                    hide-details
                    style="font-family: monospace; font-size: 12px;"
                    @keydown.stop>
                </v-textarea>
                <div
                    v-if="jsonDialog.error"
                    class="text-red-lighten-1 text-body-small mt-2">
                    {{ jsonDialog.error }}
                </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="closeJsonEditor">取消</v-btn>
                <v-btn color="primary" @click="saveJsonEditor">保存</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</v-card>
    `,

  data() {
    return {
      search: "",
      excludeNameless: true,

      variableNames: [],

      tableHeaders: [
        {
          title: "变量名",
          key: "name",
        },
        {
          title: "值",
          key: "value",
        },
        {
          title: "锁定",
          key: "lock",
          sortable: false,
          width: 72,
        },
      ],
      tableItems: [],
      pagination: { page: 1, itemsPerPage: 5 },
      itemsPerPageOptions: ITEMS_PER_PAGE_OPTIONS,
      persistedLockMap: {},
      jsonDialog: {
        show: false,
        id: 0,
        name: "",
        text: "",
        error: "",
      },
    };
  },

  created() {
    LockService.ensureLoaded();
    this.readPersistedLocks();
    this.initializeVariables();
  },

  computed: {
    panelStateId() {
      return "variables";
    },

    filteredTableItems() {
      let items = this.tableItems.filter((item) => {
        if (this.excludeNameless && !item.name) {
          return false;
        }

        return true;
      });
      if (this.search && this.search.trim()) {
        const s = this.search.toLowerCase();
        items = items.filter(
          (item) =>
            String(item.name || "")
              .toLowerCase()
              .includes(s) || this.formatValueForSearch(item.value).includes(s),
        );
      }
      return items;
    },

    allFilteredLocked() {
      const lockableItems = this.filteredTableItems.filter(
        (item) => item.id > 0,
      );
      if (lockableItems.length === 0) {
        return false;
      }

      return lockableItems.every((item) => !!item.lockEnabled);
    },

    totalCount() {
      return this.filteredTableItems.length;
    },

    pageCount() {
      return getPageCount(this.totalCount, this.pagination.itemsPerPage);
    },
  },

  methods: {
    getPanelStateSnapshot() {
      return {
        search: this.search,
        excludeNameless: this.excludeNameless,
        pagination: this.pagination,
      };
    },

    applyPanelState(state) {
      this.search = state.search;
      this.excludeNameless = state.excludeNameless;
      this.pagination = { ...this.pagination, ...state.pagination };
    },

    async initializeVariables() {
      if (!isVariablesReady() || typeof $dataSystem === "undefined") {
        this.tableItems = [];
        return;
      }

      const previousLockMap = this.getLockMapById();
      this.variableNames = await this.getVariableNames();

      this.tableItems = this.variableNames.map((varName, idx) => {
        const savedLock = previousLockMap.get(idx);
        const currentValue = $gameVariables.value(idx);
        return {
          id: idx,
          name: varName,
          value: this.markValueForDisplay(currentValue),
          lockEnabled: savedLock ? savedLock.lockEnabled : false,
          lockValue: savedLock
            ? savedLock.lockValue
            : this.markValueForDisplay(currentValue),
        };
      });
    },

    async getVariableNames() {
      return Array.isArray($dataSystem?.variables)
        ? $dataSystem.variables.slice()
        : [];
    },

    readPersistedLocks() {
      this.persistedLockMap = LockService.getVariableLocks();
    },

    writePersistedLocks() {
      const payload = {};
      this.tableItems.forEach((item) => {
        if (!item.lockEnabled || item.id <= 0) {
          return;
        }

        payload[item.id] = {
          lockEnabled: true,
          lockValue: item.lockValue,
        };
      });

      this.persistedLockMap = payload;
      LockService.setVariableLocks(payload);
    },

    onItemChange(item, newValue) {
      if (!requireVariablesReady("修改变量")) return;

      const v = $gameVariables.value(item.id);

      if (this.isComplexValue(v)) {
        this.openJsonEditor(item);
        return;
      }

      if (typeof v === "number") {
        const num = Number(newValue);
        if (!Number.isFinite(num)) {
          item.value = v;
          return;
        }
        $gameVariables.setValue(item.id, num);
      } else {
        $gameVariables.setValue(item.id, newValue);
      }

      item.value = this.markValueForDisplay($gameVariables.value(item.id));
      if (item.lockEnabled) {
        item.lockValue = item.value;
        this.writePersistedLocks();
      }
    },

    isComplexValue(value) {
      return value !== null && typeof value === "object";
    },

    // 对象 / 数组变量不要被 Vue 深度代理：游戏逻辑和锁定服务都按原始引用比较。
    markValueForDisplay(value) {
      return this.isComplexValue(value) ? markRaw(value) : value;
    },

    formatValuePreview(value) {
      try {
        const text = JSON.stringify(value);

        if (typeof text !== "string") {
          return String(value);
        }

        return text.length > 80 ? `${text.slice(0, 77)}...` : text;
      } catch (error) {
        return String(value);
      }
    },

    formatValueForSearch(value) {
      try {
        return String(
          this.isComplexValue(value) ? JSON.stringify(value) : value,
        ).toLowerCase();
      } catch (error) {
        return String(value).toLowerCase();
      }
    },

    openJsonEditor(item) {
      if (!item) {
        return;
      }

      let text;

      try {
        text = JSON.stringify(item.value, null, 2);
      } catch (error) {
        text = String(item.value);
      }

      this.jsonDialog = {
        show: true,
        id: item.id,
        name: item.name,
        text,
        error: "",
      };
    },

    closeJsonEditor() {
      this.jsonDialog.show = false;
      this.jsonDialog.error = "";
    },

    saveJsonEditor() {
      if (!requireVariablesReady("修改变量")) return;

      const dialog = this.jsonDialog;
      let parsed;

      try {
        parsed = JSON.parse(dialog.text);
      } catch (error) {
        dialog.error = `JSON 解析失败: ${String(error.message || error)}`;
        return;
      }

      $gameVariables.setValue(dialog.id, parsed);

      const item = this.tableItems.find((entry) => entry.id === dialog.id);
      if (item) {
        item.value = this.markValueForDisplay($gameVariables.value(dialog.id));
        if (item.lockEnabled) {
          item.lockValue = item.value;
          this.writePersistedLocks();
        }
      }

      this.closeJsonEditor();
    },

    toggleItemLock(item) {
      if (!requireVariablesReady("锁定变量")) return;

      item.lockEnabled = !item.lockEnabled;
      if (item.lockEnabled) {
        item.lockValue = $gameVariables.value(item.id);
        this.applyVariableLock(item);
      }

      this.writePersistedLocks();
    },

    toggleAllFilteredLocks() {
      if (!requireVariablesReady("批量锁定变量")) return;

      const targetLockEnabled = !this.allFilteredLocked;

      this.filteredTableItems.forEach((item) => {
        if (item.id <= 0) {
          return;
        }

        item.lockEnabled = targetLockEnabled;
        if (targetLockEnabled) {
          item.lockValue = $gameVariables.value(item.id);
          this.applyVariableLock(item);
        }
      });

      this.writePersistedLocks();
    },

    applyVariableLock(item) {
      if (!item || !item.lockEnabled) {
        return;
      }

      LockService.applyVariableLock(item.id);
      item.value = $gameVariables.value(item.id);
    },

    applyAllVariableLocks() {
      LockService.applyVariableLocks();
    },

    jumpToPage(page) {
      this.pagination.page = page;
    },

    getLockMapById() {
      const map = new Map();

      if (this.tableItems.length > 0) {
        this.tableItems.forEach((item) => {
          map.set(item.id, {
            lockEnabled: !!item.lockEnabled,
            lockValue: item.lockValue,
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
          lockValue: lockItem.lockValue,
        });
      });

      return map;
    },
  },
};
