// @ts-check
import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { KEY_VALUE_STORAGE } from "../js/KeyValueStorage.js";
import { isGameReady, requireGameReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { filterByKeyword } from "../js/SearchFilter.js";
import { tablePanelMixin } from "../js/TablePanelMixin.js";
import { t } from "../js/strings.js";

export default {
  name: "SaveRecallPanel",

  mixins: [tablePanelMixin, gameDataWatcherMixin],

  components: { PaginationFooter, RefreshButton, SearchField },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-card-subtitle class="ma-0 pa-0">{{ t("saveRecall.saveCurrent") }}</v-card-subtitle>
    <span class="text-body-medium text-green-darken-1">{{ t("saveRecall.mapLabel") }} : {{ currentMapName }}</span>
    <v-text-field
        ref="locationAliasField"
        :label="t('saveRecall.alias')"
        variant="solo"
        bg-color="grey-darken-3"
        v-model="locationAliasInput"
        density="compact"
        hide-details
        @keydown="onLocationAliasKeyDown"
        @focus="$event.target.select()"
        @keydown.stop>
        <template #append>
            <v-tooltip
                location="bottom">
                <template #activator="{ props }">
                    <v-btn
                        class="mt-n1"
                        color="teal"
                        size="x-small"
                        icon
                        v-bind="props"
                        @click="onAddLocation">
                        <v-icon>mdi-plus</v-icon>
                    </v-btn>
                </template>
                <span>{{ t("saveRecall.saveCurrent") }}</span>
            </v-tooltip>
        </template>
    </v-text-field>

    <v-card-subtitle class="ma-0 pa-0 mt-5">{{ t("saveRecall.searchSaved") }}</v-card-subtitle>
    <v-data-table
        v-if="tableHeaders"
        class="mt-2"
        density="compact"
        :headers="tableHeaders"
        :items="filteredTableItems"
         v-model:page="pagination.page"
         v-model:items-per-page="pagination.itemsPerPage"
         :items-per-page-options="itemsPerPageOptions">
        <template #top>
            <div class="d-flex align-center">
                <search-field v-model="search"></search-field>
                <refresh-button
                    btn-class="ml-2"
                    @click="initializeVariables">
                </refresh-button>
            </div>
        </template>
        <template
            #item.coord="{ item }">
            {{ item.coord.x }}, {{ item.coord.y }}
        </template>
        <template
            #item.actions="{ item }">
             
            <v-tooltip
                location="bottom">
                <template #activator="{ props }">
                    <v-btn
                        color="green"
                        size="x-small"
                        icon
                        v-bind="props"
                        @click="teleportLocation(item.mapId, item.coord.x, item.coord.y)">
                        <v-icon size="small">mdi-map-marker</v-icon>
                    </v-btn>
                </template>
                <span>{{ t("saveRecall.teleport") }}</span>
            </v-tooltip>
            
            
            <v-tooltip
                location="bottom">
                <template #activator="{ props }">
                    <v-btn
                        color="red"
                        class="ml-2"
                        size="x-small"
                        icon
                        v-bind="props"
                        @click="removeLocation(item.locationIndex)">
                        <v-icon size="small">mdi-delete</v-icon>
                    </v-btn>
                </template>
                <span>{{ t("saveRecall.delete") }}</span>
            </v-tooltip>
        </template>
         <template #bottom>
             <pagination-footer
                 v-model:page="pagination.page"
                 v-model:items-per-page="pagination.itemsPerPage"
                 :total="totalCount"
                 :page-count="pageCount"
                 :items-per-page-options="[5, 10, 15, 20]"
                 @jump="jumpToPage">
             </pagination-footer>
         </template>
    </v-data-table>
</v-card>
    `,

  data() {
    return {
      locationAliasInput: "",

      locations: [],

      currentMapName: "",
    };
  },

  mounted() {
    this.initializeVariables();
    this.$refs.locationAliasField.focus();
  },

  computed: {
    panelStateId() {
      return "save-recall";
    },

    tableHeaders() {
      return [
        {
          title: t("saveRecall.aliasHeader"),
          key: "name",
        },
        {
          title: t("saveRecall.mapNameHeader"),
          key: "mapName",
        },
        {
          title: t("saveRecall.coordHeader"),
          key: "coord",
        },
        {
          title: t("saveRecall.actionsHeader"),
          key: "actions",
        },
      ];
    },

    tableItems() {
      return this.locations.map((location, idx) => {
        return {
          // 保留原始下标：删除必须按原始数组位置，
          // 而 #item.actions 里的 index 是过滤后 / 当前页的下标
          locationIndex: idx,
          name: String(location.name ?? ""),
          mapName:
            typeof $dataMapInfos !== "undefined" &&
            $dataMapInfos &&
            $dataMapInfos[location.mapId]
              ? String($dataMapInfos[location.mapId].name ?? "NULL")
              : "NULL",
          mapId: location.mapId,
          coord: {
            x: location.x,
            y: location.y,
          },
        };
      });
    },

    filteredTableItems() {
      const items = /** @type {any[]} */ (/** @type {any} */ (this).tableItems);
      return filterByKeyword(items, this.search, (item) => [
        item.name,
        item.mapName,
      ]);
    },
  },

  methods: {
    t,

    async initializeVariables() {
      this.loadLocations();

      if (!isGameReady()) {
        this.currentMapName = "";
        return;
      }

      this.currentMapName = await this.getMapFullPath($gameMap.mapId());
    },

    async getMapFullPath(id) {
      if (!id || !$dataMapInfos[id]) {
        return "NULL";
      }

      let fullPath = [];
      this.getMapAncestors(id, fullPath);

      return fullPath.map((id) => $dataMapInfos[id].name).join(" / ");
    },

    getMapAncestors(id, path) {
      // 迭代实现：父链可能指向已删除的地图（$dataMapInfos[id] 为 undefined），
      // 或在异常数据下成环，两者都会让递归版本崩溃 / 栈溢出
      const visited = new Set();
      let current = id;

      while (current && !visited.has(current) && $dataMapInfos[current]) {
        visited.add(current);
        path.push(current);
        current = $dataMapInfos[current].parentId;
      }

      path.reverse();
    },

    saveLocations() {
      KEY_VALUE_STORAGE.setItem(
        "cheat.locations",
        JSON.stringify(this.locations),
      );
    },

    loadLocations() {
      const data = KEY_VALUE_STORAGE.getItem("cheat.locations");

      if (!data) {
        this.locations = [];
        return;
      }

      try {
        const parsed = JSON.parse(data);
        // 结构校验：损坏 / 被改写的文件不应让面板崩溃
        //（否则 computed 里的 item.name.toLowerCase() 会抛 TypeError）
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (it) =>
              it &&
              typeof it === "object" &&
              typeof it.name === "string" &&
              Number.isFinite(it.mapId) &&
              Number.isFinite(it.x) &&
              Number.isFinite(it.y),
          )
        ) {
          this.locations = parsed;
        } else {
          this.backupCorruptLocations(data);
          console.warn(
            "[cheat plugin] cheat.locations has unexpected structure, ignored",
          );
          this.locations = [];
        }
      } catch (error) {
        this.backupCorruptLocations(data);
        console.warn(
          "[cheat plugin] Can't parse cheat.locations, reset to empty",
          error,
        );
        this.locations = [];
      }
    },

    // 用户随后新增一个位置就会把空数组合写回 cheat.locations，
    // 先把原始损坏内容另存一份，避免手工恢复的机会也被抹掉。
    backupCorruptLocations(raw) {
      try {
        KEY_VALUE_STORAGE.setItem(
          `cheat.locations.corrupt-${Date.now()}`,
          typeof raw === "string" ? raw : JSON.stringify(raw),
        );
      } catch (error) {
        console.warn("[cheat plugin] 备份损坏的保存位置数据失败", error);
      }
    },

    onLocationAliasKeyDown(e) {
      if (e.code === "Enter") {
        this.onAddLocation();
      }
    },

    onAddLocation() {
      this.addLocation(this.locationAliasInput);
      this.locationAliasInput = "";
      this.$refs.locationAliasField.blur();
    },

    addLocation(locationAlias) {
      if (!requireGameReady(t("saveRecall.saveFeature"))) return;

      this.locations.push({
        name: locationAlias,
        mapId: $gameMap.mapId(),
        x: $gamePlayer.x,
        y: $gamePlayer.y,
      });
      this.saveLocations();
    },

    removeLocation(index) {
      this.locations.splice(index, 1);
      this.saveLocations();
    },

    teleportLocation(mapId, x, y) {
      if (!requireGameReady(t("saveRecall.teleportFeature"))) return;

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      $gamePlayer.reserveTransfer(mapId, x, y, $gamePlayer.direction(), 0);
      $gamePlayer.setPosition(x, y);
    },
  },
};
