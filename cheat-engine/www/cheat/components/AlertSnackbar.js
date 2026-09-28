import { Alert } from "../js/AlertHelper.js";

// AlertSnackbar 会覆盖 AlertHelper 里的原生 alert() 实现，而原生实现是会把 err
// 拼进提示文本的。覆盖后必须自己补上，否则调用方传的 err 会被静默丢弃 ——
// 而现有传 err 的几处（GlobalShortcut 读快捷键设置失败）都是启动期分支，
// 用户看到的只有一句无信息量的通用提示。
//
// 错误类信息还需要更长的阅读时间：调用方默认传的 1500ms 是按 success 调的，
// snack 一闪而过来不及读、也复制不了。同一份信息同时打到 console，
// 保证 toast 消失后仍可追溯。
const LEVEL_TIMEOUT = {
  warn: 5000,
  error: 8000,
};

export default {
  name: "AlertSnackbar",

  template: `
<v-snackbar
    location="top left"
    :color="color"
    v-model="showSnackbar"
    :timeout="timeout"
    class="z-index-cheat-1">
    <span 
        v-for="(line, idx) in text"
        :key="idx"
        class="font-weight-bold text-body-small d-block">
        {{ line }}
    </span>
    <template #actions>
    <v-btn
        size="x-small"
        style="margin:0"
        color="white"
        icon
        @click="showSnackbar = false">
        <v-icon size="small">mdi-close</v-icon>
    </v-btn>
    </template>
</v-snackbar>
    `,

  data() {
    return {
      showSnackbar: false,
      text: "",
      timeout: 1000,
      color: "black",
    };
  },

  mounted() {
    Alert.alertInternal = (level, msg, err = null, timeout = 1500) => {
      let color = null;
      switch (level) {
        case "success":
          color = "green";
          break;
        case "info":
          color = "blue";
          break;
        case "warn":
          color = "orange";
          break;
        case "error":
          color = "red";
          break;
        default:
          color = "blue-grey";
      }

      this.show({
        text: err ? `${msg}\n[cause] ${err}` : msg,
        color: color,
        timeout: Math.max(timeout, LEVEL_TIMEOUT[level] || 0),
      });

      if (err) {
        console.error(`[cheat plugin ${level}] ${msg}`, err);
      }
    };
  },


  methods: {
    show(options) {
      this.showSnackbar = false;

      this.text = options.text.split("\n");
      this.timeout = options.timeout;
      if (options.color) {
        this.color = options.color;
      }

      this.showSnackbar = true;
    },
  },
};
