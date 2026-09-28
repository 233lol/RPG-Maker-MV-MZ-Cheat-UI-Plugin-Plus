import { GeneralCheat } from "../js/CheatHelper.js";
import { markRaw } from "../libs/vue.js";

export default {
  name: "StatsSettingPanel",

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
                        label="无敌模式"
                        @change="onGodModeChange(actor)">
                    </v-checkbox>
                    <v-spacer></v-spacer>
                    <v-tooltip
                        location="bottom">
                        <template #activator="{ props }">
                            <v-btn
                                color="pink"
                                size="small"
                                icon
                                variant="elevated"
                                v-bind="props"
                                @click="initializeVariables">
                                <v-icon>mdi-refresh</v-icon>
                            </v-btn>
                        </template>
                        <span>重新加载游戏数据</span>
                    </v-tooltip>
                </v-card-actions>
                <v-card-subtitle class="pa-0">等级 / 经验</v-card-subtitle>
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

                <v-card-subtitle class="pa-0 mt-4">属性</v-card-subtitle>
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

  methods: {
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
      this.paramNames = $dataSystem.terms.params;
      this.actors = $gameParty
        .members()
        .map((actor) => this.extractActorData(actor));
    },

    onLevelChange(item) {
      const level = Number(item.level);
      if (Number.isFinite(level) && level >= 1) {
        item._actor.changeLevel(level, false);
      }
      this.initializeVariables();
    },

    onExpChange(item) {
      const exp = Number(item.exp);
      if (Number.isFinite(exp) && exp >= 0) {
        item._actor.changeExp(exp, false);
      }
      this.initializeVariables();
    },

    onParamChange(item, paramIndex) {
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
      item._actor._paramPlus[paramIndex] =
        newVal - base - equipBonus - growth;
      this.initializeVariables();
    },

    onGodModeChange(item) {
      GeneralCheat.toggleGodMode(item._actor);
      this.initializeVariables();
    },
  },
};
