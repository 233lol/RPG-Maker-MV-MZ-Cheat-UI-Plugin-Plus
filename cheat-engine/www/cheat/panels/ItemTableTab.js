import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { markRaw, toRaw } from "../libs/vue.js";
import {
  ITEMS_PER_PAGE_OPTIONS,
  getPageCount,
  paginationWatcherMixin,
} from "../js/PaginationHelper.js";
import { isPartyReady, requirePartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { panelStateMixin } from "../js/PanelState.js";

export default {
  name: "ItemTableTab",

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
            <v-row
                    class="ma-0 pa-0">
                    <v-col
                        cols="12"
                        md="6">
                        <v-checkbox
                            v-model="excludeNameless"
                            density="compact"
                            hide-details
                            label="隐藏无名物品">
                        
                        </v-checkbox>
                    </v-col>
                    <v-col
                        cols="12"
                        md="6">
                        <v-checkbox
                            v-model="onlyOwnedItems"
                            density="compact"
                            hide-details
                            label="只显示拥有的物品">
                        
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
      search: "",
      excludeNameless: true,
      onlyOwnedItems: false,
      tableHeaders: [],
      tableItems: [],
      pagination: { page: 1, itemsPerPage: 5 },
      itemsPerPageOptions: ITEMS_PER_PAGE_OPTIONS,
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

  computed: {
    panelStateId() {
      return `item-table-${this.stateKey}`;
    },

    filteredTableItems() {
      let items = this.tableItems.filter((item) => {
        if (this.excludeNameless && !item.name) {
          return false;
        }

        if (this.onlyOwnedItems && item.amount === 0) {
          return false;
        }

        return true;
      });
      if (this.search && this.search.trim()) {
        const s = this.search.toLowerCase();
        items = items.filter((item) => {
          for (const attr of this.searchableAttrs) {
            // 改版游戏数据里 description 等字段可能为 undefined/null，
            // 直接调 .toLowerCase() 会让整个面板崩溃
            if (
              String(item[attr] ?? "")
                .toLowerCase()
                .includes(s)
            )
              return true;
          }
          return false;
        });
      }
      return items;
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
        onlyOwnedItems: this.onlyOwnedItems,
        pagination: this.pagination,
      };
    },

    applyPanelState(state) {
      this.search = state.search;
      this.excludeNameless = state.excludeNameless;
      this.onlyOwnedItems = state.onlyOwnedItems;
      this.pagination = { ...this.pagination, ...state.pagination };
    },

    initializeVariables() {
      this.tableHeaders = this.headers.slice(0);
      this.tableHeaders.push({
        title: "数量",
        key: "amount",
      });

      if (!isPartyReady()) {
        this.tableItems = [];
        return;
      }

      this.tableItems = this.items
        .filter((item) => !!item)
        .map((item) => {
          const rawItem = toRaw(item);
          const tableItem = this.asTableData(rawItem);
          tableItem._item = markRaw(rawItem);
          tableItem.amount = $gameParty.numItems(rawItem);

          return tableItem;
        });
    },

    onItemChange(item) {
      if (!requirePartyReady("修改物品数量")) return;

      const amount = Number(item.amount);
      if (!Number.isFinite(amount)) {
        item.amount = $gameParty.numItems(toRaw(item._item));
        return;
      }

      const rawItem = toRaw(item._item);
      const diff = Math.floor(amount) - $gameParty.numItems(rawItem);
      $gameParty.gainItem(rawItem, diff);

      item.amount = $gameParty.numItems(rawItem);
    },

    jumpToPage(page) {
      this.pagination.page = page;
    },
  },
};
