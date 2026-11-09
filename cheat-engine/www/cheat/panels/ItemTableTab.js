// @ts-check
import PaginationFooter from "../components/PaginationFooter.js";
import { t } from "../js/strings.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { markRaw, toRaw } from "../libs/vue.js";
import { isPartyReady, requirePartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import {
  buildItemLocksPayload,
  itemLockKey,
  normalizeItemAmount,
} from "../js/ItemLockHelper.js";
import { LockService } from "../js/LockService.js";
import { filterByKeyword } from "../js/SearchFilter.js";
import { tablePanelMixin } from "../js/TablePanelMixin.js";

export default {
  name: "ItemTableTab",

  mixins: [tablePanelMixin, gameDataWatcherMixin],

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
                <v-tooltip location="bottom">
                    <template #activator="{ props }">
                        <v-btn
                            v-bind="props"
                            class="ml-2"
                            :color="allFilteredLocked ? 'amber' : 'grey-lighten-1'"
                            icon
                            size="small"
                            @click="toggleAllFilteredLocks">
                            <v-icon>{{ allFilteredLocked ? 'mdi-lock-open-variant' : 'mdi-lock' }}</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ allFilteredLocked ? t("items.unlockAll") : t("items.lockAll") }}</span>
                </v-tooltip>
            </div>
            <v-row
                    class="ma-0 pa-0">
                    <v-col
                        cols="12"
                        md="6">
                        <v-checkbox
                            v-model="excludeNameless"
                            density="compact"
                            hide-details
                            :label="t('items.hideNameless')">
                        
                        </v-checkbox>
                    </v-col>
                    <v-col
                        cols="12"
                        md="6">
                        <v-checkbox
                            v-model="onlyOwnedItems"
                            density="compact"
                            hide-details
                            :label="t('items.onlyOwned')">
                        
                        </v-checkbox>
                    </v-col>
                </v-row>
        </template>
        <template
            #item.amount="{ item }">
            <v-text-field
                style="width: 60px;"
                class="inline-field"
                hide-details
                variant="solo"
                bg-color="grey-darken-3"
                v-model="item.amount"
                density="compact"
                @change="onItemChange(item)"
                @focus="$event.target.select()"
                @keydown.stop>
            </v-text-field>
        </template>
        <template #item.lock="{ item }">
            <v-btn
                icon
                size="x-small"
                :title="item.lockEnabled ? t('items.unlock') : t('items.lock')"
                :color="item.lockEnabled ? 'amber' : 'grey-lighten-1'"
                @click.stop="toggleItemLock(item)">
                <v-icon size="small">{{ item.lockEnabled ? 'mdi-lock' : 'mdi-lock-open-variant' }}</v-icon>
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
</v-card>
    `,

  data() {
    return {
      excludeNameless: true,
      onlyOwnedItems: false,
      tableHeaders: [],
      tableItems: [],
      panelStateExtraKeys: ["excludeNameless", "onlyOwnedItems"],
    };
  },

  props: {
    stateKey: {
      type: String,
      default: "item",
    },
    items: {
      type: Array,
      default: () => [],
    },
    headers: {
      type: Array,
      default: () => [],
    },
    asTableData: {
      type: Function,
    },
    searchableAttrs: {
      type: Array,
      default: () => [],
    },
  },

  watch: {
    items: {
      immediate: true,
      handler() {
        this.initializeVariables();
      },
    },
  },

  mounted() {
    this.startLockSync();
  },

  activated() {
    this.startLockSync();
  },

  deactivated() {
    this.stopLockSync();
  },

  beforeUnmount() {
    this.stopLockSync();
  },

  computed: {
    panelStateId() {
      return `item-table-${this.stateKey}`;
    },

    itemKind() {
      return ["item", "weapon", "armor"].includes(this.stateKey)
        ? this.stateKey
        : "item";
    },

    allFilteredLocked() {
      return this.areAllFilteredLocked();
    },

    filteredTableItems() {
      const items = this.tableItems.filter((item) => {
        if (this.excludeNameless && !item.name) {
          return false;
        }

        if (this.onlyOwnedItems && item.amount === 0) {
          return false;
        }

        return true;
      });

      // 改版游戏数据里 description 等字段可能为 undefined / null，
      // filterByKeyword 内部统一转成字符串再比较
      return filterByKeyword(items, this.search, (item) =>
        this.searchableAttrs.map((attr) => item[attr]),
      );
    },
  },

  methods: {
    t,

    startLockSync() {
      if (this.__itemLockSyncTimer) {
        return;
      }

      // LockService 每秒会把锁定数量写回游戏，但不会通知面板。
      // 只同步已锁定行，避免覆盖用户正在编辑的未锁定行。
      this.__itemLockSyncTimer = window.setInterval(() => {
        this.syncLockedRows();
      }, 1000);
    },

    stopLockSync() {
      if (this.__itemLockSyncTimer) {
        window.clearInterval(this.__itemLockSyncTimer);
        this.__itemLockSyncTimer = null;
      }
    },

    initializeVariables() {
      this.tableHeaders = this.headers.slice(0);
      this.tableHeaders.push(
        {
          title: t("items.amount"),
          key: "amount",
        },
        {
          title: t("items.lock"),
          key: "lock",
          sortable: false,
          width: 72,
        },
      );

      if (!isPartyReady()) {
        this.tableItems = [];
        return;
      }

      const kind = this.itemKind;
      const locks = LockService.getItemLocks();

      this.tableItems = this.items
        .filter((item) => !!item)
        .map((item) => {
          const rawItem = toRaw(item);
          const tableItem = this.asTableData(rawItem);
          const id = Number(rawItem.id);
          const key = itemLockKey(kind, id);
          const saved = key ? locks[key] : null;
          const current = this.readItemAmountOf(rawItem);

          tableItem._item = markRaw(rawItem);
          tableItem.kind = kind;
          tableItem.id = id;
          tableItem.amount = current;
          tableItem.lockEnabled = !!(saved && saved.lockEnabled);
          tableItem.lockValue = saved
            ? normalizeItemAmount(saved.lockValue, current)
            : current;

          return tableItem;
        });
    },

    areAllFilteredLocked() {
      const lockable = this.filteredTableItems.filter((item) =>
        itemLockKey(this.itemKind, item.id),
      );

      return (
        lockable.length > 0 && lockable.every((item) => !!item.lockEnabled)
      );
    },

    readItemAmountOf(rawItem) {
      try {
        return normalizeItemAmount($gameParty.numItems(rawItem), 0);
      } catch (error) {
        return 0;
      }
    },

    readItemAmount(item) {
      return this.readItemAmountOf(toRaw(item._item));
    },

    writePersistedItemLocks() {
      LockService.setItemLocks(buildItemLocksPayload(this.tableItems));
    },

    toggleItemLock(item) {
      const kind = this.itemKind;

      if (
        !requirePartyReady(t("features.lockItem", { kind: t(`nav.${kind}`) }))
      ) {
        return;
      }

      if (!item || !itemLockKey(kind, item.id)) {
        return;
      }

      item.lockEnabled = !item.lockEnabled;
      if (item.lockEnabled) {
        item.lockValue = this.readItemAmount(item);
      }

      this.writePersistedItemLocks();
      item.amount = this.readItemAmount(item);
    },

    toggleAllFilteredLocks() {
      const kind = this.itemKind;

      if (
        !requirePartyReady(
          t("features.lockAllItems", { kind: t(`nav.${kind}`) }),
        )
      ) {
        return;
      }

      const targetLockEnabled = !this.areAllFilteredLocked();

      this.filteredTableItems.forEach((item) => {
        if (!itemLockKey(kind, item.id)) {
          return;
        }

        item.lockEnabled = targetLockEnabled;
        if (targetLockEnabled) {
          item.lockValue = this.readItemAmount(item);
        }
      });

      this.writePersistedItemLocks();
    },

    syncLockedRows() {
      if (!isPartyReady() || !Array.isArray(this.tableItems)) {
        return;
      }

      for (const item of this.tableItems) {
        if (!item || !item.lockEnabled) {
          continue;
        }

        const amount = this.readItemAmount(item);

        if (item.amount !== amount) {
          item.amount = amount;
        }
      }
    },

    onItemChange(item) {
      if (!requirePartyReady(t("features.modifyItemAmount"))) return;

      const amount = Number(item.amount);
      if (!Number.isFinite(amount)) {
        item.amount = this.readItemAmount(item);
        return;
      }

      const rawItem = toRaw(item._item);
      const diff = Math.floor(amount) - $gameParty.numItems(rawItem);
      $gameParty.gainItem(rawItem, diff);

      item.amount = $gameParty.numItems(rawItem);

      if (item.lockEnabled) {
        item.lockValue = item.amount;
        this.writePersistedItemLocks();
      }
    },
  },
};
