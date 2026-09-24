import PageJump from "../components/PageJump.js";
import { KeyValueStorage } from "../js/KeyValueStorage.js";

export default {
  name: "VariableSettingPanel",

  components: { PageJump },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-data-table
        v-if="tableHeaders"
        density="compact"
        :headers="tableHeaders"
        :items="filteredTableItems"
         v-model:page="pagination.page"
         v-model:items-per-page="pagination.itemsPerPage"
         :items-per-page-options="[5, 10, 15, { title: 'All', value: -1 }]">
        <template #top>
            <v-text-field
                label="搜索..."
                variant="solo"
                bg-color="grey-darken-3"
                v-model="search"
                density="compact"
                hide-details
                @focus="$event.target.select()"
                @keydown.stop>
            </v-text-field>
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
            <v-text-field
                bg-color="grey-darken-3"
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
             <div class="d-flex align-center justify-space-between pa-2">
                 <div class="d-flex align-center">
                     <span class="text-body-small mr-2">每页</span>
                     <v-select
                         v-model="pagination.itemsPerPage"
                         :items="[5, 10, 15, 20]"
                         density="compact"
                         hide-details
                         variant="outlined"
                style="width: 90px;"
                     ></v-select>
                 </div>
                 <div class="d-flex align-center ga-2">
                     <span class="text-body-small text-no-wrap">{{ paginationStart }}-{{ paginationStop }} / {{ totalCount }}</span>
                     <v-pagination v-model="pagination.page" :length="pageCount" density="compact" :total-visible="5" size="small"></v-pagination>
                     <page-jump
                         :page="pagination.page"
                         :page-count="pageCount"
                         @jump="jumpToPage">
                     </page-jump>
                 </div>
             </div>
         </template>
    </v-data-table>
    <v-tooltip
        location="bottom">
        <template #activator="{ props }">
            <v-btn
                color="pink"
                size="small"
                icon
                style="position: absolute; top: 0px; right: 0px;"
                v-bind="props"
                @click="initializeVariables">
                <v-icon>mdi-refresh</v-icon>
            </v-btn>
        </template>
        <span>重新加载游戏数据</span>
    </v-tooltip>
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
      lockUpdateTimer: null,
      lockUpdateIntervalMs: 2500,
      lockStorage: null,
      persistedLockMap: {},
    };
  },

  created() {
    this.lockStorage = new KeyValueStorage(
      "./www/cheat-settings/variable-locks.json",
    );
    this.readPersistedLocks();
    this.initializeVariables();
    this.startLockUpdater();
  },

  beforeUnmount() {
    this.stopLockUpdater();
  },

  computed: {
    filteredTableItems() {
      let items = this.tableItems.filter((item) => {
        if (this.excludeNameless && !item.name) {
          return false;
        }

        return true;
      });
      if (this.search && this.search.trim()) {
        const s = this.search.toLowerCase();
        items = items.filter((item) =>
          String(item.name || "").toLowerCase().includes(s) ||
          String(item.value).toLowerCase().includes(s)
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

     paginationStart() {
       if (this.totalCount === 0) return 0;
       return (this.pagination.page - 1) * this.pagination.itemsPerPage + 1;
     },

     paginationStop() {
       return Math.min(this.pagination.page * this.pagination.itemsPerPage, this.totalCount);
     },

     pageCount() {
       return Math.ceil(this.filteredTableItems.length / this.pagination.itemsPerPage) || 1;
     },
   },

  methods: {
    async initializeVariables() {
      const previousLockMap = this.getLockMapById();
      this.variableNames = await this.getVariableNames();

      this.tableItems = this.variableNames.map((varName, idx) => {
        const savedLock = previousLockMap.get(idx);
        return {
          id: idx,
          name: varName,
          value: $gameVariables.value(idx),
          lockEnabled: savedLock ? savedLock.lockEnabled : false,
          lockValue: savedLock
            ? savedLock.lockValue
            : $gameVariables.value(idx),
        };
      });
    },

    async getVariableNames() {
      return $dataSystem.variables.slice();
    },

    readPersistedLocks() {
      try {
        const raw = this.lockStorage.getItem("data");
        if (!raw) {
          this.persistedLockMap = {};
          return;
        }

        const data = JSON.parse(raw);
        this.persistedLockMap = data && typeof data === "object" ? data : {};
      } catch (error) {
        console.warn("[cheat plugin] Can't read persisted variable locks, reset to empty", error);
        this.persistedLockMap = {};
      }
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
      this.lockStorage.setItem("data", JSON.stringify(payload));
    },

    onItemChange(item, newValue) {
      const v = $gameVariables.value(item.id);
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

      item.value = $gameVariables.value(item.id);
      if (item.lockEnabled) {
        item.lockValue = item.value;
        this.writePersistedLocks();
      }
    },

    toggleItemLock(item) {
      item.lockEnabled = !item.lockEnabled;
      if (item.lockEnabled) {
        item.lockValue = $gameVariables.value(item.id);
        this.applyVariableLock(item);
      }

      this.writePersistedLocks();
    },

    toggleAllFilteredLocks() {
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

      const currentValue = $gameVariables.value(item.id);
      const lockValue = item.lockValue;
      if (currentValue !== lockValue) {
        $gameVariables.setValue(item.id, lockValue);
      }
      item.value = $gameVariables.value(item.id);
    },

    applyAllVariableLocks() {
      this.tableItems.forEach((item) => {
        if (item.id > 0 && item.lockEnabled) {
          this.applyVariableLock(item);
        }
      });
    },

    startLockUpdater() {
      if (this.lockUpdateTimer) {
        return;
      }

      this.lockUpdateTimer = window.setInterval(() => {
        this.applyAllVariableLocks();
      }, this.lockUpdateIntervalMs);
    },

    stopLockUpdater() {
      if (!this.lockUpdateTimer) {
        return;
      }

      window.clearInterval(this.lockUpdateTimer);
      this.lockUpdateTimer = null;
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
