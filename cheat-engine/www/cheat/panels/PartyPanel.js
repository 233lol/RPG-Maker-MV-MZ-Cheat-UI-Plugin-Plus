// @ts-check
import RefreshButton from "../components/RefreshButton.js";
import { Alert } from "../js/AlertHelper.js";
import { isPartyReady, requirePartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { panelStateMixin } from "../js/PanelState.js";
import { t } from "../js/strings.js";
import {
  canRemovePartyMember,
  getAvailableActors,
  getMaxBattleMembers,
  getPartyRows,
  getSwapTargetIndex,
} from "../js/actor/party.js";

export default {
  name: "PartyPanel",

  mixins: [gameDataWatcherMixin, panelStateMixin],

  components: { RefreshButton },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-card-actions class="pa-0">
        <span class="text-body-small text-grey-lighten-1">
            {{ t("party.battleMembers", { count: battleMemberCount }) }}
        </span>
        <v-spacer></v-spacer>
        <refresh-button
            variant="elevated"
            @click="initializeVariables">
        </refresh-button>
    </v-card-actions>

    <v-card-subtitle class="pa-0 mt-2">{{ t("party.current") }}</v-card-subtitle>
    <div v-if="partyRows.length === 0" class="text-body-small text-grey-lighten-1 mt-2">
        {{ t("party.empty") }}
    </div>
    <v-table v-else density="compact" class="mt-2">
        <thead>
            <tr>
                <th>{{ t("party.name") }}</th>
                <th>{{ t("party.className") }}</th>
                <th>{{ t("party.level") }}</th>
                <th>{{ t("party.battleMember") }}</th>
                <th>{{ t("common.actions") }}</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="row in partyRows" :key="row.id">
                <td>{{ row.name }}</td>
                <td>{{ row.className }}</td>
                <td>{{ row.level }}</td>
                <td>
                    <v-icon v-if="row.battleMember" color="teal" size="small">mdi-sword-cross</v-icon>
                </td>
                <td class="text-no-wrap">
                    <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        :disabled="!row.canMoveUp"
                        :title="t('party.moveUp')"
                        :aria-label="t('party.moveUp')"
                        @click="moveMember(row, -1)">
                        <v-icon size="small">mdi-arrow-up</v-icon>
                    </v-btn>
                    <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        :disabled="!row.canMoveDown"
                        :title="t('party.moveDown')"
                        :aria-label="t('party.moveDown')"
                        @click="moveMember(row, 1)">
                        <v-icon size="small">mdi-arrow-down</v-icon>
                    </v-btn>
                    <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        color="red"
                        :disabled="!canRemoveMember"
                        :title="t('party.remove')"
                        :aria-label="t('party.remove')"
                        @click="removeMember(row)">
                        <v-icon size="small">mdi-account-minus</v-icon>
                    </v-btn>
                </td>
            </tr>
        </tbody>
    </v-table>

    <v-card-subtitle class="pa-0 mt-4">{{ t("party.add") }}</v-card-subtitle>
    <div v-if="availableOptions.length === 0" class="text-body-small text-grey-lighten-1 mt-2">
        {{ t("party.noAvailable") }}
    </div>
    <div v-else class="d-flex align-center mt-2">
        <v-select
            v-model="selectedAddId"
            :items="availableOptions"
            :label="t('party.addPlaceholder')"
            variant="outlined"
            density="compact"
            hide-details></v-select>
        <v-btn
            class="ml-2"
            color="teal"
            size="small"
            :disabled="selectedAddId == null"
            @click="addMember">
            {{ t("common.add") }}
        </v-btn>
    </div>
</v-card>
    `,

  data() {
    return {
      partyRows: [],
      availableRows: [],
      battleMemberCount: 0,
      selectedAddId: null,
    };
  },

  created() {
    this.initializeVariables();
  },

  computed: {
    panelStateId() {
      return "party";
    },

    availableOptions() {
      return this.availableRows.map((actor) => ({
        title: actor.name,
        value: actor.id,
      }));
    },

    canRemoveMember() {
      return this.partyRows.length > 1;
    },
  },

  methods: {
    t,

    getPanelStateSnapshot() {
      return {
        selectedAddId: this.selectedAddId,
      };
    },

    applyPanelState(state) {
      this.selectedAddId = state.selectedAddId ?? null;
    },

    initializeVariables() {
      if (!isPartyReady()) {
        this.partyRows = [];
        this.availableRows = [];
        this.battleMemberCount = 0;
        return;
      }

      const dataActors = typeof $dataActors !== "undefined" ? $dataActors : [];
      const dataClasses =
        typeof $dataClasses !== "undefined" ? $dataClasses : [];

      this.partyRows = getPartyRows($gameParty, dataActors, dataClasses);
      this.availableRows = getAvailableActors($gameParty, dataActors);
      this.battleMemberCount = getMaxBattleMembers($gameParty);

      if (!this.availableRows.some((row) => row.id === this.selectedAddId)) {
        this.selectedAddId = this.availableRows[0]?.id ?? null;
      }
    },

    moveMember(row, offset) {
      if (!requirePartyReady(t("features.modifyParty"))) return;

      const target = getSwapTargetIndex(
        this.partyRows.length,
        row.index,
        offset,
      );

      if (target === null) {
        return;
      }

      if (typeof $gameParty.swapOrder !== "function") {
        Alert.warn(t("party.reorderUnsupported"));
        return;
      }

      $gameParty.swapOrder(row.index, target);
      this.initializeVariables();
    },

    removeMember(row) {
      if (!requirePartyReady(t("features.modifyParty"))) return;

      if (!canRemovePartyMember($gameParty)) {
        Alert.warn(t("party.lastMember"));
        return;
      }

      $gameParty.removeActor(row.id);
      Alert.success(t("party.removed", { name: row.name }));
      this.initializeVariables();
    },

    addMember() {
      if (!requirePartyReady(t("features.modifyParty"))) return;

      const actorId = Number(this.selectedAddId) || 0;
      if (actorId <= 0) {
        return;
      }

      const dataActors = typeof $dataActors !== "undefined" ? $dataActors : [];
      const actor = dataActors[actorId];
      $gameParty.addActor(actorId);
      Alert.success(
        t("party.added", {
          name: actor?.name ? String(actor.name) : `#${actorId}`,
        }),
      );
      this.initializeVariables();
    },
  },
};
