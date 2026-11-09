// @ts-check
import PaginationFooter from "../components/PaginationFooter.js";
import SearchField from "../components/SearchField.js";
import { Alert } from "../js/AlertHelper.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { filterByKeyword } from "../js/SearchFilter.js";
import { tablePanelMixin } from "../js/TablePanelMixin.js";
import { t } from "../js/strings.js";

export default {
  name: "TeleportPanel",

  mixins: [tablePanelMixin, gameDataWatcherMixin],

  components: { PaginationFooter, SearchField },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-row>
        <v-col cols="12">
            <v-card variant="outlined" color="primary" class="pa-2">
                <v-row density="compact">
                    <v-col cols="4" class="text-center">
                        <div class="text-body-small text-grey">{{ t("teleport.currentMap") }}</div>
                        <div class="text-body-medium font-weight-bold">{{ currentMapName }}</div>
                    </v-col>
                    <v-col cols="4" class="text-center">
                        <div class="text-body-small text-grey">X</div>
                        <div class="text-body-medium font-weight-bold">{{ currentX }}</div>
                    </v-col>
                    <v-col cols="4" class="text-center">
                        <div class="text-body-small text-grey">Y</div>
                        <div class="text-body-medium font-weight-bold">{{ currentY }}</div>
                    </v-col>
                </v-row>
            </v-card>
        </v-col>
    </v-row>
    <v-row class="mt-2">
        <v-col
            cols="4"
            md="4">
            <v-text-field
                v-model="inputX"
                label="X"
                style="max-width: 100px; margin-top: 8px;"
                density="compact"
                bg-color="grey-darken-3"
                hide-details
                variant="outlined"
                @focus="$event.target.select()"
                @keydown.stop>
            </v-text-field>
        </v-col>
        <v-col
            cols="4"
            md="4">
            <v-text-field
                v-model="inputY"
                label="Y"
                style="max-width: 100px; margin-top: 8px;"
                density="compact"
                bg-color="grey-darken-3"
                hide-details
                variant="outlined"
                @focus="$event.target.select()"
                @keydown.stop>
            </v-text-field>
        </v-col>
        <v-col
            cols="4"
            md="4"
            class="d-flex align-center">
            <v-btn
                color="orange"
                size="small"
                variant="outlined"
                @click="sameMapTeleport">
                <v-icon start>mdi-map-marker-path</v-icon>
                {{ t("teleport.currentTeleport") }}
            </v-btn>
        </v-col>
    </v-row>

    <v-data-table
        v-if="tableHeaders"
        class="mt-2"
        density="compact"
        :headers="filteredTableHeaders"
        :items="filteredMaps"
         v-model:page="pagination.page"
         v-model:items-per-page="pagination.itemsPerPage"
         :items-per-page-options="itemsPerPageOptions">
        <template #top>
            <search-field v-model="search" field-class=""></search-field>
            <v-checkbox
                v-model="excludeFullPath"
                density="compact"
                hide-details
                :label="t('teleport.hideFullPath')">
            </v-checkbox>
        </template>
        <template
            #item.fullPath="{ item }">
            {{item.fullPathJoin}}
        </template>
        <template
            #item.actions="{ item, index }">
            <v-tooltip
                location="bottom">
                <template #activator="{ props }">
                
                    <v-btn
                        color="green"
                        size="x-small"
                        icon
                        v-bind="props"
                        @click="teleportLocation(item.id, Number(inputX), Number(inputY))">
                        <v-icon size="small">mdi-map-marker</v-icon>
                    </v-btn>
                </template>
                <span>{{ t("teleport.teleport") }}</span>
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
      inputX: "0",
      inputY: "0",

      currentX: 0,
      currentY: 0,
      currentMapName: "",
      updateTimer: null,

      excludeFullPath: false,

      maps: [],

      panelStateExtraKeys: ["excludeFullPath"],
    };
  },

  created() {
    this.initializeVariables();
    this.updateCurrentPosition();
    this.startUpdateTimer();
  },

  activated() {
    this.updateCurrentPosition();
    this.startUpdateTimer();
  },

  deactivated() {
    this.stopUpdateTimer();
  },

  beforeUnmount() {
    this.stopUpdateTimer();
  },

  computed: {
    panelStateId() {
      return "teleport";
    },

    tableHeaders() {
      return [
        {
          title: "ID",
          key: "id",
        },
        {
          title: t("teleport.nameHeader"),
          key: "name",
        },
        {
          title: t("teleport.fullPathHeader"),
          key: "fullPath",
        },
        {
          title: t("teleport.actionsHeader"),
          key: "actions",
        },
      ];
    },

    filteredTableHeaders() {
      const headers = /** @type {any} */ (this.tableHeaders);

      if (this.excludeFullPath) {
        return headers.filter((header) => header.key !== "fullPath");
      }

      return headers;
    },

    filteredMaps() {
      return filterByKeyword(this.maps, this.search, (item) => [
        item.name,
        item.fullPathJoin,
        item.id,
      ]);
    },

    totalCount() {
      return this.filteredMaps.length;
    },
  },

  methods: {
    t,

    startUpdateTimer() {
      if (this.updateTimer) {
        return;
      }

      this.updateTimer = setInterval(() => {
        this.updateCurrentPosition();
      }, 1000);
    },

    stopUpdateTimer() {
      if (this.updateTimer) {
        clearInterval(this.updateTimer);
        this.updateTimer = null;
      }
    },

    async initializeVariables() {
      if (
        typeof $dataMapInfos === "undefined" ||
        !Array.isArray($dataMapInfos)
      ) {
        this.maps = [];
        return;
      }

      const mapNames = await this.getMapNames($dataMapInfos);

      this.maps = $dataMapInfos
        .filter((mapInfo) => !!mapInfo)
        .map((mapInfo) => {
          let fullPath = [];

          this.getMapAncestors(mapInfo.id, fullPath);
          fullPath = fullPath.map((id) => mapNames[id]);

          return {
            _mapInfo: mapInfo,
            id: mapInfo.id,
            fullPath: fullPath,
            fullPathJoin: fullPath.join(" / "),
            name: mapNames[mapInfo.id],
          };
        });
    },

    async getMapNames(dataMapInfos) {
      return dataMapInfos.map((m) => String(m?.name ?? ""));
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

    teleportLocation(mapId, x, y) {
      const targetMapId = Number(mapId);

      if (
        !Number.isInteger(targetMapId) ||
        targetMapId <= 0 ||
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0
      ) {
        Alert.warn(t("teleport.invalidCoord"));
        return false;
      }

      if (
        typeof $dataMapInfos === "undefined" ||
        !$dataMapInfos ||
        !$dataMapInfos[targetMapId]
      ) {
        Alert.warn(t("teleport.mapNotExist", { id: targetMapId }));
        return false;
      }

      if (typeof $gamePlayer === "undefined" || !$gamePlayer) {
        Alert.warn(t("teleport.playerNotReady"));
        return false;
      }

      // 只有当前地图能拿到宽高；其他地图的 $dataMap 不能为了取尺寸而加载，
      // 那会覆盖当前地图数据，所以只做非负整数 + 地图存在性校验。
      if (
        typeof $gameMap !== "undefined" &&
        $gameMap &&
        $gameMap.mapId() === targetMapId
      ) {
        const valid =
          typeof $gameMap.isValid === "function"
            ? $gameMap.isValid(x, y)
            : x < $gameMap.width() && y < $gameMap.height();

        if (!valid) {
          Alert.warn(t("teleport.outOfRange", { x, y }));
          return false;
        }
      }

      $gamePlayer.reserveTransfer(
        targetMapId,
        x,
        y,
        $gamePlayer.direction(),
        0,
      );
      $gamePlayer.setPosition(x, y);
      this.updateCurrentPosition();
      return true;
    },

    updateCurrentPosition() {
      if (typeof $gamePlayer !== "undefined" && $gamePlayer) {
        this.currentX = $gamePlayer.x;
        this.currentY = $gamePlayer.y;
      }
      if (typeof $gameMap !== "undefined" && $gameMap) {
        const mapId = $gameMap.mapId();
        if ($dataMapInfos && $dataMapInfos[mapId]) {
          this.currentMapName = $dataMapInfos[mapId].name;
        }
      }
    },

    sameMapTeleport() {
      const x = Number(this.inputX);
      const y = Number(this.inputY);

      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
        Alert.warn(t("teleport.invalidCoord"));
        return;
      }

      if (
        typeof $gamePlayer === "undefined" ||
        !$gamePlayer ||
        typeof $gameMap === "undefined" ||
        !$gameMap
      ) {
        Alert.warn(t("teleport.playerNotReady"));
        return;
      }

      if (x >= $gameMap.width() || y >= $gameMap.height()) {
        Alert.warn(t("teleport.outOfRange", { x, y }));
        return;
      }

      $gamePlayer.setPosition(x, y);
      $gamePlayer.center(x, y);
      $gamePlayer.makeEncounterCount();
      this.updateCurrentPosition();
    },
  },
};
