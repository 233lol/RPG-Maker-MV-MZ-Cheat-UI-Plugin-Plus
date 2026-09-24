import { Alert } from "../js/AlertHelper.js";

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
        text: msg,
        color: color,
        timeout: timeout,
      });
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
