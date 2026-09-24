import ItemTableTab from "./ItemTableTab.js";
import { markRaw } from "../libs/vue.js";

export default {
  name: "ItemSettingPanel",

  components: {
    ItemTableTab,
  },

  template: `
<v-card flat class="ma-0 pa-0">
    <item-table-tab
        :items="items"
        :headers="headers"
        :as-table-data="convertToTableData"
        :searchable-attrs="['name', 'desc']">
        
    </item-table-tab>
</v-card>
    `,

  data() {
    return {
      items: [],

      headers: [
        {
          title: "名称",
          key: "name",
        },
        {
          title: "描述",
          key: "desc",
        },
      ],
    };
  },

  created() {
    this.initializeVariables();
  },

  methods: {
    initializeVariables() {
      // markRaw：静态数据库只读展示，无需响应式，避免整张表被包进 deep Proxy
      this.items = markRaw($dataItems);
    },

    convertToTableData(item) {
      return {
        name: item.name,
        desc: item.description,
      };
    },
  },
};
