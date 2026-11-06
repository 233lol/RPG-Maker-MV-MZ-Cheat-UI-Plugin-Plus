import { t } from "../js/strings.js";
import { formatPanelError } from "../js/PanelError.js";

// 面板级错误边界：某个面板渲染 / 生命周期 / 事件处理抛错时，
// 只把这个面板替换成错误卡片，导航和其他面板仍然可用。
// 注意这里是 Options API 的 errorCaptured，返回 false 阻止错误继续向上冒泡，
// 避免整个作弊窗口被 Vue 卸载。
export default {
  name: "PanelErrorBoundary",

  props: {
    panelName: {
      type: String,
      default: "",
    },
  },

  data() {
    return {
      errorMessage: "",
      errorStack: "",
      errorInfo: "",
    };
  },

  computed: {
    hasError() {
      return !!this.errorMessage;
    },

    errorText() {
      return [this.errorMessage, this.errorInfo, this.errorStack]
        .filter((part) => !!part)
        .join("\n\n");
    },
  },

  watch: {
    // 切换到其他面板时自动清掉上一个面板的错误，给新面板一次干净的机会。
    panelName() {
      this.clearError();
    },
  },

  errorCaptured(error, instance, info) {
    const formatted = formatPanelError(error, info);

    console.error(
      `[cheat plugin] 面板 ${this.panelName || "unknown"} 发生错误`,
      error,
      info,
    );

    this.errorMessage = formatted.message;
    this.errorStack = formatted.stack;
    this.errorInfo = formatted.info;

    return false;
  },

  methods: {
    t,

    clearError() {
      this.errorMessage = "";
      this.errorStack = "";
      this.errorInfo = "";
    },

    retry() {
      this.clearError();
    },
  },

  template: `
<div v-if="hasError" class="pa-2">
    <v-alert
        type="error"
        variant="tonal"
        density="compact"
        class="mb-2">
        <div class="font-weight-bold">{{ t("common.panelErrorTitle") }}</div>
        <div class="text-body-small mt-1">{{ t("common.panelErrorHint") }}</div>
    </v-alert>
    <v-sheet
        border
        class="pa-2 mb-2 text-body-small"
        style="max-height: 240px; overflow: auto; font-family: monospace; white-space: pre-wrap; word-break: break-word;">
        {{ errorText }}
    </v-sheet>
    <v-btn
        size="small"
        color="primary"
        variant="flat"
        @click="retry">
        <v-icon start size="small">mdi-restart</v-icon>
        {{ t("common.retry") }}
    </v-btn>
</div>
<slot v-else></slot>
    `,
};
