// @ts-check
import ItemTableTab from "./ItemTableTab.js";
import { t } from "../js/strings.js";
import { markRaw } from "../libs/vue.js";

/**
 * 物品 / 武器 / 防具三个面板结构完全一致，只有数据源和列名不同。
 * 用工厂生成组件，避免维护三份一模一样的 58 行文件。
 *
 * @param {{
 *   name: string,
 *   stateKey: string,
 *   getItems: () => Array<unknown>,
 *   descTitleKey: string,
 * }} options
 */
export function createItemDatabasePanel({
  name,
  stateKey,
  getItems,
  descTitleKey,
}) {
  return {
    name,

    components: { ItemTableTab },

    template: `
<v-card flat class="ma-0 pa-0">
    <item-table-tab
        ref="itemTable"
        :state-key="stateKey"
        :items="items"
        :headers="headers"
        :as-table-data="convertToTableData"
        :searchable-attrs="['name', 'desc']">
    </item-table-tab>
</v-card>
    `,

    data() {
      return {
        stateKey,
        items: [],
      };
    },

    computed: {
      headers() {
        return [
          {
            title: t("items.name"),
            key: "name",
          },
          {
            title: t(descTitleKey),
            key: "desc",
          },
        ];
      },
    },

    created() {
      this.initializeVariables();
    },

    activated() {
      // ItemTableTab 是子组件，不会收到 keep-alive 的 deactivated；
      // 由父面板在切回时恢复它的锁定同步定时器。
      const table = this.$refs.itemTable;
      if (table && typeof table.startLockSync === "function") {
        table.startLockSync();
      }
    },

    deactivated() {
      const table = this.$refs.itemTable;
      if (table && typeof table.stopLockSync === "function") {
        table.stopLockSync();
      }
    },

    methods: {
      initializeVariables() {
        // markRaw：静态数据库只读展示，无需响应式，避免整张表被包进 deep Proxy
        this.items = markRaw(getItems() || []);
      },

      convertToTableData(item) {
        return {
          name: item.name,
          desc: item.description,
        };
      },
    },
  };
}
