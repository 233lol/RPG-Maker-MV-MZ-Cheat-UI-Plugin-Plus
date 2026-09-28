import { Key } from "../js/KeyCodes.js";

export default {
  name: "KeyInputField",

  template: `
<v-text-field
    :model-value="showingText"
    :label="label"
    :variant="variant"
    :bg-color="backgroundColor"
    density="compact"
    hide-details
    @keydown.stop.prevent="onShortcutInput"
    @focus="$event.target.select()">
    <template #append>
        <v-btn
            :style="{ visibility: canDelete ? 'visible' : 'hidden' }"
            :disabled="!canDelete"
            size="x-small"
            icon
            @click="onDeleteClick">
            <v-icon size="small">mdi-close-circle</v-icon>
        </v-btn>
    </template>
</v-text-field>
    `,

  emits: ["update:modelValue", "change"],

  data() {
    return {};
  },

  props: {
    modelValue: {
      type: Key,
      default: () => Key.createEmpty(),
    },

    deletable: {
      type: Boolean,
      default: true,
    },

    label: {
      type: String,
      default: "",
    },

    solo: {
      type: Boolean,
      default: false,
    },

    outlined: {
      type: Boolean,
      default: false,
    },

    backgroundColor: {
      type: String,
      default: undefined,
    },

    combiningKeyAlone: {
      type: Boolean,
      default: false,
    },
  },

  computed: {
    variant() {
      if (this.outlined) return "outlined";
      if (this.solo) return "solo";
      return undefined;
    },

    // 清除按钮是否可用。
    //
    // 注意：按钮不用 v-if 隐藏，而是 visibility: hidden —— 因为它在字段的
    // #append 槽里，一旦真的不渲染，Vuetify 就不会给字段加 v-field--appended
    // 类，该行灰色区域会比其它行宽一截（"框突起"）。常驻渲染 + 隐藏可以保证
    // 每一行的字段宽度完全一致。visibility 相比原先的 opacity: 0 还能顺带
    // 去掉不可见但仍可点击的问题。
    canDelete() {
      return this.deletable && !this.modelValue.isEmpty();
    },

    showingText() {
      return this.modelValue.asDisplayString();
    },
  },

  methods: {
    onDeleteClick() {
      // canDelete 已经把「不可删除 / 无内容」两种情况都挡住了，这里再挡一次，
      // 避免以后有人改了 canDelete 就静默失效。
      if (!this.canDelete) {
        return;
      }

      const eventKey = Key.createEmpty();
      this.$emit("update:modelValue", eventKey);
      this.$emit("change", eventKey);
    },

    onShortcutInput(e) {
      const eventKey = Key.fromEvent(e);

      if (eventKey.isCombiningKey() && !this.combiningKeyAlone) {
        return;
      }

      if (!eventKey.equals(this.modelValue)) {
        this.$emit("update:modelValue", eventKey);
        this.$emit("change", eventKey);
      }
    },
  },
};
