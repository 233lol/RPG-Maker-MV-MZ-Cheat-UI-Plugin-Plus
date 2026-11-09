import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import MapEventPanel from "../../cheat-engine/www/cheat/panels/MapEventPanel.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";
import { ConfirmDialog } from "../../cheat-engine/www/cheat/js/DialogHelper.js";
import { SELF_SWITCH_KEYS } from "../../cheat-engine/www/cheat/js/map-event/tools.js";

const GAME_GLOBALS = [
  "$gameMap",
  "$gamePlayer",
  "$gameParty",
  "$gameSystem",
  "$gameSelfSwitches",
  "$gameTemp",
  "$dataMap",
  "$dataMapInfos",
  "$dataCommonEvents",
];

function makePanel(overrides = {}) {
  const panel = {
    ...MapEventPanel.methods,

    limitedView: true,
    clickToTeleportEnabled: true,
    currentMapId: 0,
    lastKnownMapId: 0,
    canvasWidth: 550,
    canvasHeight: 550,
    cellSize: 14,
    baseCellSize: 14,
    maxViewSize: 25,

    mapData: null,
    renderedView: null,
    mapEvents: [],
    regularEvents: [],
    playerPosition: { x: 0, y: 0 },
    enemies: [],
    treasureBoxes: [],

    isCanvasVisible: false,
    visibilityObserver: null,
    needsRedraw: true,
    renderIntervalId: null,
    readInterval: 500,

    selfSwitchKeys: SELF_SWITCH_KEYS,
    eventTools: {
      show: false,
      selectedEventId: 0,
      selfSwitches: { A: false, B: false, C: false, D: false },
      commonEventId: null,
    },

    $refs: {},
    $nextTick(callback) {
      this.pendingTick = callback;
      if (callback) callback();
    },

    activated: MapEventPanel.activated,
    deactivated: MapEventPanel.deactivated,
    beforeUnmount: MapEventPanel.beforeUnmount,

    ...overrides,
  };

  for (const [name, fn] of Object.entries(MapEventPanel.computed)) {
    Object.defineProperty(panel, name, {
      configurable: true,
      get: () => fn.call(panel),
    });
  }

  return panel;
}

function createContext() {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);

  return {
    calls,
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    fill: record("fill"),
    arc: record("arc"),
    fillText: record("fillText"),
  };
}

function createCanvas(ctx = createContext()) {
  return {
    ctx,
    width: 300,
    height: 200,
    getContext(kind) {
      return kind === "2d" ? ctx : null;
    },
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 300, height: 200 };
    },
  };
}

function silenceWarn() {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  return {
    warnings,
    restore() {
      console.warn = original;
    },
  };
}

afterEach(() => {
  for (const name of GAME_GLOBALS) delete globalThis[name];
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IntersectionObserver;
  Alert.handler = null;
  Alert.pending = [];
});

test("MapEventPanel.saveSetting：存储抛错时只警告，不打断面板", () => {
  const panel = makePanel({
    getSettingsStorage() {
      throw new Error("disk unavailable");
    },
  });
  const { warnings, restore } = silenceWarn();

  try {
    assert.doesNotThrow(() => panel.saveSetting("key", 1));
  } finally {
    restore();
  }

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /Failed to save setting/);
});

test("MapEventPanel.initializeMapDisplay：缓存地图 ID、同步状态并启动定时器", () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timers = [];

  globalThis.setInterval = (fn, ms) => {
    const id = timers.length + 1;
    timers.push({ id, fn, ms });
    return id;
  };
  globalThis.clearInterval = () => {};

  globalThis.$gameMap = { mapId: () => 7, _events: [] };
  globalThis.$dataMap = { width: 10, height: 8, events: [] };
  globalThis.$gamePlayer = { x: 2, y: 3 };

  const calls = [];

  const panel = makePanel({
    isCanvasVisible: true,
    needsRedraw: true,
    checkForMapChange() {
      calls.push("check");
    },
    updatePlayerPosition() {
      calls.push("player");
    },
    updateEnemyPositions() {
      calls.push("enemies");
    },
    renderMap() {
      calls.push("render");
    },
  });

  try {
    panel.initializeMapDisplay();

    assert.equal(panel.currentMapId, 7);
    assert.equal(panel.lastKnownMapId, 7);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 500);
    assert.equal(panel.renderIntervalId, 1);

    timers[0].fn();

    assert.deepEqual(calls, ["player", "check", "player", "enemies", "render"]);
    // 重绘后清掉 dirty 标记，下一周期不再重复绘制
    assert.equal(panel.needsRedraw, false);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("MapEventPanel.initializeMapDisplay：地图不可用时不记录地图 ID", () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};

  const panel = makePanel({
    lastKnownMapId: 5,
    updateCurrentMapData() {
      return false;
    },
    updatePlayerPosition() {},
    updateMapEvents() {},
  });

  try {
    panel.initializeMapDisplay();
    assert.equal(panel.lastKnownMapId, 5);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("MapEventPanel.updateCurrentMapData：没有地图 / 数据未就绪时清空面板", () => {
  const panel = makePanel({
    mapData: { width: 1, height: 1, events: [] },
    clearMapData() {
      this.cleared = true;
      this.mapData = null;
    },
  });

  // 标题画面：mapId 为 0，即使 $dataMap 是上一张地图的残留也不能画
  globalThis.$dataMap = { width: 3, height: 3, events: [] };
  assert.equal(panel.updateCurrentMapData(), false);
  assert.equal(panel.cleared, true);

  // 有 mapId 但地图还没加载完
  panel.cleared = false;
  globalThis.$gameMap = { mapId: () => 2 };
  globalThis.$dataMap = null;
  assert.equal(panel.updateCurrentMapData(), false);
  assert.equal(panel.cleared, true);

  // width / height 不是有限数字
  globalThis.$dataMap = { width: "3", height: 3 };
  assert.equal(panel.updateCurrentMapData(), false);
});

test("MapEventPanel.updateCurrentMapData：数据就绪时 markRaw 并更新画布尺寸", () => {
  const dataMap = { width: 10, height: 6, events: [] };
  let sized = 0;

  globalThis.$gameMap = { mapId: () => 4 };
  globalThis.$dataMap = dataMap;

  const panel = makePanel({
    updateCanvasSize() {
      sized++;
    },
  });

  assert.equal(panel.updateCurrentMapData(), true);
  assert.equal(panel.currentMapId, 4);
  assert.equal(panel.mapData, dataMap);
  assert.equal(panel.needsRedraw, true);
  assert.equal(sized, 1);
});

test("MapEventPanel.updateCurrentMapData：访问地图数据抛错时清空并警告", () => {
  const { warnings, restore } = silenceWarn();
  const panel = makePanel({
    getCurrentMapId() {
      throw new Error("game not ready");
    },
    clearMapData() {
      this.cleared = true;
    },
  });

  try {
    assert.equal(panel.updateCurrentMapData(), false);
  } finally {
    restore();
  }

  assert.equal(panel.cleared, true);
  assert.match(String(warnings[0][0]), /Could not get current map data/);
});

test("MapEventPanel.clearMapData / clearCanvas：重置缓存并清空画布", () => {
  const ctx = createContext();
  const canvas = createCanvas(ctx);
  const panel = makePanel({
    mapData: { width: 2, height: 2, events: [] },
    mapEvents: [{ id: 1 }],
    regularEvents: [{ id: 2 }],
    enemies: [{ id: 3 }],
    treasureBoxes: [{ id: 4 }],
    renderedView: { startX: 1 },
    needsRedraw: false,
    $refs: { mapCanvas: canvas },
  });

  panel.clearMapData();

  assert.equal(panel.mapData, null);
  assert.deepEqual(panel.mapEvents, []);
  assert.deepEqual(panel.regularEvents, []);
  assert.deepEqual(panel.enemies, []);
  assert.deepEqual(panel.treasureBoxes, []);
  assert.equal(panel.renderedView, null);
  assert.equal(panel.needsRedraw, true);
  assert.deepEqual(ctx.calls, [["clearRect", 0, 0, 300, 200]]);

  // 没有 canvas 时安全返回
  assert.doesNotThrow(() => makePanel().clearCanvas());
});

test("MapEventPanel.clearCanvas：getContext 抛错时吞掉异常", () => {
  const panel = makePanel({
    $refs: {
      mapCanvas: {
        width: 10,
        height: 10,
        getContext() {
          throw new Error("2d context unavailable");
        },
      },
    },
  });

  assert.doesNotThrow(() => panel.clearCanvas());
});

test("MapEventPanel.updateCanvasSize：限制视图固定格子大小，全图视图自适应缩放", () => {
  const panel = makePanel({
    mapData: { width: 100, height: 50 },
    limitedView: true,
  });

  panel.updateCanvasSize();
  assert.equal(panel.cellSize, 14);
  assert.equal(panel.canvasWidth, 350);
  assert.equal(panel.canvasHeight, 350);

  panel.limitedView = false;
  panel.updateCanvasSize();
  // min(600 / 100, 600 / 50) = 6
  assert.equal(panel.cellSize, 6);
  assert.equal(panel.canvasWidth, 600);
  assert.equal(panel.canvasHeight, 300);

  // 超大单边地图仍至少 1px 一格
  panel.mapData = { width: 3000, height: 2 };
  panel.updateCanvasSize();
  assert.equal(panel.cellSize, 1);
  assert.equal(panel.canvasWidth, 3000);

  // 没有地图数据时不动尺寸
  panel.mapData = null;
  panel.cellSize = 9;
  panel.updateCanvasSize();
  assert.equal(panel.cellSize, 9);
});

test("MapEventPanel.setupCanvasVisibilityObserver：优先使用 IntersectionObserver", () => {
  const observed = [];
  let observerCallback = null;

  globalThis.IntersectionObserver = class {
    constructor(callback) {
      observerCallback = callback;
    }
    observe(element) {
      observed.push(element);
    }
    disconnect() {
      observed.push("disconnect");
    }
  };

  const canvas = createCanvas();
  const panel = makePanel({ $refs: { mapCanvas: canvas } });

  panel.setupCanvasVisibilityObserver();

  assert.deepEqual(observed, [canvas]);
  assert.ok(panel.visibilityObserver);

  observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  assert.equal(panel.isCanvasVisible, true);

  observerCallback([{ isIntersecting: true, intersectionRatio: 0 }]);
  assert.equal(panel.isCanvasVisible, false);
});

test("MapEventPanel.setupCanvasVisibilityObserver：没有 Observer 时监听滚动 / 尺寸", () => {
  const listeners = [];
  const canvas = createCanvas();
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
  });

  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener(type, handler) {
      listeners.push(["add", type, handler]);
    },
    removeEventListener(type, handler) {
      listeners.push(["remove", type, handler]);
    },
  };

  const panel = makePanel({ $refs: { mapCanvas: canvas } });

  panel.setupCanvasVisibilityObserver();

  assert.equal(panel.isCanvasVisible, true);
  assert.ok(
    listeners.some(([action, type]) => action === "add" && type === "scroll"),
  );
  assert.ok(
    listeners.some(([action, type]) => action === "add" && type === "resize"),
  );

  panel.visibilityObserver.disconnect();
  assert.ok(
    listeners.some(
      ([action, type]) => action === "remove" && type === "scroll",
    ),
  );
  assert.ok(
    listeners.some(
      ([action, type]) => action === "remove" && type === "resize",
    ),
  );

  // 没有 canvas 时什么都不做
  assert.doesNotThrow(() => makePanel().setupCanvasVisibilityObserver());
});

test("MapEventPanel.setCanvasVisible：可视图层变化时标脏并按需重绘", () => {
  let rendered = 0;
  const panel = makePanel({
    isCanvasVisible: true,
    needsRedraw: false,
    mapData: { width: 2, height: 2 },
    renderMap() {
      rendered++;
    },
  });

  panel.setCanvasVisible(false);
  assert.equal(panel.isCanvasVisible, false);
  assert.equal(panel.needsRedraw, false);
  assert.equal(rendered, 0);

  panel.needsRedraw = false;
  panel.setCanvasVisible(true);
  assert.equal(panel.isCanvasVisible, true);
  assert.equal(panel.needsRedraw, true);
  assert.equal(rendered, 1);

  // 状态没变时不重绘
  panel.setCanvasVisible(true);
  assert.equal(rendered, 1);
});

test("MapEventPanel.updatePlayerPosition：位置变化才标脏", () => {
  const panel = makePanel({
    playerPosition: { x: 1, y: 2 },
    needsRedraw: false,
  });

  panel.updatePlayerPosition();
  assert.deepEqual(panel.playerPosition, { x: 1, y: 2 });
  assert.equal(panel.needsRedraw, false);

  globalThis.$gamePlayer = { x: 5, y: 6 };
  panel.updatePlayerPosition();
  assert.deepEqual(panel.playerPosition, { x: 5, y: 6 });
  assert.equal(panel.needsRedraw, true);
});

test("MapEventPanel.updatePlayerPosition：读取位置抛错时只警告", () => {
  const { warnings, restore } = silenceWarn();
  globalThis.$gamePlayer = {
    get x() {
      throw new Error("player unavailable");
    },
  };
  const panel = makePanel();

  try {
    assert.doesNotThrow(() => panel.updatePlayerPosition());
  } finally {
    restore();
  }

  assert.match(String(warnings[0][0]), /Could not get player position/);
});

test("MapEventPanel.updateMapEvents：一次遍历区分敌人 / 宝箱 / 普通事件", () => {
  const treasureEvent = { id: 1, name: "宝箱", x: 2, y: 3 };
  const regularEvent = { id: 2, name: "村民", x: 4, y: 5 };
  const enemyEvent = { id: 3, name: "史莱姆", x: 6, y: 7 };

  globalThis.$gameMap = {
    _events: [
      null,
      null,
      null,
      {
        _eventId: 3,
        _x: 6,
        _y: 7,
        _direction: 4,
        _characterName: "Slime",
        _characterIndex: 2,
        page: () => ({
          moveType: 1,
          image: { characterName: "Slime", characterIndex: 2 },
        }),
      },
    ],
  };

  const panel = makePanel({
    mapData: {
      width: 10,
      height: 10,
      events: [null, treasureEvent, regularEvent, enemyEvent],
    },
  });

  panel.updateMapEvents();

  assert.deepEqual(panel.mapEvents, [treasureEvent, regularEvent, enemyEvent]);
  assert.deepEqual(panel.regularEvents, [regularEvent]);
  assert.deepEqual(panel.treasureBoxes, [{ x: 2, y: 3, id: 1, name: "宝箱" }]);
  assert.deepEqual(panel.enemies, [
    {
      id: 3,
      x: 6,
      y: 7,
      direction: 4,
      moving: true,
      characterName: "Slime",
      characterIndex: 2,
    },
  ]);

  // 没有地图数据时列表清空
  panel.mapData = null;
  panel.updateMapEvents();
  assert.deepEqual(panel.mapEvents, []);
  assert.deepEqual(panel.regularEvents, []);
  assert.deepEqual(panel.enemies, []);
  assert.deepEqual(panel.treasureBoxes, []);
});

test("MapEventPanel.updateMapEvents：跳过坐标为 undefined 的事件", () => {
  const valid = { id: 1, name: "NPC", x: 0, y: 0 };
  const panel = makePanel({
    mapData: {
      width: 5,
      height: 5,
      events: [null, { id: 2, name: "bad" }, valid],
    },
  });
  globalThis.$gameMap = { _events: [] };

  panel.updateMapEvents();

  assert.deepEqual(panel.mapEvents, [valid]);
  assert.deepEqual(panel.regularEvents, [valid]);
});

test("MapEventPanel.updateMapEvents：遍历抛错时保留原有列表并警告", () => {
  const { warnings, restore } = silenceWarn();
  const panel = makePanel({
    mapData: {
      get events() {
        throw new Error("events unavailable");
      },
    },
  });

  try {
    assert.doesNotThrow(() => panel.updateMapEvents());
  } finally {
    restore();
  }

  assert.match(String(warnings[0][0]), /Could not get map events/);
});

test("MapEventPanel.updateEnemyPositions：同步坐标 / 方向 / 移动状态", () => {
  const enemy = {
    id: 3,
    x: 1,
    y: 1,
    direction: 2,
    moving: false,
  };

  globalThis.$gameMap = {
    _events: [
      null,
      null,
      null,
      {
        _x: 4,
        _y: 5,
        _direction: 6,
        page: () => ({ moveType: 2 }),
      },
    ],
  };

  const panel = makePanel({ enemies: [enemy], needsRedraw: false });

  panel.updateEnemyPositions();

  assert.deepEqual(enemy, {
    id: 3,
    x: 4,
    y: 5,
    direction: 6,
    moving: true,
  });
  assert.equal(panel.needsRedraw, true);

  // 状态没变时不重复标脏
  panel.needsRedraw = false;
  panel.updateEnemyPositions();
  assert.equal(panel.needsRedraw, false);

  // 事件已不存在时保持原样
  globalThis.$gameMap._events[3] = null;
  panel.updateEnemyPositions();
  assert.equal(enemy.x, 4);
});

test("MapEventPanel.updateEnemyPositions：抛错时只警告", () => {
  const { warnings, restore } = silenceWarn();
  const panel = makePanel({
    enemies: [{ id: 1 }],
  });
  globalThis.$gameMap = {
    get _events() {
      throw new Error("map unavailable");
    },
  };

  try {
    assert.doesNotThrow(() => panel.updateEnemyPositions());
  } finally {
    restore();
  }

  assert.match(String(warnings[0][0]), /Could not update enemy positions/);
});

test("MapEventPanel.checkForMapChange：地图 ID 为 0 时清空并记住 0", () => {
  const panel = makePanel({
    lastKnownMapId: 9,
    updateCurrentMapData() {
      this.cleared = true;
      return false;
    },
  });

  panel.checkForMapChange();

  assert.equal(panel.cleared, true);
  assert.equal(panel.lastKnownMapId, 0);
});

test("MapEventPanel.checkForMapChange：地图数据未加载完时下周期继续重试", () => {
  globalThis.$gameMap = { mapId: () => 5 };
  globalThis.$dataMap = null;

  const panel = makePanel({
    lastKnownMapId: 4,
    mapData: { width: 1, height: 1 },
    needsRedraw: false,
    updateCurrentMapData() {
      return false;
    },
  });

  panel.checkForMapChange();

  assert.equal(panel.needsRedraw, true);
  // 没加载成功就不要记录新 mapId，否则会永远停在旧地图
  assert.equal(panel.lastKnownMapId, 4);
});

test("MapEventPanel.checkForMapChange：切图成功后分类事件并按需重绘", () => {
  const dataMap = { width: 6, height: 6, events: [] };
  globalThis.$gameMap = { mapId: () => 6, _events: [] };
  globalThis.$dataMap = dataMap;

  const calls = [];
  const panel = makePanel({
    lastKnownMapId: 5,
    needsRedraw: false,
    isCanvasVisible: true,
    updateCurrentMapData() {
      this.mapData = dataMap;
      return true;
    },
    updateMapEvents() {
      calls.push("events");
    },
    renderMap() {
      calls.push("render");
    },
  });

  panel.checkForMapChange();

  assert.deepEqual(calls, ["events", "render"]);
  assert.equal(panel.lastKnownMapId, 6);
  assert.equal(panel.needsRedraw, true);
});

test("MapEventPanel.checkForMapChange：同一张地图换了一份数据（读档）也会刷新", () => {
  const oldData = { width: 6, height: 6, events: [] };
  const newData = { width: 6, height: 6, events: [] };

  globalThis.$gameMap = { mapId: () => 6, _events: [] };
  globalThis.$dataMap = newData;

  let updated = 0;
  const panel = makePanel({
    mapData: oldData,
    lastKnownMapId: 6,
    isCanvasVisible: false,
    updateCurrentMapData() {
      updated++;
      this.mapData = newData;
      return true;
    },
    updateMapEvents() {},
  });

  panel.checkForMapChange();

  assert.equal(updated, 1);
  assert.equal(panel.needsRedraw, true);
});

test("MapEventPanel.checkForMapChange：读取状态抛错时只警告", () => {
  const { warnings, restore } = silenceWarn();
  const panel = makePanel({
    getCurrentMapId() {
      throw new Error("map unavailable");
    },
  });

  try {
    assert.doesNotThrow(() => panel.checkForMapChange());
  } finally {
    restore();
  }

  assert.match(String(warnings[0][0]), /Could not check for map change/);
});

test("MapEventPanel.renderMap：没有 canvas / 数据时安全返回", () => {
  const ctx = createContext();

  // 没有 canvas：直接返回
  assert.doesNotThrow(() => makePanel().renderMap());

  // 有 canvas 但没地图数据：清空画布
  const panel = makePanel({
    $refs: { mapCanvas: createCanvas(ctx) },
  });
  panel.renderMap();
  assert.deepEqual(ctx.calls, [["clearRect", 0, 0, 300, 200]]);
});

test("MapEventPanel.renderMap：限制视图以角色为中心并记录渲染视口", () => {
  const ctx = createContext();
  const canvas = createCanvas(ctx);
  const calls = [];

  const panel = makePanel({
    mapData: { width: 30, height: 30 },
    playerPosition: { x: 20, y: 15 },
    limitedView: true,
    cellSize: 14,
    $refs: { mapCanvas: canvas },
    drawMapGrid(ctx2, sx, sy, ex, ey) {
      calls.push(["grid", sx, sy, ex, ey]);
    },
    drawMapEvents() {
      calls.push(["events"]);
    },
    drawTreasureBoxes() {
      calls.push(["treasure"]);
    },
    drawEnemies() {
      calls.push(["enemies"]);
    },
    drawPlayer() {
      calls.push(["player"]);
    },
  });

  panel.renderMap();

  assert.deepEqual(panel.renderedView, {
    limitedView: true,
    startX: 5,
    startY: 3,
    cellSize: 14,
  });
  assert.deepEqual(calls, [
    ["grid", 5, 3, 30, 28],
    ["events"],
    ["treasure"],
    ["enemies"],
    ["player"],
  ]);
});

test("MapEventPanel.renderMap：靠近地图边缘时回退起点，避免出现空白边", () => {
  const panel = makePanel({
    mapData: { width: 30, height: 30 },
    playerPosition: { x: 1, y: 29 },
    limitedView: true,
    cellSize: 14,
    $refs: { mapCanvas: createCanvas() },
    drawMapGrid(ctx, sx, sy, ex, ey) {
      this.grid = { sx, sy, ex, ey };
    },
    drawMapEvents() {},
    drawTreasureBoxes() {},
    drawEnemies() {},
    drawPlayer() {},
  });

  panel.renderMap();

  // 角色贴近上边缘时视口起点保持 0；贴近下边缘时回退到 30 - 25 = 5
  assert.deepEqual(panel.grid, { sx: 0, sy: 5, ex: 25, ey: 30 });
  assert.deepEqual(panel.renderedView, {
    limitedView: true,
    startX: 0,
    startY: 5,
    cellSize: 14,
  });
});

test("MapEventPanel.renderMap：全图视图从 0,0 开始", () => {
  const panel = makePanel({
    mapData: { width: 12, height: 9 },
    playerPosition: { x: 5, y: 5 },
    limitedView: false,
    cellSize: 8,
    $refs: { mapCanvas: createCanvas() },
    drawMapGrid(ctx, sx, sy, ex, ey) {
      this.grid = { sx, sy, ex, ey };
    },
    drawMapEvents() {},
    drawTreasureBoxes() {},
    drawEnemies() {},
    drawPlayer() {},
  });

  panel.renderMap();

  assert.deepEqual(panel.grid, { sx: 0, sy: 0, ex: 12, ey: 9 });
});

test("MapEventPanel.drawMapGrid：绘制可通行颜色、边界与网格线", () => {
  const ctx = createContext();
  const panel = makePanel({
    mapData: { width: 2, height: 2 },
    cellSize: 10,
    isTilePassable(x, y) {
      return x === 0 && y === 0;
    },
    drawWalkableBoundaries() {
      this.boundaries = true;
    },
  });

  panel.drawMapGrid(ctx, 0, 0, 2, 2);

  // 4 个格子各一次 fillRect + strokeRect
  assert.equal(ctx.calls.filter(([name]) => name === "fillRect").length, 4);
  assert.equal(ctx.calls.filter(([name]) => name === "strokeRect").length, 4);
  assert.equal(panel.boundaries, true);
  assert.equal(ctx.strokeStyle, "#444444");
});

test("MapEventPanel.drawMapGrid：大范围视图跳过逐格边界计算", () => {
  const ctx = createContext();
  let boundaries = 0;
  const panel = makePanel({
    mapData: { width: 60, height: 60 },
    cellSize: 4,
    isTilePassable() {
      return true;
    },
    drawWalkableBoundaries() {
      boundaries++;
    },
  });

  panel.drawMapGrid(ctx, 0, 0, 60, 60);

  assert.equal(boundaries, 0);
  // 用总格数判断：2500 格以内仍逐格计算，超过就跳过
  assert.equal(panel.isTooLargeToDrawWalkableBoundaries(50, 50), false);
  assert.equal(panel.isTooLargeToDrawWalkableBoundaries(51, 50), true);
  assert.equal(panel.isTooLargeToDrawWalkableBoundaries(60, 40), false);
  assert.equal(panel.isTooLargeToDrawWalkableBoundaries(25, 25), false);
});

test("MapEventPanel.isTilePassable：越界 / 任一方向可走 / 无法判断", () => {
  const panel = makePanel({
    mapData: { width: 4, height: 4 },
    isWithinMapBounds: (x, y) => x >= 0 && x < 4 && y >= 0 && y < 4,
  });

  // 没有 $gameMap 时默认可通行
  assert.equal(panel.isTilePassable(1, 1), true);
  assert.equal(panel.isTilePassable(-1, 0), false);

  const checks = [];
  globalThis.$gameMap = {
    isPassable(x, y, direction) {
      checks.push([x, y, direction]);
      return direction === 6;
    },
  };

  assert.equal(panel.isTilePassable(1, 1), true);
  assert.deepEqual(checks, [
    [1, 1, 2],
    [1, 1, 4],
    [1, 1, 6],
  ]);

  // isPassable 抛错时退回可通行，避免整张地图画不出来
  globalThis.$gameMap.isPassable = () => {
    throw new Error("passability unavailable");
  };
  const { warnings, restore } = silenceWarn();
  try {
    assert.equal(panel.isTilePassable(1, 1), true);
  } finally {
    restore();
  }
  assert.match(String(warnings[0][0]), /Error checking passability/);
});

test("MapEventPanel.drawWalkableBoundaries：按 canPass 绘制四向边界", () => {
  const ctx = createContext();
  const panel = makePanel({
    mapData: { width: 3, height: 3 },
    cellSize: 10,
    isTilePassable: () => true,
    isWithinMapBounds: () => true,
  });

  globalThis.$gamePlayer = {
    canPass(x, y, direction) {
      return direction === 6; // 只能向右
    },
  };

  panel.drawWalkableBoundaries(ctx, 0, 0, 1, 1);

  // 左 / 上 / 下各一条线 => 3 次 moveTo + 3 次 lineTo，一次 stroke
  assert.equal(ctx.calls.filter(([name]) => name === "moveTo").length, 3);
  assert.equal(ctx.calls.filter(([name]) => name === "lineTo").length, 3);
  assert.equal(ctx.calls.filter(([name]) => name === "stroke").length, 1);
});

test("MapEventPanel.drawWalkableBoundaries：没有 canPass 时跳过该格", () => {
  const ctx = createContext();
  const panel = makePanel({
    mapData: { width: 3, height: 3 },
    cellSize: 10,
    isTilePassable: () => true,
    isWithinMapBounds: () => true,
  });

  globalThis.$gamePlayer = null;

  panel.drawWalkableBoundaries(ctx, 0, 0, 1, 1);

  assert.deepEqual(ctx.calls, []);
});

test("MapEventPanel.isWithinMapBounds：按 isValid / 宽高 / 地图数据逐级回退", () => {
  const panel = makePanel();

  // 1. 优先 isValid
  globalThis.$gameMap = {
    isValid: (x, y) => x === 1 && y === 1,
    width: () => 9,
    height: () => 9,
  };
  assert.equal(panel.isWithinMapBounds(1, 1), true);
  assert.equal(panel.isWithinMapBounds(2, 2), false);

  // 2. 没有 isValid 时使用 width / height
  delete globalThis.$gameMap.isValid;
  assert.equal(panel.isWithinMapBounds(8, 8), true);
  assert.equal(panel.isWithinMapBounds(9, 0), false);

  // 3. 没有 $gameMap 时使用 mapData（引擎里会显式为 null，而不是未定义）
  globalThis.$gameMap = null;
  panel.mapData = { width: 3, height: 2 };
  assert.equal(panel.isWithinMapBounds(2, 1), true);
  assert.equal(panel.isWithinMapBounds(3, 0), false);

  // 4. 什么都没有时不可通行
  panel.mapData = null;
  assert.equal(panel.isWithinMapBounds(0, 0), false);

  // 5. 抛错时返回 false
  globalThis.$gameMap = {
    isValid() {
      throw new Error("bounds unavailable");
    },
  };
  const { warnings, restore } = silenceWarn();
  try {
    assert.equal(panel.isWithinMapBounds(1, 1), false);
  } finally {
    restore();
  }
  assert.match(String(warnings[0][0]), /Could not check map bounds/);
});

test("MapEventPanel 绘制事件 / 敌人 / 宝箱 / 角色：只在可视范围内绘制", () => {
  const ctx = createContext();
  const panel = makePanel({
    mapData: { width: 10, height: 10 },
    limitedView: true,
    cellSize: 10,
    regularEvents: [
      { x: 1, y: 1 },
      { x: 9, y: 9 },
    ],
    enemies: [
      { x: 2, y: 2, direction: 6, moving: true },
      { x: 8, y: 8, direction: 2, moving: false },
    ],
    treasureBoxes: [
      { x: 3, y: 3 },
      { x: 7, y: 7 },
    ],
    playerPosition: { x: 4, y: 4 },
  });

  panel.drawMapEvents(ctx, 0, 0);
  panel.drawEnemies(ctx, 0, 0);
  panel.drawTreasureBoxes(ctx, 0, 0);
  panel.drawPlayer(ctx, 0, 0);

  // 视口只有 25x25，两个事件、两个敌人、两个宝箱和角色都在范围内
  assert.equal(ctx.calls.filter(([name]) => name === "fillText").length, 2);
  assert.ok(ctx.calls.some(([name]) => name === "arc"));
  assert.ok(ctx.calls.some(([name]) => name === "strokeRect"));

  // 把视口挪到别处后，所有对象都不在范围内
  const emptyCtx = createContext();
  panel.drawMapEvents(emptyCtx, 20, 20);
  panel.drawEnemies(emptyCtx, 20, 20);
  panel.drawTreasureBoxes(emptyCtx, 20, 20);
  panel.drawPlayer(emptyCtx, 20, 20);
  assert.deepEqual(emptyCtx.calls, []);
});

test("MapEventPanel.drawEnemies：每个方向都有指示器，默认方向画圆点", () => {
  const directions = [2, 4, 6, 8, 0];

  for (const direction of directions) {
    const ctx = createContext();
    const panel = makePanel({
      mapData: { width: 5, height: 5 },
      cellSize: 12,
      enemies: [{ x: 1, y: 1, direction, moving: true }],
    });

    panel.drawEnemies(ctx, 0, 0);

    assert.ok(
      ctx.calls.some(([name]) => name === "fill"),
      `方向 ${direction} 没有绘制指示器`,
    );
    if (direction === 0) {
      // 默认分支画的是小圆点
      assert.ok(ctx.calls.some(([name]) => name === "arc"));
    } else {
      assert.ok(ctx.calls.some(([name]) => name === "moveTo"));
      assert.ok(ctx.calls.some(([name]) => name === "lineTo"));
    }
  }
});

test("MapEventPanel.onCanvasClick：没有渲染记录时按角色位置换算视口", () => {
  let teleported = null;
  const panel = makePanel({
    clickToTeleportEnabled: true,
    mapData: { width: 30, height: 30 },
    limitedView: true,
    cellSize: 10,
    playerPosition: { x: 20, y: 20 },
    $refs: {
      mapCanvas: {
        getBoundingClientRect: () => ({ left: 10, top: 20 }),
      },
    },
    teleportPlayerTo(x, y) {
      teleported = { x, y };
    },
  });

  // 点击画布 (30, 30) => 格子 (3, 3)；视口回退到 (5, 5) => 地图 (8, 8)
  panel.onCanvasClick({ clientX: 40, clientY: 50 });

  assert.deepEqual(teleported, { x: 8, y: 8 });
});

test("MapEventPanel.onCanvasClick：使用最近一次渲染视口，越界时只警告", () => {
  let teleported = null;
  const { warnings, restore } = silenceWarn();
  const panel = makePanel({
    clickToTeleportEnabled: true,
    mapData: { width: 30, height: 30 },
    limitedView: true,
    cellSize: 10,
    playerPosition: { x: 20, y: 20 },
    renderedView: { limitedView: true, startX: 5, startY: 5, cellSize: 10 },
    $refs: {
      mapCanvas: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      },
    },
    teleportPlayerTo(x, y) {
      teleported = { x, y };
    },
  });

  panel.onCanvasClick({ clientX: 25, clientY: 35 });
  assert.deepEqual(teleported, { x: 7, y: 8 });

  // 负数坐标不会被传送
  teleported = null;
  panel.onCanvasClick({ clientX: -100, clientY: -100 });
  assert.equal(teleported, null);
  restore();

  assert.ok(
    warnings.some((args) => String(args[0]).includes("outside map bounds")),
  );
});

test("MapEventPanel.onCanvasClick：功能关闭 / 无地图 / 无 canvas 时直接返回", () => {
  let teleported = 0;
  const panel = makePanel({
    clickToTeleportEnabled: true,
    mapData: { width: 4, height: 4 },
    $refs: { mapCanvas: createCanvas() },
    teleportPlayerTo() {
      teleported++;
    },
  });

  panel.onCanvasClick({ clientX: 10, clientY: 20 });
  assert.equal(teleported, 1);

  panel.clickToTeleportEnabled = false;
  panel.onCanvasClick({ clientX: 10, clientY: 20 });

  panel.clickToTeleportEnabled = true;
  panel.mapData = null;
  panel.onCanvasClick({ clientX: 10, clientY: 20 });

  panel.mapData = { width: 4, height: 4 };
  panel.$refs = {};
  panel.onCanvasClick({ clientX: 10, clientY: 20 });

  assert.equal(teleported, 1);
});

test("MapEventPanel.data / created / mounted / watch 生命周期", () => {
  const data = MapEventPanel.data.call({
    loadSetting(key, fallback) {
      if (key === "mapEventPanel_limitedView") return false;
      if (key === "mapEventPanel_clickToTeleport") return false;
      if (key === "mapEventPanel_readInterval") return "750";
      return fallback;
    },
    normalizeReadInterval(value) {
      return Number(value);
    },
  });

  assert.equal(data.limitedView, false);
  assert.equal(data.clickToTeleportEnabled, false);
  assert.equal(data.readInterval, 750);
  assert.equal(data.canvasWidth, 550);
  assert.equal(data.canvasHeight, 550);
  assert.equal(data.maxViewSize, 25);
  assert.equal(data.needsRedraw, true);

  let initialized = 0;
  MapEventPanel.created.call({
    initializeMapDisplay() {
      initialized++;
    },
  });
  assert.equal(initialized, 1);

  const mountedCalls = [];
  const panel = {
    isCanvasVisible: false,
    $nextTick(callback) {
      callback();
    },
    setupCanvasVisibilityObserver() {
      mountedCalls.push("observe");
    },
    renderMap() {
      mountedCalls.push("render");
    },
  };

  MapEventPanel.mounted.call(panel);
  assert.deepEqual(mountedCalls, ["observe"]);

  panel.isCanvasVisible = true;
  MapEventPanel.mounted.call(panel);
  assert.deepEqual(mountedCalls, ["observe", "observe", "render"]);

  const saved = [];
  const watched = {
    isCanvasVisible: true,
    saveSetting(key, value) {
      saved.push([key, value]);
    },
    updateCanvasSize() {
      saved.push(["size"]);
    },
    $nextTick(callback) {
      callback();
    },
    renderMap() {
      saved.push(["render"]);
    },
  };

  MapEventPanel.watch.limitedView.call(watched, false);
  assert.deepEqual(saved, [
    ["mapEventPanel_limitedView", false],
    ["size"],
    ["render"],
  ]);

  saved.length = 0;
  MapEventPanel.watch.clickToTeleportEnabled.call(watched, false);
  assert.deepEqual(saved, [["mapEventPanel_clickToTeleport", false]]);
});

test("MapEventPanel.beforeUnmount：断开观察者并清理定时器", () => {
  const originalClearInterval = globalThis.clearInterval;
  const cleared = [];
  globalThis.clearInterval = (id) => cleared.push(id);

  const disconnected = [];
  const panel = makePanel({
    renderIntervalId: 5,
    visibilityObserver: {
      disconnect() {
        disconnected.push(true);
      },
    },
  });

  try {
    panel.beforeUnmount();
  } finally {
    globalThis.clearInterval = originalClearInterval;
  }

  assert.deepEqual(disconnected, [true]);
  assert.deepEqual(cleared, [5]);
  assert.equal(panel.renderIntervalId, null);
});

test("MapEventPanel.beforeUnmount：清理过程抛错也不影响卸载", () => {
  const originalClearInterval = globalThis.clearInterval;
  globalThis.clearInterval = () => {
    throw new Error("timer unavailable");
  };

  const panel = makePanel({
    renderIntervalId: 5,
    visibilityObserver: {
      disconnect() {
        throw new Error("observer unavailable");
      },
    },
  });

  try {
    assert.doesNotThrow(() => panel.beforeUnmount());
  } finally {
    globalThis.clearInterval = originalClearInterval;
  }
});

test("MapEventPanel.activated / deactivated：恢复与停止轮询、可见性监听", () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timers = new Map();
  const cleared = [];
  let nextId = 1;

  globalThis.setInterval = (callback, delay) => {
    const id = nextId++;
    timers.set(id, { callback, delay });
    return id;
  };
  globalThis.clearInterval = (id) => {
    cleared.push(id);
    timers.delete(id);
  };

  const calls = [];
  const panel = makePanel({
    isCanvasVisible: true,
    setupCanvasVisibilityObserver() {
      calls.push("setup");
    },
    teardownCanvasVisibilityObserver() {
      calls.push("teardown");
    },
    renderMap() {
      calls.push("render");
    },
  });

  try {
    panel.activated();
    assert.equal(timers.size, 1);
    assert.deepEqual(calls, ["setup", "render"]);

    panel.deactivated();
    assert.equal(timers.size, 0);
    assert.deepEqual(cleared, [1]);
    assert.deepEqual(calls, ["setup", "render", "teardown"]);

    panel.activated();
    assert.equal(timers.size, 1, "重新激活后应恢复轮询");
    assert.deepEqual(calls, ["setup", "render", "teardown", "setup", "render"]);

    panel.deactivated();
    assert.equal(timers.size, 0);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("MapEventPanel：切走后延迟执行的 $nextTick 不再恢复观察者", () => {
  let setups = 0;
  let pendingTick = null;
  const panel = makePanel({
    $nextTick(callback) {
      pendingTick = callback;
    },
    setupCanvasVisibilityObserver() {
      setups += 1;
    },
  });

  panel.activated();
  assert.equal(typeof pendingTick, "function");

  panel.deactivated();
  pendingTick();

  assert.equal(setups, 0);
});

test("MapEventPanel.getSettingsStorage reuses shared storage", () => {
  const first = MapEventPanel.methods.getSettingsStorage.call({});
  const second = MapEventPanel.methods.getSettingsStorage.call({});

  assert.ok(first);
  assert.equal(first, second);
  assert.equal(typeof first.getItem, "function");
  assert.equal(typeof first.setItem, "function");
});

test("MapEventPanel.isTilePassable defaults to true without $gameMap", () => {
  const panel = makePanel({
    mapData: { width: 5, height: 5, events: [] },
  });

  globalThis.$gameMap = { width: () => 5, height: () => 5 };

  assert.equal(panel.isTilePassable(1, 1), true);
  assert.equal(panel.isTilePassable(10, 10), false);
});

test("MapEventPanel.updatePlayerPosition redraws when either axis changes", () => {
  globalThis.$gamePlayer = { x: 1, y: 2 };

  const panel = makePanel({
    playerPosition: { x: 0, y: 0 },
    needsRedraw: false,
  });
  panel.updatePlayerPosition();
  assert.deepEqual(panel.playerPosition, { x: 1, y: 2 });
  assert.equal(panel.needsRedraw, true);

  panel.needsRedraw = false;
  panel.updatePlayerPosition();
  assert.equal(panel.needsRedraw, false);

  globalThis.$gamePlayer = { x: 1, y: 3 };
  panel.updatePlayerPosition();
  assert.deepEqual(panel.playerPosition, { x: 1, y: 3 });
  assert.equal(panel.needsRedraw, true);
});

test("MapEventPanel.drawWalkableBoundaries draws right border", () => {
  const ctx = createContext();

  globalThis.$gamePlayer = {
    canPass(x, y, direction) {
      return direction !== 6;
    },
  };

  const panel = makePanel({
    cellSize: 10,
    isTilePassable: () => true,
    mapData: { width: 2, height: 2, events: [] },
  });

  globalThis.$gameMap = { mapId: () => 1, isPassable: () => true };
  globalThis.$dataMap = { width: 2, height: 2, events: [] };

  panel.drawWalkableBoundaries(ctx, 0, 0, 1, 1);

  assert.ok(
    ctx.calls.some(([name, x, y]) => name === "moveTo" && x === 10 && y === 0),
  );
});

/* ------------------------------------------------------------ 事件工具 */

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

function installReadyGame() {
  globalThis.$gamePlayer = { x: 1, y: 1 };
  globalThis.$gameParty = {};
  globalThis.$gameSystem = {};
  globalThis.$gameMap = { event: () => null, _interpreter: null };
}

function makeSelfSwitchStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];

  return {
    values,
    writes,
    value(target) {
      return values.get(target.join(":")) || false;
    },
    setValue(target, value) {
      writes.push([target, value]);
      values.set(target.join(":"), value);
    },
  };
}

test("MapEventPanel：事件 / 公共事件下拉选项", () => {
  const panel = makePanel({
    mapEvents: [
      { id: 1, name: "Door", x: 2, y: 3 },
      { id: 2, name: "Chest", x: 4, y: 5 },
    ],
    eventTools: {
      show: false,
      selectedEventId: 1,
      selfSwitches: { A: false, B: false, C: false, D: false },
      commonEventId: null,
    },
  });

  globalThis.$dataCommonEvents = [
    null,
    { name: "Teleport" },
    { name: "" },
    { name: "Ending" },
  ];

  assert.deepEqual(
    panel.eventOptions.map((option) => option.id),
    [1, 2],
  );
  assert.equal(panel.selectedEventOption.title, "1: Door");
  assert.deepEqual(
    panel.commonEventOptions.map((option) => option.id),
    [1, 3],
  );

  panel.eventTools.selectedEventId = 99;
  assert.equal(panel.selectedEventOption, null);
});

test("MapEventPanel.initializeEventTools：优先当前解释器事件并读取独立开关", () => {
  const selfSwitches = makeSelfSwitchStore({ "5:2:A": true });

  globalThis.$gameMap = {
    _interpreter: { eventId: () => 2 },
    eventIdXy: () => 0,
  };
  globalThis.$gamePlayer = { x: 1, y: 1, direction: () => 2 };
  globalThis.$gameSelfSwitches = selfSwitches;

  const panel = makePanel({
    currentMapId: 5,
    mapEvents: [
      { id: 1, name: "Door", x: 2, y: 3 },
      { id: 2, name: "Chest", x: 4, y: 5 },
    ],
  });

  panel.initializeEventTools();

  assert.equal(panel.eventTools.selectedEventId, 2);
  assert.deepEqual(panel.eventTools.selfSwitches, {
    A: true,
    B: false,
    C: false,
    D: false,
  });
});

test("MapEventPanel.initializeEventTools：没有解释器时回退到面向事件 / 第一个事件", () => {
  globalThis.$gameMap = {
    _interpreter: null,
    eventIdXy: (x, y) => (x === 2 && y === 1 ? 7 : 0),
  };
  globalThis.$gamePlayer = { x: 1, y: 1, direction: () => 6 };

  const panel = makePanel({
    currentMapId: 3,
    mapEvents: [
      { id: 1, name: "A", x: 1, y: 1 },
      { id: 7, name: "B", x: 2, y: 1 },
    ],
  });

  panel.initializeEventTools();
  assert.equal(panel.eventTools.selectedEventId, 7);

  globalThis.$gameMap.eventIdXy = () => 0;
  panel.initializeEventTools();
  assert.equal(panel.eventTools.selectedEventId, 1);

  panel.mapEvents = [];
  panel.initializeEventTools();
  assert.equal(panel.eventTools.selectedEventId, 0);
  assert.deepEqual(panel.eventTools.selfSwitches, {
    A: false,
    B: false,
    C: false,
    D: false,
  });
});

test("MapEventPanel.getFacingEventId：按方向找前方事件，异常时返回 0", () => {
  const panel = makePanel();

  globalThis.$gamePlayer = { x: 5, y: 5, direction: () => 6 };
  globalThis.$gameMap = {
    eventIdXy(x, y) {
      return x === 6 && y === 5 ? 9 : 0;
    },
  };
  assert.equal(panel.getFacingEventId(), 9);

  globalThis.$gamePlayer.direction = () => 2;
  globalThis.$gameMap.eventIdXy = (x, y) => (y === 6 ? 10 : 0);
  assert.equal(panel.getFacingEventId(), 10);

  globalThis.$gamePlayer.direction = () => 4;
  globalThis.$gameMap.eventIdXy = () => 0;
  assert.equal(panel.getFacingEventId(), 0);

  globalThis.$gameMap.eventIdXy = () => {
    throw new Error("broken map");
  };
  assert.equal(panel.getFacingEventId(), 0);

  delete globalThis.$gameMap;
  assert.equal(panel.getFacingEventId(), 0);
});

test("MapEventPanel.onEventSelectionChange / onSelfSwitchChange：写入并刷新", () => {
  const alerts = captureAlerts();
  const selfSwitches = makeSelfSwitchStore();
  const panel = makePanel({ currentMapId: 4 });

  installReadyGame();
  globalThis.$gameSelfSwitches = selfSwitches;

  panel.onEventSelectionChange("7");
  assert.equal(panel.eventTools.selectedEventId, 7);

  panel.onEventSelectionChange("bad");
  assert.equal(panel.eventTools.selectedEventId, 0);

  panel.eventTools.selectedEventId = 7;
  assert.equal(panel.onSelfSwitchChange("B", true), true);
  assert.deepEqual(selfSwitches.writes, [[[4, 7, "B"], true]]);
  assert.equal(panel.eventTools.selfSwitches.B, true);

  assert.equal(panel.onSelfSwitchChange("C", 1), true);
  assert.equal(panel.eventTools.selfSwitches.C, false, "非 true 归一化为关闭");
  assert.equal(alerts.length, 0);
});

test("MapEventPanel.onSelfSwitchChange：游戏未就绪 / 写入失败时回滚显示", () => {
  const alerts = captureAlerts();
  const panel = makePanel({ currentMapId: 4 });
  panel.eventTools.selectedEventId = 7;
  panel.eventTools.selfSwitches.B = true;

  // 未就绪：提示并恢复成读取值（此时没有 $gameSelfSwitches，全部 false）
  assert.equal(panel.onSelfSwitchChange("B", true), false);
  assert.equal(panel.eventTools.selfSwitches.B, false);
  assert.equal(alerts.at(-1).level, "warn");

  installReadyGame();
  globalThis.$gameSelfSwitches = {
    value: () => false,
    setValue() {
      throw new Error("write failed");
    },
  };

  assert.equal(panel.onSelfSwitchChange("A", true), false);
  assert.equal(alerts.at(-1).level, "error");
  assert.equal(panel.eventTools.selfSwitches.A, false);
});

test("MapEventPanel.runSelectedEvent：执行当前页并处理无页面 / 忙 / 缺解释器", () => {
  const alerts = captureAlerts();
  const setupCalls = [];
  const list = [{ code: 101, parameters: ["Hello"] }];

  installReadyGame();
  globalThis.$gameMap = {
    event(id) {
      return id === 5
        ? {
            page() {
              return { list };
            },
          }
        : null;
    },
    _interpreter: {
      setup(commands, eventId) {
        setupCalls.push([commands, eventId]);
      },
      isRunning: () => false,
    },
  };

  const panel = makePanel();
  panel.eventTools.selectedEventId = 5;

  assert.equal(panel.runSelectedEvent(), true);
  assert.deepEqual(setupCalls, [[list, 5]]);
  assert.equal(alerts.at(-1).level, "success");

  panel.eventTools.selectedEventId = 99;
  assert.equal(panel.runSelectedEvent(), false);
  assert.equal(alerts.at(-1).level, "warn");

  globalThis.$gameMap = {
    event: () => ({ page: () => ({ list }) }),
    _interpreter: { setup() {}, isRunning: () => true },
  };
  panel.eventTools.selectedEventId = 5;
  assert.equal(panel.runSelectedEvent(), false);
  assert.match(alerts.at(-1).msg, /执行|busy|running/i);

  globalThis.$gameMap._interpreter = {};
  assert.equal(panel.runSelectedEvent(), false);
  assert.equal(alerts.at(-1).level, "error");
});

test("MapEventPanel.runCommonEvent：校验并排队公共事件", () => {
  const alerts = captureAlerts();
  const queued = [];

  installReadyGame();
  globalThis.$dataCommonEvents = [null, { name: "Teleport" }, { name: "" }];
  globalThis.$gameTemp = {
    reserveCommonEvent(id) {
      queued.push(id);
    },
  };

  const panel = makePanel();
  panel.eventTools.commonEventId = 1;

  assert.equal(panel.runCommonEvent(), true);
  assert.deepEqual(queued, [1]);
  assert.equal(alerts.at(-1).level, "success");

  panel.eventTools.commonEventId = 2;
  assert.equal(panel.runCommonEvent(), false);
  assert.equal(alerts.at(-1).level, "warn");
  assert.deepEqual(queued, [1]);

  panel.eventTools.commonEventId = 1;
  globalThis.$gameTemp = null;
  assert.equal(panel.runCommonEvent(), false);
  assert.equal(alerts.at(-1).level, "error");
});

test("MapEventPanel.confirmTriggerSelectedEvent / reloadEventTools", () => {
  const originalShow = ConfirmDialog.show;
  const calls = [];

  try {
    ConfirmDialog.show = (options) => {
      calls.push(options);
    };

    const panel = makePanel();
    panel.eventTools.selectedEventId = 0;
    panel.confirmTriggerSelectedEvent();
    assert.equal(calls.length, 0, "未选择事件时不弹确认框");

    panel.eventTools.selectedEventId = 3;
    panel.runSelectedEvent = () => calls.push("run");

    panel.confirmTriggerSelectedEvent();
    assert.equal(calls.length, 1);
    assert.match(calls[0].message, /#3/);

    calls[0].actions.at(-1).action();
    assert.equal(calls.at(-1), "run");
  } finally {
    ConfirmDialog.show = originalShow;
  }

  const events = [];
  const panel = makePanel({
    updateMapEvents() {
      events.push("update");
    },
    initializeEventTools() {
      events.push("init");
    },
  });

  panel.reloadEventTools();
  assert.deepEqual(events, ["update", "init"]);
});
