import PageJump from "../components/PageJump.js";

export default {
  name: "TeleportPanel",

  components: { PageJump },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-row>
        <v-col cols="12">
            <v-card variant="outlined" color="primary" class="pa-2 mb-2">
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
    <v-row>
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
         :items-per-page-options="[5, 10, 15, { title: 'All', value: -1 }]">
        <template #top>
            <v-text-field
                label="搜索..."
                variant="solo"
                bg-color="grey-darken-3"
                v-model="search"
                density="compact"
                hide-details

                @focus="$event.target.select()"
                @keydown.stop>
            </v-text-field>
            <v-checkbox
                v-model="excludeFullPath"
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
             <div class="d-flex align-center justify-space-between pa-2">
                 <div class="d-flex align-center">
                     <span class="text-body-small mr-2">每页</span>
                     <v-select
                         v-model="pagination.itemsPerPage"
                         :items="[5, 10, 15, 20]"
                         density="compact"
                         hide-details
                         variant="outlined"
                         style="width: 90px;"
                     ></v-select>
                 </div>
                 <div class="d-flex align-center ga-2">
                     <span class="text-body-small text-no-wrap">{{ paginationStart }}-{{ paginationStop }} / {{ totalCount }}</span>
                     <v-pagination v-model="pagination.page" :length="pageCount" density="compact" :total-visible="5" size="small"></v-pagination>
                     <page-jump
                         :page="pagination.page"
                         :page-count="pageCount"
                         @jump="jumpToPage">
                     </page-jump>
                 </div>
             </div>
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
        return this.tableHeaders.filter(
          (header) => header.key !== "fullPath",
        );
      }

      return this.tableHeaders;
    },

    filteredMaps() {
      if (!this.search || !this.search.trim()) return this.maps;
      const s = this.search.toLowerCase();
      return this.maps.filter((item) =>
        item.name.toLowerCase().includes(s) ||
        item.fullPathJoin.toLowerCase().includes(s) ||
        String(item.id).toLowerCase().includes(s)
      );
    },

    totalCount() {
      return this.filteredMaps.length;
    },

    paginationStart() {
      if (this.totalCount === 0) return 0;
      return (this.pagination.page - 1) * this.pagination.itemsPerPage + 1;
    },

    paginationStop() {
      return Math.min(this.pagination.page * this.pagination.itemsPerPage, this.totalCount);
    },

    pageCount() {
      return Math.ceil(this.filteredMaps.length / this.pagination.itemsPerPage) || 1;
    },
  },

  methods: {
    jumpToPage(page) {
      this.pagination.page = page;
    },

    async initializeVariables() {
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
      return dataMapInfos.map((m) => (m ? m.name : ""));
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
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      $gamePlayer.reserveTransfer(mapId, x, y, $gamePlayer.direction(), 0);
      $gamePlayer.setPosition(x, y);
    },

    updateCurrentPosition() {
      if (typeof $gamePlayer !== 'undefined' && $gamePlayer) {
        this.currentX = $gamePlayer.x;
        this.currentY = $gamePlayer.y;
      }
      if (typeof $gameMap !== 'undefined' && $gameMap) {
        const mapId = $gameMap.mapId();
        if ($dataMapInfos && $dataMapInfos[mapId]) {
          this.currentMapName = $dataMapInfos[mapId].name;
        }
      }
    },

    sameMapTeleport() {
      const x = Number(this.inputX);
      const y = Number(this.inputY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      $gamePlayer.setPosition(x, y);
      $gamePlayer.center(x, y);
      $gamePlayer.makeEncounterCount();
      this.updateCurrentPosition();
    },
  },
};
