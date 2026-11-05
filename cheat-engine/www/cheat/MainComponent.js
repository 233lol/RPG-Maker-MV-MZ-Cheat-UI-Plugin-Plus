import CheatModal from "./CheatModal.js";
import { GLOBAL_SHORTCUT } from "./js/GlobalShortcut.js";
import { GeneralCheat } from "./js/CheatHelper.js";
import { LockService } from "./js/LockService.js";
import AlertSnackbar from "./components/AlertSnackbar.js";
import ConfirmDialog from "./components/ConfirmDialog.js";
import { customizeRPGMakerFunctions } from "./init/customize_functions.js";
import { installGameDataHooks } from "./js/GameDataState.js";
import { Key } from "./js/KeyCodes.js";

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
            class="opaque-on-mouseover"
            v-model="currentComponentName"
            v-if="show"
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
      currentComponentName: null,
    };
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

    window.addEventListener("keydown", this.onGlobalKeyDown);
    window.addEventListener("keyup", this.onGlobalKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onGlobalKeyDown);
    window.removeEventListener("keyup", this.onGlobalKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
  },

  methods: {
    onGlobalKeyDown(e) {
      if (e.repeat) {
        GLOBAL_SHORTCUT.runKeyRepeatEvent(e, Key.fromKey(this.currentKey));
      } else {
        GLOBAL_SHORTCUT.runKeyLeaveEvent(e, Key.fromKey(this.currentKey));
        this.currentKey.add(e.keyCode);
        this.currentKey.adjustCombiningKey(e);
        GLOBAL_SHORTCUT.runKeyEnterEvent(e, Key.fromKey(this.currentKey));
      }
    },

    onGlobalKeyUp(e) {
      GLOBAL_SHORTCUT.runKeyLeaveEvent(e, Key.fromKey(this.currentKey));
      this.currentKey.remove(e.keyCode);
      // 不要在 keyup 时再跑一次 enter：按住 Ctrl 再松开 C 会拿「剩下的
      // Ctrl」重新匹配一遍，可能误触发单键快捷键。
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
    },

    toggleCheatModal(componentName) {
      const prevComponentName = this.currentComponentName;

      if (componentName) {
        this.currentComponentName = componentName;
      }

      if (this.show) {
        if (!componentName || componentName === prevComponentName) {
          this.show = false;
        }
        return;
      }

      this.show = true;
    },
  },
};
