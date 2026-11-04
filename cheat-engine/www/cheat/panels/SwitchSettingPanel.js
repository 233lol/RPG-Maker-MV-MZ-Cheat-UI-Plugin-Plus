import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { LockService } from "../js/LockService.js";
import {
  ITEMS_PER_PAGE_OPTIONS,
  getPageCount,
  paginationWatcherMixin,
} from "../js/PaginationHelper.js";
import { isSwitchesReady, requireSwitchesReady } from "../js/GameState.js";

export default {
  name: "SwitchSettingPanel",

  mixins: [paginationWatcherMixin],

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
             <pagination-footer
                 v-model:page="pagination.page"
                 v-model:items-per-page="pagination.itemsPerPage"
                 :total="totalCount"
                 :page-count="pageCount"
                 :items-per-page-options="[5, 10, 15, 20]"
                 select-width="70px"
                 @jump="jumpToPage">
             </pagination-footer>
         </template>
    </v-data-table>
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
      itemsPerPageOptions: ITEMS_PER_PAGE_OPTIONS,
      persistedLockMap: {},
    };
  },

  created() {
    LockService.ensureLoaded();
    this.readPersistedLocks();
    this.initializeVariables();
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

    pageCount() {
      return getPageCount(this.totalCount, this.pagination.itemsPerPage);
    },
  },

  methods: {
    async initializeVariables() {
      if (!isSwitchesReady() || typeof $dataSystem === "undefined") {
        this.tableItems = [];
        return;
      }

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
      return Array.isArray($dataSystem?.switches)
        ? $dataSystem.switches.slice()
        : [];
    },

    readPersistedLocks() {
      this.persistedLockMap = LockService.getSwitchLocks();
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
      LockService.setSwitchLocks(payload);
    },

    onItemChange(item) {
      if (!requireSwitchesReady("修改开关")) return;

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
      if (!requireSwitchesReady("锁定开关")) return;

      item.lockEnabled = !item.lockEnabled;
      if (item.lockEnabled) {
        item.lockValue = !!$gameSwitches.value(item.id);
        this.applySwitchLock(item);
      }

      this.writePersistedLocks();
    },

    toggleAllFilteredLocks() {
      if (!requireSwitchesReady("批量锁定开关")) return;

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

      LockService.applySwitchLock(item.id);
      item.value = !!$gameSwitches.value(item.id);
    },

    applyAllSwitchLocks() {
      LockService.applySwitchLocks();
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
              if (!requireSwitchesReady("批量修改开关")) return;

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
