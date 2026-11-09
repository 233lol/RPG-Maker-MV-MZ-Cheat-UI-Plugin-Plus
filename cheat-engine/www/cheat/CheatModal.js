// @ts-check
import { t } from "./js/strings.js";
import {
  clampGeometry as clampWindowGeometry,
  getDefaultGeometry,
} from "./js/CheatWindowGeometry.js";
import { panelStateMixin } from "./js/PanelState.js";
import PanelErrorBoundary from "./components/PanelErrorBoundary.js";
import GeneralPanel from "./panels/GeneralPanel.js";
import GameSystemPanel from "./panels/GameSystemPanel.js";
import HealthSettingPanel from "./panels/HealthSettingPanel.js";
import StatsSettingPanel from "./panels/StatsSettingPanel.js";
import PartyPanel from "./panels/PartyPanel.js";
import ItemSettingPanel from "./panels/ItemSettingPanel.js";
import WeaponSettingPanel from "./panels/WeaponSettingPanel.js";
import ArmorSettingPanel from "./panels/ArmorSettingPanel.js";
import SkillSettingPanel from "./panels/SkillSettingPanel.js";
import VariableSettingPanel from "./panels/VariableSettingPanel.js";
import GlobalVariablePanel from "./panels/GlobalVariablePanel.js";
import SwitchSettingPanel from "./panels/SwitchSettingPanel.js";
import SaveRecallPanel from "./panels/SaveRecallPanel.js";
import SaveSlotPanel from "./panels/SaveSlotPanel.js";
import SaveBackupPanel from "./panels/SaveBackupPanel.js";
import TeleportPanel from "./panels/TeleportPanel.js";
import MapEventPanel from "./panels/MapEventPanel.js";
import ShortcutPanel from "./panels/ShortcutPanel.js";

export default {
  name: "CheatModal",

  components: {
    PanelErrorBoundary,
    GeneralPanel,
    GameSystemPanel,
    HealthSettingPanel,
    StatsSettingPanel,
    PartyPanel,
    ItemSettingPanel,
    WeaponSettingPanel,
    ArmorSettingPanel,
    SkillSettingPanel,
    VariableSettingPanel,
    GlobalVariablePanel,
    SwitchSettingPanel,
    SaveRecallPanel,
    SaveSlotPanel,
    SaveBackupPanel,
    TeleportPanel,
    MapEventPanel,
    ShortcutPanel,
  },

  template: `
<v-card
    ref="cardRoot"
    class="z-index-cheat-0 cheat-window d-flex flex-column"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    :aria-label="t('common.cheatWindow')"
    :style="cardStyle">
    <div class="cheat-window-drag" @pointerdown="startDrag">
        <v-icon size="small" class="mr-1" aria-hidden="true">mdi-drag</v-icon>
        <span class="text-body-small text-grey-lighten-1">{{ t("common.cheatWindow") }}</span>
        <v-spacer></v-spacer>
        <v-btn
            icon
            size="x-small"
            variant="text"
            :title="t('common.close')"
            :aria-label="t('common.close')"
            @click="$emit('close')">
            <v-icon size="small" aria-hidden="true">mdi-close</v-icon>
        </v-btn>
    </div>
    <div 
        class="d-flex flex-grow-1 ma-0 pa-0 cheat-window-content">
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
                            :aria-current="modelValue === child.component ? 'page' : undefined"
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
                        :aria-current="modelValue === item.component ? 'page' : undefined"
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
            <!-- 缓存全部面板：切走再切回保留搜索词、分页、滚动位置与画布状态。
                 各面板必须在 deactivated 里暂停定时器 / 监听器，见 js/GameDataWatcher.js
                 与各面板的 activated/deactivated 实现。 -->
            <panel-error-boundary :panel-name="modelValue">
                <keep-alive>
                    <component :is="modelValue"></component>
                </keep-alive>
            </panel-error-boundary>
        </div>
    </div>
</v-card>
    `,

  emits: ["update:modelValue", "close"],

  mixins: [panelStateMixin],

  props: {
    modelValue: {
      type: String,
    },
  },

  data() {
    return {
      geometry: getDefaultGeometry(),
      navWidth: 160,
    };
  },

  computed: {
    panelStateId() {
      return "cheat-window";
    },

    openedGroups() {
      return [t("nav.items")];
    },

    navTreeItems() {
      return [
        {
          name: t("nav.general"),
          icon: "mdi-hammer-screwdriver",
          component: "general-panel",
        },
        {
          name: t("nav.gameSystem"),
          icon: "mdi-chart-box-outline",
          component: "game-system-panel",
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
          name: t("nav.party"),
          icon: "mdi-account-group",
          component: "party-panel",
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
          name: t("nav.saveSlots"),
          icon: "mdi-content-save-all",
          component: "save-slot-panel",
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
      ];
    },

    cardStyle() {
      return {
        left: `${this.geometry.x}px`,
        top: `${this.geometry.y}px`,
        width: `${this.geometry.width}px`,
        height: `${this.geometry.height}px`,
      };
    },

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

    this.setupResizeObserver();
    window.addEventListener("resize", this.onViewportResize);
    this.focusModal();
  },

  beforeUnmount() {
    this.stopDrag();

    if (this.__sizeSyncTimer) {
      window.clearTimeout(this.__sizeSyncTimer);
      this.__sizeSyncTimer = null;
    }
    this.__pendingSize = null;

    if (this.__resizeObserver) {
      this.__resizeObserver.disconnect();
      this.__resizeObserver = null;
    }

    window.removeEventListener("resize", this.onViewportResize);
  },

  methods: {
    t,

    getRootElement() {
      const root = this.$refs.cardRoot;
      return root && (root.$el || root);
    },

    focusModal() {
      const root = this.getRootElement();

      if (root && typeof root.focus === "function") {
        root.focus({ preventScroll: true });
      }
    },

    trapFocus(event) {
      const root = this.getRootElement();

      if (!root) {
        return;
      }

      const selector = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",");

      const focusables = [...root.querySelectorAll(selector)].filter(
        (element) =>
          element.offsetParent !== null || element === document.activeElement,
      );

      if (focusables.length === 0) {
        event.preventDefault();
        this.focusModal();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!root.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
        return;
      }

      if (active === root) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    },

    clampGeometry(geometry = this.geometry) {
      return clampWindowGeometry(geometry);
    },

    updateGeometry(patch) {
      const next = this.clampGeometry({ ...this.geometry, ...patch });

      if (
        next.x !== this.geometry.x ||
        next.y !== this.geometry.y ||
        next.width !== this.geometry.width ||
        next.height !== this.geometry.height
      ) {
        this.geometry = next;
      }
    },

    onViewportResize() {
      this.updateGeometry(this.geometry);
    },

    setupResizeObserver() {
      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const root = this.getRootElement();

      if (!root) {
        return;
      }

      this.__resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        const rect = entry.target.getBoundingClientRect();

        if (!(rect.width > 0 && rect.height > 0)) {
          return;
        }

        const width = Math.round(rect.width);
        const height = Math.round(rect.height);

        if (width === this.geometry.width && height === this.geometry.height) {
          return;
        }

        // 不能在这个回调里同步写回尺寸：CSS resize 手柄会给出小数尺寸，
        // 写回整数宽高会在同一次观察循环里再次触发布局，Chromium 报
        // "ResizeObserver loop completed with undelivered notifications"，
        // 而 MZ 的全局 error 处理会因此停掉游戏循环。放到下一个任务里再写。
        this.scheduleSizeSync(width, height);
      });

      this.__resizeObserver.observe(root);
    },

    scheduleSizeSync(width, height) {
      this.__pendingSize = { width, height };

      if (this.__sizeSyncTimer) {
        return;
      }

      // 用 setTimeout 而不是 requestAnimationFrame：窗口最小化 / 被遮挡时
      // rAF 可能长时间不触发，尺寸就再也同步不回来了。
      this.__sizeSyncTimer = window.setTimeout(() => {
        this.__sizeSyncTimer = null;

        const pending = this.__pendingSize;
        this.__pendingSize = null;

        if (!pending) {
          return;
        }

        if (
          pending.width === this.geometry.width &&
          pending.height === this.geometry.height
        ) {
          return;
        }

        this.updateGeometry(pending);
      }, 0);
    },

    startDrag(event) {
      // 拖动条上的关闭按钮不能触发拖动
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }

      event.preventDefault();

      this.__dragState = {
        startX: event.clientX,
        startY: event.clientY,
        originX: this.geometry.x,
        originY: this.geometry.y,
      };

      // 捕获指针：拖出窗口后再松开也能收到 pointerup。
      // 部分环境不支持 capture，失败时仍靠 window 监听兜底。
      try {
        if (
          event.currentTarget &&
          typeof event.currentTarget.setPointerCapture === "function"
        ) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      } catch (error) {
        // ignore
      }

      window.addEventListener("pointermove", this.onDragMove);
      window.addEventListener("pointerup", this.stopDrag, { once: true });
      window.addEventListener("pointercancel", this.stopDrag, { once: true });
    },

    onDragMove(event) {
      if (!this.__dragState) {
        return;
      }

      // 丢失 pointerup 时 mouseup 后 buttons 会变成 0，主动结束拖动。
      if (event.buttons === 0) {
        this.stopDrag();
        return;
      }

      this.updateGeometry({
        x: this.__dragState.originX + (event.clientX - this.__dragState.startX),
        y: this.__dragState.originY + (event.clientY - this.__dragState.startY),
      });
    },

    stopDrag() {
      this.__dragState = null;
      window.removeEventListener("pointermove", this.onDragMove);
      window.removeEventListener("pointerup", this.stopDrag);
      window.removeEventListener("pointercancel", this.stopDrag);
    },

    getPanelStateSnapshot() {
      return { geometry: this.geometry };
    },

    applyPanelState(state) {
      if (state.geometry) {
        this.geometry = this.clampGeometry(state.geometry);
      }
    },

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
