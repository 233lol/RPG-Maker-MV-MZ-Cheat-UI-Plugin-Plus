import CheatModal from "./CheatModal.js";
import { GLOBAL_SHORTCUT } from "./js/GlobalShortcut.js";
import { GeneralCheat } from "./js/CheatHelper.js";
import { LockService } from "./js/LockService.js";
import AlertSnackbar from "./components/AlertSnackbar.js";
import ConfirmDialog from "./components/ConfirmDialog.js";
import { customizeRPGMakerFunctions } from "./init/customize_functions.js";
import { isCheatUiTarget } from "./js/ClickGuard.js";
import { installGameDataHooks } from "./js/GameDataState.js";
import { loadPanelState, savePanelState } from "./js/PanelState.js";
import { Key } from "./js/KeyCodes.js";

function getInitialPanelName() {
  const state = loadPanelState("main-window", {
    lastPanel: "general-panel",
  });

  return typeof state.lastPanel === "string" && state.lastPanel
    ? state.lastPanel
    : "general-panel";
}

function isEditableTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  return !!target.closest(
    "input, textarea, select, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']",
  );
}

export default {
  name: "MainComponent",
  components: { CheatModal, AlertSnackbar, ConfirmDialog },
  template: `
<div 
    class="pa-2"
    ref="rootDiv">
    <v-fade-transition leave-absolute>
        <cheat-modal
            id="cheat-modal"
            ref="cheatModal"
            class="opaque-on-mouseover"
            v-model="currentComponentName"
            v-if="show"
            @close="closeCheatModal"
            >
        </cheat-modal>
    </v-fade-transition>
    <alert-snackbar></alert-snackbar>
    <confirm-dialog></confirm-dialog>
</div>`,

  data() {
    return {
      currentKey: Key.createEmpty(),
      show: false,
      currentComponentName: getInitialPanelName(),
    };
  },

  watch: {
    currentComponentName(value) {
      if (value) {
        savePanelState("main-window", { lastPanel: value });
      }
    },
  },

  created() {
    customizeRPGMakerFunctions(this);
    installGameDataHooks();
    LockService.ensureLoaded();

    GeneralCheat.toggleCheatModal = (componentName = null) => {
      this.toggleCheatModal(componentName);
    };

    GeneralCheat.openCheatModal = (componentName = null) => {
      this.openCheatModal(componentName);
    };

    window.addEventListener("keydown", this.onGlobalKeyDown, true);
    window.addEventListener("keyup", this.onGlobalKeyUp, true);
    window.addEventListener("keypress", this.onGlobalKeyPress, true);
    window.addEventListener("blur", this.onWindowBlur);
  },

  mounted() {
    this.setupInputGuard();
    document.addEventListener("focusin", this.onDocumentFocusIn, true);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onGlobalKeyDown, true);
    window.removeEventListener("keyup", this.onGlobalKeyUp, true);
    window.removeEventListener("keypress", this.onGlobalKeyPress, true);
    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("focusin", this.onDocumentFocusIn, true);
    this.teardownInputGuard();
  },

  methods: {
    onGlobalKeyDown(e) {
      // Tab 在作弊窗口内循环，避免焦点跑回游戏画面。
      // 对话框 / 菜单是 teleport 到 #app 的独立弹层，Tab 交给它们自己管理。
      if (this.show && e.key === "Tab") {
        const inOverlay = !!(
          e.target &&
          typeof e.target.closest === "function" &&
          e.target.closest(".v-overlay, .v-menu, .v-tooltip")
        );

        if (!inOverlay) {
          const modal = this.$refs.cheatModal;

          if (modal && typeof modal.trapFocus === "function") {
            modal.trapFocus(e);
          }
        }

        if (!isCheatUiTarget(e.target)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Esc 关闭作弊窗口；弹层（对话框 / 菜单）自己处理 Esc
      if (this.show && e.key === "Escape") {
        const inOverlay = !!(
          e.target &&
          typeof e.target.closest === "function" &&
          e.target.closest(".v-overlay, .v-menu, .v-tooltip")
        );

        if (!inOverlay) {
          this.closeCheatModal();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // 输入框里的按键交给输入框自己处理（复制 / 粘贴 / 光标移动），
      // 作弊窗口的 #app 冒泡拦截会阻止它们传到游戏。
      if (this.show && isEditableTarget(e.target)) {
        return;
      }

      if (e.repeat) {
        GLOBAL_SHORTCUT.runKeyRepeatEvent(e, Key.fromKey(this.currentKey));
      } else {
        GLOBAL_SHORTCUT.runKeyLeaveEvent(e, Key.fromKey(this.currentKey));
        this.currentKey.add(e.keyCode);
        this.currentKey.adjustCombiningKey(e);
        GLOBAL_SHORTCUT.runKeyEnterEvent(e, Key.fromKey(this.currentKey));
      }

      // 焦点不在作弊 UI 上时，阻止按键继续传给游戏
      if (this.show && !isCheatUiTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    onGlobalKeyUp(e) {
      GLOBAL_SHORTCUT.runKeyLeaveEvent(e, Key.fromKey(this.currentKey));
      this.currentKey.remove(e.keyCode);
      // 不要在 keyup 时再跑一次 enter：按住 Ctrl 再松开 C 会拿「剩下的
      // Ctrl」重新匹配一遍，可能误触发单键快捷键。

      if (this.show && !isCheatUiTarget(e.target)) {
        e.stopPropagation();
      }
    },

    onGlobalKeyPress(e) {
      if (this.show && !isCheatUiTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    setupInputGuard() {
      const app = document.getElementById("app");

      if (!app || this.__inputGuard) {
        return;
      }

      this.__inputGuard = (event) => {
        if (this.show) {
          event.stopPropagation();
        }
      };

      for (const type of ["keydown", "keyup", "keypress"]) {
        app.addEventListener(type, this.__inputGuard);
      }
    },

    teardownInputGuard() {
      const app = document.getElementById("app");

      if (!app || !this.__inputGuard) {
        return;
      }

      for (const type of ["keydown", "keyup", "keypress"]) {
        app.removeEventListener(type, this.__inputGuard);
      }

      this.__inputGuard = null;
    },

    onDocumentFocusIn(event) {
      if (!this.show || isCheatUiTarget(event.target)) {
        return;
      }

      this.focusCheatModal();
    },

    focusCheatModal() {
      const modal = this.$refs.cheatModal;

      if (modal && typeof modal.focusModal === "function") {
        modal.focusModal();
      }
    },

    closeCheatModal() {
      this.show = false;
      this.currentKey = Key.createEmpty();
    },

    // 窗口失焦时收不到 keyup，按键状态会卡住（例如切出去再回来，
    // Ctrl 仍被当成按下）。直接清空当前组合键。
    onWindowBlur() {
      this.currentKey = Key.createEmpty();
    },

    openCheatModal(componentName) {
      if (componentName) {
        this.currentComponentName = componentName;
      }

      this.show = true;
      this.$nextTick(() => this.focusCheatModal());
    },

    toggleCheatModal(componentName) {
      const prevComponentName = this.currentComponentName;

      if (componentName) {
        this.currentComponentName = componentName;
      }

      if (this.show) {
        if (!componentName || componentName === prevComponentName) {
          this.closeCheatModal();
        }
        return;
      }

      this.show = true;
      this.$nextTick(() => this.focusCheatModal());
    },
  },
};
