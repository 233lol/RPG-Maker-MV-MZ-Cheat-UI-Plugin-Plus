import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { Alert } from "../js/AlertHelper.js";
import { ConfirmDialog } from "../js/DialogHelper.js";
import { SaveBackupCheat } from "../js/SaveBackupHelper.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { filterByKeyword } from "../js/SearchFilter.js";
import { tablePanelMixin } from "../js/TablePanelMixin.js";
import { markRaw } from "../libs/vue.js";
import { t } from "../js/strings.js";

// 存档时间机器面板：手动/自动快照、一键回滚、导入导出。
// 核心逻辑全在 js/SaveBackupHelper.js，这里只负责展示与二次确认。
export default {
  name: "SaveBackupPanel",

  mixins: [tablePanelMixin, gameDataWatcherMixin],

  components: { PaginationFooter, RefreshButton, SearchField },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-sheet border rounded class="px-2 py-1 mb-1">
        <!-- 第 1 行：当前存档 + 计数 + 刷新 -->
        <div class="d-flex align-center">
            <div class="flex-grow-1 cheat-save-backup-status text-body-small">
                <div>
                    <span class="text-grey-lighten-1">{{ t("saveBackup.current") }}</span>
                    <b class="text-green-darken-1">{{ currentSummary }}</b>
                </div>
                <div class="text-grey-lighten-1">{{ currentSaveLine }}</div>
            </div>
            <refresh-button
                size="x-small"
                icon-size="small"
                variant="text"
                :tooltip="t('saveBackup.reloadTooltip')"
                @click="reload">
            </refresh-button>
        </div>

        <!-- 第 2 行：开关 + 两个数字参数。
             三个细节是踩过坑之后定下来的：
               1. 不用 Vuetify 的 prefix / suffix —— 它们是分开渲染的 span，
                  在弹性布局里会被拉长成「每 ……1 ……次存档留 1 份」；
               2. 不用 v-model + type=number，改成 :value 绑定字符串 + @change 回写，
                  这样「值是数字还是字符串」不会影响输入框的显示；
               3. 宽度不能写死 —— 框里只有 14px 放字时「56」会被切成「5」，
                  所以宽度交给 numFieldStyle() 按位数精算（1 位 36px，每多 1 位 +9.5px）。 -->
        <div class="d-flex align-center flex-wrap ga-2 mt-1">
            <v-checkbox
                v-model="settings.autoOnSave"
                density="compact"
                hide-details
                class="flex-grow-0"
                :disabled="!available"
                @change="onSettingsChange">
                <template #label>
                    <span class="text-body-small">{{ t("saveBackup.autoOnSave") }}</span>
                </template>
            </v-checkbox>
            <div class="d-flex align-center ga-1">
                <span class="text-body-small text-grey-lighten-1">{{ t("saveBackup.every") }}</span>
                <v-text-field
                    v-model="intervalText"
                    variant="outlined"
                    density="compact"
                    hide-details
                    type="number"
                    class="cheat-save-backup-num"
                    :style="numFieldStyle(intervalText)"
                    :min="1"
                    :max="100"
                    :disabled="!available || !settings.autoOnSave"
                    @update:model-value="onIntervalInput"
                    @blur="commitIntervalText"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
                <span class="text-body-small text-grey-lighten-1">{{ t("saveBackup.saveTimesKeep") }}</span>
            </div>
            <div class="d-flex align-center ga-1">
                <span class="text-body-small text-grey-lighten-1">{{ t("saveBackup.keepPerSlot") }}</span>
                <v-text-field
                    v-model="keepText"
                    variant="outlined"
                    density="compact"
                    hide-details
                    type="number"
                    class="cheat-save-backup-num"
                    :style="numFieldStyle(keepText)"
                    :min="1"
                    :max="100"
                    :disabled="!available"
                    @update:model-value="onKeepInput"
                    @blur="commitKeepText"
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>
                <span class="text-body-small text-grey-lighten-1">{{ t("saveBackup.unit") }}</span>
            </div>
        </div>

        <!-- 第 3 行：把当前生效的设置用纯文字复述一遍。
             输入框万一渲染异常（字体 / 主题问题），这里也一定看得见值。 -->
        <div class="d-flex align-center flex-wrap ga-1 mt-1">
            <span class="text-body-small text-grey-lighten-1 mr-2">{{ autoSettingHint }}</span>
            <v-spacer></v-spacer>
            <v-btn
                size="small"
                variant="text"
                color="indigo-lighten-2"
                :disabled="!available || stats.count === 0"
                @click="exportBackups">
                <v-icon start size="small">mdi-export</v-icon>
                {{ t("saveBackup.exportAll") }}
            </v-btn>
            <v-btn
                size="small"
                variant="text"
                color="indigo-lighten-1"
                :disabled="!available || selectedBackupIds.length === 0"
                @click="exportSelectedBackups">
                <v-icon start size="small">mdi-export-variant</v-icon>
                {{ t("saveBackup.exportSelected", { count: selectedBackupIds.length }) }}
            </v-btn>
            <v-btn
                size="small"
                variant="text"
                color="deep-purple-lighten-2"
                :disabled="!available"
                @click="importBackups">
                <v-icon start size="small">mdi-import</v-icon>
                {{ t("saveBackup.import") }}
            </v-btn>
            <v-btn
                size="small"
                variant="text"
                color="error"
                :disabled="!available || stats.count === 0"
                @click="clearAllBackups">
                <v-icon start size="small">mdi-delete-sweep</v-icon>
                {{ t("saveBackup.clearAll") }}
            </v-btn>
        </div>
    </v-sheet>

    <v-alert
        v-if="!available"
        type="warning"
        density="compact"
        variant="tonal"
        class="mb-1">
        {{ t("saveBackup.unavailable") }}
    </v-alert>

    <input
        ref="importInput"
        type="file"
        accept=".json,application/json"
        style="display: none;"
        @change="onImportFileChange">

    <v-data-table
        class="cheat-save-backup-table"
        density="compact"
        show-select
        select-strategy="filtered"
        v-model="selectedBackupIds"
        :headers="tableHeaders"
        :items="filteredTableItems"
        v-model:page="pagination.page"
        v-model:items-per-page="pagination.itemsPerPage"
        :items-per-page-options="itemsPerPageOptions"
        :no-data-text="t('saveBackup.noData')">
        <template #top>
            <div class="d-flex align-center flex-wrap ga-2 pb-1">
                <search-field
                    v-model="search"
                    :label="t('saveBackup.searchPlaceholder')"
                    clearable
                    field-style="min-width: 150px;">
                </search-field>
                <v-select
                    :label="t('saveBackup.slot')"
                    variant="solo"
                    bg-color="grey-darken-3"
                    v-model="slotFilter"
                    :items="slotOptions"
                    density="compact"
                    hide-details
                    style="max-width: 120px;">
                </v-select>
            </div>
        </template>

        <template #item.slot="{ item }">
            <div class="d-flex align-center">
                <v-chip
                    size="x-small"
                    :color="item.slot === loadedSlot ? 'teal' : 'blue-grey-darken-2'"
                    variant="flat"
                    class="flex-shrink-0">
                    #{{ item.slot }}
                </v-chip>
                <v-icon
                    v-if="item.slot === loadedSlot"
                    size="x-small"
                    color="teal-lighten-1"
                    class="ml-1 flex-shrink-0">mdi-download</v-icon>
            </div>
            <div class="text-body-small text-grey-lighten-1">{{ saveCountText(item) }}</div>
        </template>

        <template #item.progress="{ item }">
            <div class="cheat-save-backup-ellipsis">{{ progressPrimary(item) }}</div>
            <div class="text-body-small text-grey-lighten-1 cheat-save-backup-ellipsis">{{ progressSecondary(item) }}</div>
            <div class="text-body-small text-grey cheat-save-backup-ellipsis">{{ progressTertiary(item) }}</div>
        </template>

        <template #item.createdText="{ item }">
            <div class="text-body-small cheat-save-backup-ellipsis">{{ item.createdText.slice(5) }}</div>
            <div class="text-body-small text-grey-lighten-1 cheat-save-backup-ellipsis">{{ item.relativeText }}</div>
            <div v-if="item.restoredAt" class="text-body-small text-amber-lighten-2 cheat-save-backup-ellipsis">
                {{ t("saveBackup.restoredTimes", { count: item.restoreCount }) }}
            </div>
        </template>

        <template #item.actions="{ item }">
            <v-menu location="bottom end" :attach="'#app'">
                <template #activator="{ props }">
                    <v-btn
                        v-bind="props"
                        icon
                        size="x-small"
                        variant="text"
                        color="grey-lighten-2">
                        <v-icon size="small">mdi-dots-vertical</v-icon>
                    </v-btn>
                </template>
                <v-list density="compact" min-width="230">
                    <v-list-item
                        :disabled="!available || !item.exists"
                        @click="restoreBackupSameSlot(item)">
                        <template #prepend>
                            <v-icon size="small" color="green">mdi-restore</v-icon>
                        </template>
                        <v-list-item-title>{{ t("saveBackup.restoreSameSlot", { slot: item.slot }) }}</v-list-item-title>
                        <v-list-item-subtitle>{{ t("saveBackup.restoreSameHint") }}</v-list-item-subtitle>
                    </v-list-item>
                    <v-list-item
                        :disabled="!available || !item.exists"
                        @click="restoreBackupOtherSlot(item)">
                        <template #prepend>
                            <v-icon size="small" color="teal">mdi-content-copy</v-icon>
                        </template>
                        <v-list-item-title>{{ t("saveBackup.restoreOtherSlot") }}</v-list-item-title>
                        <v-list-item-subtitle>{{ t("saveBackup.restoreOtherHint") }}</v-list-item-subtitle>
                    </v-list-item>
                    <v-list-item
                        :disabled="!available"
                        @click="deleteBackup(item)">
                        <template #prepend>
                            <v-icon size="small" color="red">mdi-delete</v-icon>
                        </template>
                        <v-list-item-title>{{ t("saveBackup.deleteSnapshot") }}</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
        </template>

        <template #bottom>
            <pagination-footer
                :page="pagination.page"
                :items-per-page="pagination.itemsPerPage"
                :total="totalCount"
                :page-count="pageCount"
                :show-page-size="false"
                :total-visible="4"
                wrapper-class="flex-wrap ga-1 pa-1"
                @update:page="pagination.page = $event"
                @jump="jumpToPage">
            </pagination-footer>
        </template>
    </v-data-table>

    <v-card-text class="pt-1 pb-0 text-body-small text-grey-lighten-1">
        {{ t("saveBackup.footerPrefix") }}<b>{{ t("saveBackup.footerAfterSave") }}</b>{{ t("saveBackup.footerMiddle") }}<b>{{ t("saveBackup.footerBeforeRestore") }}</b>{{ t("saveBackup.footerSuffix", { count: settings.autoKeep }) }}
    </v-card-text>
</v-card>
    `,

  data() {
    return {
      available: false,

      // 自动快照设置（存在 save-backups/config.json）。
      // 这里只是首帧占位，真实值由 reload() 立刻从磁盘读入
      settings: {
        autoOnSave: false,
        autoSaveInterval: 1,
        autoKeep: 5,
      },

      // 两个数字框的「编辑中文本」。
      // 为什么要单独一份：输入框直接绑 settings.* 的话，输入过程中一旦
      // 解析/落盘回写 settings，Vuetify 就会拿旧值把输入框覆盖回去（表现为「打不进去」）。
      // 这里让输入框只认自己的文本，解析结果另行走 settings，互不打架。
      intervalText: "1",
      keepText: "5",

      loadedSlot: -1,
      currentSavefileInfo: null,
      // 表格里每行都可能要问一次该槽位的存档头，按槽位缓存避免重复读盘。
      // markRaw：纯缓存，不需要响应式（reload 时会整体重建）
      savefileInfoCache: markRaw(new Map()),
      currentMapName: "",
      playtimeText: "",

      backups: [],
      selectedBackupIds: [],
      stats: {
        count: 0,
        missingCount: 0,
        sizeText: "-",
      },

      slotFilter: "all",
      panelStateExtraKeys: ["slotFilter"],

      // 面板只有 ~600px 宽：三列就够，表头纵向换行的坑见 css/main.css 的
      // .cheat-save-backup-table。槽位列既要放 #N 也要放存档次数，给宽一点。
      tableHeaders: [
        {
          title: t("saveBackup.slot"),
          key: "slot",
          width: "19%",
        },
        {
          title: t("saveBackup.progressHeader"),
          key: "progress",
          sortable: false,
          width: "47%",
        },
        {
          title: t("saveBackup.createdHeader"),
          key: "createdText",
          width: "34%",
        },
        {
          title: t("saveBackup.actionsHeader"),
          key: "actions",
          sortable: false,
          width: 60,
          align: "center",
        },
      ],
    };
  },

  created() {
    this.reload();
  },

  computed: {
    panelStateId() {
      return "save-backup";
    },

    // 状态压成一行：槽位 · 地图 · 快照计数 · 占用。
    // 逐条换行会把表格挤到屏幕外，得不偿失。
    currentSummary() {
      const slot =
        this.loadedSlot > 0
          ? t("saveBackup.statusSaveSlot", { slot: this.loadedSlot })
          : t("saveBackup.statusNoSlot");

      const parts = [slot];

      if (this.currentMapName) {
        parts.push(this.currentMapName);
      }

      parts.push(t("saveBackup.snapshotCount", { count: this.stats.count }));

      if (this.stats.missingCount > 0) {
        parts.push(
          t("saveBackup.missingCount", { count: this.stats.missingCount }),
        );
      } else {
        parts.push(this.stats.sizeText);
      }

      return parts.join(" · ");
    },

    currentPlaytimeText() {
      const info = this.currentSavefileInfo;
      return (info && info.playtimeText) || this.playtimeText || "";
    },

    // 时长与存档时间来自引擎存档头（DataManager.loadSavefileInfo），
    // 拿不到就明确说「未记录」，而不是留一个空行让人怀疑坏了
    currentSaveLine() {
      const info = this.currentSavefileInfo;
      const playtime = this.currentPlaytimeText;
      const savedAt = info ? info.timestampText : "";

      const playtimeText = t("saveBackup.playtime", {
        playtime: playtime || t("common.notRecorded"),
      });

      return savedAt
        ? `${playtimeText} · ${t("saveBackup.savedAt", { time: savedAt })}`
        : playtimeText;
    },

    // 开关说明放在 tooltip 里，不再单独占一行高度
    autoSettingHint() {
      if (!this.settings.autoOnSave) {
        return t("saveBackup.autoOff");
      }

      // 用编辑框里的文本即可：它跟着输入实时更新，不需要另一个格式化函数
      const interval = this.intervalText || "?";

      // 保留份数已经在输入框里写着，这里只说触发时机，避免同一句话看两遍
      if (Number(interval) > 1) {
        return t("saveBackup.autoOnInterval", { interval });
      }

      return t("saveBackup.autoOnEvery");
    },

    slotOptions() {
      const slots = new Set(
        this.backups.map((item) => Number(item.slot)).filter((s) => s >= 1),
      );

      return [
        { title: t("saveBackup.slotAll"), value: "all" },
        ...[...slots]
          .sort((a, b) => a - b)
          .map((slot) => ({
            title: t("saveBackup.slotN", { slot }),
            value: slot,
          })),
      ];
    },

    filteredTableItems() {
      const items =
        this.slotFilter === "all"
          ? this.backups
          : this.backups.filter(
              (item) => Number(item.slot) === Number(this.slotFilter),
            );

      // 备注已不是主标识，但历史快照 / 导入的快照里可能还有，一并参与搜索
      return filterByKeyword(items, this.search, (item) => [
        item.label,
        item.mapName,
        item.createdText,
        item.savefileTimeText,
        item.slot,
      ]);
    },
  },

  methods: {
    t,

    reload() {
      this.available = SaveBackupCheat.isLocalMode();
      this.settings = SaveBackupCheat.getSettings();
      // 编辑框文本必须跟着磁盘值走，否则打开面板时显示的是上一次的残留
      this.intervalText = String(this.settings.autoSaveInterval);
      this.keepText = String(this.settings.autoKeep);
      this.loadedSlot = SaveBackupCheat.getLoadedSlot();
      this.playtimeText = SaveBackupCheat.getPlaytimeText();
      this.currentMapName = this.getCurrentMapName();
      // 缓存必须清掉：否则刷新后仍然显示上一次读到的存档头
      this.savefileInfoCache = markRaw(new Map());
      // 没有明确「当前槽位」时，退回显示 1 号槽的信息（至少能看到有档可备份）
      this.currentSavefileInfo = SaveBackupCheat.readSavefileInfo(
        this.loadedSlot > 0 ? this.loadedSlot : 1,
      );
      // 旧版本建的快照没记时长 / 存档时间，这里用引擎存档头补一次。
      // 回填只是锦上添花，写盘失败（只读目录 / 磁盘满）不能让面板打不开。
      try {
        SaveBackupCheat.backfillFromSavefileInfo();
      } catch (error) {
        console.warn("[cheat plugin] 回填快照元数据失败", error);
      }

      this.backups = SaveBackupCheat.listBackups();

      // 删除 / 还原 / 清空后刷新时，把已经不存在的快照从选择里剔除，
      // 避免「导出选中」写出空文件。
      const existingIds = new Set(this.backups.map((item) => String(item.id)));
      this.selectedBackupIds = this.selectedBackupIds.filter((id) =>
        existingIds.has(String(id)),
      );

      const stats = SaveBackupCheat.getStats();
      this.stats = {
        count: stats.count,
        missingCount: stats.missingCount,
        sizeText: SaveBackupCheat.formatBytes(stats.bytes),
      };
    },

    // 输入框的「编辑中文本」直接由 v-model 维护，不参与解析。
    // 空串时只同步 settings（这样下面那行提示会跟着变），但不立刻回写 1 ——
    // 否则用户删掉数字的一瞬间就被填回 "1"，等于删不掉。
    onIntervalInput(value) {
      this.intervalText =
        value === null || value === undefined ? "" : String(value);
      this.settings.autoSaveInterval = this.parseCount(this.intervalText, 1);
      this.onSettingsChange();
    },

    onKeepInput(value) {
      this.keepText =
        value === null || value === undefined ? "" : String(value);
      this.settings.autoKeep = this.parseCount(this.keepText, 1);
      this.onSettingsChange();
    },

    // 数字框的宽度：按当前文本的位数精算，既不切字也不留空白。
    // 两个方向都踩过：
    //   1. 写死 46px —— outlined 变体的 .v-field__input 左右内边距各 16px
    //      （compact 密度只收窄上下），46px 里只剩 14px 放字，「56」被切成「5」；
    //   2. 改成「底宽 44px + 每多 1 位加 12px」—— 第 1 位是靠底宽撑的，3 位数右边
    //      就多出 20 多像素空白。
    // 现在按真实字宽算：Vuetify 给 .v-field 写死了 font-size:16px，Roboto 数字
    // 每位约 8.9px，所以宽度 = 左右内边距 16 + 边框 2 + 每位 9.5 + 光标余量 4，向上取整，
    // 并给 1 位数一个 36px 下限（框高 40px，再窄就成竖条了）。
    // 1 位 36px / 2 位 41px / 3 位 51px，右边只留一个光标的位置。
    // 返回 width 与 max-width 两个值：只给一个会被类里的宽度/上限卡回去。
    numFieldStyle(text) {
      const digits = Math.max(
        String(text === null || text === undefined ? "" : text).length,
        1,
      );
      const width = Math.max(36, Math.ceil(22 + digits * 9.5));

      return { width: `${width}px`, maxWidth: `${width}px` };
    },

    // 只取前导数字（type=number 在部分输入法下会短暂给出 "3e" 之类的中间态）
    parseCount(value, min) {
      const match = String(
        value === null || value === undefined ? "" : value,
      ).match(/\d+/);
      const num = match ? parseInt(match[0], 10) : NaN;

      if (!Number.isFinite(num)) {
        return min;
      }

      return Math.min(Math.max(num, min), 100);
    },

    // 失焦时把编辑框收敛成合法值：空 / 非法 → 退回下限，并同步回写磁盘
    commitIntervalText() {
      const num = this.parseCount(this.intervalText, 1);
      this.intervalText = String(num);

      if (this.settings.autoSaveInterval !== num) {
        this.settings.autoSaveInterval = num;
        this.onSettingsChange();
      }
    },

    commitKeepText() {
      const num = this.parseCount(this.keepText, 1);
      this.keepText = String(num);

      if (this.settings.autoKeep !== num) {
        this.settings.autoKeep = num;
        this.onSettingsChange();
      }
    },

    onSettingsChange() {
      try {
        this.settings = SaveBackupCheat.writeSettings({
          autoOnSave: this.settings.autoOnSave === true,
          autoSaveInterval: this.settings.autoSaveInterval,
          autoKeep: this.settings.autoKeep,
        });
      } catch (error) {
        Alert.error(
          t("saveBackup.settingsSaveFailed", { message: error.message }),
          error,
        );
        this.settings = SaveBackupCheat.getSettings();
      }
    },

    getCurrentMapName() {
      try {
        const mapId = $gameMap ? $gameMap.mapId() : 0;
        const info =
          typeof $dataMapInfos !== "undefined" && $dataMapInfos
            ? $dataMapInfos[mapId]
            : null;
        const name = info ? info.name : "";
        return name ? `${name} (${mapId})` : `#${mapId}`;
      } catch (error) {
        return "";
      }
    },

    // 表格「存档内进度」三行：地图 / 时长 · 大小 / 存档时间。
    // 一列里两行放不下「存档于 10-01 19:51:31」这种长文案，索性拆成独立行，
    // 每行都短到不会被省略号截断（列只有 ~140px）。
    // 时长优先用快照自己的元数据；老快照没有时退回该槽位当前的存档头 ——
    // 快照不带时长时，存档头就是最好的近似（比显示「未记录」有用），
    // 但只是显示，不写回元数据（免得把近似值固化成「事实」）。
    // getSavefileInfo 内部按槽位缓存，表格行数少，代价可忽略。
    progressPrimary(item) {
      const name = item.mapName || "";

      if (name) {
        // 很多游戏的地图名自带编号（如「01 海岸」），再补一次 (2) 就是重复信息
        const hasOwnNumber = /^\s*\d/.test(name);
        const suffix = !hasOwnNumber && item.mapId ? ` (${item.mapId})` : "";

        return `${name}${suffix}`;
      }

      if (item.mapId) {
        return t("saveBackup.mapWithId", { id: item.mapId });
      }

      return this.getLivePlaytimeText(item) || t("saveBackup.noRecord");
    },

    progressSecondary(item) {
      const parts = [];

      if (item.mapName || item.mapId) {
        parts.push(
          this.getLivePlaytimeText(item) || t("saveBackup.noPlaytime"),
        );
      }

      parts.push(item.exists ? item.sizeText : t("saveBackup.dataMissing"));

      return parts.join(" · ");
    },

    // 存档头记的存档时间：单独一行，并省掉「存档于」和秒
    // —— 列只有 ~190px，带秒的完整时间 + 定语必定被省略号截断
    progressTertiary(item) {
      if (!item.savefileTimeText) {
        return "";
      }

      return t("saveBackup.savefileTime", {
        time: item.savefileTimeText.slice(0, 11),
      });
    },

    // 该快照的时长文案：先自己的元数据，再该槽位当前的存档头
    getLivePlaytimeText(item) {
      if (item.playtimeText) {
        return item.playtimeText;
      }

      const info = this.getSavefileInfo(item.slot);
      return info ? info.playtimeText : "";
    },

    getSavefileInfo(slot) {
      const key = Number(slot);

      if (!Number.isInteger(key) || key < 1) {
        return null;
      }

      if (!this.savefileInfoCache.has(key)) {
        this.savefileInfoCache.set(key, SaveBackupCheat.readSavefileInfo(key));
      }

      return this.savefileInfoCache.get(key);
    },

    saveCountText(item) {
      const count = Number(item.saveCount);

      if (!Number.isFinite(count) || count <= 0) {
        return "";
      }

      return t("saveBackup.saveCount", { count });
    },

    // 还原的两种目标槽位都走同一个确认框，把「会覆盖什么」讲清楚：
    //   - 原槽位：写回快照自己的槽位（内存里正在玩的那份会被覆盖）
    //   - 其他槽位：把快照复制成另一个存档，原槽位不动
    restoreBackupSameSlot(item) {
      this.confirmRestore(item, Number(item.slot));
    },

    restoreBackupOtherSlot(item) {
      const suggested = this.getSuggestedTargetSlot(item.slot);
      const input = window.prompt(
        t("saveBackup.restoreTargetPrompt", { slot: item.slot }),
        String(suggested),
      );

      if (input === null) {
        return;
      }

      const target = Math.floor(Number(input));

      if (!Number.isInteger(target) || target < 1) {
        Alert.warn(t("saveBackup.targetInvalid"));
        return;
      }

      const max = SaveBackupCheat.maxSavefiles();
      if (max > 0 && target > max) {
        Alert.warn(t("saveBackup.targetTooLarge", { max }));
        return;
      }

      if (target === Number(item.slot)) {
        // 等同于原槽位还原，交给同一条确认流程，免得两套提示不一致
        this.confirmRestore(item, target);
        return;
      }

      this.confirmRestore(item, target);
    },

    // 推荐的默认目标槽位：优先空槽位，都满了就顺延到下一个槽位
    getSuggestedTargetSlot(sourceSlot) {
      const source = Number(sourceSlot);
      const max = SaveBackupCheat.maxSavefiles();
      const limit = max > 0 ? max : source + 1;

      for (let slot = 1; slot <= limit; slot++) {
        if (slot !== source && !SaveBackupCheat.hasSave(slot)) {
          return slot;
        }
      }

      // 所有槽位都占满时也要给一个有效默认值：source 是最大槽位时
      // 旧逻辑返回 source + 1，用户直接回车就会在还原时抛「超出上限」。
      if (limit > 1) {
        return source < limit ? source + 1 : 1;
      }

      return source;
    },

    confirmRestore(item, targetSlot) {
      const sourceSlot = Number(item.slot);
      const isSameSlot = targetSlot === sourceSlot;
      const hasTarget = SaveBackupCheat.hasSave(targetSlot);
      const progress = `${this.progressPrimary(item)} · ${this.progressSecondary(item)}`;

      let consequence;
      if (isSameSlot && hasTarget) {
        consequence = t("saveBackup.consequenceSameWithTarget", {
          slot: targetSlot,
        });
      } else if (isSameSlot) {
        consequence = t("saveBackup.consequenceSameEmpty", {
          slot: targetSlot,
        });
      } else if (hasTarget) {
        consequence = t("saveBackup.consequenceOtherWithTarget", {
          slot: targetSlot,
          source: sourceSlot,
        });
      } else {
        consequence = t("saveBackup.consequenceOtherEmpty", {
          slot: targetSlot,
          source: sourceSlot,
        });
      }

      // 覆盖「内存里正在玩的那份」时必须提醒先存档，否则看起来像没生效
      const warnLoaded =
        this.loadedSlot === targetSlot
          ? t("saveBackup.warnLoaded", { slot: targetSlot })
          : "";

      ConfirmDialog.show({
        width: 520,
        message: t("saveBackup.restoreConfirm", {
          slot: targetSlot,
          source: sourceSlot,
          time: item.createdText,
          relative: item.relativeText,
          progress,
          consequence,
          warnLoaded,
        }),
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: isSameSlot ? "mdi-restore" : "mdi-content-copy",
            label: t("saveBackup.restoreAction", { slot: targetSlot }),
            color: "green",
            action: () => {
              ConfirmDialog.close();
              this.doRestore(item, targetSlot);
            },
          },
        ],
      });
    },

    doRestore(item, targetSlot) {
      try {
        SaveBackupCheat.restoreBackup(item.id, targetSlot);
        this.reload();
      } catch (error) {
        Alert.error(
          t("saveBackup.restoreFailed", { message: error.message }),
          error,
        );
      }
    },

    deleteBackup(item) {
      ConfirmDialog.show({
        width: 420,
        message: t("saveBackup.deleteConfirm", {
          time: item.createdText,
          slot: item.slot,
        }),
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: "mdi-delete",
            label: t("common.delete"),
            color: "red",
            action: () => {
              ConfirmDialog.close();

              try {
                SaveBackupCheat.deleteBackup(item.id);
                this.reload();
              } catch (error) {
                Alert.error(
                  t("saveBackup.deleteFailed", { message: error.message }),
                  error,
                );
              }
            },
          },
        ],
      });
    },

    clearAllBackups() {
      this.confirmClearBackups(null, t("saveBackup.clearConfirm"));
    },

    confirmClearBackups(kind, message) {
      ConfirmDialog.show({
        width: 460,
        message: message,
        actions: [
          {
            icon: "mdi-close",
            label: t("common.cancel"),
            color: "white",
            action: ConfirmDialog.close,
          },
          {
            icon: "mdi-delete-sweep",
            label: t("saveBackup.clearAction"),
            color: "red",
            action: () => {
              ConfirmDialog.close();

              try {
                const count = SaveBackupCheat.clearBackups(kind);
                Alert.success(t("saveBackup.clearedCount", { count }));
                this.reload();
              } catch (error) {
                Alert.error(
                  t("saveBackup.clearFailed", { message: error.message }),
                  error,
                );
              }
            },
          },
        ],
      });
    },

    exportBackups() {
      if (this.backups.length === 0) {
        Alert.warn(t("saveBackup.exportEmpty"));
        return;
      }

      try {
        const file = SaveBackupCheat.exportAll();
        Alert.success(t("saveBackup.exportedTo", { file }));
      } catch (error) {
        Alert.error(
          t("saveBackup.exportFailed", { message: error.message }),
          error,
        );
      }
    },

    exportSelectedBackups() {
      if (this.selectedBackupIds.length === 0) {
        Alert.warn(t("saveBackup.exportSelectedEmpty"));
        return;
      }

      try {
        const file = SaveBackupCheat.exportSelected(this.selectedBackupIds);
        Alert.success(t("saveBackup.exportedTo", { file }));
      } catch (error) {
        Alert.error(
          t("saveBackup.exportFailed", { message: error.message }),
          error,
        );
      }
    },

    importBackups() {
      const input = this.$refs.importInput;
      if (!input) {
        return;
      }

      // 同一个文件连续导入两次也要能触发 change
      input.value = "";
      input.click();
    },

    onImportFileChange(event) {
      const file = event.target && event.target.files && event.target.files[0];
      if (!file) {
        return;
      }

      const maxBytes = SaveBackupCheat.getMaxImportBytes();
      if (file.size > maxBytes) {
        Alert.error(
          t("saveBackup.importTooLarge", {
            size: Math.ceil(file.size / 1024 / 1024),
            max: maxBytes / 1024 / 1024,
          }),
        );
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        try {
          const result = SaveBackupCheat.importFromJson(String(reader.result));
          Alert.success(
            t("saveBackup.importDone", {
              added: result.added,
              skipped: result.skipped,
            }),
          );
          this.reload();
        } catch (error) {
          Alert.error(
            t("saveBackup.importFailed", { message: error.message }),
            error,
          );
        }
      };

      reader.onerror = () => {
        Alert.error(t("saveBackup.fileReadFailed"));
      };

      reader.readAsText(file);
    },
  },
};
