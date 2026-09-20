import GeneralPanel from "./panels/GeneralPanel.js";
import HealthSettingPanel from "./panels/HealthSettingPanel.js";
import StatsSettingPanel from "./panels/StatsSettingPanel.js";
import ItemSettingPanel from "./panels/ItemSettingPanel.js";
import WeaponSettingPanel from "./panels/WeaponSettingPanel.js";
import ArmorSettingPanel from "./panels/ArmorSettingPanel.js";
import SkillSettingPanel from "./panels/SkillSettingPanel.js";
import VariableSettingPanel from "./panels/VariableSettingPanel.js";
import GlobalVariablePanel from "./panels/GlobalVariablePanel.js";
import SwitchSettingPanel from "./panels/SwitchSettingPanel.js";
import SaveRecallPanel from "./panels/SaveRecallPanel.js";
import TeleportPanel from "./panels/TeleportPanel.js";
import MapEventPanel from "./panels/MapEventPanel.js";
import ShortcutPanel from "./panels/ShortcutPanel.js";

export default {
  name: "CheatModal",

  components: {
    GeneralPanel,
    HealthSettingPanel,
    StatsSettingPanel,
    ItemSettingPanel,
    WeaponSettingPanel,
    ArmorSettingPanel,
    SkillSettingPanel,
    VariableSettingPanel,
    GlobalVariablePanel,
    SwitchSettingPanel,
    SaveRecallPanel,
    TeleportPanel,
    MapEventPanel,
    ShortcutPanel,
  },

  template: `
<v-card 
    class="z-index-cheat-0"
    width="80vw"
    height="90vh"
    style="max-width: 775px; max-height: 550px;">
    <div 
        class="d-flex fill-height ma-0 pa-0">
        <div
            :style="'width: ' + navWidth + 'px;'"
            class="fill-height d-inline pa-1 overflow-y-auto hide-scrollbar">
            <v-list density="compact" nav class="text-body-small cheat-nav" :opened="openedGroups">
                <template v-for="item in navTreeItems" :key="item.name">
                    <v-list-group v-if="item.children" :value="item.name">
                        <template v-slot:activator="{ props }">
                            <v-list-item
                                v-bind="props"
                                :prepend-icon="item.icon"
                                :title="item.name"
                                density="compact"
                            ></v-list-item>
                        </template>
                        <v-list-item
                            v-for="child in item.children"
                            :key="child.name"
                            :prepend-icon="child.icon"
                            :title="child.name"
                            :active="modelValue === child.component"
                            density="compact"
                            class="pl-4"
                            @click="onNavItemClick(child)"
                        ></v-list-item>
                    </v-list-group>
                    <v-list-item
                        v-else
                        :prepend-icon="item.icon"
                        :title="item.name"
                        :active="modelValue === item.component"
                        density="compact"
                        @click="onNavItemClick(item)"
                    ></v-list-item>
                </template>
            </v-list>
        </div>
        <v-divider vertical></v-divider>
        <div
            :style="'width: calc(100% - ' + navWidth + 'px - 1px);'"
            class="fill-height d-inline pa-2 overflow-y-auto hide-scrollbar">
            <component :is="modelValue"></component>
        </div>
    </div>
</v-card>
    `,

  emits: ["update:modelValue"],

  props: {
    modelValue: {
      type: String,
    },
  },

  data() {
    return {
      navWidth: 160,
      openedGroups: ['物品'],

      navTreeItems: [
        {
          name: "常用",
          icon: "mdi-hammer-screwdriver",
          component: "general-panel",
        },
        {
          name: "战斗",
          icon: "mdi-battery-70",
          component: "health-setting-panel",
        },
        {
          name: "等级/属性",
          icon: "mdi-sword-cross",
          component: "stats-setting-panel",
        },
        {
          name: "物品",
          icon: "mdi-bag-personal-outline",
          children: [
            {
              name: "道具",
              icon: "mdi-flask-empty-plus",
              component: "item-setting-panel",
            },
            {
              name: "武器",
              icon: "mdi-sword",
              component: "weapon-setting-panel",
            },
            {
              name: "防具",
              icon: "mdi-shield-plus",
              component: "armor-setting-panel",
            },
          ],
        },
          {
              name: "技能",
              icon: "mdi-lightning-bolt",
              component: "skill-setting-panel",
          },
          {
              name: "变量",
              icon: "mdi-variable",
              component: "variable-setting-panel",
          },
          {
              name: "全局变量",
              icon: "mdi-file-tree",
              component: "global-variable-panel",
          },
        {
          name: "开关",
          icon: "mdi-toggle-switch",
          component: "switch-setting-panel",
        },
        {
          name: "存读位置",
          icon: "mdi-map-marker-plus",
          component: "save-recall-panel",
        },
        {
          name: "传送",
          icon: "mdi-run-fast",
          component: "teleport-panel",
        },
        {
          name: "地图事件",
          icon: "mdi-map-search",
          component: "map-event-panel",
        },
        {
          name: "快捷键",
          icon: "mdi-keyboard-outline",
          component: "shortcut-panel",
        },
      ],
    };
  },

  computed: {
    componentNameToNavItem() {
      const ret = {};
      this.iterateLeaf(this.navTreeItems, (item) => {
        ret[item.component] = item;
      });
      return ret;
    },
  },

  mounted() {
    let navItem = this.componentNameToNavItem[this.modelValue];

    if (!navItem) {
      navItem = Object.values(this.componentNameToNavItem)[0];
      this.$emit("update:modelValue", navItem.component);
    }
  },

  methods: {
    onNavItemClick(item) {
      this.$emit("update:modelValue", item.component);
    },

    iterateLeaf(node, leafFunc) {
      if (Array.isArray(node)) {
        for (const item of node) {
          this.iterateLeaf(item, leafFunc);
        }
      } else if (Object.hasOwnProperty.call(node, "children")) {
        this.iterateLeaf(node.children, leafFunc);
      } else {
        leafFunc(node);
      }
    },
  },
};
