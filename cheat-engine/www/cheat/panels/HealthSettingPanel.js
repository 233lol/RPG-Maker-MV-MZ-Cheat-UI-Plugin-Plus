import HealthSettingTab from "./HealthSettingTab.js";
import { BattleCheat } from "../js/CheatHelper.js";
import { isPartyReady } from "../js/GameState.js";
import { markRaw } from "../libs/vue.js";

export default {
  name: "HealthSettingPanel",

  components: {
    HealthSettingTab,
  },

  template: `
<v-card 
    class="ma-0 pa-0"
    flat>
    <v-card-subtitle class="text-body-small pb-0">战斗</v-card-subtitle>
    <v-card-text class="pt-0 pb-2">
        <v-checkbox
            v-model="disableRandomEncounter"
            hide-details
            density="compact"
            class="my-0 py-0"
            @change="onDisableRandomEncounterChange">
            <template #label>
                <span class="text-body-small">禁用随机遇敌</span>
            </template>
        </v-checkbox>
        <v-btn size="small" @click.prevent="encounterBattle">遇敌</v-btn>
        <v-btn size="small" @click.prevent="victory">胜利</v-btn>
        <v-btn size="small" @click.prevent="defeat">失败</v-btn>
        <v-btn size="small" @click.prevent="escape">逃跑</v-btn>
        <v-btn size="small" @click.prevent="abort">中止</v-btn>
    </v-card-text>
    
    <v-card-subtitle class="text-body-small pb-1">敌人</v-card-subtitle>
    <v-card-text class="pt-0 pb-2">
        <v-btn size="small" @click.prevent="changeAllEnemyHealth(0)">HP 0</v-btn>
        <v-btn size="small" @click.prevent="changeAllEnemyHealth(1)">HP 1</v-btn>
        <v-btn size="small" @click.prevent="recoverAllEnemy">恢复</v-btn>
        <v-btn size="small" @click.prevent="fillTpAllEnemy">补满 TP</v-btn>
    </v-card-text>
    
    <v-card-subtitle class="text-body-small pb-1">队伍</v-card-subtitle>
    <v-card-text class="pt-0 pb-2">
        <v-btn size="small" @click.prevent="changeAllPartyHealth(0)">HP 0</v-btn>
        <v-btn size="small" @click.prevent="changeAllPartyHealth(1)">HP 1</v-btn>
        <v-btn size="small" @click.prevent="recoverAllParty">恢复</v-btn>
        <v-btn size="small" @click.prevent="fillTpAllParty">补满 TP</v-btn>
    </v-card-text>
    
    <template v-if="enemy && enemy.length > 0">
        <v-card-subtitle class="text-body-small pb-1">敌人详情</v-card-subtitle>
        <v-card-text class="pt-0 pb-2">
            <health-setting-tab
                :items="enemy"
                @change="onDetailChange">
            </health-setting-tab>
        </v-card-text>
    </template>
    
    <template v-if="party && party.length > 0">
        <v-card-subtitle class="text-body-small pb-1">队伍详情</v-card-subtitle>
        <v-card-text class="pt-0 pb-2">
            <health-setting-tab
                :items="party"
                @change="onDetailChange">
            </health-setting-tab>
        </v-card-text>
    </template>
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
      disableRandomEncounter: false,
      enemy: [],
      party: [],
    };
  },

  created() {
    this.initializeVariables();
  },

  methods: {
    initializeVariables() {
      if (
        !isPartyReady() ||
        typeof $gameTroop === "undefined" ||
        !$gameTroop
      ) {
        this.enemy = [];
        this.party = [];
        this.disableRandomEncounter =
          BattleCheat.isDisableRandomEncounter();
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
