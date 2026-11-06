// @ts-check
import RefreshButton from "../components/RefreshButton.js";
import { GeneralCheat } from "../js/CheatHelper.js";
import { isPartyReady, requirePartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { panelStateMixin } from "../js/PanelState.js";
import { markRaw } from "../libs/vue.js";
import { t } from "../js/strings.js";
import { getClassOptions } from "../js/actor/actors.js";
import { getEquipItem, getEquipmentRows } from "../js/actor/equipment.js";
import { getActiveStates, getAvailableStates } from "../js/actor/states.js";

const SUB_TABS = ["attributes", "equipment", "states"];

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
            <v-tabs
                v-model="selectedSubTab"
                density="compact"
                show-arrows>
                <v-tab value="attributes">{{ t("stats.tabAttributes") }}</v-tab>
                <v-tab value="equipment">{{ t("stats.tabEquipment") }}</v-tab>
                <v-tab value="states">{{ t("stats.tabStates") }}</v-tab>
            </v-tabs>

            <v-window v-model="selectedSubTab">
                <v-window-item value="attributes">
                    <v-card flat class="ma-0">
                        <v-card-actions class="pa-0">
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

                        <v-card-subtitle class="pa-0 mt-2">{{ t("stats.identity") }}</v-card-subtitle>
                        <v-row class="mt-0 pt-3">
                            <v-col cols="12" md="6">
                                <v-text-field
                                    :label="t('stats.name')"
                                    v-model="actor.name"
                                    variant="outlined"
                                    density="compact"
                                    hide-details
                                    @change="onNameChange(actor)"
                                    @focus="$event.target.select()"
                                    @keydown.stop></v-text-field>
                            </v-col>
                            <v-col cols="12" md="6">
                                <v-text-field
                                    :label="t('stats.nickname')"
                                    v-model="actor.nickname"
                                    variant="outlined"
                                    density="compact"
                                    hide-details
                                    @change="onNicknameChange(actor)"
                                    @focus="$event.target.select()"
                                    @keydown.stop></v-text-field>
                            </v-col>
                        </v-row>
                        <v-textarea
                            :label="t('stats.profile')"
                            v-model="actor.profile"
                            variant="outlined"
                            density="compact"
                            rows="2"
                            hide-details
                            class="mt-2"
                            @change="onProfileChange(actor)"
                            @keydown.stop></v-textarea>

                        <v-row class="mt-2">
                            <v-col cols="12" md="6">
                                <v-select
                                    :label="t('stats.class')"
                                    :items="classOptions"
                                    :model-value="actor.classId"
                                    variant="outlined"
                                    density="compact"
                                    hide-details
                                    @update:model-value="onClassChange(actor, $event)">
                                </v-select>
                            </v-col>
                        </v-row>

                        <v-card-subtitle class="pa-0 mt-4">{{ t("stats.levelExp") }}</v-card-subtitle>
                        <v-row class="mt-0 pt-3">
                            <v-col>
                                <v-text-field
                                    :label="t('stats.level')"
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
                                    :label="t('stats.exp')"
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

                <v-window-item value="equipment">
                    <v-card flat class="ma-0">
                        <v-card-actions class="pa-0">
                            <v-spacer></v-spacer>
                            <refresh-button
                                variant="elevated"
                                @click="initializeVariables">
                            </refresh-button>
                        </v-card-actions>

                        <div v-if="actor.equipment.length === 0" class="text-body-small text-grey-lighten-1">
                            {{ t("stats.noEquipment") }}
                        </div>
                        <v-row
                            v-for="slot in actor.equipment"
                            :key="slot.slotId"
                            class="mt-0 pt-2">
                            <v-col cols="12" md="4" class="text-body-medium align-self-center">
                                {{ slot.slotName || t("stats.equipSlot", { index: slot.slotId + 1 }) }}
                            </v-col>
                            <v-col cols="12" md="8">
                                <v-select
                                    :items="slot.options"
                                    :model-value="slot.equipId"
                                    variant="outlined"
                                    density="compact"
                                    hide-details
                                    @update:model-value="onEquipChange(actor, slot, $event)">
                                </v-select>
                            </v-col>
                        </v-row>
                    </v-card>
                </v-window-item>

                <v-window-item value="states">
                    <v-card flat class="ma-0">
                        <v-card-actions class="pa-0">
                            <v-spacer></v-spacer>
                            <refresh-button
                                variant="elevated"
                                @click="initializeVariables">
                            </refresh-button>
                        </v-card-actions>

                        <v-card-subtitle class="pa-0">{{ t("stats.currentStates") }}</v-card-subtitle>
                        <div v-if="actor.activeStates.length > 0" class="mt-2">
                            <v-chip
                                v-for="state in actor.activeStates"
                                :key="state.id"
                                class="mr-1 mb-1"
                                closable
                                @click:close="onRemoveState(actor, state.id)">
                                {{ state.name }}
                            </v-chip>
                        </div>
                        <div v-else class="text-body-small text-grey-lighten-1">
                            {{ t("stats.noStates") }}
                        </div>

                        <v-card-subtitle class="pa-0 mt-4">{{ t("stats.addState") }}</v-card-subtitle>
                        <div class="d-flex align-center mt-2">
                            <v-select
                                v-model="actor.stateToAdd"
                                :items="actor.availableStateOptions"
                                :label="t('stats.statePlaceholder')"
                                variant="outlined"
                                density="compact"
                                hide-details
                                clearable></v-select>
                            <v-btn
                                class="ml-2"
                                color="teal"
                                size="small"
                                :disabled="actor.stateToAdd == null"
                                @click="onAddState(actor)">
                                {{ t("common.add") }}
                            </v-btn>
                        </div>
                    </v-card>
                </v-window-item>
            </v-window>
        </v-window-item>
    </v-window>
</v-card>
    `,

  data() {
    return {
      selectedTab: null,
      selectedSubTab: "attributes",
      paramNames: [], // name of stats (Max HP, ATK, ...)
      classOptions: [],
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
        selectedSubTab: this.selectedSubTab,
      };
    },

    applyPanelState(state) {
      this.selectedTab = state.selectedTab;
      this.selectedSubTab = SUB_TABS.includes(state.selectedSubTab)
        ? state.selectedSubTab
        : "attributes";
    },

    extractActorData(actor) {
      // get actor param
      const paramSize = actor._paramPlus.length;
      const param = new Array(paramSize);

      for (let paramId = 0; paramId < paramSize; ++paramId) {
        param[paramId] = actor.param(paramId);
      }

      const equipment = getEquipmentRows(
        actor,
        typeof $dataSystem !== "undefined" ? $dataSystem : null,
        typeof $dataWeapons !== "undefined" ? $dataWeapons : [],
        typeof $dataArmors !== "undefined" ? $dataArmors : [],
      ).map((slot) => ({
        ...slot,
        options: [{ title: t("stats.none"), value: 0 }, ...slot.options],
      }));

      return {
        _actor: markRaw(actor),
        id: actor._actorId,
        name: actor._name,
        nickname: actor._nickname,
        profile: actor._profile,
        classId: Number(actor._classId) || 0,
        godMode: GeneralCheat.isGodMode(actor),
        level: actor.level,
        exp: actor.currentExp(),
        param: param,
        equipment,
        activeStates: getActiveStates(
          actor,
          typeof $dataStates !== "undefined" ? $dataStates : [],
        ),
        availableStateOptions: getAvailableStates(
          actor,
          typeof $dataStates !== "undefined" ? $dataStates : [],
        ),
        stateToAdd: null,
      };
    },

    initializeVariables() {
      if (!isPartyReady()) {
        this.paramNames = [];
        this.classOptions = [];
        this.actors = [];
        return;
      }

      this.paramNames =
        typeof $dataSystem !== "undefined" && $dataSystem?.terms?.params
          ? $dataSystem.terms.params
          : [];
      this.classOptions = getClassOptions(
        typeof $dataClasses !== "undefined" ? $dataClasses : [],
      );
      this.actors = $gameParty
        .members()
        .map((actor) => this.extractActorData(actor));

      if (!this.actors.some((actor) => actor.id === this.selectedTab)) {
        this.selectedTab = this.actors[0]?.id ?? null;
      }

      if (!SUB_TABS.includes(this.selectedSubTab)) {
        this.selectedSubTab = "attributes";
      }
    },

    onNameChange(item) {
      if (!requirePartyReady(t("features.modifyActor"))) return;

      item._actor.setName(String(item.name ?? ""));
      this.initializeVariables();
    },

    onNicknameChange(item) {
      if (!requirePartyReady(t("features.modifyActor"))) return;

      item._actor.setNickname(String(item.nickname ?? ""));
      this.initializeVariables();
    },

    onProfileChange(item) {
      if (!requirePartyReady(t("features.modifyActor"))) return;

      item._actor.setProfile(String(item.profile ?? ""));
      this.initializeVariables();
    },

    onClassChange(item, classId) {
      if (!requirePartyReady(t("features.modifyActor"))) return;

      const id = Number(classId) || 0;
      if (id <= 0 || id === item.classId) {
        this.initializeVariables();
        return;
      }

      if (
        typeof $dataClasses !== "undefined" &&
        $dataClasses &&
        !$dataClasses[id]
      ) {
        this.initializeVariables();
        return;
      }

      item._actor.changeClass(id, true);
      this.initializeVariables();
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

    onEquipChange(item, slot, equipId) {
      if (!requirePartyReady(t("features.modifyEquipment"))) return;

      const numericId = Number(equipId) || 0;
      const equip = getEquipItem(
        slot.slotId,
        numericId,
        typeof $dataWeapons !== "undefined" ? $dataWeapons : [],
        typeof $dataArmors !== "undefined" ? $dataArmors : [],
        slot.slotTypeId,
      );

      if (numericId > 0 && !equip) {
        this.initializeVariables();
        return;
      }

      item._actor.changeEquip(slot.slotId, equip);
      this.initializeVariables();
    },

    onAddState(item) {
      if (!requirePartyReady(t("features.modifyState"))) return;

      const stateId = Number(item.stateToAdd) || 0;
      if (stateId <= 0) {
        return;
      }

      if (
        typeof $dataStates !== "undefined" &&
        $dataStates &&
        !$dataStates[stateId]
      ) {
        return;
      }

      item._actor.addState(stateId);
      this.initializeVariables();
    },

    onRemoveState(item, stateId) {
      if (!requirePartyReady(t("features.modifyState"))) return;

      const id = Number(stateId) || 0;
      if (id <= 0) {
        return;
      }

      item._actor.removeState(id);
      this.initializeVariables();
    },
  },
};
