// @ts-check
import { t } from "../js/strings.js";

// 面板通用的「重新加载游戏数据」按钮。
export default {
  name: "RefreshButton",

  props: {
    tooltip: {
      type: String,
      default: "",
    },
    color: {
      type: String,
      default: "pink",
    },
    size: {
      type: String,
      default: "small",
    },
    icon: {
      type: String,
      default: "mdi-refresh",
    },
    iconSize: {
      type: String,
      default: "",
    },
    variant: {
      type: String,
      default: undefined,
    },
    btnClass: {
      type: String,
      default: "",
    },
    btnStyle: {
      type: [String, Object],
      default: "",
    },
  },

  emits: ["click"],

  computed: {
    resolvedTooltip() {
      return this.tooltip || t("common.reloadGameData");
    },
  },

  template: `
<v-tooltip location="bottom">
    <template #activator="{ props }">
        <v-btn
            :color="color"
            :size="size"
            icon
            :variant="variant"
            :class="btnClass"
            :style="btnStyle || undefined"
            :aria-label="resolvedTooltip"
            v-bind="props"
            @click="$emit('click')">
            <v-icon :size="iconSize || undefined" aria-hidden="true">{{ icon }}</v-icon>
        </v-btn>
    </template>
    <span>{{ resolvedTooltip }}</span>
</v-tooltip>
    `,
};
