import {
  GeneralCheat,
  GameSpeedCheat,
  SpeedCheat,
  SceneCheat,
  BattleCheat,
} from "../js/CheatHelper.js";

import RefreshButton from "../components/RefreshButton.js";
import { Alert } from "../js/AlertHelper.js";
import interpretCodes from "../js/eventCodes.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { saveLocale } from "../js/LocaleService.js";
import { getAvailableLocales, getLocale, t } from "../js/strings.js";
import * as BuildVersion from "../version.js";

// shiki 体积较大，改为首次使用时动态加载并缓存，避免随面板启动解析
let codeToHtmlPromise = null;
function loadCodeToHtml() {
  if (!codeToHtmlPromise) {
    codeToHtmlPromise = import("../libs/shiki.bundle.mjs").then(
      (m) => m.codeToHtml,
    );
  }
  return codeToHtmlPromise;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 高亮半径：只对当前执行位置附近 ±20 行跑 shiki，其余行输出已转义的纯文本，
// 避免几百条指令并发高亮把主线程卡死
const HIGHLIGHT_RADIUS = 20;

function plainParamHtml(text) {
  return `<pre style="margin:0; white-space:pre-wrap; word-break:break-word;">${escapeHtml(text)}</pre>`;
}

export default {
  name: "GeneralPanel",

  mixins: [gameDataWatcherMixin],

  components: { RefreshButton },

  template: `
<v-card 
    class="ma-0 pa-0"
    flat>
    <v-card-text 
        class="py-0">
        <v-checkbox
            v-model="noClip"
            density="compact"
            hide-details
            :label="t('general.noClip')"
            @change="onNoClipChange">
        </v-checkbox>
    </v-card-text>
    
    <v-card-text class="py-0">
        <v-text-field
            v-model="gold"
            :label="t('general.gold')"
            variant="outlined"
            density="compact"
            hide-details
            @change="onGoldChange"
            @focus="$event.target.select()"
            @keydown.stop>
        </v-text-field>
    </v-card-text>
    
    <v-card-text class="pt-4 pb-0">
        <v-slider
            v-model="speed"
            :min="minSpeed"
            :max="maxSpeed"
            :step="stepSpeed"
            :thumb-label="true"
            thumb-color="red"
            hide-details
            @end="onSpeedChange">
            <template #prepend>
                <span class="text-grey-lighten-1 align-self-center mr-2 text-body-medium" style="white-space: nowrap;">{{ t("general.moveSpeed") }}</span>
                <v-icon color="grey lighten-3" @click="addSpeed(-stepSpeed)">mdi-chevron-left</v-icon>
            </template>
            <template #append>
                <v-icon color="grey lighten-3" @click="addSpeed(stepSpeed)">mdi-chevron-right</v-icon>
                <span class="text-grey-lighten-1 align-self-center ml-2">{{speed.toFixed(1)}}</span>
            </template>
        </v-slider>
        <v-checkbox
            v-model="fixSpeed"
            class="pt-0"
            hide-details
            density="compact"
            :label="t('general.fixedSpeed')"
            @change="onSpeedChange">
        </v-checkbox>
        
        <v-slider
            v-model="gameSpeed"
            :min="minGameSpeed"
            :max="maxGameSpeed"
            :step="stepGameSpeed"
            class="mt-3"
            :thumb-label="true"
            thumb-color="red"
            hide-details
            @end="onGameSpeedChange">
            <template #prepend>
                <span class="text-grey-lighten-1 align-self-center mr-2 d-inline-block text-body-medium" style="white-space: nowrap;">{{ t("general.gameSpeed") }}</span>
                <v-icon color="grey lighten-3" @click="addGameSpeed(-stepGameSpeed)">mdi-chevron-left</v-icon>
            </template>
            <template #append>
                <v-icon color="grey lighten-3" @click="addGameSpeed(stepGameSpeed)">mdi-chevron-right</v-icon>
                <span class="text-grey-lighten-1 align-self-center ml-2 mr-2">x{{gameSpeed.toFixed(1)}}</span>
                <v-icon size="16" color="grey lighten-3 ml-2" @click="setGameSpeed(1)">mdi-restore</v-icon>
            </template>
        </v-slider>
        
        <v-checkbox
            v-model="applyAllForGameSpeed"
            class="d-inline-flex pt-0"
            hide-details
            density="compact"
            :label="t('general.allScenes')"
            @change="onApplyAllForGameSpeedChange">
        </v-checkbox>
        <v-checkbox
            v-model="applyBattleForGameSpeed"
            class="d-inline-flex ml-2 pt-0 mb-0"
            hide-details
            density="compact"
            :label="t('general.inBattle')"
            @change="onApplyBattleForGameSpeedChange">
        </v-checkbox>
    </v-card-text>

    <v-card-subtitle class="mt-3 font-weight-bold">{{ t("general.quickActions") }}</v-card-subtitle>
    
    <v-card-text class="py-0">
        <v-btn size="small" @click="gotoTitle">{{ t("general.backToTitle") }}</v-btn>
        <v-btn size="small" class="mr-1" @click="toggleSaveScene">{{ t("general.saveScene") }}</v-btn>
        <v-btn size="small" @click="toggleLoadScene">{{ t("general.loadScene") }}</v-btn>
    </v-card-text>

    <v-card-text>
        <v-btn size="small" @click="victory">{{ t("general.victory") }}</v-btn>
        <v-btn size="small" @click="recoverAllParty">{{ t("general.recoverParty") }}</v-btn>
        <v-btn size="small" @click="changeAllEnemyHealth(1)">{{ t("general.enemyHp1") }}</v-btn>
    </v-card-text>

    <v-card-text class="pt-0">
        <v-btn size="small" color="indigo" @click="inspectCurrentEvent">{{ t("general.inspectEvent") }}</v-btn>
        <v-btn size="small" color="deep-purple" class="ml-2" @click="openDebugRepl">{{ t("general.openRepl") }}</v-btn>
    </v-card-text>

    <v-dialog v-model="showEventInspectDialog" max-width="1200" persistent>
      <v-card>
            <v-card-title class="d-flex align-center">
                <v-btn icon size="small" @click="closeEventInspectDialog">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <v-spacer></v-spacer>
                <span class="text-title-large">{{ t("general.inspector.title", { id: inspectedEventId === null ? '-' : inspectedEventId }) }}</span>
            </v-card-title>
            <v-card-text>
              <v-sheet
                border
                class="pa-0"
                style="max-height: 620px; overflow-y: auto; font-size: 12px;">
                <div
                  v-if="inspectedEventRows.length === 0"
                  class="pa-4 text-grey-lighten-1">
                  {{ inspectedEventMessage || t("general.inspector.empty") }}
                </div>
                <div v-else>
                  <div
                    class="d-flex px-3 py-1 font-weight-bold"
                    style="border-bottom: 1px solid rgba(255,255,255,0.18); position: sticky; top: 0; z-index: 1;">
                    <div style="width: 60px;">{{ t("general.inspector.index") }}</div>
                    <div style="width: 70px;">{{ t("general.inspector.code") }}</div>
                    <div class="flex-grow-1">{{ t("general.inspector.command") }}</div>
                  </div>
                  <div
                    v-for="row in inspectedEventRows"
                    :key="row.index"
                    :ref="'eventRow-' + row.index"
                    class="d-flex px-3 py-1"
                    :style="{
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: row.index === inspectedEventCurrentIndex ? 'rgba(33, 150, 243, 0.16)' : 'transparent'
                    }">
                    <div style="width: 60px;" class="text-grey-lighten-1">{{ row.index }}</div>
                    <div style="width: 70px;" class="text-blue-lighten-2">{{ row.codeText }}</div>
                    <div class="flex-grow-1" :style="{ paddingLeft: row.indentPx + 'px' }">
                      <div class="font-weight-bold text-uppercase">{{ row.commandName }}</div>
                      <div style="margin-top: 2px; white-space: pre-wrap; word-break: break-word;" v-html="row.paramHtml"></div>
                    </div>
                  </div>
                </div>
              </v-sheet>
            </v-card-text>
        </v-card>
    </v-dialog>

    <v-dialog v-model="showDebugReplDialog" max-width="1200" persistent>
      <v-card
        ref="debugReplCard"
        @keydown.stop
        @keyup.stop
        @keypress.stop>
            <v-card-title class="d-flex align-center">
                <v-btn icon size="small" @click="closeDebugRepl">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <v-card-actions>
                    <v-btn size="small" color="primary" @click="runRepl">{{ t("general.repl.run") }}</v-btn>
                    <v-btn size="small" variant="text" @click="clearReplOutput">{{ t("general.repl.clearOutput") }}</v-btn>
                </v-card-actions>
                <v-spacer></v-spacer>
                <span class="text-title-large">{{ t("general.repl.title") }}</span>
            </v-card-title>
            <v-card-text>
                <v-textarea
                    v-model="replInput"
                    :label="t('general.repl.input')"
                    variant="outlined"
                    auto-grow
                    rows="10"
                    hide-details
                    @keydown.ctrl.enter.stop.prevent="runRepl"
                    @keydown.meta.enter.stop.prevent="runRepl"
                  @keydown.stop
                  @keyup.stop
                  @keypress.stop
                    style="font-family: monospace; font-size: 12px;">
                </v-textarea>

                <div class="mt-3 mb-1 text-body-small">{{ t("general.repl.output") }}</div>
                <v-textarea
                    :model-value="replOutputText"
                    variant="outlined"
                    auto-grow
                    rows="23"
                    readonly
                    hide-details
                  @keydown.stop
                  @keyup.stop
                  @keypress.stop
                    style="font-family: monospace; font-size: 12px;">
                </v-textarea>
            </v-card-text>
        </v-card>
    </v-dialog>

    <v-card-text class="py-0 d-flex align-center">
        <span class="text-body-small text-grey-lighten-1 mr-2">{{ t("general.language") }}</span>
        <v-select
            v-model="locale"
            :items="localeOptions"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 160px;"
            @update:model-value="onLocaleChange">
        </v-select>
    </v-card-text>

    <v-card-text class="pt-2 pb-2 text-body-small text-grey-lighten-1 text-center">
        <a
            :href="versionUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-grey-lighten-1"
            style="text-decoration: none;"
            @click="openVersionLink">
            {{ versionLabel }}
        </a>
    </v-card-text>
    <refresh-button
        btn-style="position: absolute; top: 0px; right: 0px;"
        @click="initializeVariables">
    </refresh-button>
</v-card>
    `,

  data() {
    return {
      locale: getLocale(),
      localeOptions: getAvailableLocales(),

      noClip: false,
      gold: 0,
      speed: 0,
      fixSpeed: false,

      minSpeed: 1,
      maxSpeed: 10,
      stepSpeed: 0.5,

      gameSpeed: 1,
      minGameSpeed: 0.1,
      maxGameSpeed: 10,
      stepGameSpeed: 0.1,
      applyAllForGameSpeed: false,
      applyBattleForGameSpeed: false,

      showEventInspectDialog: false,
      inspectedEventId: null,
      inspectedEventCurrentIndex: -1,
      inspectedEventRows: [],
      inspectedEventMessage: "",

      showDebugReplDialog: false,
      replInput: "$gameMap.mapId()",
      replOutputEntries: [],
      replGlobalKeyGuard: null,
      popupEscapeKeyGuard: null,
    };
  },

  created() {
    this.initializeVariables();
  },

  watch: {
    showEventInspectDialog() {
      this.updatePopupEscapeKeyGuard();
    },

    showDebugReplDialog(newValue) {
      if (newValue) {
        this.enableReplGlobalKeyGuard();
      } else {
        this.disableReplGlobalKeyGuard();
      }

      this.updatePopupEscapeKeyGuard();
    },
  },

  beforeUnmount() {
    this.disableReplGlobalKeyGuard();
    this.disablePopupEscapeKeyGuard();
  },

  methods: {
    t,

    onLocaleChange(locale) {
      if (!locale || locale === getLocale()) {
        return;
      }

      saveLocale(locale);

      // 导航、分页选项等模块级常量在加载时求值，刷新一次最省事
      if (typeof window !== "undefined" && window.location) {
        window.location.reload();
      }
    },

    initializeVariables() {
      // 键盘监听在 app 挂载时就绑定了，读档 / 加载转圈（MZ 还要初始化 effekseer
      // WASM）这段窗口里 $gamePlayer、$gameParty 还不存在。这里用默认值兜底 ——
      // 否则 created() 抛错会让整个「常用」面板挂掉、整块空白，而用户很难
      // 联想到是作弊面板的问题。
      // 4 是引擎自己的默认移动速度（Game_CharacterBase.initialize）。
      this.noClip = $gamePlayer ? $gamePlayer._through : false;
      this.speed = $gamePlayer ? $gamePlayer.moveSpeed() : 4;
      this.fixSpeed = SpeedCheat.isFixed();
      this.gold = $gameParty ? $gameParty._gold : 0;

      this.gameSpeed = GameSpeedCheat.getRate();
      const gameSpeedSceneOption = GameSpeedCheat.getSceneOption();
      if (gameSpeedSceneOption === GameSpeedCheat.sceneOptions().all) {
        this.applyAllForGameSpeed = true;
      } else if (
        gameSpeedSceneOption === GameSpeedCheat.sceneOptions().battle
      ) {
        this.applyBattleForGameSpeed = true;
      }
    },

    onNoClipChange() {
      GeneralCheat.toggleNoClip();
      this.initializeVariables();
    },

    onSpeedChange() {
      SpeedCheat.setSpeed(this.speed, this.fixSpeed);
      SpeedCheat.__writeSettings(this.speed, this.fixSpeed);
      this.initializeVariables();
    },

    addSpeed(amount) {
      this.speed = Math.min(
        Math.max(this.speed + amount, this.minSpeed),
        this.maxSpeed,
      );
      this.onSpeedChange();
    },

    onGoldChange() {
      const value = Number(this.gold);

      // 空字符串会被 Number("") 转成 0，旧逻辑会把金币直接清零；
      // 非法输入也不会回滚显示，输入框会一直停在校验失败的值上。
      if (
        this.gold === "" ||
        this.gold === null ||
        this.gold === undefined ||
        !Number.isInteger(value) ||
        value < 0
      ) {
        this.initializeVariables();
        return;
      }

      if (!$gameParty) {
        Alert.warn(t("general.partyNotReady"));
        this.initializeVariables();
        return;
      }

      const diff = value - $gameParty._gold;

      if (diff < 0) {
        $gameParty.loseGold(-diff);
      } else if (diff > 0) {
        $gameParty.gainGold(diff);
      }

      this.gold = $gameParty._gold;
      this.initializeVariables();
    },

    gotoTitle() {
      SceneCheat.gotoTitle();
    },

    toggleSaveScene() {
      SceneCheat.toggleSaveScene();
    },

    toggleLoadScene() {
      SceneCheat.toggleLoadScene();
    },

    victory() {
      BattleCheat.victory();
    },

    recoverAllParty() {
      BattleCheat.recoverAllParty();
    },

    changeAllEnemyHealth(newHp) {
      BattleCheat.changeAllEnemyHealth(newHp);
    },

    async inspectCurrentEvent() {
      // 连续点击时，先发后到的旧请求不能覆盖新结果
      const token = (this.__eventInspectToken || 0) + 1;
      this.__eventInspectToken = token;

      const commandIndex = this.getCurrentEventCommandIndex();

      try {
        const eventId = this.getCurrentEventId();
        this.inspectedEventId = eventId;
        this.inspectedEventCurrentIndex = commandIndex;

        if (!eventId || eventId <= 0) {
          if (token !== this.__eventInspectToken) {
            return;
          }

          this.inspectedEventRows = [];
          this.inspectedEventMessage = t("general.inspector.noEvent");
          this.showEventInspectDialog = true;
          return;
        }

        const eventObject = $gameMap.event(eventId);
        const pageData =
          eventObject && eventObject.page ? eventObject.page() : null;

        const rows = await this.formatEventListEntries(
          pageData && pageData.list ? pageData.list : [],
          commandIndex,
        );

        if (token !== this.__eventInspectToken) {
          return;
        }

        this.inspectedEventRows = rows;
        this.inspectedEventMessage =
          this.inspectedEventRows.length === 0
            ? t("general.inspector.empty")
            : "";
      } catch (error) {
        if (token !== this.__eventInspectToken) {
          return;
        }

        this.inspectedEventRows = [];
        this.inspectedEventMessage = t("general.inspector.error", {
          message: String(error),
        });
      }

      if (token !== this.__eventInspectToken) {
        return;
      }

      this.showEventInspectDialog = true;
      this.$nextTick(() => {
        window.requestAnimationFrame(() => {
          this.scrollToCurrentEventEntry();
        });
      });
    },

    closeEventInspectDialog() {
      this.showEventInspectDialog = false;
    },

    getCurrentEventId() {
      return Number($gameMap._interpreter.eventId()) || 0;
    },

    getCurrentEventCommandIndex() {
      const index = Number($gameMap._interpreter._index);
      if (!Number.isInteger(index) || index < 0) {
        return -1;
      }

      return index - 1;
    },

    scrollToCurrentEventEntry() {
      if (this.inspectedEventCurrentIndex < 0) {
        return;
      }

      const rowRef = this.$refs[`eventRow-${this.inspectedEventCurrentIndex}`];
      const rowEl = Array.isArray(rowRef) ? rowRef[0] : rowRef;
      if (!rowEl || typeof rowEl.scrollIntoView !== "function") {
        return;
      }

      rowEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    },

    async formatEventListEntries(list, anchorIndex = -1) {
      if (!Array.isArray(list) || list.length === 0) {
        return [];
      }

      const anchor = Math.max(
        0,
        Number.isInteger(anchorIndex) ? anchorIndex : 0,
      );

      return Promise.all(
        list.map(async (entry, index) => {
          const safeEntry = entry || {};
          const indent = Number.isInteger(safeEntry.indent)
            ? safeEntry.indent
            : 0;
          const code =
            typeof safeEntry.code === "number" ? safeEntry.code : null;
          const codeName =
            code === null ? "unknown" : interpretCodes.interpretCodes(code);
          const paramValue = safeEntry.parameters;
          const paramText = JSON.stringify(paramValue);
          const nearAnchor = Math.abs(index - anchor) <= HIGHLIGHT_RADIUS;
          return {
            index,
            codeText: code === null ? "n/a" : String(code),
            commandName: codeName,
            indentPx: Math.max(0, indent) * 16,
            paramHtml: nearAnchor
              ? await this.highlightParamText(paramText)
              : plainParamHtml(paramText),
          };
        }),
      );
    },

    async highlightParamText(text) {
      try {
        const codeToHtml = await loadCodeToHtml();
        return await codeToHtml(text, {
          lang: "json",
          theme: "dark-plus",
        });
      } catch (error) {
        // 异常消息可能回显输入片段，直接拼进 v-html 等于开注入口，
        // NW.js 下 XSS 即 RCE，必须先做 HTML 实体转义
        return plainParamHtml((error && error.message) || error);
      }
    },

    openDebugRepl() {
      this.showDebugReplDialog = true;
    },

    closeDebugRepl() {
      this.showDebugReplDialog = false;
    },

    updatePopupEscapeKeyGuard() {
      if (this.showEventInspectDialog || this.showDebugReplDialog) {
        this.enablePopupEscapeKeyGuard();
      } else {
        this.disablePopupEscapeKeyGuard();
      }
    },

    enablePopupEscapeKeyGuard() {
      if (this.popupEscapeKeyGuard) {
        return;
      }

      this.popupEscapeKeyGuard = (event) => {
        if (event.key !== "Escape") {
          return;
        }

        if (!this.showEventInspectDialog && !this.showDebugReplDialog) {
          return;
        }

        if (this.showDebugReplDialog) {
          this.closeDebugRepl();
        }
        if (this.showEventInspectDialog) {
          this.closeEventInspectDialog();
        }

        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        event.stopPropagation();
        event.preventDefault();
      };

      window.addEventListener("keydown", this.popupEscapeKeyGuard, true);
    },

    disablePopupEscapeKeyGuard() {
      if (!this.popupEscapeKeyGuard) {
        return;
      }

      window.removeEventListener("keydown", this.popupEscapeKeyGuard, true);
      this.popupEscapeKeyGuard = null;
    },

    enableReplGlobalKeyGuard() {
      if (this.replGlobalKeyGuard) {
        return;
      }

      this.replGlobalKeyGuard = (event) => {
        if (!this.showDebugReplDialog) {
          return;
        }

        const target = event.target;
        if (this.isNodeInsideDebugRepl(target)) {
          return;
        }

        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        event.stopPropagation();
        event.preventDefault();
      };

      window.addEventListener("keydown", this.replGlobalKeyGuard, true);
      window.addEventListener("keyup", this.replGlobalKeyGuard, true);
      window.addEventListener("keypress", this.replGlobalKeyGuard, true);
    },

    disableReplGlobalKeyGuard() {
      if (!this.replGlobalKeyGuard) {
        return;
      }

      window.removeEventListener("keydown", this.replGlobalKeyGuard, true);
      window.removeEventListener("keyup", this.replGlobalKeyGuard, true);
      window.removeEventListener("keypress", this.replGlobalKeyGuard, true);
      this.replGlobalKeyGuard = null;
    },

    isNodeInsideDebugRepl(node) {
      const replCardRef = this.$refs.debugReplCard;
      const replRoot =
        replCardRef && replCardRef.$el ? replCardRef.$el : replCardRef;
      if (!replRoot || !node || typeof replRoot.contains !== "function") {
        return false;
      }

      if (replRoot.contains(node)) {
        return true;
      }

      if (typeof node.closest === "function" && node.closest(".v-dialog")) {
        return true;
      }

      return false;
    },

    runRepl() {
      const code = String(this.replInput || "");
      if (!code) {
        this.appendReplOutput("warn", t("general.repl.emptyCode"));
        return;
      }

      this.appendReplOutput("input", code);

      try {
        const result = eval(code);
        this.appendReplOutput("result", this.formatReplValue(result));
      } catch (error) {
        const message = error && error.stack ? error.stack : String(error);
        this.appendReplOutput("error", message);
      }
    },

    clearReplOutput() {
      this.replOutputEntries = [];
    },

    appendReplOutput(type, content) {
      const labelMap = {
        input: "IN",
        result: "OUT",
        error: "ERR",
        warn: "WARN",
      };
      const label = labelMap[type] || "LOG";
      this.replOutputEntries.push(`${label}> ${content}`);

      if (this.replOutputEntries.length > 200) {
        this.replOutputEntries = this.replOutputEntries.slice(-200);
      }
    },

    formatReplValue(value) {
      if (value === undefined) {
        return "undefined";
      }
      if (typeof value === "string") {
        return value;
      }
      if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        return String(value);
      }

      try {
        return JSON.stringify(value, null, 2);
      } catch (error) {
        try {
          return String(value);
        } catch (stringError) {
          return "[Unserializable value]";
        }
      }
    },

    onGameSpeedChange() {
      let sceneOption = null;
      if (this.applyAllForGameSpeed) {
        sceneOption = GameSpeedCheat.sceneOptions().all;
      } else if (this.applyBattleForGameSpeed) {
        sceneOption = GameSpeedCheat.sceneOptions().battle;
      }

      GameSpeedCheat.setGameSpeed(this.gameSpeed, sceneOption);
      GameSpeedCheat.__writeSettings(this.gameSpeed, sceneOption);
      this.initializeVariables();
    },

    addGameSpeed(amount) {
      this.gameSpeed = Math.min(
        Math.max(this.gameSpeed + amount, this.minGameSpeed),
        this.maxGameSpeed,
      );
      this.onGameSpeedChange();
    },

    setGameSpeed(amount) {
      this.gameSpeed = amount;
      this.onGameSpeedChange();
    },

    onApplyAllForGameSpeedChange() {
      if (this.applyAllForGameSpeed) {
        this.applyBattleForGameSpeed = false;
      } else {
        this.applyBattleForGameSpeed = true;
      }

      this.onGameSpeedChange();
    },

    onApplyBattleForGameSpeedChange() {
      if (this.applyBattleForGameSpeed) {
        this.applyAllForGameSpeed = false;
      } else {
        this.applyAllForGameSpeed = true;
      }

      this.onGameSpeedChange();
    },

    openVersionLink(e) {
      e.preventDefault();
      if (typeof nw === "object") {
        nw.Shell.openExternal(this.versionUrl);
      } else {
        window.open(this.versionUrl, "_blank");
      }
    },
  },

  computed: {
    replOutputText() {
      return this.replOutputEntries.join("\n");
    },

    versionLabel() {
      const commit = BuildVersion.RPGVERSION || "unknown";
      const semver = BuildVersion.RPGSEMVER;

      return semver
        ? `v${semver} · ${commit} · Vue 3 + Vuetify 4`
        : `Commit ${commit} · Vue 3 + Vuetify 4`;
    },

    versionUrl() {
      return `https://github.com/233lol/RPG-Maker-MV-MZ-Cheat-UI-Plugin-Plus/commit/${BuildVersion.RPGVERSION}`;
    },
  },
};
