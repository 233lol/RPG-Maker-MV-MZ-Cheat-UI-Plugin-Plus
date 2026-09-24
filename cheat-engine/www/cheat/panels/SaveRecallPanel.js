import PageJump from "../components/PageJump.js";
import { KEY_VALUE_STORAGE } from "../js/KeyValueStorage.js";

export default {
  name: "SaveRecallPanel",

  components: { PageJump },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-card-subtitle class="ma-0 pa-0">保存当前位置</v-card-subtitle>
    <span class="text-body-medium text-green-darken-1">地图 : {{currentMapName}}</span>
    <v-text-field
        ref="locationAliasField"
        label="位置别名"
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
                <span>保存当前位置</span>
            </v-tooltip>
        </template>
    </v-text-field>

    <v-card-subtitle class="ma-0 pa-0 mt-5">搜索保存的位置</v-card-subtitle>
    <v-data-table
        v-if="tableHeaders"
        class="mt-2"
        density="compact"
        :headers="tableHeaders"
        :items="filteredTableItems"
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
                <span>传送</span>
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
                <span>删除</span>
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
      locationAliasInput: "",

      search: "",

      locations: [],

      currentMapName: "",

      tableHeaders: [
        {
          title: "别名",
          key: "name",
        },
        {
          title: "地图名",
          key: "mapName",
        },
        {
          title: "坐标",
          key: "coord",
        },
        {
          title: "操作",
          key: "actions",
        },
      ],
      pagination: { page: 1, itemsPerPage: 5 },
    };
  },

  mounted() {
    this.initializeVariables();
    this.$refs.locationAliasField.focus();
  },

  computed: {
    tableItems() {
      return this.locations.map((location, idx) => {
        return {
          // 保留原始下标：删除必须按原始数组位置，
          // 而 #item.actions 里的 index 是过滤后 / 当前页的下标
          locationIndex: idx,
          name: location.name,
          mapName: $dataMapInfos[location.mapId]
            ? $dataMapInfos[location.mapId].name
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
      let items = this.tableItems;
      if (this.search && this.search.trim()) {
        const s = this.search.toLowerCase();
        items = items.filter((item) =>
          item.name.toLowerCase().includes(s) ||
          item.mapName.toLowerCase().includes(s)
        );
      }
      return items;
    },

    totalCount() {
      return this.filteredTableItems.length;
    },

    paginationStart() {
      if (this.totalCount === 0) return 0;
      return (this.pagination.page - 1) * this.pagination.itemsPerPage + 1;
    },

    paginationStop() {
      return Math.min(this.pagination.page * this.pagination.itemsPerPage, this.totalCount);
    },

    pageCount() {
      return Math.ceil(this.filteredTableItems.length / this.pagination.itemsPerPage) || 1;
    },
  },

  methods: {
    jumpToPage(page) {
      this.pagination.page = page;
    },

    async initializeVariables() {
      this.loadLocations();
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
          console.warn("[cheat plugin] cheat.locations has unexpected structure, ignored");
          this.locations = [];
        }
      } catch (error) {
        console.warn("[cheat plugin] Can't parse cheat.locations, reset to empty", error);
        this.locations = [];
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
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      $gamePlayer.reserveTransfer(mapId, x, y, $gamePlayer.direction(), 0);
      $gamePlayer.setPosition(x, y);
    },
  },
};
