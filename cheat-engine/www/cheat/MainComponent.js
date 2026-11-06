// @ts-check
import CheatModal from "./CheatModal.js";
import { GLOBAL_SHORTCUT } from "./js/GlobalShortcut.js";
import { GeneralCheat } from "./js/CheatHelper.js";
import { LockService } from "./js/LockService.js";
import AlertSnackbar from "./components/AlertSnackbar.js";
import ConfirmDialog from "./components/ConfirmDialog.js";
import {
  clearGameInput,
  customizeRPGMakerFunctions,
} from "./init/customize_functions.js";
import { isCheatUiTarget, setGameInputBlocked } from "./js/ClickGuard.js";
import { installGameDataHooks } from "./js/GameDataState.js";
import { loadPanelState, savePanelState } from "./js/PanelState.js";
import { Key } from "./js/KeyCodes.js";
import { subscribeLocaleChange } from "./js/strings.js";

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
            :key="localeKey"
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
      // 语言切换时递增，用来重挂 cheat-modal，让 data() 里缓存的文案重新求值。
      // 只重建作弊 UI，不重载游戏，也不会丢玩家进度。
      localeKey: 0,
    };
  },

  computed: {
    // 地图事件面板需要边看地图边移动 / 点击游戏，其余面板打开时屏蔽游戏输入。
    shouldBlockGameInput() {
      return this.show && this.currentComponentName !== "map-event-panel";
    },
  },

  watch: {
    shouldBlockGameInput: {
      immediate: true,
      handler(blocked) {
        setGameInputBlocked(blocked);

        if (blocked) {
          clearGameInput();
        }
      },
    },

    currentComponentName(value) {
      if (value) {
        savePanelState("main-window", { lastPanel: value });
      }
    },
  },

  created() {
    customizeRPGMakerFunctions();
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

    this.__unsubscribeLocaleChange = subscribeLocaleChange(() => {
      this.localeKey += 1;
    });
  },

  mounted() {
    this.setupInputGuard();
    document.addEventListener("focusin", this.onDocumentFocusIn, true);
  },

  beforeUnmount() {
    setGameInputBlocked(false);
    this.releaseCurrentKey();
    window.removeEventListener("keydown", this.onGlobalKeyDown, true);
    window.removeEventListener("keyup", this.onGlobalKeyUp, true);
    window.removeEventListener("keypress", this.onGlobalKeyPress, true);
    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("focusin", this.onDocumentFocusIn, true);
    this.teardownInputGuard();

    if (this.__unsubscribeLocaleChange) {
      this.__unsubscribeLocaleChange();
      this.__unsubscribeLocaleChange = null;
    }
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

      // 输入框里的按键交给输入框自己处理（复制 / 粘贴 / 光标移动）。
      // 不要求作弊窗口已打开：游戏插件可能用 DOM 输入框做文本输入，
      // 窗口关闭时也不应该被 Ctrl+C / Ctrl+S 等全局快捷键抢走。
      if (isEditableTarget(e.target)) {
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
      if (this.shouldBlockGameInput && !isCheatUiTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    onGlobalKeyUp(e) {
      GLOBAL_SHORTCUT.runKeyLeaveEvent(e, Key.fromKey(this.currentKey));
      this.currentKey.remove(e.keyCode);
      // 不要在 keyup 时再跑一次 enter：按住 Ctrl 再松开 C 会拿「剩下的
      // Ctrl」重新匹配一遍，可能误触发单键快捷键。

      if (this.shouldBlockGameInput && !isCheatUiTarget(e.target)) {
        e.stopPropagation();
      }
    },

    onGlobalKeyPress(e) {
      if (this.shouldBlockGameInput && !isCheatUiTarget(e.target)) {
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
        if (this.shouldBlockGameInput) {
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
      if (!this.shouldBlockGameInput || isCheatUiTarget(event.target)) {
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

    // 失焦 / 关闭窗口时收不到 keyup，必须手动补一次 leave，
    // 否则「按住生效」的快捷键（skipMessage 的加速 / 跳过消息）会永久残留。
    releaseCurrentKey() {
      const key = Key.fromKey(this.currentKey);

      try {
        if (!key.isEmpty()) {
          GLOBAL_SHORTCUT.runKeyLeaveEvent(
            {
              preventDefault() {},
              stopImmediatePropagation() {},
              stopPropagation() {},
            },
            key,
          );
        }
      } catch (error) {
        console.warn("[cheat plugin] 释放快捷键失败", error);
      } finally {
        this.currentKey = Key.createEmpty();
      }
    },

    closeCheatModal() {
      this.show = false;
      this.releaseCurrentKey();
    },

    // 窗口失焦时收不到 keyup，按键状态会卡住（例如切出去再回来，
    // Ctrl 仍被当成按下）。这里先补 leave，再清空当前组合键。
    onWindowBlur() {
      this.releaseCurrentKey();
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
