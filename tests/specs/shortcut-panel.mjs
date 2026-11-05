import assert from "node:assert/strict";

export function registerShortcutPanel({ test, page }) {
  test("快捷键面板：修改 / 冲突保护 / 搜索 / 参数校验 / 恢复默认", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const base = document.baseURI;
      const { GLOBAL_SHORTCUT } = await import(
        new URL("cheat/js/GlobalShortcut.js", base).href
      );
      const { Key } = await import(new URL("cheat/js/KeyCodes.js", base).href);

      const panel = await api.openPanel("shortcut-panel", "ShortcutPanel");
      await api.waitFor(() => panel.shortcuts.length > 0, 5000, 50);

      const item = panel.shortcuts.find((entry) => entry.id === "toggleNoClip");
      const quickSave = panel.shortcuts.find(
        (entry) => entry.id === "quickSave",
      );
      const oldShortcut = item.shortcut.asString();
      const oldSlot = GLOBAL_SHORTCUT.getParam("quickSave", "slot");

      try {
        panel.onShortcutChange(Key.fromString("alt q"), item);
        const runtimeAfterChange =
          GLOBAL_SHORTCUT.getShortcut("toggleNoClip").asString();
        const itemAfterChange = item.shortcut.asString();
        const diskAfterChange = JSON.parse(
          require("fs").readFileSync(
            GLOBAL_SHORTCUT.shortcutSettingsFile,
            "utf8",
          ),
        ).toggleNoClip.shortcut;

        // 冲突键：ctrl c 已被「打开作弊窗口」占用
        panel.onShortcutChange(Key.fromString("ctrl c"), item);
        const runtimeAfterConflict =
          GLOBAL_SHORTCUT.getShortcut("toggleNoClip").asString();
        const itemAfterConflict = item.shortcut.asString();

        // 搜索：按名称 / 键位过滤
        panel.search = item.name;
        const byName = panel.filteredShortcuts.map((entry) => entry.id);
        panel.search = "";
        panel.shortcutSearch = Key.fromString("alt q");
        panel.onShortcutSearchChange(panel.shortcutSearch);
        const byKey = panel.filteredShortcuts.map((entry) => entry.id);
        panel.shortcutSearch = Key.createEmpty();

        // 参数展开
        panel.changeExpanded(quickSave);
        const expandedOnce = panel.tableExpanded.slice();
        panel.changeExpanded(quickSave);
        const expandedTwice = panel.tableExpanded.slice();

        // 参数校验：合法写入、越界拒绝并回滚显示值
        panel.onParameterChange("2", quickSave, "slot");
        const slotAfterValid = GLOBAL_SHORTCUT.getParam("quickSave", "slot");
        const slotItemAfterValid = quickSave.param.slot.value;

        panel.onParameterChange("999999", quickSave, "slot");
        const slotAfterInvalid = GLOBAL_SHORTCUT.getParam("quickSave", "slot");
        const slotItemAfterInvalid = quickSave.param.slot.value;

        // 恢复默认会重新读取磁盘并重建列表
        panel.restoreToDefault();
        const restored = GLOBAL_SHORTCUT.getShortcut("toggleNoClip").asString();
        const itemCountAfterRestore = panel.shortcuts.length;

        return {
          oldShortcut,
          runtimeAfterChange,
          itemAfterChange,
          diskAfterChange,
          runtimeAfterConflict,
          itemAfterConflict,
          byName,
          byKey,
          expandedOnce,
          expandedTwice,
          slotAfterValid,
          slotItemAfterValid,
          slotAfterInvalid,
          slotItemAfterInvalid,
          restored,
          itemCountAfterRestore,
        };
      } finally {
        panel.search = "";
        panel.shortcutSearch = Key.createEmpty();
        panel.tableExpanded = [];
        GLOBAL_SHORTCUT.setParam("quickSave", "slot", oldSlot);
        GLOBAL_SHORTCUT.restoreDefaultSettings();
        panel.initializeVariables();
      }
    });

    assert.equal(result.oldShortcut, "alt w");
    assert.equal(result.runtimeAfterChange, "alt q", "快捷键修改没有立即生效");
    assert.equal(result.itemAfterChange, "alt q", "列表项没有同步新快捷键");
    assert.equal(result.diskAfterChange, "alt q", "快捷键修改没有落盘");
    assert.equal(result.runtimeAfterConflict, "alt q", "冲突快捷键被错误写入");
    assert.equal(result.itemAfterConflict, "alt q", "冲突后列表项被改坏");
    assert.deepEqual(result.byName, ["toggleNoClip"]);
    assert.deepEqual(result.byKey, ["toggleNoClip"]);
    assert.deepEqual(result.expandedOnce, ["quickSave"]);
    assert.deepEqual(result.expandedTwice, []);
    assert.equal(result.slotAfterValid, 2);
    assert.equal(result.slotItemAfterValid, 2);
    assert.equal(result.slotAfterInvalid, 2, "越界参数被写入");
    assert.equal(result.slotItemAfterInvalid, 2, "越界后输入框没有回滚");
    assert.equal(result.restored, "alt w", "恢复默认快捷键失败");
    assert.ok(result.itemCountAfterRestore > 0);
  });
}
