import RefreshButton from "../components/RefreshButton.js";
import { GeneralCheat } from "../js/CheatHelper.js";
import { isPartyReady, requirePartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { panelStateMixin } from "../js/PanelState.js";
import { markRaw } from "../libs/vue.js";
import { t } from "../js/strings.js";

export default {
  name: "StatsSettingPanel",

  mixins: [gameDataWatcherMixin, panelStateMixin],

  components: { RefreshButton },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-tabs
        v-model="selectedTab"
        bg-color="grey-darken-3"
        show-arrows>
        <v-tab
            v-for="actor in actors"
            :key="actor.id"
            :value="actor.id">
            {{actor.name}}
        </v-tab>
    </v-tabs>
    <v-window
        v-model="selectedTab">
        <v-window-item
            v-for="actor in actors"
            :key="actor.id"
            :value="actor.id">
            <v-card
                flat
                class="ma-0">
                <v-card-actions
                    class="pa-0">
                    <v-checkbox
                        v-model="actor.godMode"
                        density="compact"
                        hide-details
                        :label="t('stats.godMode')"
                        @change="onGodModeChange(actor)">
                    </v-checkbox>
                    <v-spacer></v-spacer>
                    <refresh-button
                        variant="elevated"
                        @click="initializeVariables">
                    </refresh-button>
                </v-card-actions>
                <v-card-subtitle class="pa-0">{{ t("stats.levelExp") }}</v-card-subtitle>
                <v-row class="mt-0 pt-3">
                    <v-col>
                        <v-text-field
                            label="Lv"
                            v-model="actor.level"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @change="onLevelChange(actor)"
                            @focus="$event.target.select()"
                            @keydown.stop></v-text-field>
                    </v-col>
                    <v-col>
                        <v-text-field
                            label="EXP"
                            v-model="actor.exp"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @change="onExpChange(actor)"
                            @focus="$event.target.select()"
                            @keydown.stop></v-text-field>
                    </v-col>
                </v-row>

                <v-card-subtitle class="pa-0 mt-4">{{ t("stats.params") }}</v-card-subtitle>
                <v-row class="mt-0 pt-3">
                    <v-col
                        v-for="(_, paramIdx) in actor.param.length"
                        :key="paramIdx"
                        cols="12"
                        md="6">
                        <v-text-field
                            :label="paramNames[paramIdx]"
                            v-model="actor.param[paramIdx]"
                            variant="outlined"
                            density="compact"
                            hide-details
                            @change="onParamChange(actor, paramIdx)"
                            @focus="$event.target.select()"
                            @keydown.stop></v-text-field>
                    </v-col>
                </v-row>
            </v-card>
        </v-window-item>
    </v-window>
</v-card>
    `,

  data() {
    return {
      selectedTab: null,
      paramNames: [], // name of stats (Max HP, ATK, ...)
      actors: [],
    };
  },

  created() {
    this.initializeVariables();
  },

  computed: {
    panelStateId() {
      return "stats";
    },
  },

  methods: {
    t,

    getPanelStateSnapshot() {
      return {
        selectedTab: this.selectedTab,
      };
    },

    applyPanelState(state) {
      this.selectedTab = state.selectedTab;
    },

    extractActorData(actor) {
      // get actor param
      const paramSize = actor._paramPlus.length;
      const param = new Array(paramSize);

      for (let paramId = 0; paramId < paramSize; ++paramId) {
        param[paramId] = actor.param(paramId);
      }

      return {
        _actor: markRaw(actor),
        id: actor._actorId,
        name: actor._name,
        godMode: GeneralCheat.isGodMode(actor),
        level: actor.level,
        exp: actor.currentExp(),
        param: param,
      };
    },

    initializeVariables() {
      if (!isPartyReady()) {
        this.paramNames = [];
        this.actors = [];
        return;
      }

      this.paramNames =
        typeof $dataSystem !== "undefined" && $dataSystem?.terms?.params
          ? $dataSystem.terms.params
          : [];
      this.actors = $gameParty
        .members()
        .map((actor) => this.extractActorData(actor));

      if (!this.actors.some((actor) => actor.id === this.selectedTab)) {
        this.selectedTab = this.actors[0]?.id ?? null;
      }
    },

    onLevelChange(item) {
      if (!requirePartyReady(t("features.modifyLevel"))) return;

      const level = Number(item.level);
      if (Number.isFinite(level) && level >= 1) {
        item._actor.changeLevel(level, false);
      }
      this.initializeVariables();
    },

    onExpChange(item) {
      if (!requirePartyReady(t("features.modifyExp"))) return;

      const exp = Number(item.exp);
      if (Number.isFinite(exp) && exp >= 0) {
        item._actor.changeExp(exp, false);
      }
      this.initializeVariables();
    },

    onParamChange(item, paramIndex) {
      if (!requirePartyReady(t("features.modifyParam"))) return;

      const newVal = Number(item.param[paramIndex]);
      if (!Number.isFinite(newVal)) {
        this.initializeVariables();
        return;
      }
      const base = item._actor.paramBase(paramIndex);
      const growth =
        typeof item._actor.paramGrowth === "function"
          ? item._actor.paramGrowth(paramIndex)
          : 0;
      const equipBonus = item._actor
        .equips()
        .reduce((sum, eq) => sum + (eq ? eq.params[paramIndex] : 0), 0);
      item._actor._paramPlus[paramIndex] = newVal - base - equipBonus - growth;
      this.initializeVariables();
    },

    onGodModeChange(item) {
      GeneralCheat.toggleGodMode(item._actor);
      this.initializeVariables();
    },
  },
};
