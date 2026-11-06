import RefreshButton from "../components/RefreshButton.js";
import HealthSettingTab from "./HealthSettingTab.js";
import { BattleCheat } from "../js/CheatHelper.js";
import { isPartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { markRaw } from "../libs/vue.js";
import { t } from "../js/strings.js";

export default {
  name: "HealthSettingPanel",

  mixins: [gameDataWatcherMixin],

  components: {
    HealthSettingTab,
    RefreshButton,
  },

  template: `
<v-card 
    class="ma-0 pa-0"
    flat>
    <v-card-subtitle class="text-body-small pb-0">{{ t("battle.title") }}</v-card-subtitle>
    <v-card-text class="pt-0 pb-2">
        <v-checkbox
            v-model="disableRandomEncounter"
            hide-details
            density="compact"
            class="my-0 py-0"
            @change="onDisableRandomEncounterChange">
            <template #label>
                <span class="text-body-small">{{ t("battle.disableRandomEncounter") }}</span>
            </template>
        </v-checkbox>
        <v-btn size="small" @click.prevent="encounterBattle">{{ t("battle.encounter") }}</v-btn>
        <v-btn size="small" @click.prevent="victory">{{ t("battle.victory") }}</v-btn>
        <v-btn size="small" @click.prevent="defeat">{{ t("battle.defeat") }}</v-btn>
        <v-btn size="small" @click.prevent="escape">{{ t("battle.escape") }}</v-btn>
        <v-btn size="small" @click.prevent="abort">{{ t("battle.abort") }}</v-btn>
    </v-card-text>
    
    <v-card-subtitle class="text-body-small pb-1">{{ t("battle.enemy") }}</v-card-subtitle>
    <v-card-text class="pt-0 pb-2">
        <v-btn size="small" @click.prevent="changeAllEnemyHealth(0)">{{ t("battle.hpZero") }}</v-btn>
        <v-btn size="small" @click.prevent="changeAllEnemyHealth(1)">{{ t("battle.hpOne") }}</v-btn>
        <v-btn size="small" @click.prevent="recoverAllEnemy">{{ t("battle.recover") }}</v-btn>
        <v-btn size="small" @click.prevent="fillTpAllEnemy">{{ t("battle.fillTp") }}</v-btn>
    </v-card-text>
    
    <v-card-subtitle class="text-body-small pb-1">{{ t("battle.party") }}</v-card-subtitle>
    <v-card-text class="pt-0 pb-2">
        <v-btn size="small" @click.prevent="changeAllPartyHealth(0)">{{ t("battle.hpZero") }}</v-btn>
        <v-btn size="small" @click.prevent="changeAllPartyHealth(1)">{{ t("battle.hpOne") }}</v-btn>
        <v-btn size="small" @click.prevent="recoverAllParty">{{ t("battle.recover") }}</v-btn>
        <v-btn size="small" @click.prevent="fillTpAllParty">{{ t("battle.fillTp") }}</v-btn>
    </v-card-text>
    
    <template v-if="enemy && enemy.length > 0">
        <v-card-subtitle class="text-body-small pb-1">{{ t("battle.enemyDetail") }}</v-card-subtitle>
        <v-card-text class="pt-0 pb-2">
            <health-setting-tab
                :items="enemy"
                @change="onDetailChange">
            </health-setting-tab>
        </v-card-text>
    </template>
    
    <template v-if="party && party.length > 0">
        <v-card-subtitle class="text-body-small pb-1">{{ t("battle.partyDetail") }}</v-card-subtitle>
        <v-card-text class="pt-0 pb-2">
            <health-setting-tab
                :items="party"
                @change="onDetailChange">
            </health-setting-tab>
        </v-card-text>
    </template>
    <refresh-button
        btn-style="position: absolute; top: 0px; right: 0px;"
        @click="initializeVariables">
    </refresh-button>
</v-card>
    `,

  data() {
    return {
      disableRandomEncounter: false,
      enemy: [],
      party: [],
    };
  },

  created() {
    this.initializeVariables();
  },

  methods: {
    t,

    initializeVariables() {
      if (!isPartyReady() || typeof $gameTroop === "undefined" || !$gameTroop) {
        this.enemy = [];
        this.party = [];
        this.disableRandomEncounter = BattleCheat.isDisableRandomEncounter();
        return;
      }

      this.enemy = markRaw($gameTroop.members().slice());
      this.party = markRaw($gameParty.members().slice());
      this.disableRandomEncounter = BattleCheat.isDisableRandomEncounter();
    },

    recoverAllEnemy() {
      BattleCheat.recoverAllEnemy();
      this.initializeVariables();
    },

    recoverAllParty() {
      BattleCheat.recoverAllParty();
      this.initializeVariables();
    },

    fillTpAllEnemy() {
      BattleCheat.fillTpAllEnemy();
      this.initializeVariables();
    },

    fillTpAllParty() {
      BattleCheat.fillTpAllParty();
      this.initializeVariables();
    },

    changeAllEnemyHealth(newHp) {
      BattleCheat.changeAllEnemyHealth(newHp);
      this.initializeVariables();
    },

    changeAllPartyHealth(newHp) {
      BattleCheat.changeAllPartyHealth(newHp);
      this.initializeVariables();
    },

    encounterBattle() {
      BattleCheat.encounterBattle();
    },

    victory() {
      BattleCheat.victory();
    },

    defeat() {
      BattleCheat.defeat();
    },

    escape() {
      BattleCheat.escape();
    },

    abort() {
      BattleCheat.abort();
    },

    onDisableRandomEncounterChange() {
      BattleCheat.toggleDisableRandomEncounter();
      this.initializeVariables();
    },

    onDetailChange(items) {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const member = item._member;
        if (!member) continue;

        const hp = Number(item.hp.hp);
        const mp = Number(item.mp.mp);
        if (Number.isFinite(hp)) {
          member.setHp(hp);
        }
        if (Number.isFinite(mp)) {
          member.setMp(mp);
        }
      }
      this.initializeVariables();
    },
  },
};
