import PaginationFooter from "../components/PaginationFooter.js";
import SearchField from "../components/SearchField.js";
import { Alert } from "../js/AlertHelper.js";
import {
  ITEMS_PER_PAGE_OPTIONS,
  getPageCount,
  paginationWatcherMixin,
} from "../js/PaginationHelper.js";

export default {
  name: "TeleportPanel",

  mixins: [paginationWatcherMixin],

  components: { PaginationFooter, SearchField },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-row>
        <v-col cols="12">
            <v-card variant="outlined" color="primary" class="pa-2">
                <v-row density="compact">
                    <v-col cols="4" class="text-center">
                        <div class="text-body-small text-grey">当前地图</div>
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
                当前传送
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
                label="隐藏完整路径">
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
                <span>传送</span>
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

      search: "",
      excludeFullPath: false,

      maps: [],

      pagination: { page: 1, itemsPerPage: 5 },
      itemsPerPageOptions: ITEMS_PER_PAGE_OPTIONS,

      tableHeaders: [
        {
          title: "ID",
          key: "id",
        },
        {
          title: "名称",
          key: "name",
        },
        {
          title: "完整路径",
          key: "fullPath",
        },
        {
          title: "操作",
          key: "actions",
        },
      ],
    };
  },

  created() {
    this.initializeVariables();
    this.updateCurrentPosition();
    this.updateTimer = setInterval(() => {
      this.updateCurrentPosition();
    }, 1000);
  },

  beforeUnmount() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  },

  computed: {
    filteredTableHeaders() {
      if (this.excludeFullPath) {
        return this.tableHeaders.filter((header) => header.key !== "fullPath");
      }

      return this.tableHeaders;
    },

    filteredMaps() {
      if (!this.search || !this.search.trim()) return this.maps;
      const s = this.search.toLowerCase();
      return this.maps.filter(
        (item) =>
          String(item.name ?? "")
            .toLowerCase()
            .includes(s) ||
          String(item.fullPathJoin ?? "")
            .toLowerCase()
            .includes(s) ||
          String(item.id ?? "")
            .toLowerCase()
            .includes(s),
      );
    },

    totalCount() {
      return this.filteredMaps.length;
    },

    pageCount() {
      return getPageCount(this.totalCount, this.pagination.itemsPerPage);
    },
  },

  methods: {
    jumpToPage(page) {
      this.pagination.page = page;
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
        Alert.warn("传送坐标必须是正整数");
        return false;
      }

      if (
        typeof $dataMapInfos === "undefined" ||
        !$dataMapInfos ||
        !$dataMapInfos[targetMapId]
      ) {
        Alert.warn(`地图 ${targetMapId} 不存在`);
        return false;
      }

      if (typeof $gamePlayer === "undefined" || !$gamePlayer) {
        Alert.warn("玩家数据尚未初始化，无法传送");
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
          Alert.warn(`坐标 ${x},${y} 超出当前地图范围`);
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
        Alert.warn("传送坐标必须是正整数");
        return;
      }

      if (
        typeof $gamePlayer === "undefined" ||
        !$gamePlayer ||
        typeof $gameMap === "undefined" ||
        !$gameMap
      ) {
        Alert.warn("玩家数据尚未初始化，无法传送");
        return;
      }

      if (x >= $gameMap.width() || y >= $gameMap.height()) {
        Alert.warn(`坐标 ${x},${y} 超出当前地图范围`);
        return;
      }

      $gamePlayer.setPosition(x, y);
      $gamePlayer.center(x, y);
      $gamePlayer.makeEncounterCount();
      this.updateCurrentPosition();
    },
  },
};
