// @ts-check
import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { lockTableMixin } from "../js/LockTableMixin.js";
import { isSwitchesReady, requireSwitchesReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { matchesKeyword } from "../js/SearchFilter.js";
import { t } from "../js/strings.js";

export default {
  name: "SwitchSettingPanel",

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
            <div class="d-flex px-3 pt-3 pb-3">
                <v-checkbox
                    v-model="excludeNameless"
                    density="compact"
                    hide-details
                    :label="t('switch.hideNameless')">
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
                    <span>{{ allSwitchOn ? t("switch.turnOffAll") : t("switch.turnOnAll") }}</span>
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
                        <span>{{ allFilteredLocked ? t("switch.unlockAll") : t("switch.lockAll") }}</span>
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
      lockKind: "switch",
    };
  },

  computed: {
    panelStateId() {
      return "switches";
    },

    tableHeaders() {
      return [
        {
          title: t("switch.name"),
          key: "name",
        },
        {
          title: t("switch.value"),
          key: "value",
        },
        {
          title: t("switch.lock"),
          key: "lock",
          sortable: false,
          width: 72,
        },
      ];
    },

    // e2e / 调试用：引擎里的开关名表
    switchNames() {
      return this.names;
    },

    filteredTableItems() {
      return this.tableItems.filter(
        (item) =>
          item.id !== 0 &&
          !(this.excludeNameless && !item.name) &&
          matchesKeyword(this.search, item.name),
      );
    },

    allSwitchOn() {
      const items = /** @type {any[]} */ (
        /** @type {any} */ (this).filteredTableItems
      );
      const hasTurnOff = items.find((item) => item.value === false);
      return !hasTurnOff;
    },

    allSwitchIcon() {
      return this.allSwitchOn ? "mdi-toggle-switch-off" : "mdi-toggle-switch";
    },
  },

  methods: {
    t,

    /* ------------------------- lockTableMixin 适配 ------------------------- */

    isDataReady() {
      return isSwitchesReady();
    },

    requireDataReady(feature) {
      return requireSwitchesReady(feature);
    },

    getNames() {
      return Array.isArray($dataSystem?.switches)
        ? $dataSystem.switches.slice()
        : [];
    },

    readValue(id) {
      return $gameSwitches.value(id);
    },

    writeValue(id, value) {
      $gameSwitches.setValue(id, value);
    },

    normalizeValue(value) {
      return !!value;
    },

    /* ------------------------------ 面板操作 ------------------------------ */

    onItemChange(item) {
      if (!requireSwitchesReady(t("features.modifySwitch"))) return;

      this.writeValue(item.id, item.value);
      this.afterValueChange(item);
    },

    toggleAllSwitches() {
      const self = this;
      ConfirmDialog.show({
        width: 450,
        message:
          (this.allSwitchOn ? t("switch.confirmOff") : t("switch.confirmOn")) +
          "\n" +
          t("switch.confirmCaution"),
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: this.allSwitchIcon,
            color: "green",
            label: this.allSwitchOn ? t("switch.turnOff") : t("switch.turnOn"),
            async action() {
              if (!requireSwitchesReady(t("features.batchModifySwitch")))
                return;

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
