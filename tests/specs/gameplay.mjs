import assert from "node:assert/strict";

export function registerGameplay({ test, page, type, state }) {
  test("穿墙 / 移动速度 / 游戏速度 / 随机遇敌 / 无敌模式全部生效", async () => {
    const during = await page.evaluate(async () => {
      const { GeneralCheat, SpeedCheat, GameSpeedCheat, BattleCheat } =
        await import(new URL("cheat/js/CheatHelper.js", document.baseURI).href);

      if ($gamePlayer._through) GeneralCheat.toggleNoClip();
      if (BattleCheat.isDisableRandomEncounter()) {
        BattleCheat.toggleDisableRandomEncounter();
      }

      const actor = $gameParty.members()[0];
      if (GeneralCheat.isGodMode(actor)) GeneralCheat.godModeOff(actor);

      const before = {
        through: $gamePlayer._through,
        speed: $gamePlayer.realMoveSpeed(),
        canEncounter: $gamePlayer.canEncounter(),
        rate: GameSpeedCheat.getRate(),
        hp: actor.hp,
        mhp: actor.mhp,
        godMode: GeneralCheat.isGodMode(actor),
      };

      GeneralCheat.toggleNoClip();
      SpeedCheat.setSpeed(6);
      BattleCheat.toggleDisableRandomEncounter();
      GeneralCheat.godModeOn(actor);
      actor.gainHp(-999999);
      GameSpeedCheat.setGameSpeed(2);

      return {
        before,
        during: {
          through: $gamePlayer._through,
          speed: $gamePlayer.realMoveSpeed(),
          canEncounter: $gamePlayer.canEncounter(),
          rate: GameSpeedCheat.getRate(),
          hp: actor.hp,
          mhp: actor.mhp,
          godMode: GeneralCheat.isGodMode(actor),
        },
      };
    });

    assert.equal(during.before.through, false);
    assert.equal(during.during.through, true, "穿墙没有开启");
    assert.equal(during.during.speed, 6, "移动速度没有设置成 6");
    assert.equal(during.during.canEncounter, false, "随机遇敌没有关闭");
    assert.equal(during.during.rate, 2, "游戏速度没有设置成 2");
    assert.equal(during.during.godMode, true, "无敌模式没有开启");
    assert.equal(
      during.during.hp,
      during.during.mhp,
      "无敌模式下仍然受到了伤害",
    );

    const after = await page.evaluate(async () => {
      const { GeneralCheat, SpeedCheat, GameSpeedCheat, BattleCheat } =
        await import(new URL("cheat/js/CheatHelper.js", document.baseURI).href);
      const actor = $gameParty.members()[0];

      GeneralCheat.godModeOff(actor);
      GeneralCheat.toggleNoClip();
      SpeedCheat.setSpeed(4);
      BattleCheat.toggleDisableRandomEncounter();
      GameSpeedCheat.setGameSpeed(1);
      actor.setHp(actor.mhp);
      actor.setMp(actor.mmp);

      return {
        through: $gamePlayer._through,
        speed: $gamePlayer.realMoveSpeed(),
        canEncounter: $gamePlayer.canEncounter(),
        rate: GameSpeedCheat.getRate(),
        godMode: GeneralCheat.isGodMode(actor),
      };
    });

    assert.equal(after.through, false);
    assert.equal(after.speed, 4);
    assert.equal(after.canEncounter, true);
    assert.equal(after.rate, 1);
    assert.equal(after.godMode, false);
  });

  test("常用 / 战斗 / 属性面板能修改游戏状态", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const { GeneralCheat } = await import(
        new URL("cheat/js/CheatHelper.js", document.baseURI).href
      );

      const general = await api.openPanel("general-panel", "GeneralPanel");
      const oldGold = $gameParty.gold();
      general.gold = "43210";
      general.onGoldChange();
      const newGold = $gameParty.gold();
      general.gold = String(oldGold);
      general.onGoldChange();

      const health = await api.openPanel(
        "health-setting-panel",
        "HealthSettingPanel",
      );
      const actors = $gameParty.members();
      for (const actor of actors) actor.setHp(1);
      health.recoverAllParty();
      const hpAfterRecover = actors.map((actor) => actor.hp);
      const maxHp = actors.map((actor) => actor.mhp);

      const stats = await api.openPanel(
        "stats-setting-panel",
        "StatsSettingPanel",
      );
      const item = stats.actors[0];
      const actor = item._actor;
      const oldLevel = actor.level;
      const nextLevel = oldLevel >= 99 ? oldLevel - 1 : oldLevel + 1;
      item.level = nextLevel;
      stats.onLevelChange(item);
      const levelAfter = actor.level;

      const godBefore = GeneralCheat.isGodMode(actor);
      const statsItem = stats.actors.find((entry) => entry._actor === actor);
      stats.onGodModeChange(statsItem);
      const godAfterOn = GeneralCheat.isGodMode(actor);
      stats.onGodModeChange(statsItem);
      const godAfterOff = GeneralCheat.isGodMode(actor);

      // 还原等级
      const restoreItem = stats.actors.find((entry) => entry._actor === actor);
      restoreItem.level = oldLevel;
      stats.onLevelChange(restoreItem);

      return {
        oldGold,
        newGold,
        restoredGold: $gameParty.gold(),
        hpAfterRecover,
        maxHp,
        oldLevel,
        nextLevel,
        levelAfter,
        godBefore,
        godAfterOn,
        godAfterOff,
      };
    });

    assert.equal(result.newGold, 43210, "常用面板修改金币失败");
    assert.equal(result.restoredGold, result.oldGold, "金币没有还原");
    assert.deepEqual(
      result.hpAfterRecover,
      result.maxHp,
      "战斗面板没有恢复全员 HP",
    );
    assert.equal(
      result.levelAfter,
      result.nextLevel,
      "属性面板修改等级失败",
    );
    assert.equal(result.godAfterOn, !result.godBefore, "属性面板没有切换无敌模式");
    assert.equal(result.godAfterOff, result.godBefore, "无敌模式没有还原");
  });

  test("变量 / 开关 / 存读位置 / 传送 / 地图事件面板联动游戏数据", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;

      const variablePanel = await api.openPanel(
        "variable-setting-panel",
        "VariableSettingPanel",
      );
      await api.waitFor(() => variablePanel.tableItems.length > 0, 5000, 50);
      const variableItem = variablePanel.tableItems.find((item) => item.id > 0);
      const oldVariable = $gameVariables.value(variableItem.id);
      variablePanel.onItemChange(variableItem, 4242);
      const newVariable = $gameVariables.value(variableItem.id);
      $gameVariables.setValue(variableItem.id, oldVariable);

      const switchPanel = await api.openPanel(
        "switch-setting-panel",
        "SwitchSettingPanel",
      );
      await api.waitFor(() => switchPanel.tableItems.length > 0, 5000, 50);
      const switchItem = switchPanel.tableItems.find((item) => item.id > 0);
      const oldSwitch = $gameSwitches.value(switchItem.id);
      switchItem.value = !oldSwitch;
      switchPanel.onItemChange(switchItem);
      const newSwitch = $gameSwitches.value(switchItem.id);
      $gameSwitches.setValue(switchItem.id, oldSwitch);

      const recallPanel = await api.openPanel(
        "save-recall-panel",
        "SaveRecallPanel",
      );
      const recallBefore = recallPanel.locations.length;
      recallPanel.addLocation("auto-test-location");
      const recallAfterAdd = recallPanel.locations.length;
      recallPanel.removeLocation(recallPanel.locations.length - 1);
      const recallAfterRemove = recallPanel.locations.length;

      const teleportPanel = await api.openPanel(
        "teleport-panel",
        "TeleportPanel",
      );
      const mapId = $gameMap.mapId();
      const x = $gamePlayer.x;
      const y = $gamePlayer.y;
      teleportPanel.teleportLocation(mapId, x, y);
      const reservedMapId = $gamePlayer._newMapId;
      const reservedPosition = { x: $gamePlayer.x, y: $gamePlayer.y };
      $gamePlayer.clearTransferInfo();

      const mapEventPanel = await api.openPanel(
        "map-event-panel",
        "MapEventPanel",
      );
      await api.waitFor(
        () => mapEventPanel.currentMapId === $gameMap.mapId(),
        10000,
        100,
      );

      return {
        variableId: variableItem.id,
        oldVariable,
        newVariable,
        oldSwitch,
        newSwitch,
        recallBefore,
        recallAfterAdd,
        recallAfterRemove,
        mapId,
        expectedPosition: { x, y },
        reservedMapId,
        reservedPosition,
        mapEventMapId: mapEventPanel.currentMapId,
        hasMapData: !!mapEventPanel.mapData,
        regularEvents: mapEventPanel.regularEvents?.length ?? 0,
      };
    });

    assert.equal(result.newVariable, 4242, "变量面板没有写入新值");
    assert.notEqual(result.oldSwitch, result.newSwitch, "开关面板没有切换开关");
    assert.equal(result.recallAfterAdd, result.recallBefore + 1);
    assert.equal(result.recallAfterRemove, result.recallBefore);
    assert.equal(result.reservedMapId, result.mapId, "传送面板没有设置目标地图");
    assert.deepEqual(
      result.reservedPosition,
      result.expectedPosition,
      "传送面板没有把玩家放到目标坐标",
    );
    assert.equal(result.mapEventMapId, result.mapId, "地图事件面板地图 ID 不同步");
    assert.equal(result.hasMapData, true, "地图事件面板没有加载地图数据");
  });

  test("快捷键 / KeyValueStorage / 游戏速度设置写入磁盘", async () => {
    const result = await page.evaluate(async () => {
      const base = document.baseURI;
      const { GLOBAL_SHORTCUT } = await import(
        new URL("cheat/js/GlobalShortcut.js", base).href
      );
      const { Key } = await import(new URL("cheat/js/KeyCodes.js", base).href);
      const { KeyValueStorage } = await import(
        new URL("cheat/js/KeyValueStorage.js", base).href
      );
      const { GameSpeedCheat } = await import(
        new URL("cheat/js/CheatHelper.js", base).href
      );
      const { getCheatSettingsPath } = await import(
        new URL("cheat/js/SettingsPath.js", base).href
      );
      const fs = require("fs");

      const shortcutFile = getCheatSettingsPath("shortcuts.json");
      const settingsDir = getCheatSettingsPath("__probe__").replace(
        /\/__probe__$/,
        "",
      );
      const shortcutFileExists = fs.existsSync(shortcutFile);
      const defaults = JSON.parse(fs.readFileSync(shortcutFile, "utf-8"));

      const oldKey = GLOBAL_SHORTCUT.getShortcut("toggleNoClip");
      const newKey = Key.fromString("alt q");
      GLOBAL_SHORTCUT.setShortcut("toggleNoClip", newKey);
      GLOBAL_SHORTCUT.writeShortcutSettings();
      const changed = JSON.parse(fs.readFileSync(shortcutFile, "utf-8"));
      GLOBAL_SHORTCUT.setShortcut("toggleNoClip", oldKey);
      GLOBAL_SHORTCUT.writeShortcutSettings();
      const restored = JSON.parse(fs.readFileSync(shortcutFile, "utf-8"));

      const kvPath = getCheatSettingsPath("test-kv.json");
      const storage = new KeyValueStorage(kvPath);
      storage.setItem("hello", "世界");
      const kvFile = JSON.parse(fs.readFileSync(kvPath, "utf-8"));
      const kvRead = storage.getItem("hello");
      fs.unlinkSync(kvPath);

      GameSpeedCheat.setGameSpeed(3, GameSpeedCheat.sceneOptions().all);
      GameSpeedCheat.__writeSettings(3, GameSpeedCheat.sceneOptions().all);
      const gameSpeedFile = JSON.parse(
        fs.readFileSync(getCheatSettingsPath("gameSpeed.json"), "utf-8"),
      );
      GameSpeedCheat.setGameSpeed(1, GameSpeedCheat.sceneOptions().all);
      fs.unlinkSync(getCheatSettingsPath("gameSpeed.json"));

      return {
        shortcutFileExists,
        settingsDir,
        defaultShortcut: defaults.toggleCheatModal?.shortcut,
        changedShortcut: changed.toggleNoClip?.shortcut,
        restoredShortcut: restored.toggleNoClip?.shortcut,
        kvFileValue: kvFile.hello,
        kvRead,
        gameSpeedData: gameSpeedFile.data,
      };
    });

    assert.equal(result.shortcutFileExists, true, "快捷键设置文件没有生成");
    assert.ok(
      result.settingsDir.endsWith(
        type === "mv" ? "/www/cheat-settings" : "/cheat-settings",
      ),
      `设置目录不符合引擎布局: ${result.settingsDir}`,
    );
    assert.equal(result.defaultShortcut, "ctrl c");
    assert.equal(result.changedShortcut, "alt q", "快捷键修改没有落盘");
    assert.equal(result.restoredShortcut, "alt w", "快捷键没有还原");
    assert.equal(result.kvFileValue, "世界", "KeyValueStorage 没有写入 UTF-8 内容");
    assert.equal(result.kvRead, "世界", "KeyValueStorage 没有读回内容");

    const gameSpeed = JSON.parse(result.gameSpeedData);
    assert.equal(gameSpeed.rate, 3);
    assert.equal(gameSpeed.sceneOption, "all");
  });
}
