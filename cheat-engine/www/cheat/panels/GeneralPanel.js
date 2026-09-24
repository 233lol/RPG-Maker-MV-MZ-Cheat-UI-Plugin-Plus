import {
  GeneralCheat,
  GameSpeedCheat,
  SpeedCheat,
  SceneCheat,
  BattleCheat,
} from "../js/CheatHelper.js";

import interpretCodes from "../js/eventCodes.js";
import { RPGVERSION } from "../version.js";

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

  template: `
<v-card 
    class="ma-0 pa-0"
    flat>
    <v-card-text 
        class="py-0">
        <v-checkbox
            v-model="noClip"
            label="穿墙"
            @change="onNoClipChange">
        </v-checkbox>
    </v-card-text>
    
    <v-card-text class="py-0">
        <v-text-field
            v-model="gold"
            label="钱"
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
                <span class="text-grey-lighten-1 align-self-center mr-2 text-body-medium" style="white-space: nowrap;">移动速度</span>
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
            label="固定速度"
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
                <span class="text-grey-lighten-1 align-self-center mr-2 d-inline-block text-body-medium" style="white-space: nowrap;">游戏速度</span>
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
            label="全部场景"
            @change="onApplyAllForGameSpeedChange">
        </v-checkbox>
        <v-checkbox
            v-model="applyBattleForGameSpeed"
            class="d-inline-flex ml-2 pt-0 mb-0"
            hide-details
            density="compact"
            label="战斗中"
            @change="onApplyBattleForGameSpeedChange">
        </v-checkbox>
    </v-card-text>

    <v-card-subtitle class="mt-3 font-weight-bold">快速操作</v-card-subtitle>
    
    <v-card-text class="py-0">
        <v-btn size="small" @click="gotoTitle">返回标题</v-btn>
        <v-btn size="small" class="mr-1" @click="toggleSaveScene">保存页面</v-btn>
        <v-btn size="small" @click="toggleLoadScene">加载页面</v-btn>
    </v-card-text>

    <v-card-text>
        <v-btn size="small" @click="victory">胜利</v-btn>
        <v-btn size="small" @click="recoverAllParty">我方恢复</v-btn>
        <v-btn size="small" @click="changeAllEnemyHealth(1)">敌人1血</v-btn>
    </v-card-text>

    <v-card-text class="pt-0">
        <v-btn size="small" color="indigo" @click="inspectCurrentEvent">检查当前事件</v-btn>
        <v-btn size="small" color="deep-purple" class="ml-2" @click="openDebugRepl">打开REPL</v-btn>
    </v-card-text>

    <v-dialog v-model="showEventInspectDialog" max-width="1200" persistent>
      <v-card>
            <v-card-title class="d-flex align-center">
                <v-btn icon size="small" @click="closeEventInspectDialog">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <v-spacer></v-spacer>
                <span class="text-title-large">Event ID: {{ inspectedEventId === null ? '-' : inspectedEventId }}</span>
            </v-card-title>
            <v-card-text>
              <v-sheet
                border
                class="pa-0"
                style="max-height: 620px; overflow-y: auto; font-size: 12px;">
                <div
                  v-if="inspectedEventRows.length === 0"
                  class="pa-4 text-grey-lighten-1">
                  {{ inspectedEventMessage || '(empty event list)' }}
                </div>
                <div v-else>
                  <div
                    class="d-flex px-3 py-1 font-weight-bold"
                    style="border-bottom: 1px solid rgba(255,255,255,0.18); position: sticky; top: 0; z-index: 1;">
                    <div style="width: 60px;">Index</div>
                    <div style="width: 70px;">Code</div>
                    <div class="flex-grow-1">Command / Params</div>
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
                    <v-btn size="small" color="primary" @click="runRepl">执行 (⌘/Ctrl+Enter)</v-btn>
                    <v-btn size="small" variant="text" @click="clearReplOutput">清空输出</v-btn>
                </v-card-actions>
                <v-spacer></v-spacer>
                <span class="text-title-large">调试 REPL</span>
            </v-card-title>
            <v-card-text>
                <v-textarea
                    v-model="replInput"
                    label="输入"
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

                <div class="mt-3 mb-1 text-body-small">输出</div>
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
    <v-tooltip
        location="bottom">
        <template #activator="{ props }">
            <v-btn
                color="pink"
                size="small"
                icon
                style="position: absolute; top: 0px; right: 0px;"
                v-bind="props"
                @click="initializeVariables">
                <v-icon>mdi-refresh</v-icon>
            </v-btn>
        </template>
        <span>重新加载游戏数据</span>
    </v-tooltip>
</v-card>
    `,

  data() {
    return {
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
    initializeVariables() {
      this.noClip = $gamePlayer._through;
      this.speed = $gamePlayer.moveSpeed();
      this.fixSpeed = SpeedCheat.isFixed();
      this.gold = $gameParty._gold;

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
      if (
        isNaN(this.gold) ||
        !Number.isInteger(Number(this.gold)) ||
        this.gold < 0
      ) {
        return;
      }

      const diff = this.gold - $gameParty._gold;

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
      try {
        const eventId = this.getCurrentEventId();
        this.inspectedEventId = eventId;
        this.inspectedEventCurrentIndex = this.getCurrentEventCommandIndex();

        if (!eventId || eventId <= 0) {
          this.inspectedEventRows = [];
          this.inspectedEventMessage = "当前没有正在执行的地图事件";
          this.showEventInspectDialog = true;
          return;
        }

        const eventObject = $gameMap.event(eventId);
        const pageData =
          eventObject && eventObject.page ? eventObject.page() : null;

        this.inspectedEventRows = await this.formatEventListEntries(
          pageData && pageData.list ? pageData.list : [],
        );
        this.inspectedEventMessage =
          this.inspectedEventRows.length === 0 ? "(empty event list)" : "";
      } catch (error) {
        this.inspectedEventRows = [];
        this.inspectedEventMessage = `error: ${String(error)}`;
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

    async formatEventListEntries(list) {
      if (!Array.isArray(list) || list.length === 0) {
        return [];
      }

      const anchor = Math.max(
        0,
        Number.isInteger(this.inspectedEventCurrentIndex)
          ? this.inspectedEventCurrentIndex
          : 0,
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

      if (
        typeof node.closest === "function" &&
        node.closest(".v-dialog")
      ) {
        return true;
      }

      return false;
    },

    runRepl() {
      const code = String(this.replInput || "");
      if (!code) {
        this.appendReplOutput("warn", "请输入要执行的 JavaScript 代码");
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
      return `Commit ${RPGVERSION}, Vue 3 + Vuetify 4`;
    },

    versionUrl() {
      return `https://github.com/233lol/RPG-Maker-MV-MZ-Cheat-UI-Plugin/commit/${RPGVERSION}`;
    },
  },
};
