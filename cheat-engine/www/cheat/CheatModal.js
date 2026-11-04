import { t } from "./js/strings.js";
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
import SaveBackupPanel from "./panels/SaveBackupPanel.js";
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
    SaveBackupPanel,
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
            <!-- 只缓存全局变量面板：切走再切回不再销毁重建（该面板初始化要扫描 window） -->
            <keep-alive :include="['GlobalVariablePanel']">
                <component :is="modelValue"></component>
            </keep-alive>
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
      openedGroups: [t("nav.items")],

      navTreeItems: [
        {
          name: t("nav.general"),
          icon: "mdi-hammer-screwdriver",
          component: "general-panel",
        },
        {
          name: t("nav.battle"),
          icon: "mdi-battery-70",
          component: "health-setting-panel",
        },
        {
          name: t("nav.stats"),
          icon: "mdi-sword-cross",
          component: "stats-setting-panel",
        },
        {
          name: t("nav.items"),
          icon: "mdi-bag-personal-outline",
          children: [
            {
              name: t("nav.item"),
              icon: "mdi-flask-empty-plus",
              component: "item-setting-panel",
            },
            {
              name: t("nav.weapon"),
              icon: "mdi-sword",
              component: "weapon-setting-panel",
            },
            {
              name: t("nav.armor"),
              icon: "mdi-shield-plus",
              component: "armor-setting-panel",
            },
          ],
        },
        {
          name: t("nav.skill"),
          icon: "mdi-lightning-bolt",
          component: "skill-setting-panel",
        },
        {
          name: t("nav.variable"),
          icon: "mdi-variable",
          component: "variable-setting-panel",
        },
        {
          name: t("nav.globalVariable"),
          icon: "mdi-file-tree",
          component: "global-variable-panel",
        },
        {
          name: t("nav.switch"),
          icon: "mdi-toggle-switch",
          component: "switch-setting-panel",
        },
        {
          name: t("nav.saveLocation"),
          icon: "mdi-map-marker-plus",
          component: "save-recall-panel",
        },
        {
          name: t("nav.saveBackup"),
          icon: "mdi-backup-restore",
          component: "save-backup-panel",
        },
        {
          name: t("nav.teleport"),
          icon: "mdi-run-fast",
          component: "teleport-panel",
        },
        {
          name: t("nav.mapEvent"),
          icon: "mdi-map-search",
          component: "map-event-panel",
        },
        {
          name: t("nav.shortcut"),
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
