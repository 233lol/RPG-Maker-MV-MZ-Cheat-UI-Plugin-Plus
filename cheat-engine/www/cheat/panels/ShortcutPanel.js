import KeyInputField from "../components/KeyInputField.js";
import PageJump from "../components/PageJump.js";
import { GLOBAL_SHORTCUT } from "../js/GlobalShortcut.js";
import { Key } from "../js/KeyCodes.js";
import { Alert } from "../js/AlertHelper.js";

export default {
  name: "ShortcutPanel",

  components: {
    KeyInputField,
    PageJump,
  },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-row>
        <v-col
            cols="12"
            md="8">
            <v-text-field
                label="搜索..."
                variant="solo"
                bg-color="grey-darken-3"
                v-model="search"
                density="compact"
                hide-details
                @update:model-value="onSearchChange"
                @focus="$event.target.select()"
                @keydown.stop>
            </v-text-field>
        </v-col>
        <v-col
            cols="12"
            md="4">
            <key-input-field
                v-model="shortcutSearch"
                label="快捷键"
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
            label="隐藏描述">
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
            <span>恢复默认设置</span>
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
         :items-per-page-options="[5, 10, 15, { title: 'All', value: -1 }]">
        <template
            #item.shortcut="{ item }">
            <key-input-field
                style="width: 170px;"
                v-model="item.shortcut"
                :deletable="!item.necessary"
                :label="item.shortcut.isEmpty() ? '未分配快捷键' : '快捷键'"
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
                        参数
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
</v-card>
    `,

  data() {
    return {
      shortcuts: [],

      tableExpanded: [],

      hideDesc: true,
      search: "",
      shortcutSearch: Key.createEmpty(),

      tableHeaders: [
        {
          title: "名称",
          key: "name",
        },
        {
          title: "描述",
          key: "desc",
        },
        {
          title: "快捷键",
          key: "shortcut",
        },
        {
          title: "参数",
          key: "param",
        },
      ],
      pagination: { page: 1, itemsPerPage: 5 },
    };
  },

  created() {
    this.initializeVariables();
  },

  computed: {
    filteredHeaders() {
      return this.tableHeaders.filter(
        (header) => !this.hideDesc || header.key !== "desc",
      );
    },

    filteredShortcuts() {
      let items = this.shortcuts.filter((item) => {
        return (
          this.shortcutSearch.isEmpty() ||
          item.shortcut.contains(this.shortcutSearch)
        );
      });
      if (this.search && this.search.trim()) {
        const s = this.search.toLowerCase();
        items = items.filter((item) =>
          item.name.toLowerCase().includes(s) ||
          item.desc.toLowerCase().includes(s) ||
          item.shortcut.asDisplayString().toLowerCase().includes(s)
        );
      }
      return items;
    },

    totalCount() {
      return this.filteredShortcuts.length;
    },

    paginationStart() {
      if (this.totalCount === 0) return 0;
      return (this.pagination.page - 1) * this.pagination.itemsPerPage + 1;
    },

    paginationStop() {
      return Math.min(this.pagination.page * this.pagination.itemsPerPage, this.totalCount);
    },

    pageCount() {
      return Math.ceil(this.filteredShortcuts.length / this.pagination.itemsPerPage) || 1;
    },
  },

  methods: {
    jumpToPage(page) {
      this.pagination.page = page;
    },

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
