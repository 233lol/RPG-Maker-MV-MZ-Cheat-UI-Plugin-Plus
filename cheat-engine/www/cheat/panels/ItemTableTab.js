import PaginationFooter from "../components/PaginationFooter.js";
import { t } from "../js/strings.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { markRaw, toRaw } from "../libs/vue.js";
import { isPartyReady, requirePartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
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

  computed: {
    panelStateId() {
      return `item-table-${this.stateKey}`;
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

    initializeVariables() {
      this.tableHeaders = this.headers.slice(0);
      this.tableHeaders.push({
        title: t("items.amount"),
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
      if (!requirePartyReady(t("features.modifyItemAmount"))) return;

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
  },
};
