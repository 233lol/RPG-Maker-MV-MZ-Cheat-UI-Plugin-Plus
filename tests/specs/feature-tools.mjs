import assert from "node:assert/strict";

// 全局变量收藏 / 撤销、物品锁定、事件工具、游戏统计面板的端到端冒烟测试。
// 所有会改动游戏状态的步骤都在 finally 里恢复原值。
export function registerFeatureTools({ test, page }) {
  test("全局变量面板：收藏完整路径并撤销修改", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const key = "__cheatTestFavoriteAndUndo";
      const panel = await api.openPanel(
        "global-variable-panel",
        "GlobalVariablePanel",
      );

      await api.waitFor(() => panel.initialLoaded, 15000, 100);
      window[key] = { value: 1, other: 2 };
      panel.reloadRootGlobals(true);
      panel.navigateTo([]);

      try {
        const rootEntry = panel.entries.find((entry) => entry.key === key);
        panel.enterEntry(rootEntry);

        const valueEntry = panel.entries.find((entry) => entry.key === "value");
        panel.toggleEntryFavorite(valueEntry);

        const favoritePaths = panel.favoritePaths.map((path) => path.slice());

        panel.showFavoritesOnly = true;
        await panel.$nextTick();
        panel.pagination.page = 1;
        panel.pagination.itemsPerPage = 50;
        const favoriteRows = panel.pagedEntries.map((row) => row.pathText);

        panel.showFavoritesOnly = false;
        panel.navigateTo([key]);
        const valueEntryAgain = panel.entries.find(
          (entry) => entry.key === "value",
        );
        panel.onValueInput(valueEntryAgain, "9");
        const afterChange = window[key].value;

        panel.undoLastChange();
        const afterUndo = window[key].value;
        const undoStackLength = panel.undoStack.length;

        return {
          favoritePaths,
          favoriteRows,
          afterChange,
          afterUndo,
          undoStackLength,
        };
      } finally {
        panel.showFavoritesOnly = false;
        panel.favoritePaths = [];
        delete window[key];
        panel.navigateTo([]);
        panel.reloadRootGlobals(true);
      }
    });

    assert.deepEqual(result.favoritePaths, [
      ["__cheatTestFavoriteAndUndo", "value"],
    ]);
    assert.deepEqual(result.favoriteRows, ["__cheatTestFavoriteAndUndo.value"]);
    assert.equal(result.afterChange, 9);
    assert.equal(result.afterUndo, 1, "撤销没有恢复旧值");
    assert.equal(result.undoStackLength, 0);
  });

  test("物品面板：锁定数量后持续写回，解除锁定后不再干预", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      await api.openPanel("item-setting-panel", "ItemSettingPanel");

      const tab = await api.waitFor(
        () => api.findComponent("ItemTableTab")?.proxy,
        5000,
        50,
      );
      await api.waitFor(() => tab.tableItems.length > 0, 5000, 50);

      const row = tab.tableItems.find(
        (entry) =>
          entry._item &&
          entry._item.id > 0 &&
          $gameParty.numItems(entry._item) < 95,
      );

      if (!row) {
        throw new Error("道具面板没有找到可锁定的道具");
      }

      const item = row._item;
      const originalAmount = $gameParty.numItems(item);
      const originalLocked = !!row.lockEnabled;

      try {
        tab.toggleItemLock(row);
        const lockedAmount = $gameParty.numItems(item);

        $gameParty.gainItem(item, 5);
        const changedAmount = $gameParty.numItems(item);

        await new Promise((resolve) => setTimeout(resolve, 1300));
        const restoredAmount = $gameParty.numItems(item);

        tab.toggleItemLock(row);
        const unlocked = !row.lockEnabled;

        return {
          originalAmount,
          lockedAmount,
          changedAmount,
          restoredAmount,
          unlocked,
        };
      } finally {
        if (row.lockEnabled) {
          tab.toggleItemLock(row);
        }

        if (originalLocked !== !!row.lockEnabled) {
          tab.toggleItemLock(row);
        }

        const currentAmount = $gameParty.numItems(item);
        $gameParty.gainItem(item, originalAmount - currentAmount);
        tab.initializeVariables();
      }
    });

    assert.equal(
      result.lockedAmount,
      result.originalAmount,
      "锁定值不是当前持有数量",
    );
    assert.equal(
      result.changedAmount,
      result.originalAmount + 5,
      "测试没有成功改变道具数量",
    );
    assert.equal(
      result.restoredAmount,
      result.originalAmount,
      "锁定没有把数量写回",
    );
    assert.equal(result.unlocked, true, "再次点击没有解除锁定");
  });

  test("地图事件工具：读取 / 切换独立开关并列出公共事件", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel("map-event-panel", "MapEventPanel");

      await api.waitFor(() => panel.currentMapId > 0, 10000, 100);

      panel.updateMapEvents();
      panel.initializeEventTools();

      const eventOptions = panel.eventOptions.map((option) => option.id);
      const eventId = panel.eventTools.selectedEventId;
      const originalA = panel.eventTools.selfSwitches.A;

      try {
        panel.onSelfSwitchChange("A", !originalA);
        const changed = panel.eventTools.selfSwitches.A;

        panel.onSelfSwitchChange("A", originalA);
        const restored = panel.eventTools.selfSwitches.A;

        return {
          eventOptions,
          eventId,
          originalA,
          changed,
          restored,
          commonEventCount: panel.commonEventOptions.length,
        };
      } finally {
        panel.onSelfSwitchChange("A", originalA);
      }
    });

    assert.ok(result.eventOptions.length > 0, "当前地图没有事件");
    assert.ok(result.eventId > 0, "事件工具没有选中事件");
    assert.equal(result.changed, !result.originalA, "独立开关没有切换");
    assert.equal(result.restored, result.originalA, "独立开关没有恢复");
    assert.ok(result.commonEventCount > 0, "没有读取到公共事件");
  });

  test("游戏统计面板：读取并写回步数 / 游玩时长", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel("game-system-panel", "GameSystemPanel");

      await api.waitFor(() => panel.ready, 10000, 100);

      const originalSteps = $gameParty._steps;
      const originalPlaytime = $gameSystem.playtime();

      try {
        panel.steps = originalSteps + 1;
        panel.onStepsChange();
        const changedSteps = $gameParty._steps;

        panel.playtimeSeconds = originalPlaytime + 1;
        panel.onPlaytimeChange();
        const changedPlaytime = $gameSystem.playtime();

        return {
          ready: panel.ready,
          mapId: panel.mapId,
          gameMapId: $gameMap.mapId(),
          partySize: panel.partySize,
          gamePartySize: $gameParty.members().length,
          originalSteps,
          changedSteps,
          originalPlaytime,
          changedPlaytime,
        };
      } finally {
        panel.steps = originalSteps;
        panel.onStepsChange();
        panel.playtimeSeconds = originalPlaytime;
        panel.onPlaytimeChange();
        panel.initializeVariables();
      }
    });

    assert.equal(result.ready, true);
    assert.equal(result.mapId, result.gameMapId);
    assert.equal(result.partySize, result.gamePartySize);
    assert.equal(result.changedSteps, result.originalSteps + 1);
    assert.equal(result.changedPlaytime, result.originalPlaytime + 1);
  });
}
