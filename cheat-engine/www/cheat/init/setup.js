// @ts-check
import { createApp } from "../libs/vue.js";
import {
  createVuetify,
  components,
  directives,
  aliases,
  mdi,
} from "../libs/vuetify.js";

import MainComponent from "../MainComponent.js";
import { Alert } from "../js/AlertHelper.js";
import { t } from "../js/strings.js";

const app = createApp({
  components: { MainComponent },
});

// 面板级错误由 PanelErrorBoundary 捕获；这里兜住边界之外的未处理异常，
// 至少留下可追溯的日志，并用 snackbar 提示用户，而不是静默白屏。
app.config.errorHandler = (error, instance, info) => {
  console.error("[cheat plugin] 未捕获的界面错误", error, info);

  try {
    Alert.error(t("common.unexpectedError"), error);
  } catch (alertError) {
    console.error("[cheat plugin] 显示错误提示失败", alertError);
  }
};

app.use(
  createVuetify({
    components,
    directives,
    theme: {
      defaultTheme: "dark",
    },
    icons: {
      defaultSet: "mdi",
      aliases,
      sets: {
        mdi,
      },
    },
    defaults: {
      VTooltip: {
        attach: "#app",
      },
      VDialog: {
        attach: "#app",
      },
      VMenu: {
        attach: "#app",
      },
      VSnackbar: {
        attach: "#app",
      },
    },
  }),
);

app.mount("#app");
