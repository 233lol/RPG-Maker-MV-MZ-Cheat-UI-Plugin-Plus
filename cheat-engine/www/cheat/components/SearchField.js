// @ts-check
import { t } from "../js/strings.js";

// 面板通用的搜索框：样式、聚焦全选、阻止快捷键冒泡统一在这里维护。
export default {
  name: "SearchField",

  props: {
    modelValue: {
      type: String,
      default: "",
    },
    label: {
      type: String,
      default: "",
    },
    clearable: {
      type: Boolean,
      default: false,
    },
    prependIcon: {
      type: String,
      default: "",
    },
    fieldClass: {
      type: String,
      default: "flex-grow-1",
    },
    fieldStyle: {
      type: [String, Object],
      default: "",
    },
  },

  emits: ["update:modelValue"],

  computed: {
    resolvedLabel() {
      return this.label || t("common.search");
    },
  },

  template: `
<v-text-field
    :model-value="modelValue"
    :label="resolvedLabel"
    variant="solo"
    bg-color="grey-darken-3"
    density="compact"
    hide-details
    :clearable="clearable"
    :class="fieldClass"
    :style="fieldStyle || undefined"
    @update:model-value="$emit('update:modelValue', $event)"
    @focus="$event.target.select()"
    @keydown.stop>
    <template v-if="prependIcon || $slots['prepend-inner']" #prepend-inner>
        <v-icon v-if="prependIcon" size="small">{{ prependIcon }}</v-icon>
        <slot v-if="$slots['prepend-inner']" name="prepend-inner"></slot>
    </template>
    <template v-if="$slots['append-inner']" #append-inner>
        <slot name="append-inner"></slot>
    </template>
</v-text-field>
    `,
};
