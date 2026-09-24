import PageJump from "../components/PageJump.js";
import { toRaw } from "../libs/vue.js";

export default {
  name: "ItemTableTab",

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
            <v-row
                    class="ma-0 pa-0">
                    <v-col
                        cols="12"
                        md="6">
                        <v-checkbox
                            v-model="excludeNameless"
                            density="compact"
                            hide-details
                            label="隐藏无名物品"
                            @change="onTableFilterChange">
                        
                        </v-checkbox>
                    </v-col>
                    <v-col
                        cols="12"
                        md="6">
                        <v-checkbox
                            v-model="onlyOwnedItems"
                            density="compact"
                            hide-details
                            label="只显示拥有的物品"
                            @change="onTableFilterChange">
                        
                        </v-checkbox>
                    </v-col>
                </v-row>
        </template>
        <template
            #item.amount="{ item }">
            <v-text-field
                style="width: 60px;"
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
             <div class="d-flex align-center justify-space-between pa-2">
                 <div class="d-flex align-center">
                     <span class="text-body-small mr-2">每页</span>
                     <v-select
                         v-model="pagination.itemsPerPage"
                         :items="[5, 10, 15, 20]"
                         density="compact"
                         hide-details
                variant="solo"
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
      onlyOwnedItems: false,
      tableHeaders: [],
      tableItems: [],
      pagination: { page: 1, itemsPerPage: 5 },
    };
  },

  props: {
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

  created() {},

  watch: {
    items: {
      immediate: true,
      handler() {
        this.initializeVariables();
      },
    },
  },

  computed: {
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
            if (String(item[attr] ?? "").toLowerCase().includes(s)) return true;
          }
          return false;
        });
      }
      return items;
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
    initializeVariables() {
      this.tableHeaders = this.headers.slice(0);
      this.tableHeaders.push({
        title: "数量",
        key: "amount",
      });

      this.tableItems = this.items
        .filter((item) => !!item)
        .map((item) => {
          const rawItem = toRaw(item);
          const tableItem = this.asTableData(rawItem);
          tableItem._item = rawItem;
          tableItem.amount = $gameParty.numItems(rawItem);

          return tableItem;
        });
    },

    onItemChange(item) {
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

    onTableFilterChange() {},

    jumpToPage(page) {
      this.pagination.page = page;
    },
  },
};
