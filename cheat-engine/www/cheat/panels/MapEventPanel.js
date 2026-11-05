import { MapEventClassifier } from "../js/map-event/classifier.js";
import { markRaw } from "../libs/vue.js";
import { t } from "../js/strings.js";

export default {
  name: "MapEventPanel",

  template: `
<v-card flat class="ma-0 pa-0">
    <v-row class="mb-0 pa-0">
        <v-col cols="12">
            <canvas
                ref="mapCanvas"
                :width="canvasWidth"
                :height="canvasHeight"
                :style="canvasStyle"
                @click="onCanvasClick">
            </canvas>
        </v-col>
    </v-row>
    
    <v-row class="mb-0 pa-0">
        <v-col cols="12">
            <div class="text-body-small">
                <v-chip size="x-small" color="grey">{{ t("mapEvent.walkable") }}</v-chip>
                <v-chip size="x-small" color="grey-darken-3" class="ml-2">{{ t("mapEvent.blocked") }}</v-chip>
                <v-chip size="x-small" color="red" class="ml-2">{{ t("mapEvent.player") }}</v-chip>
                <v-chip size="x-small" color="yellow" class="ml-2 text-black">{{ t("mapEvent.event") }}</v-chip>
                <v-chip size="x-small" color="white" class="ml-2 text-black">{{ t("mapEvent.border") }}</v-chip>
                <v-chip size="x-small" color="orange" class="ml-2">{{ t("mapEvent.enemy") }}</v-chip>
                <v-chip size="x-small" color="blue" class="ml-2">{{ t("mapEvent.treasure") }}</v-chip>
            </div>
        </v-col>
    </v-row>

    <v-row class="mb-0 pa-0">
        <v-col cols="12" md="4">
            <v-switch
                v-model="limitedView"
                :label="t('mapEvent.limitedView')"
                color="primary"
                hide-details>
            </v-switch>
        </v-col>
        <v-col cols="12" md="4">
            <v-text-field
                v-model="currentMapId"
                :label="t('mapEvent.currentMapId')"
                density="compact"
                readonly
                bg-color="grey-darken-3"
                hide-details
                variant="outlined">
            </v-text-field>
        </v-col>
        <v-col cols="12" md="4">
            <v-text-field
                v-model="readInterval"
                :label="t('mapEvent.readInterval')"
                density="compact"
                bg-color="grey-darken-3"
                hide-details
                variant="outlined"
                @change="onReadIntervalChange"
                @keydown.stop>
            </v-text-field>
        </v-col>
    </v-row>
</v-card>
    `,

  data() {
    return {
      limitedView: this.loadSetting("mapEventPanel_limitedView", true), // 25x25 view when true, full map when false
      clickToTeleportEnabled: this.loadSetting(
        "mapEventPanel_clickToTeleport",
        true,
      ), // Toggle for click-to-teleport functionality
      currentMapId: 0,
      canvasWidth: 550,
      canvasHeight: 550,
      cellSize: 14, // Size of each grid cell in pixels (dynamic for full view)
      baseCellSize: 14, // Original cellSize for limited view mode

      mapData: null,
      renderedView: null, // 最近一次绘制使用的视口（点击传送按它换算坐标）
      mapEvents: [],
      regularEvents: [], // Filtered events list excluding enemies and treasure boxes
      playerPosition: { x: 0, y: 0 },
      enemies: [], // Track enemy positions and movement
      treasureBoxes: [], // Track treasure box positions

      // Map rendering properties
      maxViewSize: 25, // For 25x25 limited view

      // Track last known map ID to detect map changes
      lastKnownMapId: 0,

      // Visibility and runtime control
      isCanvasVisible: false, // whether the canvas is currently visible in viewport
      visibilityObserver: null, // IntersectionObserver instance (if any)
      needsRedraw: true, // dirty flag: only redraw canvas when game state changed
      renderIntervalId: null, // id returned from setInterval for periodic updates
      // Interval in ms for reading game data
      readInterval: this.normalizeReadInterval(
        this.loadSetting("mapEventPanel_readInterval", 500),
      ),
    };
  },

  created() {
    this.initializeMapDisplay();
  },

  mounted() {
    this.$nextTick(() => {
      // Start observing canvas visibility and do an initial render only if visible
      this.setupCanvasVisibilityObserver();
      if (this.isCanvasVisible) this.renderMap();
    });
  },

  watch: {
    limitedView(newValue) {
      this.saveSetting("mapEventPanel_limitedView", newValue);
      this.updateCanvasSize();
      this.$nextTick(() => {
        if (this.isCanvasVisible) this.renderMap();
      });
    },

    clickToTeleportEnabled(newValue) {
      this.saveSetting("mapEventPanel_clickToTeleport", newValue);
    },
  },

  beforeUnmount() {
    // Clean up observer and interval when component is destroyed
    try {
      if (
        this.visibilityObserver &&
        typeof this.visibilityObserver.disconnect === "function"
      ) {
        this.visibilityObserver.disconnect();
      }
    } catch (e) {
      // ignore
    }

    try {
      if (this.renderIntervalId) {
        clearInterval(this.renderIntervalId);
        this.renderIntervalId = null;
      }
    } catch (e) {
      // ignore
    }
  },

  computed: {
    displayMapWidth() {
      if (!this.mapData) return 0;
      return this.limitedView
        ? Math.min(this.maxViewSize, this.mapData.width)
        : this.mapData.width;
    },

    displayMapHeight() {
      if (!this.mapData) return 0;
      return this.limitedView
        ? Math.min(this.maxViewSize, this.mapData.height)
        : this.mapData.height;
    },

    canvasStyle() {
      return {
        border: "1px solid #ccc",
        backgroundColor: "#000",
        cursor: this.clickToTeleportEnabled ? "pointer" : "default",
      };
    },
  },

  methods: {
    t,

    // localStorage helper methods
    loadSetting(key, defaultValue) {
      try {
        const saved = localStorage.getItem(key);
        return saved !== null ? JSON.parse(saved) : defaultValue;
      } catch (error) {
        console.warn("Failed to load setting:", key, error);
        return defaultValue;
      }
    },

    saveSetting(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn("Failed to save setting:", key, error);
      }
    },

    initializeMapDisplay() {
      // 地图数据是异步加载的（刚读档 / 传送时 $dataMap 还是 null）。
      // 只有数据真正可用时才记录 mapId，否则下个周期不会再重试。
      if (this.updateCurrentMapData()) {
        this.lastKnownMapId = this.currentMapId;
      }
      this.updatePlayerPosition();
      this.updateMapEvents(); // Now handles all event classification in one pass

      // Update every readInterval to reflect real-time changes
      // store interval id so we can clear it when component is destroyed
      this.renderIntervalId = setInterval(() => {
        this.checkForMapChange();
        this.updatePlayerPosition();
        this.updateEnemyPositions();

        if (this.isCanvasVisible && this.needsRedraw) {
          this.renderMap();
          this.needsRedraw = false;
        }
      }, this.readInterval);
    },

    // localStorage 里的值可能是旧版本 / 手改 / 空串，直接进 setInterval
    // 会变成 0ms 忙循环，必须先按界面允许的范围收敛。
    normalizeReadInterval(value) {
      const parsed = parseInt(value, 10);

      if (!Number.isFinite(parsed)) {
        return 500;
      }

      return Math.min(1000, Math.max(100, parsed));
    },

    onReadIntervalChange() {
      const valid = this.normalizeReadInterval(this.readInterval);

      if (valid !== this.readInterval) {
        this.readInterval = valid;
      }
      this.saveSetting("mapEventPanel_readInterval", valid);
      if (this.renderIntervalId) {
        clearInterval(this.renderIntervalId);
        this.renderIntervalId = null;
      }
      this.renderIntervalId = setInterval(() => {
        this.checkForMapChange();
        this.updatePlayerPosition();
        this.updateEnemyPositions();
        if (this.isCanvasVisible && this.needsRedraw) {
          this.renderMap();
          this.needsRedraw = false;
        }
      }, valid);
    },

    // $gameMap 在游戏对象创建前是 undefined（例如自动恢复上次面板时）。
    // 返回 0 表示「当前没有地图」，调用方按无数据处理即可。
    getCurrentMapId() {
      try {
        if (typeof $gameMap === "undefined" || !$gameMap) {
          return 0;
        }

        const mapId = Number($gameMap.mapId());
        return Number.isFinite(mapId) && mapId > 0 ? mapId : 0;
      } catch (error) {
        return 0;
      }
    },

    // $dataMap 在地图异步加载期间是 null（传送 / 读档 / 新游戏起始的一瞬间）。
    // Vue 3.5 的 markRaw(null) 会直接抛 TypeError，所以先判断数据是否真的可用。
    isMapDataReady(dataMap) {
      return (
        !!dataMap &&
        typeof dataMap === "object" &&
        Number.isFinite(dataMap.width) &&
        Number.isFinite(dataMap.height)
      );
    },

    updateCurrentMapData() {
      try {
        this.currentMapId = this.getCurrentMapId();

        const dataMap = typeof $dataMap === "undefined" ? null : $dataMap;

        // mapId 为 0 表示还没进入地图（标题画面）；此时 $dataMap 可能仍是
        // 上一张地图的残留数据，不能拿来画。
        if (this.currentMapId <= 0 || !this.isMapDataReady(dataMap)) {
          this.clearMapData();
          return false;
        }

        if (this.mapData !== dataMap) {
          this.mapData = markRaw(dataMap);
          this.needsRedraw = true;
        }
        this.updateCanvasSize();
        return true;
      } catch (error) {
        console.warn("Could not get current map data:", error);
        this.clearMapData();
        return false;
      }
    },

    // 没有可用地图数据时清空面板，避免继续画上一张地图。
    clearMapData() {
      this.mapData = null;
      this.mapEvents = [];
      this.regularEvents = [];
      this.enemies = [];
      this.treasureBoxes = [];
      this.renderedView = null;
      this.needsRedraw = true;
      this.clearCanvas();
    },

    clearCanvas() {
      const canvas = this.$refs.mapCanvas;
      if (!canvas) return;

      try {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch (error) {
        // ignore
      }
    },

    updateCanvasSize() {
      if (!this.mapData) return;

      if (this.limitedView) {
        // For limited view, use base cellSize and calculate canvas size
        this.cellSize = this.baseCellSize;
        const maxSize = this.maxViewSize;
        this.canvasWidth = Math.min(600, maxSize * this.cellSize);
        this.canvasHeight = Math.min(600, maxSize * this.cellSize);
      } else {
        // For full view, dynamically adjust cellSize to fit the map within 600px
        const maxCanvasSize = 600;
        const scaleX = maxCanvasSize / this.mapData.width;
        const scaleY = maxCanvasSize / this.mapData.height;

        // Use the smaller scale to ensure the entire map fits
        const dynamicCellSize = Math.max(
          1,
          Math.floor(Math.min(scaleX, scaleY)),
        );

        // Update cellSize for full view rendering
        this.cellSize = dynamicCellSize;

        // Calculate actual canvas size based on dynamic cellSize
        this.canvasWidth = this.mapData.width * this.cellSize;
        this.canvasHeight = this.mapData.height * this.cellSize;
      }
    },

    // Visibility observer setup: use IntersectionObserver when available,
    // otherwise fall back to listening to window scroll/resize and checking
    // bounding rect intersection.
    setupCanvasVisibilityObserver() {
      const canvas = this.$refs.mapCanvas;
      if (!canvas) return;

      // If IntersectionObserver is available, prefer it (efficient)
      if (typeof IntersectionObserver !== "undefined") {
        try {
          this.visibilityObserver = new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                this.setCanvasVisible(
                  entry.isIntersecting && entry.intersectionRatio > 0,
                );
              }
            },
            { root: null, threshold: 0.01 },
          );

          this.visibilityObserver.observe(canvas);
          return;
        } catch (e) {
          // fall through to fallback
        }
      }

      // Fallback: recalculate visibility on scroll/resize at low frequency
      const checkVisibility = () => {
        const rect = canvas.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;

        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.left <= vw &&
          rect.top <= vh;

        this.setCanvasVisible(isVisible);
      };

      // Throttle fallback checks
      let timeout = null;
      const throttledCheck = () => {
        if (timeout) return;
        timeout = setTimeout(() => {
          timeout = null;
          checkVisibility();
        }, 200);
      };

      window.addEventListener("scroll", throttledCheck, true);
      window.addEventListener("resize", throttledCheck);

      // store observer-like object so beforeDestroy can cleanup listeners
      this.visibilityObserver = {
        disconnect() {
          window.removeEventListener("scroll", throttledCheck, true);
          window.removeEventListener("resize", throttledCheck);

          // 组件卸载时取消尚未执行的节流回调，避免访问已销毁的 canvas
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
        },
      };

      // initial check
      checkVisibility();
    },

    setCanvasVisible(visible) {
      if (this.isCanvasVisible === visible) return;
      this.isCanvasVisible = visible;
      if (visible) {
        this.needsRedraw = true;
        this.$nextTick(() => {
          if (this.mapData) this.renderMap();
        });
      }
    },

    updatePlayerPosition() {
      try {
        if ($gamePlayer) {
          const newX = $gamePlayer.x;
          const newY = $gamePlayer.y;
          if (
            newX !== this.playerPosition.x ||
            newY !== this.playerPosition.y
          ) {
            this.playerPosition = { x: newX, y: newY };
            this.needsRedraw = true;
          }
        }
      } catch (error) {
        console.warn("Could not get player position:", error);
      }
    },

    updateMapEvents() {
      try {
        const mapEvents = [];
        const enemies = [];
        const treasureBoxes = [];
        const regularEvents = [];

        if (!this.mapData || !this.mapData.events) {
          this.mapEvents = markRaw(mapEvents);
          this.enemies = enemies;
          this.treasureBoxes = treasureBoxes;
          this.regularEvents = markRaw(regularEvents);
          return;
        }

        // Single pass through events - classify each one
        for (let i = 1; i < this.mapData.events.length; i++) {
          const event = this.mapData.events[i];
          if (!event || event.x === undefined || event.y === undefined)
            continue;

          // Add to main events list
          mapEvents.push(event);

          // Get corresponding game event for dynamic data
          const gameEvent = $gameMap._events[i];

          // Check if it's an enemy first
          if (gameEvent && this.isEnemyEvent(gameEvent)) {
            const page =
              typeof gameEvent.page === "function" ? gameEvent.page() : null;

            enemies.push({
              id: gameEvent._eventId || i,
              x: gameEvent._x !== undefined ? gameEvent._x : event.x,
              y: gameEvent._y !== undefined ? gameEvent._y : event.y,
              direction: gameEvent._direction || 2,
              moving: page ? Number(page.moveType) > 0 : false,
              characterName:
                gameEvent._characterName || page?.image?.characterName || "",
              characterIndex:
                gameEvent._characterIndex ?? page?.image?.characterIndex ?? 0,
            });
          }
          // If not enemy, check if it's a treasure
          else if (this.isTreasureEvent(event)) {
            treasureBoxes.push({
              x: event.x,
              y: event.y,
              id: event.id,
              name: event.name,
            });
          }
          // If neither enemy nor treasure, add to regular events
          else {
            regularEvents.push(event);
          }
        }

        this.mapEvents = markRaw(mapEvents);
        this.enemies = enemies;
        this.treasureBoxes = treasureBoxes;
        this.regularEvents = markRaw(regularEvents);
      } catch (error) {
        console.warn("Could not get map events:", error);
      }
    },

    isEnemyEvent(event) {
      return MapEventClassifier.isEnemyEvent(event);
    },

    isTreasureEvent(event) {
      return MapEventClassifier.isTreasureEvent(event);
    },

    updateEnemyPositions() {
      try {
        let changed = false;
        this.enemies.forEach((enemy) => {
          const gameEvent = $gameMap._events[enemy.id];
          if (gameEvent) {
            const page =
              typeof gameEvent.page === "function" ? gameEvent.page() : null;
            const moving = page ? Number(page.moveType) > 0 : false;

            if (
              enemy.x !== gameEvent._x ||
              enemy.y !== gameEvent._y ||
              enemy.direction !== gameEvent._direction ||
              enemy.moving !== moving
            ) {
              changed = true;
            }
            enemy.x = gameEvent._x;
            enemy.y = gameEvent._y;
            enemy.direction = gameEvent._direction || 2;
            enemy.moving = moving;
          }
        });
        if (changed) this.needsRedraw = true;
      } catch (error) {
        console.warn("Could not update enemy positions:", error);
      }
    },

    checkForMapChange() {
      try {
        const currentMapId = this.getCurrentMapId();

        if (currentMapId <= 0) {
          // 标题画面等没有当前地图的场景：清空后记下 0，
          // 否则每个周期都会当成「地图正在加载」反复重试。
          if (this.lastKnownMapId !== 0) {
            this.updateCurrentMapData();
            this.lastKnownMapId = 0;
          }
          return;
        }

        const dataMap = typeof $dataMap === "undefined" ? null : $dataMap;
        const mapChanged = currentMapId !== this.lastKnownMapId;
        // 读档回到同一张地图时 mapId 不变，但 $dataMap 已经换成新对象。
        const dataChanged = this.mapData !== dataMap;

        if (mapChanged || dataChanged) {
          const loaded = this.updateCurrentMapData();

          if (!loaded) {
            // 地图数据还没加载完：不记录新的 mapId，下个周期继续重试。
            // 否则面板会一直停在上一张地图上，直到下一次切图。
            this.needsRedraw = true;
            return;
          }

          this.updateMapEvents();
          this.lastKnownMapId = currentMapId;
          this.needsRedraw = true;

          this.$nextTick(() => {
            if (this.isCanvasVisible) this.renderMap();
          });
        }
      } catch (error) {
        console.warn("Could not check for map change:", error);
      }
    },

    renderMap() {
      const canvas = this.$refs.mapCanvas;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");

      if (!this.mapData) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate view bounds
      let startX = 0,
        startY = 0,
        endX = this.mapData.width,
        endY = this.mapData.height;

      if (this.limitedView) {
        // Center the view around the player
        startX = Math.max(
          0,
          this.playerPosition.x - Math.floor(this.maxViewSize / 2),
        );
        startY = Math.max(
          0,
          this.playerPosition.y - Math.floor(this.maxViewSize / 2),
        );
        endX = Math.min(this.mapData.width, startX + this.maxViewSize);
        endY = Math.min(this.mapData.height, startY + this.maxViewSize);

        // Adjust start positions if we hit the map boundaries
        if (endX - startX < this.maxViewSize) {
          startX = Math.max(0, endX - this.maxViewSize);
        }
        if (endY - startY < this.maxViewSize) {
          startY = Math.max(0, endY - this.maxViewSize);
        }
      }

      // 记录本次实际绘制所用的视口。点击传送必须按「画布当前的视口」
      // 换算，而不是点击那一刻的 playerPosition（角色可能已经移动、
      // 但画布还没重绘）。
      this.renderedView = {
        limitedView: this.limitedView,
        startX: startX,
        startY: startY,
        cellSize: this.cellSize,
      };

      this.drawMapGrid(ctx, startX, startY, endX, endY);

      this.drawMapEvents(ctx, startX, startY);

      this.drawTreasureBoxes(ctx, startX, startY);

      this.drawEnemies(ctx, startX, startY);

      this.drawPlayer(ctx, startX, startY);
    },

    isTooLargeToDrawWalkableBoundaries(width, height) {
      // 每个格子最多 4 次 canPass，按「总格数」限制而不是要求宽高同时超限：
      // 100x20 这类单边很长的地图旧判断仍会跑边界计算。
      return width * height > 2500;
    },

    drawMapGrid(ctx, startX, startY, endX, endY) {
      // First pass: Draw basic grid with simple passability colors
      for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
          const canvasX = (x - startX) * this.cellSize;
          const canvasY = (y - startY) * this.cellSize;

          // Check if any movement is possible from this tile using canPass
          let canMove = this.isTilePassable(x, y);

          // Simple color scheme based on movement possibility
          if (canMove) {
            // Light grey for tiles where movement is possible
            ctx.fillStyle = "#888888";
          } else {
            // Dark grey for tiles where no movement is possible
            ctx.fillStyle = "#333333";
          }

          ctx.fillRect(canvasX, canvasY, this.cellSize, this.cellSize);
        }
      }

      // Second pass: Draw walkable area boundaries using canPass with directions
      if (
        !this.isTooLargeToDrawWalkableBoundaries(endX - startX, endY - startY)
      ) {
        this.drawWalkableBoundaries(ctx, startX, startY, endX, endY);
      }

      // Third pass: Draw grid lines
      ctx.strokeStyle = "#444444";
      ctx.lineWidth = 0.5;
      for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
          const canvasX = (x - startX) * this.cellSize;
          const canvasY = (y - startY) * this.cellSize;
          ctx.strokeRect(canvasX, canvasY, this.cellSize, this.cellSize);
        }
      }
    },

    isTilePassable(x, y) {
      try {
        // Check if coordinates are within bounds first
        if (!this.isWithinMapBounds(x, y)) {
          return false;
        }

        // Fallback: Check passability using RPG Maker's basic method
        if ($gameMap && typeof $gameMap.isPassable === "function") {
          // Check all 4 directions to see if any direction is passable
          return (
            $gameMap.isPassable(x, y, 2) ||
            $gameMap.isPassable(x, y, 4) ||
            $gameMap.isPassable(x, y, 6) ||
            $gameMap.isPassable(x, y, 8)
          );
        }

        return true; // Default to passable if can't determine
      } catch (error) {
        console.warn("Error checking passability:", error);
        return true;
      }
    },

    drawWalkableBoundaries(ctx, startX, startY, endX, endY) {
      ctx.strokeStyle = "#FFFFFF"; // white for non-walkable boundaries
      ctx.lineWidth = 2;

      for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
          if (!this.isTilePassable(x, y)) continue;

          const canvasX = (x - startX) * this.cellSize;
          const canvasY = (y - startY) * this.cellSize;

          // Use canPass to check movement in each direction
          if ($gamePlayer && typeof $gamePlayer.canPass === "function") {
            // Check if player can move from this tile in each direction
            const canMoveLeft = $gamePlayer.canPass(x, y, 4); // direction 4 = left
            const canMoveRight = $gamePlayer.canPass(x, y, 6); // direction 6 = right
            const canMoveUp = $gamePlayer.canPass(x, y, 8); // direction 8 = up
            const canMoveDown = $gamePlayer.canPass(x, y, 2); // direction 2 = down

            // Draw boundary lines where movement is blocked
            ctx.beginPath();

            if (!canMoveLeft) {
              // Draw left border - can't move left from this tile
              ctx.moveTo(canvasX, canvasY);
              ctx.lineTo(canvasX, canvasY + this.cellSize);
            }

            if (!canMoveRight) {
              // Draw right border - can't move right from this tile
              ctx.moveTo(canvasX + this.cellSize, canvasY);
              ctx.lineTo(canvasX + this.cellSize, canvasY + this.cellSize);
            }

            if (!canMoveUp) {
              // Draw top border - can't move up from this tile
              ctx.moveTo(canvasX, canvasY);
              ctx.lineTo(canvasX + this.cellSize, canvasY);
            }

            if (!canMoveDown) {
              // Draw bottom border - can't move down from this tile
              ctx.moveTo(canvasX, canvasY + this.cellSize);
              ctx.lineTo(canvasX + this.cellSize, canvasY + this.cellSize);
            }

            ctx.stroke();
          }
        }
      }
    },

    isWithinMapBounds(x, y) {
      try {
        // Method 1: Use RPG Maker's built-in validation
        if ($gameMap && typeof $gameMap.isValid === "function") {
          return $gameMap.isValid(x, y);
        }

        // Method 2: Use RPG Maker's width/height methods
        if ($gameMap) {
          const width = $gameMap.width();
          const height = $gameMap.height();
          return x >= 0 && x < width && y >= 0 && y < height;
        }

        // Method 3: Fallback to map data
        if (this.mapData) {
          return (
            x >= 0 &&
            x < this.mapData.width &&
            y >= 0 &&
            y < this.mapData.height
          );
        }

        return false;
      } catch (error) {
        console.warn("Could not check map bounds:", error);
        return false;
      }
    },

    drawMapEvents(ctx, startX, startY) {
      // Only draw regular events (excluding enemies and treasure boxes)
      this.regularEvents.forEach((event) => {
        if (
          event.x >= startX &&
          event.x < startX + this.displayMapWidth &&
          event.y >= startY &&
          event.y < startY + this.displayMapHeight
        ) {
          const canvasX = (event.x - startX) * this.cellSize;
          const canvasY = (event.y - startY) * this.cellSize;

          // Draw yellow background for event
          ctx.fillStyle = "#FFD700";
          ctx.fillRect(canvasX, canvasY, this.cellSize, this.cellSize);

          // Draw "EV" text
          ctx.fillStyle = "#000000";
          ctx.font = `${Math.max(8, this.cellSize - 4)}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            "EV",
            canvasX + this.cellSize / 2,
            canvasY + this.cellSize / 2,
          );
        }
      });
    },

    drawEnemies(ctx, startX, startY) {
      this.enemies.forEach((enemy) => {
        if (
          enemy.x >= startX &&
          enemy.x < startX + this.displayMapWidth &&
          enemy.y >= startY &&
          enemy.y < startY + this.displayMapHeight
        ) {
          const canvasX = (enemy.x - startX) * this.cellSize;
          const canvasY = (enemy.y - startY) * this.cellSize;

          // Draw orange circle for enemy
          ctx.fillStyle = "#FF8C00"; // Dark orange
          ctx.beginPath();
          ctx.arc(
            canvasX + this.cellSize / 2,
            canvasY + this.cellSize / 2,
            Math.max(3, this.cellSize / 3),
            0,
            2 * Math.PI,
          );
          ctx.fill();

          // Add a small black outline for better visibility
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;
          ctx.stroke();

          // If enemy is moving, add a small indicator
          if (enemy.moving) {
            // Draw a small triangle to indicate movement direction
            const centerX = canvasX + this.cellSize / 2;
            const centerY = canvasY + this.cellSize / 2;
            const size = Math.max(2, this.cellSize / 6);

            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath();

            // Direction: 2=down, 4=left, 6=right, 8=up
            switch (enemy.direction) {
              case 2: // down
                ctx.moveTo(centerX, centerY + size);
                ctx.lineTo(centerX - size / 2, centerY);
                ctx.lineTo(centerX + size / 2, centerY);
                break;
              case 4: // left
                ctx.moveTo(centerX - size, centerY);
                ctx.lineTo(centerX, centerY - size / 2);
                ctx.lineTo(centerX, centerY + size / 2);
                break;
              case 6: // right
                ctx.moveTo(centerX + size, centerY);
                ctx.lineTo(centerX, centerY - size / 2);
                ctx.lineTo(centerX, centerY + size / 2);
                break;
              case 8: // up
                ctx.moveTo(centerX, centerY - size);
                ctx.lineTo(centerX - size / 2, centerY);
                ctx.lineTo(centerX + size / 2, centerY);
                break;
              default:
                // Default direction indicator
                ctx.arc(centerX, centerY, size / 2, 0, 2 * Math.PI);
            }

            ctx.closePath();
            ctx.fill();
          }
        }
      });
    },

    drawTreasureBoxes(ctx, startX, startY) {
      this.treasureBoxes.forEach((treasure) => {
        if (
          treasure.x >= startX &&
          treasure.x < startX + this.displayMapWidth &&
          treasure.y >= startY &&
          treasure.y < startY + this.displayMapHeight
        ) {
          const canvasX = (treasure.x - startX) * this.cellSize;
          const canvasY = (treasure.y - startY) * this.cellSize;

          // Draw blue square for treasure box
          ctx.fillStyle = "#0066FF"; // Blue
          // fill the square
          ctx.fillRect(canvasX, canvasY, this.cellSize, this.cellSize);

          // Add a small black outline for better visibility
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;
          ctx.strokeRect(
            canvasX + this.cellSize / 8,
            canvasY + this.cellSize / 8,
            (this.cellSize * 3) / 4,
            (this.cellSize * 3) / 4,
          );

          // Optional: Add a small highlight to make it look more like a chest
          ctx.fillStyle = "#66AAFF"; // Lighter blue for highlight
          ctx.fillRect(
            canvasX + (this.cellSize * 3) / 8,
            canvasY + this.cellSize / 4,
            this.cellSize / 4,
            this.cellSize / 4,
          );
        }
      });
    },

    drawPlayer(ctx, startX, startY) {
      const playerCanvasX = (this.playerPosition.x - startX) * this.cellSize;
      const playerCanvasY = (this.playerPosition.y - startY) * this.cellSize;

      // Only draw if player is within view
      if (
        this.playerPosition.x >= startX &&
        this.playerPosition.x < startX + this.displayMapWidth &&
        this.playerPosition.y >= startY &&
        this.playerPosition.y < startY + this.displayMapHeight
      ) {
        // Draw red circle for player
        ctx.fillStyle = "#FF0000";
        ctx.beginPath();
        ctx.arc(
          playerCanvasX + this.cellSize / 2,
          playerCanvasY + this.cellSize / 2,
          Math.max(3, this.cellSize / 3),
          0,
          2 * Math.PI,
        );
        ctx.fill();
      }
    },

    onCanvasClick(event) {
      if (
        !this.clickToTeleportEnabled ||
        !this.mapData ||
        !this.$refs.mapCanvas
      )
        return;

      // Get canvas bounds and click position
      const canvas = this.$refs.mapCanvas;
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      // 优先使用画布最近一次绘制时的视口。角色移动后、下一次
      // readInterval 重绘之前，点击位置必须按旧视口换算才和眼睛看到的一致。
      const view =
        this.renderedView && this.renderedView.limitedView === this.limitedView
          ? this.renderedView
          : null;
      const cellSize = view ? view.cellSize : this.cellSize;

      // Calculate which grid cell was clicked
      const cellX = Math.floor(clickX / cellSize);
      const cellY = Math.floor(clickY / cellSize);

      let startX = 0;
      let startY = 0;

      if (this.limitedView) {
        if (view) {
          startX = view.startX;
          startY = view.startY;
        } else {
          // 还没有渲染记录时退回按当前角色位置计算
          startX = Math.max(
            0,
            this.playerPosition.x - Math.floor(this.maxViewSize / 2),
          );
          startY = Math.max(
            0,
            this.playerPosition.y - Math.floor(this.maxViewSize / 2),
          );

          const endX = Math.min(this.mapData.width, startX + this.maxViewSize);
          const endY = Math.min(this.mapData.height, startY + this.maxViewSize);

          if (endX - startX < this.maxViewSize) {
            startX = Math.max(0, endX - this.maxViewSize);
          }
          if (endY - startY < this.maxViewSize) {
            startY = Math.max(0, endY - this.maxViewSize);
          }
        }
      }

      const mapX = startX + cellX;
      const mapY = startY + cellY;

      // Validate coordinates are within map bounds
      if (
        mapX >= 0 &&
        mapX < this.mapData.width &&
        mapY >= 0 &&
        mapY < this.mapData.height
      ) {
        this.teleportPlayerTo(mapX, mapY);
      } else {
        console.warn(
          `Click coordinates (${mapX}, ${mapY}) are outside map bounds`,
        );
      }
    },

    teleportPlayerTo(targetX, targetY) {
      try {
        if ($gamePlayer) {
          // Use direct positioning for instant teleport
          $gamePlayer.setPosition(targetX, targetY);
          $gamePlayer.center(targetX, targetY);
          $gamePlayer.makeEncounterCount();
        }
      } catch (error) {
        console.warn("Could not teleport player:", error);
      }
    },
  },
};
