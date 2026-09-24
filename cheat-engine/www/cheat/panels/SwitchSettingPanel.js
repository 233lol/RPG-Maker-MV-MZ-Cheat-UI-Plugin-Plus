import PageJump from "../components/PageJump.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { KeyValueStorage } from "../js/KeyValueStorage.js";

export default {
  name: "SwitchSettingPanel",

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
            <div class="d-flex px-3 pt-3 pb-3">
                <v-checkbox
                    v-model="excludeNameless"
                    density="compact"
                    hide-details
                    label="隐藏无名开关">
                </v-checkbox>
                <v-spacer></v-spacer>
                <v-tooltip
                    location="bottom">
                    <template #activator="{ props }">
                        <v-btn
                            color="teal"
                            v-bind="props"
                            icon
                            size="x-small"
                            @click="toggleAllSwitches">
                            <v-icon>{{ allSwitchIcon }}</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ allSwitchOn ? '关闭所有过滤的开关' : '打开所有过滤的开关' }}</span>
                </v-tooltip>
                      <v-tooltip location="bottom">
                        <template #activator="{ props }">
                          <v-btn
                            color="amber"
                            class="ml-2"
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
            <v-switch
                v-model="item.value"
                density="compact"
                hide-details
                @click.self.stop
                @change="onItemChange(item)">
            </v-switch>
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
                         style="width: 70px;"
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

      switchNames: [],

      tableHeaders: [
        {
          title: "开关名",
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
      "./www/cheat-settings/switch-locks.json",
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
      return this.tableItems.filter((item) => {
        if (
          item.id === 0 ||
          (this.excludeNameless && !item.name) ||
          !this.tableItemFilter(item.name, this.search, item)
        ) {
          return false;
        }

        return true;
      });
    },

    allSwitchOn() {
      const hasTurnOff = this.filteredTableItems.find(
        (item) => item.value === false,
      );
      return !hasTurnOff;
    },

    allSwitchIcon() {
      return this.allSwitchOn ? "mdi-toggle-switch-off" : "mdi-toggle-switch";
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
      this.switchNames = await this.getSwitchNames();

      this.tableItems = this.switchNames.map((switchName, idx) => {
        const savedLock = previousLockMap.get(idx);
        return {
          id: idx,
          name: switchName,
          value: $gameSwitches.value(idx),
          lockEnabled: savedLock ? savedLock.lockEnabled : false,
          lockValue:
            savedLock && typeof savedLock.lockValue === "boolean"
              ? savedLock.lockValue
              : $gameSwitches.value(idx),
        };
      });
    },

    async getSwitchNames() {
      return $dataSystem.switches.slice();
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
        console.warn("[cheat plugin] Can't read persisted switch locks, reset to empty", error);
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
          lockValue: !!item.lockValue,
        };
      });

      this.persistedLockMap = payload;
      this.lockStorage.setItem("data", JSON.stringify(payload));
    },

    onItemChange(item) {
      // modify value
      $gameSwitches.setValue(item.id, item.value);

      // refresh
      item.value = $gameSwitches.value(item.id);
      if (item.lockEnabled) {
        item.lockValue = item.value;
        this.writePersistedLocks();
      }
    },

    toggleItemLock(item) {
      item.lockEnabled = !item.lockEnabled;
      if (item.lockEnabled) {
        item.lockValue = !!$gameSwitches.value(item.id);
        this.applySwitchLock(item);
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
          item.lockValue = !!$gameSwitches.value(item.id);
          this.applySwitchLock(item);
        }
      });

      this.writePersistedLocks();
    },

    applySwitchLock(item) {
      if (!item || !item.lockEnabled) {
        return;
      }

      const currentValue = !!$gameSwitches.value(item.id);
      const lockValue = !!item.lockValue;
      if (currentValue !== lockValue) {
        $gameSwitches.setValue(item.id, lockValue);
      }
      item.value = !!$gameSwitches.value(item.id);
    },

    applyAllSwitchLocks() {
      this.tableItems.forEach((item) => {
        if (item.id > 0 && item.lockEnabled) {
          this.applySwitchLock(item);
        }
      });
    },

    startLockUpdater() {
      if (this.lockUpdateTimer) {
        return;
      }

      this.lockUpdateTimer = window.setInterval(() => {
        this.applyAllSwitchLocks();
      }, this.lockUpdateIntervalMs);
    },

    stopLockUpdater() {
      if (!this.lockUpdateTimer) {
        return;
      }

      window.clearInterval(this.lockUpdateTimer);
      this.lockUpdateTimer = null;
    },

    getLockMapById() {
      const map = new Map();

      if (this.tableItems.length > 0) {
        this.tableItems.forEach((item) => {
          map.set(item.id, {
            lockEnabled: !!item.lockEnabled,
            lockValue: !!item.lockValue,
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
          lockValue: !!lockItem.lockValue,
        });
      });

      return map;
    },

    tableItemFilter(value, search, item) {
      if (search === null || search.trim() === "") {
        return true;
      }

      const target = item.raw || item;
      return String(target.name || "")
        .toLowerCase()
        .includes(search.toLowerCase());
    },

    jumpToPage(page) {
      this.pagination.page = page;
    },

    toggleAllSwitches() {
      const self = this;
      ConfirmDialog.show({
        width: 450,
        message:
          (this.allSwitchOn
            ? "Turn off all filtered switches?"
            : "Turn on all filtered switches?") +
          "\n(CAUTION: Potential to give fatal errors to save data)",
        actions: [
          {
            icon: "mdi-close",
            label: "cancel",
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: this.allSwitchIcon,
            color: "green",
            label: this.allSwitchOn ? "Turn Off" : "Turn On",
            async action() {
              const value = !self.allSwitchOn;
              self.filteredTableItems.forEach((item) => {
                $gameSwitches.setValue(item.id, value);
                item.value = value;
                if (item.lockEnabled) {
                  item.lockValue = value;
                }
              });
              self.writePersistedLocks();
              self.initializeVariables();
              ConfirmDialog.close();
            },
          },
        ],
      });
    },
  },
};
