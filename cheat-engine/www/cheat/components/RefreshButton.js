import { t } from "../js/strings.js";

// 面板通用的「重新加载游戏数据」按钮。
export default {
  name: "RefreshButton",

  props: {
    tooltip: {
      type: String,
      default: () => t("common.reloadGameData"),
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
            v-bind="props"
            @click="$emit('click')">
            <v-icon :size="iconSize || undefined">{{ icon }}</v-icon>
        </v-btn>
    </template>
    <span>{{ tooltip }}</span>
</v-tooltip>
    `,
};
