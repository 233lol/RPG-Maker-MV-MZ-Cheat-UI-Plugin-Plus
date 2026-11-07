// @ts-check
import RefreshButton from "../components/RefreshButton.js";
import { Alert } from "../js/AlertHelper.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { isGameReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import {
  PLAY_TIME_MAX_SECONDS,
  parseStatInteger,
  readGameStats,
  writeCounters,
  writeGold,
  writePlaytime,
  writeSteps,
} from "../js/game-system/stats.js";
import { t } from "../js/strings.js";

export default {
  name: "GameSystemPanel",

  mixins: [gameDataWatcherMixin],

  components: { RefreshButton },

  template: `
<v-card flat class="ma-0 pa-0">
    <div class="d-flex align-center mb-2">
        <v-icon class="mr-2">mdi-chart-box-outline</v-icon>
        <span class="text-title-medium">{{ t("gameSystem.title") }}</span>
        <v-spacer></v-spacer>
        <refresh-button @click="initializeVariables"></refresh-button>
    </div>

    <v-alert
        v-if="!ready"
        type="info"
        variant="tonal"
        density="compact">
        {{ t("gameSystem.unavailable") }}
    </v-alert>

    <template v-else>
        <v-row dense>
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="playtimeSeconds"
                    type="number"
                    :min="0"
                    :max="maxPlaytimeSeconds"
                    :label="t('gameSystem.playtime')"
                    :hint="t('gameSystem.playtimeHint', { time: playtimeText })"
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    @change="onPlaytimeChange"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="steps"
                    type="number"
                    :min="0"
                    :label="t('gameSystem.steps')"
                    variant="outlined"
                    density="compact"
                    hide-details
                    @change="onStepsChange"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="gold"
                    type="number"
                    :min="0"
                    :label="t('gameSystem.gold')"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mt-3"
                    @change="onGoldChange"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="saveCount"
                    type="number"
                    :min="0"
                    :label="t('gameSystem.saveCount')"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mt-3"
                    @change="onCounterChange('saveCount')"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="battleCount"
                    type="number"
                    :min="0"
                    :label="t('gameSystem.battleCount')"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mt-3"
                    @change="onCounterChange('battleCount')"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="winCount"
                    type="number"
                    :min="0"
                    :label="t('gameSystem.winCount')"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mt-3"
                    @change="onCounterChange('winCount')"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    v-model="escapeCount"
                    type="number"
                    :min="0"
                    :label="t('gameSystem.escapeCount')"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mt-3"
                    @change="onCounterChange('escapeCount')"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
            </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>

        <v-row dense>
            <v-col cols="12" md="6">
                <v-text-field
                    :model-value="mapText"
                    :label="t('gameSystem.currentMap')"
                    readonly
                    variant="outlined"
                    density="compact"
                    hide-details>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    :model-value="positionText"
                    :label="t('gameSystem.position')"
                    readonly
                    variant="outlined"
                    density="compact"
                    hide-details>
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    :model-value="partySize"
                    :label="t('gameSystem.partySize')"
                    readonly
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mt-3">
                </v-text-field>
            </v-col>
            <v-col cols="12" md="6">
                <v-text-field
                    :model-value="engineText"
                    :label="t('gameSystem.engine')"
                    readonly
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mt-3">
                </v-text-field>
            </v-col>
        </v-row>

        <div class="d-flex mt-4">
            <v-btn
                color="red"
                variant="text"
                prepend-icon="mdi-counter"
                @click="confirmResetCounters">
                {{ t("gameSystem.resetCounters") }}
            </v-btn>
        </div>
    </template>
</v-card>
    `,

  data() {
    return {
      ready: false,
      playtimeSeconds: 0,
      playtimeText: "00:00:00",
      steps: 0,
      saveCount: 0,
      battleCount: 0,
      winCount: 0,
      escapeCount: 0,
      gold: 0,
      mapId: 0,
      mapName: "",
      playerX: 0,
      playerY: 0,
      partySize: 0,
      engine: "",
      maxPlaytimeSeconds: PLAY_TIME_MAX_SECONDS,
    };
  },

  created() {
    this.initializeVariables();
  },

  computed: {
    mapText() {
      if (this.mapId <= 0) {
        return t("gameSystem.noMap");
      }

      return t("gameSystem.mapValue", {
        id: this.mapId,
        name: this.mapName || t("common.unknown"),
      });
    },

    positionText() {
      return `${this.playerX}, ${this.playerY}`;
    },

    engineText() {
      return this.engine || t("common.unknown");
    },
  },

  methods: {
    t,

    getGameEnv() {
      return {
        gameSystem: typeof $gameSystem !== "undefined" ? $gameSystem : null,
        gameParty: typeof $gameParty !== "undefined" ? $gameParty : null,
        gameMap: typeof $gameMap !== "undefined" ? $gameMap : null,
        gamePlayer: typeof $gamePlayer !== "undefined" ? $gamePlayer : null,
        dataMapInfos:
          typeof $dataMapInfos !== "undefined" ? $dataMapInfos : null,
        graphics: typeof Graphics !== "undefined" ? Graphics : null,
        utils: typeof Utils !== "undefined" ? Utils : null,
      };
    },

    initializeVariables() {
      this.ready = isGameReady();

      if (!this.ready) {
        return;
      }

      const stats = readGameStats(this.getGameEnv());

      this.playtimeSeconds = stats.playtimeSeconds;
      this.playtimeText = stats.playtimeText;
      this.steps = stats.steps;
      this.saveCount = stats.saveCount;
      this.battleCount = stats.battleCount;
      this.winCount = stats.winCount;
      this.escapeCount = stats.escapeCount;
      this.gold = stats.gold;
      this.mapId = stats.mapId;
      this.mapName = stats.mapName;
      this.playerX = stats.playerX;
      this.playerY = stats.playerY;
      this.partySize = stats.partySize;
      this.engine = stats.engine;
    },

    reportInvalid(label) {
      Alert.warn(t("gameSystem.invalidValue", { label }));
      this.initializeVariables();
    },

    reportWriteFailure(result, label) {
      Alert.error(
        t("gameSystem.writeFailed", {
          label,
          message: (result && result.message) || "",
        }),
      );
      this.initializeVariables();
    },

    reportUpdated(label) {
      Alert.success(t("gameSystem.updated", { label }));
      this.initializeVariables();
    },

    onPlaytimeChange() {
      const label = t("gameSystem.playtime");
      const value = parseStatInteger(this.playtimeSeconds, {
        min: 0,
        max: this.maxPlaytimeSeconds,
      });

      if (value === null) {
        this.reportInvalid(label);
        return;
      }

      const env = this.getGameEnv();
      const result = writePlaytime(env.gameSystem, env.graphics, value);

      if (!result.ok) {
        this.reportWriteFailure(result, label);
        return;
      }

      this.reportUpdated(label);
    },

    onStepsChange() {
      const label = t("gameSystem.steps");
      const value = parseStatInteger(this.steps);

      if (value === null) {
        this.reportInvalid(label);
        return;
      }

      const env = this.getGameEnv();
      const result = writeSteps(env.gameParty, value);

      if (!result.ok) {
        this.reportWriteFailure(result, label);
        return;
      }

      this.reportUpdated(label);
    },

    onCounterChange(key) {
      const labels = {
        saveCount: t("gameSystem.saveCount"),
        battleCount: t("gameSystem.battleCount"),
        winCount: t("gameSystem.winCount"),
        escapeCount: t("gameSystem.escapeCount"),
      };
      const label = labels[key] || key;
      const value = parseStatInteger(this[key]);

      if (value === null) {
        this.reportInvalid(label);
        return;
      }

      const env = this.getGameEnv();
      const result = writeCounters(env.gameSystem, { [key]: value });

      if (!result.ok) {
        this.reportWriteFailure(result, label);
        return;
      }

      this.reportUpdated(label);
    },

    onGoldChange() {
      const label = t("gameSystem.gold");
      const value = parseStatInteger(this.gold);

      if (value === null) {
        this.reportInvalid(label);
        return;
      }

      const env = this.getGameEnv();
      const result = writeGold(env.gameParty, value);

      if (!result.ok) {
        this.reportWriteFailure(result, label);
        return;
      }

      this.reportUpdated(label);
    },

    confirmResetCounters() {
      const self = this;

      ConfirmDialog.show({
        width: 460,
        message: t("gameSystem.resetConfirm"),
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: "mdi-counter",
            color: "red",
            label: t("gameSystem.reset"),
            action() {
              self.resetCounters();
              ConfirmDialog.close();
            },
          },
        ],
      });
    },

    resetCounters() {
      const env = this.getGameEnv();
      const result = writeCounters(env.gameSystem, {
        saveCount: 0,
        battleCount: 0,
        winCount: 0,
        escapeCount: 0,
      });

      if (!result.ok) {
        this.reportWriteFailure(result, t("gameSystem.resetCounters"));
        return;
      }

      this.reportUpdated(t("gameSystem.resetCounters"));
    },
  },
};
