// @ts-check
import { t } from "../js/strings.js";

export default {
  name: "PageJump",

  template: `
<span class="d-inline-flex align-center">
  <v-text-field
    v-model="inputVal"
    type="number"
    :min="1"
    :max="pageCount"
    density="compact"
    hide-details
    :aria-label="t('common.jumpToPage')"
    class="page-jump-input"
    style="width: 60px; max-width: 60px; margin: 0 1px;"
    @keydown.self.stop
    @keydown.enter="jump"
    @focus="$event.target.select()">
  </v-text-field>
  <v-btn
    size="x-small"
    icon
    class="mx-0"
    :aria-label="t('common.jumpToPage')"
    @click="jump">
    <v-icon size="x-small" aria-hidden="true">mdi-arrow-right-bold</v-icon>
  </v-btn>
</span>
  `,

  emits: ["jump"],

  props: {
    page: { type: Number, required: true },
    pageCount: { type: Number, required: true },
  },

  data() {
    return {
      inputVal: this.page,
    };
  },

  watch: {
    page(val) {
      this.inputVal = val;
    },
  },

  methods: {
    t,

    jump() {
      const p = Number(this.inputVal);
      if (p >= 1 && p <= this.pageCount) {
        this.$emit("jump", p);
      }
      this.inputVal = this.page;
    },
  },
};
