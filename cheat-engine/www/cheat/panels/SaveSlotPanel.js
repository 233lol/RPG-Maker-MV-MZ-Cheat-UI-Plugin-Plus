// @ts-check
import RefreshButton from "../components/RefreshButton.js";
import { SceneCheat } from "../js/CheatHelper.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { isGameReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { SaveBackupCheat } from "../js/SaveBackupHelper.js";
import { subscribeLocaleChange, t } from "../js/strings.js";

// 部分静态方法由 applyStaticMethods 动态挂载，TS 看不到，面板侧统一走 any 别名。
/** @type {any} */
const BackupCheat = SaveBackupCheat;

// 存档槽总览：按槽位展示地图 / 时长 / 存档时间 / 大小，并提供读取与覆盖保存。
// 快照 / 回滚仍由「存档时间机器」面板负责。
export default {
  name: "SaveSlotPanel",

  mixins: [gameDataWatcherMixin],

  components: { RefreshButton },

  template: `
<v-card flat class="ma-0 pa-0">
    <div class="d-flex align-center mb-2">
        <v-icon class="mr-2">mdi-content-save-all</v-icon>
        <span class="text-title-medium">{{ t("saveSlots.title") }}</span>
        <v-spacer></v-spacer>
        <refresh-button @click="initializeVariables"></refresh-button>
    </div>

    <v-alert
        v-if="!ready"
        type="info"
        variant="tonal"
        density="compact">
        {{ t("saveSlots.notReady") }}
    </v-alert>

    <v-alert
        v-else-if="!available"
        type="info"
        variant="tonal"
        density="compact">
        {{ t("saveSlots.unavailable") }}
    </v-alert>

    <v-data-table
        v-else
        :headers="tableHeaders"
        :items="slots"
        item-value="slot"
        density="compact"
        hide-default-footer>
        <template #item.slot="{ item }">
            <div class="d-flex align-center">
                <span class="text-body-small">#{{ item.slot }}</span>
                <v-chip
                    v-if="item.isCurrent"
                    size="x-small"
                    color="green"
                    class="ml-1">
                    {{ t("saveSlots.current") }}
                </v-chip>
            </div>
        </template>
        <template #item.map="{ item }">
            <span class="text-body-small">{{ item.mapText }}</span>
        </template>
        <template #item.playtime="{ item }">
            <span class="text-body-small">{{ item.playtimeText }}</span>
        </template>
        <template #item.savedAt="{ item }">
            <span class="text-body-small">{{ item.savedAtText }}</span>
        </template>
        <template #item.size="{ item }">
            <span class="text-body-small">{{ item.sizeText }}</span>
        </template>
        <template #item.actions="{ item }">
            <v-btn
                size="x-small"
                variant="text"
                color="green"
                :disabled="!item.exists"
                @click="loadSlot(item)">
                {{ t("saveSlots.load") }}
            </v-btn>
            <v-btn
                size="x-small"
                variant="text"
                color="orange"
                @click="saveSlot(item)">
                {{ t("saveSlots.save") }}
            </v-btn>
        </template>
    </v-data-table>
</v-card>
    `,

  data() {
    return {
      ready: false,
      available: false,
      currentSlot: -1,
      slots: [],
    };
  },

  created() {
    this.initializeVariables();
    // 槽位里的「空槽位 / 无记录 / 无时长记录」是缓存字符串，切语言后重建一次。
    this.__unsubscribeLocale = subscribeLocaleChange(() => {
      this.initializeVariables();
    });
  },

  beforeUnmount() {
    if (this.__unsubscribeLocale) {
      this.__unsubscribeLocale();
      this.__unsubscribeLocale = null;
    }
  },

  computed: {
    tableHeaders() {
      return [
        { title: t("saveSlots.slotHeader"), key: "slot", width: 92 },
        { title: t("saveSlots.mapHeader"), key: "map" },
        { title: t("saveSlots.playtimeHeader"), key: "playtime" },
        { title: t("saveSlots.savedAtHeader"), key: "savedAt" },
        { title: t("saveSlots.sizeHeader"), key: "size", width: 82 },
        {
          title: t("saveSlots.actionsHeader"),
          key: "actions",
          sortable: false,
          align: "center",
          width: 132,
        },
      ];
    },
  },

  methods: {
    t,

    initializeVariables() {
      this.ready = isGameReady();
      this.available = !!BackupCheat.isLocalMode();
      this.currentSlot = -1;
      this.slots = [];

      if (!this.ready || !this.available) {
        return;
      }

      const maxSlots = Math.max(
        0,
        Math.min(999, Math.floor(Number(BackupCheat.maxSavefiles()) || 0)),
      );
      this.currentSlot = Number(BackupCheat.getLoadedSlot()) || -1;

      const rows = [];

      for (let slot = 1; slot <= maxSlots; slot++) {
        let exists = false;
        let meta = null;

        try {
          exists = !!BackupCheat.hasSave(slot);
        } catch (error) {
          console.warn("[cheat plugin] 检查存档槽失败", error);
        }

        if (exists) {
          try {
            meta = BackupCheat.parseSaveMeta(slot) || null;
          } catch (error) {
            console.warn("[cheat plugin] 读取存档槽元数据失败", error);
          }
        }

        rows.push({
          slot,
          exists,
          isCurrent: slot === this.currentSlot,
          mapText: this.formatMapText(meta, exists),
          playtimeText:
            exists && meta && meta.playtime
              ? meta.playtime
              : exists
                ? t("saveBackup.noPlaytime")
                : "-",
          savedAtText:
            exists && meta && meta.savefileTimeText
              ? meta.savefileTimeText
              : exists
                ? t("saveSlots.noRecord")
                : "-",
          sizeText:
            exists && meta && meta.dataSize
              ? BackupCheat.formatBytes(meta.dataSize)
              : "-",
        });
      }

      this.slots = rows;
    },

    formatMapText(meta, exists) {
      if (!exists) {
        return t("saveSlots.empty");
      }

      const mapId = Number(meta && meta.mapId) || 0;
      const mapName = String((meta && meta.mapName) || "");

      if (mapId <= 0) {
        return t("saveSlots.noRecord");
      }

      return mapName
        ? `${mapName} (#${mapId})`
        : t("saveBackup.mapWithId", { id: mapId });
    },

    loadSlot(item) {
      if (!item || !item.exists) {
        return;
      }

      const slot = Number(item.slot);

      ConfirmDialog.show({
        width: 460,
        message: t("saveSlots.loadConfirm", { slot }),
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: "mdi-download",
            label: t("saveSlots.load"),
            color: "green",
            action: () => {
              ConfirmDialog.close();
              this.performLoad(slot);
            },
          },
        ],
      });
    },

    saveSlot(item) {
      if (!item) {
        return;
      }

      const slot = Number(item.slot);
      const exists = !!item.exists;

      ConfirmDialog.show({
        width: 460,
        message: exists
          ? t("saveSlots.overwriteConfirm", { slot })
          : t("saveSlots.saveConfirm", { slot }),
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: exists ? "mdi-content-save" : "mdi-content-save-plus",
            label: t("saveSlots.save"),
            color: exists ? "orange" : "green",
            action: () => {
              ConfirmDialog.close();
              this.performSave(slot);
            },
          },
        ],
      });
    },

    async performLoad(slot) {
      try {
        await SceneCheat.quickLoad(slot);
      } finally {
        this.initializeVariables();
      }
    },

    async performSave(slot) {
      try {
        await SceneCheat.quickSave(slot);
      } finally {
        this.initializeVariables();
      }
    },
  },
};
