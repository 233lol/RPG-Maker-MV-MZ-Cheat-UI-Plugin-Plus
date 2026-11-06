import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import MapEventPanel from "../../cheat-engine/www/cheat/panels/MapEventPanel.js";
import SaveRecallPanel from "../../cheat-engine/www/cheat/panels/SaveRecallPanel.js";
import TeleportPanel from "../../cheat-engine/www/cheat/panels/TeleportPanel.js";
import SaveBackupPanel from "../../cheat-engine/www/cheat/panels/SaveBackupPanel.js";
import { SaveBackupCheat } from "../../cheat-engine/www/cheat/js/SaveBackupHelper.js";
import { KEY_VALUE_STORAGE } from "../../cheat-engine/www/cheat/js/KeyValueStorage.js";
import { ConfirmDialog } from "../../cheat-engine/www/cheat/js/DialogHelper.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";

const originalStorageGet = KEY_VALUE_STORAGE.getItem;
const originalStorageSet = KEY_VALUE_STORAGE.setItem;
const originalDialogShow = ConfirmDialog.show;
const originalDialogClose = ConfirmDialog.close;

function makePanel(definition, overrides = {}) {
  return {
    ...definition.methods,
    ...overrides,
  };
}

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

afterEach(() => {
  for (const name of [
    "$dataMap",
    "$dataMapInfos",
    "$gameMap",
    "$gamePlayer",
    "$gameParty",
    "$gameSystem",
  ]) {
    delete globalThis[name];
  }

  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.FileReader;

  KEY_VALUE_STORAGE.getItem = originalStorageGet;
  KEY_VALUE_STORAGE.setItem = originalStorageSet;
  ConfirmDialog.show = originalDialogShow;
  ConfirmDialog.close = originalDialogClose;

  Alert.handler = null;
  Alert.pending = [];
});

/* ---------------------------------------------------------------- MapEventPanel */

function makeSettingsStorage(initial = {}) {
  const data = new Map(Object.entries(initial));

  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

function makeMapEventPanel(storage, overrides = {}) {
  return makePanel(MapEventPanel, {
    getSettingsStorage: () => storage,
    ...overrides,
  });
}

test("MapEventPanel.loadSetting / saveSetting：只读写统一设置存储", () => {
  const storage = makeSettingsStorage({
    good: JSON.stringify({ a: 1 }),
    bad: "{bad",
  });

  const panel = makeMapEventPanel(storage);
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.deepEqual(panel.loadSetting("good", null), { a: 1 });
    assert.equal(panel.loadSetting("missing", 5), 5);
    assert.equal(panel.loadSetting("bad", "fallback"), "fallback");

    panel.saveSetting("saved", { b: 2 });
    assert.equal(storage.getItem("saved"), '{"b":2}');
  } finally {
    console.warn = originalWarn;
  }
});

test("MapEventPanel：不读写 localStorage（NW.js 多个游戏共用一个用户目录）", () => {
  let touched = 0;

  globalThis.window = {};
  globalThis.localStorage = {
    getItem() {
      touched += 1;
      return "should-not-be-read";
    },
    setItem() {
      touched += 1;
    },
  };

  const storage = makeSettingsStorage();
  const panel = makeMapEventPanel(storage);

  assert.equal(panel.loadSetting("missing", "default"), "default");
  panel.saveSetting("saved", 1);

  assert.equal(touched, 0);
  assert.equal(storage.getItem("saved"), "1");
});

test("MapEventPanel：读取间隔会收敛到 100-1000ms", () => {
  const panel = makePanel(MapEventPanel);

  assert.equal(panel.normalizeReadInterval(500), 500);
  assert.equal(panel.normalizeReadInterval("250"), 250);
  assert.equal(panel.normalizeReadInterval(50), 100);
  assert.equal(panel.normalizeReadInterval(5000), 1000);
  assert.equal(panel.normalizeReadInterval("bad"), 500);
  assert.equal(panel.normalizeReadInterval(null), 500);
  assert.equal(panel.normalizeReadInterval(250.9), 250);
});

test("MapEventPanel.onReadIntervalChange：保存合法值并重建定时器", () => {
  const storage = makeSettingsStorage();

  const timers = [];
  const cleared = [];
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (fn, ms) => {
    const id = timers.length + 1;
    timers.push({ id, fn, ms });
    return id;
  };
  globalThis.clearInterval = (id) => cleared.push(id);

  const panel = makeMapEventPanel(storage, {
    readInterval: 50,
    renderIntervalId: 99,
    isCanvasVisible: false,
    needsRedraw: false,
  });

  try {
    panel.onReadIntervalChange();

    assert.equal(panel.readInterval, 100);
    assert.equal(storage.getItem("mapEventPanel_readInterval"), "100");
    assert.deepEqual(cleared, [99]);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 100);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("MapEventPanel：当前地图 / 地图数据就绪判断", () => {
  const panel = makePanel(MapEventPanel);

  assert.equal(panel.getCurrentMapId(), 0);

  globalThis.$gameMap = { mapId: () => 3 };
  assert.equal(panel.getCurrentMapId(), 3);

  globalThis.$gameMap = { mapId: () => 0 };
  assert.equal(panel.getCurrentMapId(), 0);

  globalThis.$gameMap = {
    mapId() {
      throw new Error("not ready");
    },
  };
  assert.equal(panel.getCurrentMapId(), 0);

  assert.equal(panel.isMapDataReady(null), false);
  assert.equal(panel.isMapDataReady({}), false);
  assert.equal(panel.isMapDataReady({ width: 10 }), false);
  assert.equal(panel.isMapDataReady({ width: 10, height: 20 }), true);
});

test("MapEventPanel.updateCurrentMapData / clearMapData：无地图时清空，有数据时标记重绘", () => {
  const cleared = [];
  const panel = makePanel(MapEventPanel, {
    clearMapData() {
      cleared.push("clear");
    },
    updateCanvasSize() {
      this.updated = true;
    },
    mapData: null,
    currentMapId: 0,
    needsRedraw: false,
  });

  assert.equal(panel.updateCurrentMapData(), false);
  assert.equal(cleared.length, 1);

  globalThis.$gameMap = { mapId: () => 2 };
  globalThis.$dataMap = { width: 20, height: 10 };

  assert.equal(panel.updateCurrentMapData(), true);
  assert.equal(panel.currentMapId, 2);
  assert.equal(panel.mapData, globalThis.$dataMap);
  assert.equal(panel.needsRedraw, true);
  assert.equal(panel.updated, true);
});

test("MapEventPanel.clearMapData / clearCanvas：清空状态与画布", () => {
  const calls = [];
  const panel = makePanel(MapEventPanel, {
    mapData: { width: 1, height: 1 },
    mapEvents: [1],
    regularEvents: [2],
    enemies: [3],
    treasureBoxes: [4],
    renderedView: {},
    needsRedraw: false,
    $refs: {
      mapCanvas: {
        width: 100,
        height: 50,
        getContext() {
          return {
            clearRect: (...args) => calls.push(args),
          };
        },
      },
    },
  });

  panel.clearMapData();

  assert.equal(panel.mapData, null);
  assert.deepEqual(panel.mapEvents, []);
  assert.deepEqual(panel.regularEvents, []);
  assert.deepEqual(panel.enemies, []);
  assert.deepEqual(panel.treasureBoxes, []);
  assert.equal(panel.renderedView, null);
  assert.equal(panel.needsRedraw, true);
  assert.deepEqual(calls, [[0, 0, 100, 50]]);

  // 没有画布 / getContext 抛错都不影响清理
  panel.$refs = {};
  assert.doesNotThrow(() => panel.clearCanvas());
});

test("MapEventPanel：显示尺寸、画布样式与视口内边界判断", () => {
  const panel = makePanel(MapEventPanel, {
    limitedView: true,
    maxViewSize: 25,
    mapData: { width: 40, height: 10 },
    clickToTeleportEnabled: true,
  });

  assert.equal(MapEventPanel.computed.displayMapWidth.call(panel), 25);
  assert.equal(MapEventPanel.computed.displayMapHeight.call(panel), 10);
  assert.equal(
    MapEventPanel.computed.displayMapWidth.call({ mapData: null }),
    0,
  );
  assert.equal(
    MapEventPanel.computed.displayMapHeight.call({ mapData: null }),
    0,
  );

  panel.limitedView = false;
  assert.equal(MapEventPanel.computed.displayMapWidth.call(panel), 40);

  assert.deepEqual(MapEventPanel.computed.canvasStyle.call(panel), {
    border: "1px solid #ccc",
    backgroundColor: "#000",
    cursor: "pointer",
  });

  panel.clickToTeleportEnabled = false;
  assert.equal(
    MapEventPanel.computed.canvasStyle.call(panel).cursor,
    "default",
  );
});

test("MapEventPanel.isTooLargeToDrawWalkableBoundaries / isWithinMapBounds / isTilePassable", () => {
  const panel = makePanel(MapEventPanel, {
    mapData: { width: 10, height: 10 },
  });

  globalThis.$gameMap = null;

  assert.equal(panel.isTooLargeToDrawWalkableBoundaries(51, 50), true);
  assert.equal(panel.isTooLargeToDrawWalkableBoundaries(100, 25), false);
  assert.equal(panel.isTooLargeToDrawWalkableBoundaries(50, 49), false);

  assert.equal(panel.isWithinMapBounds(1, 1), true);
  assert.equal(panel.isWithinMapBounds(-1, 1), false);
  assert.equal(panel.isWithinMapBounds(10, 1), false);

  globalThis.$gameMap = { isValid: (x, y) => x === y };
  assert.equal(panel.isWithinMapBounds(2, 2), true);
  assert.equal(panel.isWithinMapBounds(2, 3), false);

  globalThis.$gameMap = {
    width: () => 5,
    height: () => 4,
  };
  assert.equal(panel.isWithinMapBounds(4, 3), true);
  assert.equal(panel.isWithinMapBounds(5, 3), false);

  globalThis.$gameMap = null;
  globalThis.$dataMap = { width: 3, height: 2 };
  panel.mapData = { width: 3, height: 2 };
  assert.equal(panel.isWithinMapBounds(2, 1), true);
  assert.equal(panel.isWithinMapBounds(3, 1), false);

  globalThis.$gameMap = {
    isValid: (x, y) => x >= 0 && x < 5 && y >= 0 && y < 5,
    isPassable: (x, y, direction) => x === 1 && direction === 2,
  };
  panel.mapData = { width: 5, height: 5 };
  assert.equal(panel.isTilePassable(1, 1), true);
  assert.equal(panel.isTilePassable(2, 2), false);
  assert.equal(panel.isTilePassable(99, 99), false);

  globalThis.$gameMap = {
    isValid: () => true,
    isPassable() {
      throw new Error("bad map");
    },
  };
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.equal(panel.isTilePassable(1, 1), true);
  } finally {
    console.warn = originalWarn;
  }
});

test("MapEventPanel.teleportPlayerTo：调用玩家定位方法，异常只警告", () => {
  const calls = [];
  globalThis.$gamePlayer = {
    setPosition: (x, y) => calls.push(["position", x, y]),
    center: (x, y) => calls.push(["center", x, y]),
    makeEncounterCount: () => calls.push(["encounter"]),
  };

  const panel = makePanel(MapEventPanel);
  panel.teleportPlayerTo(3, 4);

  assert.deepEqual(calls, [
    ["position", 3, 4],
    ["center", 3, 4],
    ["encounter"],
  ]);

  delete globalThis.$gamePlayer;
  assert.doesNotThrow(() => panel.teleportPlayerTo(1, 1));

  globalThis.$gamePlayer = {
    setPosition() {
      throw new Error("bad player");
    },
  };
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.doesNotThrow(() => panel.teleportPlayerTo(1, 1));
  } finally {
    console.warn = originalWarn;
  }
});

test("MapEventPanel.onCanvasClick：按当前视口换算坐标，越界不传送", () => {
  const teleports = [];
  const panel = makePanel(MapEventPanel, {
    clickToTeleportEnabled: true,
    mapData: { width: 20, height: 20 },
    limitedView: false,
    cellSize: 10,
    renderedView: null,
    playerPosition: { x: 10, y: 10 },
    maxViewSize: 25,
    $refs: {
      mapCanvas: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      },
    },
    teleportPlayerTo: (x, y) => teleports.push([x, y]),
  });

  panel.onCanvasClick({ clientX: 25, clientY: 35 });
  assert.deepEqual(teleports, [[2, 3]]);

  panel.onCanvasClick({ clientX: 1000, clientY: 10 });
  assert.deepEqual(teleports, [[2, 3]]);

  panel.limitedView = true;
  panel.renderedView = {
    limitedView: true,
    cellSize: 10,
    startX: 5,
    startY: 6,
  };
  panel.onCanvasClick({ clientX: 25, clientY: 35 });
  assert.deepEqual(teleports, [
    [2, 3],
    [7, 9],
  ]);

  panel.clickToTeleportEnabled = false;
  panel.onCanvasClick({ clientX: 25, clientY: 35 });
  assert.equal(teleports.length, 2);
});

/* --------------------------------------------------------------- SaveRecallPanel */

test("SaveRecallPanel.getMapAncestors / getMapFullPath：沿父链拼接地图名", async () => {
  globalThis.$dataMapInfos = [
    null,
    { id: 1, name: "World", parentId: 0 },
    { id: 2, name: "Town", parentId: 1 },
    { id: 3, name: "Inn", parentId: 2 },
  ];

  const panel = makePanel(SaveRecallPanel);

  const path = [];
  panel.getMapAncestors(3, path);
  assert.deepEqual(path, [1, 2, 3]);

  const cycle = [];
  globalThis.$dataMapInfos[1].parentId = 3;
  panel.getMapAncestors(3, cycle);
  assert.deepEqual(cycle, [1, 2, 3]);

  globalThis.$dataMapInfos[1].parentId = 0;
  assert.equal(await panel.getMapFullPath(3), "World / Town / Inn");
  assert.equal(await panel.getMapFullPath(99), "NULL");
  assert.equal(await panel.getMapFullPath(0), "NULL");
});

test("SaveRecallPanel：保存 / 删除位置并持久化", () => {
  globalThis.$gamePlayer = { x: 4, y: 5 };
  globalThis.$gameParty = {};
  globalThis.$gameMap = { mapId: () => 7 };
  globalThis.$gameSystem = {};

  let saved = 0;
  const panel = makePanel(SaveRecallPanel, {
    locations: [],
    saveLocations() {
      saved++;
    },
  });

  panel.addLocation("Inn");
  assert.deepEqual(panel.locations, [{ name: "Inn", mapId: 7, x: 4, y: 5 }]);
  assert.equal(saved, 1);

  panel.removeLocation(0);
  assert.deepEqual(panel.locations, []);
  assert.equal(saved, 2);

  delete globalThis.$gamePlayer;
  panel.addLocation("Blocked");
  assert.deepEqual(panel.locations, []);
  assert.equal(saved, 2, "游戏未就绪时不保存");
});

test("SaveRecallPanel.loadLocations：合法数据恢复，损坏数据隔离备份", () => {
  const stored = new Map();
  KEY_VALUE_STORAGE.getItem = (key) => stored.get(key) ?? null;
  KEY_VALUE_STORAGE.setItem = (key, value) => stored.set(key, value);

  const panel = makePanel(SaveRecallPanel, { locations: [] });

  stored.set("cheat.locations", JSON.stringify([]));
  panel.loadLocations();
  assert.deepEqual(panel.locations, []);

  const valid = [{ name: "Inn", mapId: 1, x: 2, y: 3 }];
  stored.set("cheat.locations", JSON.stringify(valid));
  panel.loadLocations();
  assert.deepEqual(panel.locations, valid);

  stored.set("cheat.locations", "{bad");
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    panel.loadLocations();
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(panel.locations, []);
  assert.ok(
    [...stored.keys()].some((key) =>
      key.startsWith("cheat.locations.corrupt-"),
    ),
  );

  stored.set("cheat.locations", JSON.stringify([{ name: 1 }]));
  const warnings = [];
  const originalWarn2 = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    panel.loadLocations();
  } finally {
    console.warn = originalWarn2;
  }

  assert.deepEqual(panel.locations, []);
  assert.equal(warnings.length, 1);
});

test("SaveRecallPanel.teleportLocation：校验坐标与游戏就绪状态", () => {
  globalThis.$gamePlayer = {
    _direction: 2,
    direction() {
      return this._direction;
    },
    reserveTransfer(...args) {
      this.transfer = args;
    },
    setPosition(...args) {
      this.position = args;
    },
  };
  globalThis.$gameParty = {};
  globalThis.$gameMap = {};
  globalThis.$gameSystem = {};

  const panel = makePanel(SaveRecallPanel);

  panel.teleportLocation(1, Number.NaN, 2);
  assert.equal(globalThis.$gamePlayer.transfer, undefined);

  panel.teleportLocation(1, 2, 3);
  assert.deepEqual(globalThis.$gamePlayer.transfer, [1, 2, 3, 2, 0]);
  assert.deepEqual(globalThis.$gamePlayer.position, [2, 3]);

  delete globalThis.$gamePlayer;
  const alerts = captureAlerts();
  panel.teleportLocation(1, 2, 3);
  assert.equal(alerts.at(-1).level, "warn");
});

/* ----------------------------------------------------------------- TeleportPanel */

test("TeleportPanel：地图名 / 父链 / 搜索与表头", async () => {
  globalThis.$dataMapInfos = [
    null,
    { id: 1, name: "World", parentId: 0 },
    { id: 2, name: "Town", parentId: 1 },
  ];

  const panel = makePanel(TeleportPanel, {
    maps: [],
    search: "",
    excludeFullPath: false,
    tableHeaders: [{ key: "name" }, { key: "fullPath" }],
  });

  assert.equal(typeof panel.getMapAncestors, "function");
  const path = [];
  panel.getMapAncestors(2, path);
  assert.deepEqual(path, [1, 2]);

  assert.deepEqual(await panel.getMapNames(globalThis.$dataMapInfos), [
    "",
    "World",
    "Town",
  ]);

  assert.deepEqual(TeleportPanel.computed.filteredTableHeaders.call(panel), [
    { key: "name" },
    { key: "fullPath" },
  ]);
  panel.excludeFullPath = true;
  assert.deepEqual(TeleportPanel.computed.filteredTableHeaders.call(panel), [
    { key: "name" },
  ]);

  panel.maps = [
    { id: 1, name: "World", fullPathJoin: "" },
    { id: 2, name: "Town", fullPathJoin: "World / Town" },
  ];
  Object.defineProperty(panel, "filteredMaps", {
    get() {
      return TeleportPanel.computed.filteredMaps.call(this);
    },
  });
  assert.equal(TeleportPanel.computed.totalCount.call(panel), 2);
  panel.search = "world";
  assert.equal(
    TeleportPanel.computed.filteredMaps
      .call(panel)
      .map((item) => item.id)
      .join(","),
    "1,2",
  );
});

test("TeleportPanel.initializeVariables：整理地图与完整路径", async () => {
  globalThis.$dataMapInfos = [
    null,
    { id: 1, name: "World", parentId: 0 },
    { id: 2, name: "Town", parentId: 1 },
  ];

  const panel = makePanel(TeleportPanel, { maps: [] });
  await panel.initializeVariables();

  assert.equal(panel.maps.length, 2);
  assert.equal(panel.maps[1].id, 2);
  assert.equal(panel.maps[1].fullPathJoin, "World / Town");
  assert.equal(panel.maps[1].name, "Town");

  delete globalThis.$dataMapInfos;
  await panel.initializeVariables();
  assert.deepEqual(panel.maps, []);
});

test("TeleportPanel.teleportLocation：非法输入 / 地图不存在 / 玩家未就绪 / 越界", () => {
  const alerts = captureAlerts();

  globalThis.$dataMapInfos = [null, { id: 1, name: "World" }];
  globalThis.$gamePlayer = {
    direction: () => 2,
    reserveTransfer(...args) {
      this.transfer = args;
    },
    setPosition(...args) {
      this.position = args;
    },
  };
  globalThis.$gameMap = {
    mapId: () => 1,
    isValid: (x, y) => x < 10 && y < 10,
  };

  const panel = makePanel(TeleportPanel, {
    updateCurrentPosition() {
      this.updated = true;
    },
  });

  assert.equal(panel.teleportLocation(0, 1, 1), false);
  assert.equal(panel.teleportLocation(1, -1, 1), false);
  assert.equal(panel.teleportLocation(99, 1, 1), false);

  delete globalThis.$gamePlayer;
  assert.equal(panel.teleportLocation(1, 1, 1), false);

  globalThis.$gamePlayer = {
    direction: () => 2,
    reserveTransfer(...args) {
      this.transfer = args;
    },
    setPosition(...args) {
      this.position = args;
    },
  };
  assert.equal(panel.teleportLocation(1, 99, 1), false);

  assert.equal(panel.teleportLocation(1, 2, 3), true);
  assert.deepEqual(globalThis.$gamePlayer.transfer, [1, 2, 3, 2, 0]);
  assert.deepEqual(globalThis.$gamePlayer.position, [2, 3]);
  assert.equal(panel.updated, true);
  assert.equal(alerts.length, 5);
});

test("TeleportPanel.updateCurrentPosition / sameMapTeleport", () => {
  globalThis.$dataMapInfos = [null, { id: 1, name: "World" }];
  globalThis.$gameMap = { mapId: () => 1, width: () => 10, height: () => 10 };
  globalThis.$gamePlayer = {
    x: 1,
    y: 2,
    setPosition(x, y) {
      this.x = x;
      this.y = y;
    },
    center(x, y) {
      this.centered = [x, y];
    },
    makeEncounterCount() {
      this.encounter = true;
    },
  };

  const panel = makePanel(TeleportPanel, {
    currentX: 0,
    currentY: 0,
    currentMapName: "",
    inputX: "3",
    inputY: "4",
  });

  panel.updateCurrentPosition();
  assert.equal(panel.currentX, 1);
  assert.equal(panel.currentY, 2);
  assert.equal(panel.currentMapName, "World");

  panel.sameMapTeleport();
  assert.equal(globalThis.$gamePlayer.x, 3);
  assert.equal(globalThis.$gamePlayer.y, 4);
  assert.deepEqual(globalThis.$gamePlayer.centered, [3, 4]);
  assert.equal(globalThis.$gamePlayer.encounter, true);

  const alerts = captureAlerts();
  panel.inputX = "99";
  panel.sameMapTeleport();
  assert.equal(alerts.at(-1).level, "warn");

  panel.inputX = "bad";
  panel.sameMapTeleport();
  assert.equal(alerts.length, 2);
});

/* --------------------------------------------------------------- SaveBackupPanel */

function makeSavePanel(overrides = {}) {
  return makePanel(SaveBackupPanel, {
    available: false,
    settings: { autoOnSave: false, autoSaveInterval: 1, autoKeep: 5 },
    intervalText: "1",
    keepText: "5",
    loadedSlot: -1,
    currentSavefileInfo: null,
    savefileInfoCache: new Map(),
    currentMapName: "",
    playtimeText: "",
    backups: [],
    selectedBackupIds: [],
    stats: { count: 0, missingCount: 0, sizeText: "-" },
    slotFilter: "all",
    search: "",
    ...overrides,
  });
}

const originalBackupMethods = {
  isLocalMode: SaveBackupCheat.isLocalMode,
  getSettings: SaveBackupCheat.getSettings,
  writeSettings: SaveBackupCheat.writeSettings,
  getLoadedSlot: SaveBackupCheat.getLoadedSlot,
  getPlaytimeText: SaveBackupCheat.getPlaytimeText,
  readSavefileInfo: SaveBackupCheat.readSavefileInfo,
  backfillFromSavefileInfo: SaveBackupCheat.backfillFromSavefileInfo,
  listBackups: SaveBackupCheat.listBackups,
  getStats: SaveBackupCheat.getStats,
  maxSavefiles: SaveBackupCheat.maxSavefiles,
  hasSave: SaveBackupCheat.hasSave,
  restoreBackup: SaveBackupCheat.restoreBackup,
  deleteBackup: SaveBackupCheat.deleteBackup,
  clearBackups: SaveBackupCheat.clearBackups,
  exportAll: SaveBackupCheat.exportAll,
  exportSelected: SaveBackupCheat.exportSelected,
  importFromJson: SaveBackupCheat.importFromJson,
  getMaxImportBytes: SaveBackupCheat.getMaxImportBytes,
};

test.afterEach(() => {
  Object.assign(SaveBackupCheat, originalBackupMethods);
});

test("SaveBackupPanel.reload：读取设置 / 当前槽位 / 快照并剔除失效选择", () => {
  SaveBackupCheat.isLocalMode = () => true;
  SaveBackupCheat.getSettings = () => ({
    autoOnSave: true,
    autoSaveInterval: 3,
    autoKeep: 7,
  });
  SaveBackupCheat.getLoadedSlot = () => 2;
  SaveBackupCheat.getPlaytimeText = () => "01:00:00";
  SaveBackupCheat.readSavefileInfo = () => ({ playtimeText: "00:10:00" });
  SaveBackupCheat.backfillFromSavefileInfo = () => 0;
  SaveBackupCheat.listBackups = () => [
    { id: "a", createdAt: 2 },
    { id: "b", createdAt: 1 },
  ];
  SaveBackupCheat.getStats = () => ({
    count: 2,
    missingCount: 1,
    bytes: 1024,
  });

  const panel = makeSavePanel({
    selectedBackupIds: ["a", "stale"],
    getCurrentMapName: () => "Town (2)",
  });

  panel.reload();

  assert.equal(panel.available, true);
  assert.deepEqual(panel.settings, {
    autoOnSave: true,
    autoSaveInterval: 3,
    autoKeep: 7,
  });
  assert.equal(panel.intervalText, "3");
  assert.equal(panel.keepText, "7");
  assert.equal(panel.loadedSlot, 2);
  assert.equal(panel.playtimeText, "01:00:00");
  assert.equal(panel.currentMapName, "Town (2)");
  assert.deepEqual(panel.currentSavefileInfo, { playtimeText: "00:10:00" });
  assert.equal(panel.backups.length, 2);
  assert.deepEqual(panel.selectedBackupIds, ["a"]);
  assert.deepEqual(panel.stats, {
    count: 2,
    missingCount: 1,
    sizeText: "1.0 KB",
  });
  assert.ok(panel.savefileInfoCache instanceof Map);
  assert.equal(panel.savefileInfoCache.size, 0);
});

test("SaveBackupPanel：当前状态 / 提示文案 computed", () => {
  const panel = makeSavePanel({
    loadedSlot: 2,
    currentMapName: "Town",
    stats: { count: 3, missingCount: 0, sizeText: "2.0 KB" },
  });

  const summary = SaveBackupPanel.computed.currentSummary.call(panel);
  assert.match(summary, /2/);
  assert.match(summary, /Town/);
  assert.match(summary, /3/);
  assert.match(summary, /2\.0 KB/);

  panel.stats.missingCount = 1;
  assert.match(SaveBackupPanel.computed.currentSummary.call(panel), /1/);

  panel.currentSavefileInfo = { playtimeText: "00:10:00" };
  panel.playtimeText = "01:00:00";
  assert.equal(
    SaveBackupPanel.computed.currentPlaytimeText.call(panel),
    "00:10:00",
  );
  panel.currentSavefileInfo = null;
  assert.equal(
    SaveBackupPanel.computed.currentPlaytimeText.call(panel),
    "01:00:00",
  );

  panel.currentSavefileInfo = {
    playtimeText: "00:10:00",
    timestampText: "10-01 19:50",
  };
  Object.defineProperty(panel, "currentPlaytimeText", {
    get() {
      return SaveBackupPanel.computed.currentPlaytimeText.call(this);
    },
  });
  assert.match(
    SaveBackupPanel.computed.currentSaveLine.call(panel),
    /00:10:00/,
  );
  assert.match(
    SaveBackupPanel.computed.currentSaveLine.call(panel),
    /10-01 19:50/,
  );

  panel.settings.autoOnSave = false;
  assert.notEqual(SaveBackupPanel.computed.autoSettingHint.call(panel), "");
  panel.settings.autoOnSave = true;
  panel.intervalText = "3";
  assert.match(SaveBackupPanel.computed.autoSettingHint.call(panel), /3/);
  panel.intervalText = "1";
  assert.notEqual(SaveBackupPanel.computed.autoSettingHint.call(panel), "");
});

test("SaveBackupPanel：槽位选项与表格过滤", () => {
  const panel = makeSavePanel({
    backups: [
      { id: "a", slot: 2, label: "Inn", mapName: "Town" },
      { id: "b", slot: 1, label: "Boss", mapName: "Cave" },
      { id: "c", slot: 2, label: "Shop", mapName: "Town" },
      { id: "bad", slot: 0 },
    ],
  });

  assert.deepEqual(
    SaveBackupPanel.computed.slotOptions.call(panel).map((item) => item.value),
    ["all", 1, 2],
  );

  assert.equal(
    SaveBackupPanel.computed.filteredTableItems.call(panel).length,
    4,
  );

  panel.slotFilter = 2;
  assert.deepEqual(
    SaveBackupPanel.computed.filteredTableItems
      .call(panel)
      .map((item) => item.id),
    ["a", "c"],
  );

  panel.search = "boss";
  panel.slotFilter = "all";
  assert.deepEqual(
    SaveBackupPanel.computed.filteredTableItems
      .call(panel)
      .map((item) => item.id),
    ["b"],
  );
});

test("SaveBackupPanel.parseCount / numFieldStyle / 输入提交", () => {
  const panel = makeSavePanel();
  let changes = 0;

  panel.onSettingsChange = () => changes++;

  assert.equal(panel.parseCount("12", 1), 12);
  assert.equal(panel.parseCount("3e", 1), 3);
  assert.equal(panel.parseCount("", 2), 2);
  assert.equal(panel.parseCount(null, 4), 4);
  assert.equal(panel.parseCount("0", 1), 1);
  assert.equal(panel.parseCount("999", 1), 100);

  assert.deepEqual(panel.numFieldStyle("1"), {
    width: "36px",
    maxWidth: "36px",
  });
  assert.deepEqual(panel.numFieldStyle("123"), {
    width: "51px",
    maxWidth: "51px",
  });
  assert.deepEqual(panel.numFieldStyle(null), {
    width: "36px",
    maxWidth: "36px",
  });

  panel.onIntervalInput("4");
  assert.equal(panel.intervalText, "4");
  assert.equal(panel.settings.autoSaveInterval, 4);
  assert.equal(changes, 1);

  panel.onKeepInput(null);
  assert.equal(panel.keepText, "");
  assert.equal(panel.settings.autoKeep, 1);
  assert.equal(changes, 2);

  panel.intervalText = "bad";
  panel.settings.autoSaveInterval = 1;
  panel.commitIntervalText();
  assert.equal(panel.intervalText, "1");
  assert.equal(changes, 2);

  panel.settings.autoSaveInterval = 2;
  panel.intervalText = "5";
  panel.commitIntervalText();
  assert.equal(panel.settings.autoSaveInterval, 5);
  assert.equal(changes, 3);

  panel.keepText = "9";
  panel.settings.autoKeep = 9;
  panel.commitKeepText();
  assert.equal(changes, 3);

  panel.keepText = "12";
  panel.commitKeepText();
  assert.equal(panel.settings.autoKeep, 12);
  assert.equal(changes, 4);
});

test("SaveBackupPanel.onSettingsChange：写盘失败时回滚到磁盘设置", () => {
  SaveBackupCheat.getSettings = () => ({
    autoOnSave: false,
    autoSaveInterval: 1,
    autoKeep: 5,
  });
  SaveBackupCheat.writeSettings = () => {
    throw new Error("disk full");
  };

  const alerts = captureAlerts();
  const panel = makeSavePanel({
    settings: { autoOnSave: true, autoSaveInterval: 2, autoKeep: 6 },
  });

  panel.onSettingsChange();

  assert.equal(alerts.at(-1).level, "error");
  assert.deepEqual(panel.settings, {
    autoOnSave: false,
    autoSaveInterval: 1,
    autoKeep: 5,
  });
});

test("SaveBackupPanel.getCurrentMapName / progress*：地图、时长、存档时间与存档次数", () => {
  globalThis.$gameMap = { mapId: () => 2 };
  globalThis.$dataMapInfos = [null, { name: "World" }, { name: "Town" }];

  const panel = makeSavePanel({
    getSavefileInfo(slot) {
      return slot === 2 ? { playtimeText: "00:20:00" } : null;
    },
  });

  assert.equal(panel.getCurrentMapName(), "Town (2)");

  delete globalThis.$dataMapInfos;
  assert.equal(panel.getCurrentMapName(), "#2");

  const item = {
    mapName: "01 Coast",
    mapId: 1,
    slot: 2,
    playtimeText: "",
    exists: true,
    sizeText: "1.0 KB",
    savefileTimeText: "10-01 19:50:55",
  };

  assert.equal(panel.progressPrimary(item), "01 Coast");
  assert.match(panel.progressSecondary(item), /00:20:00/);
  assert.match(panel.progressSecondary(item), /1\.0 KB/);
  assert.match(panel.progressTertiary(item), /10-01 19:50/);

  item.mapName = "Cave";
  assert.equal(panel.progressPrimary(item), "Cave (1)");

  item.mapName = "";
  assert.equal(panel.progressPrimary(item), "地图 #1");

  item.mapId = 0;
  assert.equal(panel.progressPrimary(item), "00:20:00");

  panel.getSavefileInfo = () => null;
  assert.equal(panel.progressPrimary(item), "无记录");

  assert.equal(panel.saveCountText({ saveCount: 3 }), "第 3 次存档");
  assert.equal(panel.saveCountText({ saveCount: 0 }), "");
  assert.equal(panel.saveCountText({ saveCount: "bad" }), "");

  assert.equal(panel.progressTertiary({}), "");
});

test("SaveBackupPanel.getSavefileInfo：按槽位缓存，非法槽位返回 null", () => {
  let calls = 0;
  SaveBackupCheat.readSavefileInfo = (slot) => {
    calls++;
    return { playtimeText: `slot-${slot}` };
  };

  const panel = makeSavePanel();

  assert.deepEqual(panel.getSavefileInfo(2), { playtimeText: "slot-2" });
  assert.deepEqual(panel.getSavefileInfo(2), { playtimeText: "slot-2" });
  assert.equal(calls, 1);

  assert.equal(panel.getSavefileInfo(0), null);
  assert.equal(panel.getSavefileInfo("bad"), null);
});

test("SaveBackupPanel.getSuggestedTargetSlot：优先空槽，全满时顺延或回到 1", () => {
  const panel = makeSavePanel();

  SaveBackupCheat.maxSavefiles = () => 3;
  SaveBackupCheat.hasSave = (slot) => slot === 1;

  assert.equal(panel.getSuggestedTargetSlot(1), 2);
  assert.equal(panel.getSuggestedTargetSlot(2), 3);

  SaveBackupCheat.hasSave = () => true;
  assert.equal(panel.getSuggestedTargetSlot(1), 2);
  assert.equal(panel.getSuggestedTargetSlot(2), 3);
  assert.equal(panel.getSuggestedTargetSlot(3), 1);

  SaveBackupCheat.maxSavefiles = () => 0;
  SaveBackupCheat.hasSave = () => false;
  assert.equal(panel.getSuggestedTargetSlot(1), 2);
});

test("SaveBackupPanel.restoreBackupOtherSlot：提示输入目标槽位并校验", () => {
  const originalPrompt = globalThis.window;
  const confirmations = [];
  const alerts = captureAlerts();

  globalThis.window = {
    prompt: () => "2",
  };

  SaveBackupCheat.maxSavefiles = () => 10;
  SaveBackupCheat.hasSave = () => false;

  const panel = makeSavePanel({
    confirmRestore(item, target) {
      confirmations.push([item.id, target]);
    },
  });

  try {
    panel.restoreBackupOtherSlot({ id: "a", slot: 1 });
    assert.deepEqual(confirmations, [["a", 2]]);

    globalThis.window.prompt = () => null;
    panel.restoreBackupOtherSlot({ id: "a", slot: 1 });
    assert.equal(confirmations.length, 1);

    globalThis.window.prompt = () => "0";
    panel.restoreBackupOtherSlot({ id: "a", slot: 1 });
    assert.equal(alerts.at(-1).level, "warn");

    globalThis.window.prompt = () => "99";
    panel.restoreBackupOtherSlot({ id: "a", slot: 1 });
    assert.equal(alerts.at(-1).level, "warn");

    globalThis.window.prompt = () => "1";
    panel.restoreBackupOtherSlot({ id: "a", slot: 1 });
    assert.deepEqual(confirmations, [
      ["a", 2],
      ["a", 1],
    ]);
  } finally {
    if (originalPrompt === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalPrompt;
    }
  }
});

test("SaveBackupPanel.confirmRestore：确认框展示差异后果，动作调用 doRestore", () => {
  const dialogs = [];
  const restored = [];
  ConfirmDialog.show = (options) => dialogs.push(options);
  ConfirmDialog.close = () => {};

  SaveBackupCheat.hasSave = () => true;

  const panel = makeSavePanel({
    loadedSlot: 1,
    progressPrimary: () => "地图",
    progressSecondary: () => "时长",
    doRestore(item, target) {
      restored.push([item.id, target]);
    },
  });

  panel.confirmRestore(
    {
      id: "a",
      slot: 1,
      createdText: "刚刚",
      relativeText: "1 分钟前",
    },
    1,
  );

  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].width, 520);
  assert.equal(dialogs[0].actions.length, 2);
  assert.match(dialogs[0].message, /地图/);

  dialogs[0].actions[1].action();
  assert.deepEqual(restored, [["a", 1]]);
});

test("SaveBackupPanel.doRestore / deleteBackup / clearAllBackups：成功刷新，失败提示", () => {
  const alerts = captureAlerts();
  let reloads = 0;
  const deleted = [];
  const cleared = [];
  const dialogs = [];

  ConfirmDialog.show = (options) => dialogs.push(options);
  ConfirmDialog.close = () => {};
  SaveBackupCheat.restoreBackup = () => {};
  SaveBackupCheat.deleteBackup = (id) => deleted.push(id);
  SaveBackupCheat.clearBackups = (kind) => {
    cleared.push(kind);
    return 2;
  };

  const panel = makeSavePanel({
    reload() {
      reloads++;
    },
  });

  panel.doRestore({ id: "a" }, 1);
  assert.equal(reloads, 1);

  SaveBackupCheat.restoreBackup = () => {
    throw new Error("bad snapshot");
  };
  panel.doRestore({ id: "a" }, 1);
  assert.equal(alerts.at(-1).level, "error");

  panel.deleteBackup({ id: "a", slot: 1, createdText: "x" });
  assert.equal(dialogs.length, 1);
  dialogs[0].actions[1].action();
  assert.deepEqual(deleted, ["a"]);
  assert.equal(reloads, 2);

  panel.clearAllBackups();
  assert.equal(dialogs.length, 2);
  dialogs[1].actions[1].action();
  assert.deepEqual(cleared, [null]);
  assert.equal(reloads, 3);
  assert.equal(alerts.at(-1).level, "success");
});

test("SaveBackupPanel.exportBackups / exportSelectedBackups：空列表提示，成功提示路径", () => {
  const alerts = captureAlerts();
  const panel = makeSavePanel({ backups: [] });

  panel.exportBackups();
  assert.equal(alerts.at(-1).level, "warn");

  panel.backups = [{ id: "a" }];
  panel.selectedBackupIds = [];
  panel.exportSelectedBackups();
  assert.equal(alerts.at(-1).level, "warn");

  SaveBackupCheat.exportAll = () => "/tmp/all.json";
  SaveBackupCheat.exportSelected = (ids) => `/tmp/${ids.join(",")}.json`;

  panel.exportBackups();
  assert.equal(alerts.at(-1).level, "success");
  assert.match(alerts.at(-1).msg, /\/tmp\/all\.json/);

  panel.selectedBackupIds = ["a"];
  panel.exportSelectedBackups();
  assert.equal(alerts.at(-1).level, "success");
  assert.match(alerts.at(-1).msg, /\/tmp\/a\.json/);

  SaveBackupCheat.exportAll = () => {
    throw new Error("disk full");
  };
  panel.exportBackups();
  assert.equal(alerts.at(-1).level, "error");
});

test("SaveBackupPanel.importBackups / onImportFileChange：文件选择、大小与结果提示", () => {
  const alerts = captureAlerts();
  const clicks = [];
  const input = {
    value: "stale",
    click() {
      clicks.push(this.value);
    },
  };
  const panel = makeSavePanel({
    $refs: { importInput: input },
    reload() {
      this.reloaded = true;
    },
  });

  SaveBackupCheat.getMaxImportBytes = () => 10;
  SaveBackupCheat.importFromJson = (text) => ({ added: 1, skipped: 0 });

  panel.importBackups();
  assert.deepEqual(clicks, [""]);
  assert.equal(input.value, "");

  panel.$refs = {};
  panel.importBackups();

  panel.onImportFileChange({ target: { files: [] } });
  assert.equal(alerts.length, 0);

  panel.onImportFileChange({
    target: { files: [{ size: 11, content: "{}" }] },
  });
  assert.equal(alerts.at(-1).level, "error");

  class FakeFileReader {
    readAsText(file) {
      this.result = file.content;
      this.onload();
    }
  }

  globalThis.FileReader = FakeFileReader;

  panel.onImportFileChange({
    target: { files: [{ size: 5, content: "{}" }] },
  });

  assert.equal(alerts.at(-1).level, "success");
  assert.equal(panel.reloaded, true);

  SaveBackupCheat.importFromJson = () => {
    throw new Error("bad file");
  };
  panel.onImportFileChange({
    target: { files: [{ size: 5, content: "{}" }] },
  });
  assert.equal(alerts.at(-1).level, "error");
});
