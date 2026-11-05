import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { lockTableMixin } from "../js/LockTableMixin.js";
import { isVariablesReady, requireVariablesReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { matchesKeyword } from "../js/SearchFilter.js";
import { markRaw } from "../libs/vue.js";

export default {
  name: "VariableSettingPanel",

  mixins: [lockTableMixin, gameDataWatcherMixin],

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
      lockKind: "variable",
      lockLabel: "变量",

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
      jsonDialog: {
        show: false,
        id: 0,
        name: "",
        text: "",
        error: "",
      },
    };
  },

  computed: {
    panelStateId() {
      return "variables";
    },

    // e2e / 调试用：引擎里的变量名表
    variableNames() {
      return this.names;
    },

    filteredTableItems() {
      return this.tableItems.filter(
        (item) =>
          !(this.excludeNameless && !item.name) &&
          matchesKeyword(
            this.search,
            item.name,
            this.formatValueForSearch(item.value),
          ),
      );
    },
  },

  methods: {
    /* ------------------------- lockTableMixin 适配 ------------------------- */

    isDataReady() {
      return isVariablesReady();
    },

    requireDataReady(feature) {
      return requireVariablesReady(feature);
    },

    getNames() {
      return Array.isArray($dataSystem?.variables)
        ? $dataSystem.variables.slice()
        : [];
    },

    readValue(id) {
      return $gameVariables.value(id);
    },

    writeValue(id, value) {
      $gameVariables.setValue(id, value);
    },

    normalizeValue(value) {
      return this.markValueForDisplay(value);
    },

    /* ------------------------------ 面板操作 ------------------------------ */

    onItemChange(item, newValue) {
      if (!requireVariablesReady("修改变量")) return;

      const currentValue = this.readValue(item.id);

      if (this.isComplexValue(currentValue)) {
        this.openJsonEditor(item);
        return;
      }

      if (typeof currentValue === "number") {
        const num = Number(newValue);
        if (!Number.isFinite(num)) {
          item.value = currentValue;
          return;
        }
        this.writeValue(item.id, num);
      } else {
        this.writeValue(item.id, newValue);
      }

      this.afterValueChange(item);
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

      this.writeValue(dialog.id, parsed);

      const item = this.tableItems.find((entry) => entry.id === dialog.id);
      if (item) {
        this.afterValueChange(item);
      }

      this.closeJsonEditor();
    },
  },
};
