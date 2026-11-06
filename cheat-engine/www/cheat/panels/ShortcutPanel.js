// @ts-check
import KeyInputField from "../components/KeyInputField.js";
import PaginationFooter from "../components/PaginationFooter.js";
import SearchField from "../components/SearchField.js";
import { GLOBAL_SHORTCUT } from "../js/GlobalShortcut.js";
import { Key } from "../js/KeyCodes.js";
import { Alert } from "../js/AlertHelper.js";
import { filterByKeyword } from "../js/SearchFilter.js";
import { tablePanelMixin } from "../js/TablePanelMixin.js";
import { t } from "../js/strings.js";

export default {
  name: "ShortcutPanel",

  mixins: [tablePanelMixin],

  components: {
    KeyInputField,
    PaginationFooter,
    SearchField,
  },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-row>
        <v-col
            cols="12"
            md="8">
            <search-field
                v-model="search"
                field-class=""
                @update:model-value="onSearchChange">
            </search-field>
        </v-col>
        <v-col
            cols="12"
            md="4">
            <key-input-field
                v-model="shortcutSearch"
                :label="t('shortcut.label')"
                solo
                density="compact"
                bg-color="grey-darken-3"
                hide-details
                combining-key-alone
                @change="onShortcutSearchChange">
            </key-input-field>
        </v-col>
    </v-row>
    <v-card-text
        class="pa-0 d-flex justify-space-between align-center">
        <v-checkbox
            class="d-inline-flex"
            v-model="hideDesc"
            density="compact"
            hide-details
            :label="t('shortcut.hideDesc')">
        </v-checkbox>
        <v-tooltip
            location="bottom">
            <template #activator="{ props }">
                <v-btn
                    color="green"
                    v-bind="props"
                    size="x-small"
                    icon
                    @click="restoreToDefault">
                    <v-icon size="small">mdi-restore</v-icon>
                </v-btn>
            </template>
            <span>{{ t("shortcut.restoreTooltip") }}</span>
        </v-tooltip>
    </v-card-text>
    <v-data-table
        class="mt-2"
        density="compact"
        expand-strategy="single"
        :headers="filteredHeaders"
        v-model:expanded="tableExpanded"
        :items="filteredShortcuts"
         v-model:page="pagination.page"
         v-model:items-per-page="pagination.itemsPerPage"
         :items-per-page-options="itemsPerPageOptions">
        <template
            #item.shortcut="{ item }">
            <key-input-field
                style="width: 220px;"
                v-model="item.shortcut"
                :deletable="!item.necessary"
                :label="item.shortcut.isEmpty() ? t('shortcut.unassigned') : t('shortcut.label')"
                solo
                density="compact"
                bg-color="grey-darken-3"
                :combining-key-alone="item.combiningKeyAlone"
                hide-details
                @change="onShortcutChange($event, item)">
            </key-input-field>
        </template>
        <template
            #item.param="{ item, index }">
            <v-btn
                v-if="Object.keys(item.paramDesc).length > 0"
                color="blue-grey"
                size="x-small"
                icon
                @click="changeExpanded(item)">
                <v-icon size="small">mdi-cog</v-icon>
            </v-btn>
        </template>
        <template #expanded-row="{ columns, item }">
            <td :colspan="columns.length" class="ma-0 pa-0 pl-0">
                <v-card 
                    flat
                    class="ma-0 py-2 px-0"
                    v-if="Object.keys(item.paramDesc).length > 0">
                    <v-card-subtitle
                        class="py-0 mb-1">
                        {{ t("shortcut.params") }}
                    </v-card-subtitle>
                    <v-card-text
                        class="py-0 my-0 mb-1"
                        v-for="paramKey in Object.keys(item.paramDesc)"
                        :key="paramKey">
                        <v-row
                            class="ma-0 pa-0">
                            <v-col
                                class="pa-0"
                                cols="12"
                                md="3">
                                <v-text-field
                                    v-model="item.param[paramKey].value"
                                    variant="outlined"
                                    density="compact"
                                    hide-details
                    @change="onParameterChange($event, item, paramKey)"
                    :label="item.paramDesc[paramKey].name"
                    @focus="$event.target.select()"
                    @keydown.stop>
                                </v-text-field>
                            </v-col>
                            <v-col
                                class="pa-0 d-inline-flex align-center"
                                cols="12"
                                md="9">
                                <span class="ml-3">: {{item.paramDesc[paramKey].desc}}</span>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
            </td>
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
      shortcuts: [],

      tableExpanded: [],

      hideDesc: true,
      shortcutSearch: Key.createEmpty(),

      tableHeaders: [
        {
          title: t("shortcut.nameHeader"),
          key: "name",
        },
        {
          title: t("shortcut.descHeader"),
          key: "desc",
        },
        {
          title: t("shortcut.shortcutHeader"),
          key: "shortcut",
        },
        {
          title: t("shortcut.paramHeader"),
          key: "param",
        },
      ],
      panelStateExtraKeys: ["hideDesc"],
    };
  },

  created() {
    this.initializeVariables();
  },

  computed: {
    panelStateId() {
      return "shortcuts";
    },

    filteredHeaders() {
      return this.tableHeaders.filter(
        (header) => !this.hideDesc || header.key !== "desc",
      );
    },

    filteredShortcuts() {
      const items = this.shortcuts.filter(
        (item) =>
          this.shortcutSearch.isEmpty() ||
          item.shortcut.contains(this.shortcutSearch),
      );

      return filterByKeyword(items, this.search, (item) => [
        item.name,
        item.desc,
        item.shortcut.asDisplayString(),
      ]);
    },

    totalCount() {
      return this.filteredShortcuts.length;
    },
  },

  methods: {
    t,

    restoreToDefault() {
      GLOBAL_SHORTCUT.restoreDefaultSettings();
      this.initializeVariables();
    },

    onSearchChange(search) {
      this.shortcutSearch = Key.createEmpty();
    },

    onShortcutSearchChange(key) {
      this.search = "";
    },

    changeExpanded(item) {
      // v-data-table 的 v-model:expanded 存的是「行的 item-value」，不是行对象本身。
      // Vuetify 的 useExpanded 里 isExpanded 是这样比的：
      //     [...expanded].some(c => toRaw(c) === toRaw(item.value))
      // 而 item.value 由 itemValue 决定，本表未设置 itemValue，默认取 item.id。
      //
      // 之前这里塞的是 [item]（整个对象），toRaw(对象) 永远 !== "quickSave"
      // 这种 id 字符串，于是没有任何行能匹配上 —— 表现就是点设置按钮没反应。
      const id = item.id;

      if (this.tableExpanded.length === 1 && this.tableExpanded[0] === id) {
        this.tableExpanded = [];
      } else {
        this.tableExpanded = [id];
      }
    },

    onShortcutChange(key, item) {
      try {
        GLOBAL_SHORTCUT.setShortcut(item.id, key);
      } catch (err) {
        Alert.error(err.message);
      }

      item.shortcut = GLOBAL_SHORTCUT.getShortcut(item.id);
    },

    onParameterChange(value, item, paramId) {
      try {
        GLOBAL_SHORTCUT.setParam(item.id, paramId, value);
      } catch (err) {
        Alert.error(err.message);
      }

      item.param[paramId].value = GLOBAL_SHORTCUT.getParam(item.id, paramId);
    },

    convertToInternalData(settings, config) {
      const param = {};

      if (settings.param) {
        for (const paramName of Object.keys(settings.param)) {
          param[paramName] = {
            id: paramName,
            value: settings.param[paramName],
          };
        }
      }

      return {
        id: config.id,
        name: config.name,
        desc: config.desc,
        necessary: config.necessary,
        combiningKeyAlone: config.combiningKeyAlone,
        paramDesc: config.param,

        // use deep copy of settings
        shortcut: Key.fromKey(settings.shortcut),
        param: param,
      };
    },

    initializeVariables() {
      this.shortcuts = Object.keys(GLOBAL_SHORTCUT.shortcutConfig).map(
        (key) => {
          return this.convertToInternalData(
            GLOBAL_SHORTCUT.shortcutSettings[key],
            GLOBAL_SHORTCUT.shortcutConfig[key],
          );
        },
      );
    },
  },
};
