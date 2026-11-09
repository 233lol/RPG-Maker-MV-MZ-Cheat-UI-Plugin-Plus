import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import SaveSlotPanel from "../../cheat-engine/www/cheat/panels/SaveSlotPanel.js";
import { SceneCheat } from "../../cheat-engine/www/cheat/js/CheatHelper.js";
import { SaveBackupCheat } from "../../cheat-engine/www/cheat/js/SaveBackupHelper.js";
import { ConfirmDialog } from "../../cheat-engine/www/cheat/js/DialogHelper.js";
import {
  getLocale,
  setLocale,
} from "../../cheat-engine/www/cheat/js/strings.js";

/** @type {any} */
const BackupCheat = SaveBackupCheat;

const GLOBALS = ["$gamePlayer", "$gameParty", "$gameMap", "$gameSystem"];

const ORIGINAL_BACKUP = {
  isLocalMode: BackupCheat.isLocalMode,
  maxSavefiles: BackupCheat.maxSavefiles,
  getLoadedSlot: BackupCheat.getLoadedSlot,
  hasSave: BackupCheat.hasSave,
  parseSaveMeta: BackupCheat.parseSaveMeta,
  formatBytes: BackupCheat.formatBytes,
};

const ORIGINAL_SCENE = {
  quickLoad: SceneCheat.quickLoad,
  quickSave: SceneCheat.quickSave,
};

function makePanel(overrides = {}) {
  const panel = {
    ...SaveSlotPanel.methods,
    ...SaveSlotPanel.data.call({}),
    ...overrides,
  };

  Object.defineProperty(panel, "tableHeaders", {
    configurable: true,
    get() {
      return SaveSlotPanel.computed.tableHeaders.call(this);
    },
  });

  return panel;
}

function setGameReady() {
  globalThis.$gamePlayer = {};
  globalThis.$gameParty = {};
  globalThis.$gameMap = {};
  globalThis.$gameSystem = {};
}

afterEach(() => {
  Object.assign(BackupCheat, ORIGINAL_BACKUP);
  Object.assign(SceneCheat, ORIGINAL_SCENE);

  for (const name of GLOBALS) {
    delete globalThis[name];
  }
});

test("SaveSlotPanel：游戏未就绪 / 非本地模式时给出提示状态", () => {
  const panel = makePanel();

  panel.initializeVariables();
  assert.equal(panel.ready, false);
  assert.equal(panel.available, false);
  assert.deepEqual(panel.slots, []);

  setGameReady();
  BackupCheat.isLocalMode = () => false;
  panel.initializeVariables();

  assert.equal(panel.ready, true);
  assert.equal(panel.available, false);
  assert.deepEqual(panel.slots, []);
});

test("SaveSlotPanel：按槽位生成地图 / 时长 / 时间 / 大小", () => {
  setGameReady();
  BackupCheat.isLocalMode = () => true;
  BackupCheat.maxSavefiles = () => 3;
  BackupCheat.getLoadedSlot = () => 2;
  BackupCheat.hasSave = (slot) => slot === 1 || slot === 3;
  BackupCheat.parseSaveMeta = (slot) => ({
    slot,
    mapId: slot === 1 ? 12 : 0,
    mapName: slot === 1 ? "Forest" : "",
    playtime: slot === 1 ? "01:02:03" : "",
    savefileTimeText: slot === 1 ? "2026-11-09 10:00:00" : "",
    dataSize: slot === 1 ? 2048 : 0,
  });
  BackupCheat.formatBytes = (bytes) => `${bytes}B`;

  const panel = makePanel();

  panel.initializeVariables();

  assert.equal(panel.currentSlot, 2);
  assert.equal(panel.slots.length, 3);

  assert.deepEqual(panel.slots[0], {
    slot: 1,
    exists: true,
    isCurrent: false,
    mapText: "Forest (#12)",
    playtimeText: "01:02:03",
    savedAtText: "2026-11-09 10:00:00",
    sizeText: "2048B",
  });

  assert.equal(panel.slots[1].exists, false);
  assert.equal(panel.slots[1].isCurrent, true);
  assert.equal(panel.slots[1].mapText, "空槽位");

  assert.equal(panel.slots[2].exists, true);
  assert.equal(panel.slots[2].isCurrent, false);
  assert.equal(panel.slots[2].mapText, "无记录");
  assert.equal(panel.slots[2].playtimeText, "无时长记录");
});

test("SaveSlotPanel.formatMapText：空槽 / 无地图 / 有地图名", () => {
  const panel = makePanel();

  assert.equal(panel.formatMapText(null, false), "空槽位");
  assert.equal(panel.formatMapText({ mapId: 0 }, true), "无记录");
  assert.equal(panel.formatMapText({ mapId: 7, mapName: "" }, true), "地图 #7");
  assert.equal(
    panel.formatMapText({ mapId: 7, mapName: "Cave" }, true),
    "Cave (#7)",
  );
});

test("SaveSlotPanel.created：语言变化后重建槽位文案", () => {
  let rebuilt = 0;
  const panel = {
    initializeVariables() {
      rebuilt += 1;
    },
  };

  const originalLocale = getLocale();
  const nextLocale = originalLocale === "en" ? "ja" : "en";

  SaveSlotPanel.created.call(panel);

  try {
    assert.equal(rebuilt, 1);

    assert.equal(setLocale(nextLocale), true);
    assert.equal(rebuilt, 2, "槽位里的缓存文案应随语言重建");

    panel.__unsubscribeLocale();
    assert.equal(setLocale(originalLocale), true);
    assert.equal(rebuilt, 2, "取消订阅后不应再重建");
  } finally {
    panel.__unsubscribeLocale();
    setLocale(originalLocale);
  }
});

test("SaveSlotPanel.loadSlot / saveSlot：空槽不能读取，覆盖前有确认", () => {
  const shown = [];
  const originalShow = ConfirmDialog.show;
  ConfirmDialog.show = (options) => shown.push(options);

  const panel = makePanel();

  try {
    panel.loadSlot({ slot: 1, exists: false });
    assert.equal(shown.length, 0);

    panel.loadSlot({ slot: 2, exists: true });
    panel.saveSlot({ slot: 2, exists: true });
    panel.saveSlot({ slot: 3, exists: false });
  } finally {
    ConfirmDialog.show = originalShow;
  }

  assert.equal(shown.length, 3);
  assert.match(shown[0].message, /存档 2/);
  assert.match(shown[1].message, /已存在/);
  assert.match(shown[2].message, /保存到存档 3/);

  // 确认按钮生成后，点击会关闭对话框并执行动作
  const actions = shown[0].actions;
  assert.equal(actions.length, 2);
  assert.equal(typeof actions[1].action, "function");
});

test("SaveSlotPanel.performLoad / performSave：调用快速读档并刷新", async () => {
  const calls = [];
  const panel = makePanel({
    initializeVariables() {
      calls.push("refresh");
    },
  });

  SceneCheat.quickLoad = async (slot) => {
    calls.push(["load", slot]);
    return true;
  };
  SceneCheat.quickSave = async (slot) => {
    calls.push(["save", slot]);
    return true;
  };

  await panel.performLoad(2);
  await panel.performSave(3);

  assert.deepEqual(calls, [["load", 2], "refresh", ["save", 3], "refresh"]);
});
