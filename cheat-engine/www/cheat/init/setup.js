import { createApp } from "../libs/vue.js";
import {
  createVuetify,
  components,
  directives,
  aliases,
  mdi,
} from "../libs/vuetify.js";

import MainComponent from "../MainComponent.js";

const app = createApp({
  components: { MainComponent },
});

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
