import assert from "node:assert/strict";

export function registerGlobalVariable({ test, page }) {
  test("全局变量面板：导航 / 修改值 / JSON 编辑与新增 / 删除", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const key = "__cheatTestGlobalForUi";
      const panel = await api.openPanel(
        "global-variable-panel",
        "GlobalVariablePanel",
      );
      await api.waitFor(() => panel.initialLoaded, 15000, 100);

      window[key] = {
        nested: { value: 1, needle: "found" },
        list: [1, 2],
      };

      panel.reloadRootGlobals(true);
      panel.navigateTo([]);

      try {
        const rootEntry = panel.entries.find((entry) => entry.key === key);
        const rootFound = !!rootEntry;

        panel.enterEntry(rootEntry);
        const rootMembers = panel.entries.map((entry) => entry.key);

        const nestedEntry = panel.entries.find(
          (entry) => entry.key === "nested",
        );
        panel.enterEntry(nestedEntry);
        const nestedPath = panel.path.slice();

        const valueEntry = panel.entries.find((entry) => entry.key === "value");
        panel.onValueInput(valueEntry, "42");
        const valueChanged = window[key].nested.value === 42;

        // 修改后 entries 重新生成，valueText 应反映新值
        const valueEntryAfter = panel.entries.find(
          (entry) => entry.key === "value",
        );
        const valueText = valueEntryAfter?.valueText;

        // 新增属性
        panel.openJsonAdd(null);
        panel.jsonDialog.keyText = "added";
        panel.jsonDialog.text = '{"ok":true}';
        panel.submitJsonDialog();
        const added = JSON.stringify(window[key].nested.added);

        // 非法 JSON 不写入
        panel.openJsonAdd(null);
        panel.jsonDialog.keyText = "bad";
        panel.jsonDialog.text = "{bad json";
        panel.submitJsonDialog();
        const invalidError = panel.jsonDialog.error;
        const invalidNotWritten = !("bad" in window[key].nested);
        panel.closeJsonDialog();

        // 删除刚新增的属性
        panel.rebuildEntries();
        const addedEntry = panel.entries.find((entry) => entry.key === "added");
        panel.deleteEntry(addedEntry);
        const deleted = !("added" in window[key].nested);

        // 返回根层后用 JSON 编辑器整体替换嵌套对象
        panel.goUp();
        const nestedAtRoot = panel.entries.find(
          (entry) => entry.key === "nested",
        );
        panel.openJsonEditor(nestedAtRoot);
        panel.jsonDialog.text = '{"value":42,"needle":"found","replaced":true}';
        panel.submitJsonDialog();
        const replaced = window[key].nested.replaced === true;

        // 数组层新增元素
        const listEntry = panel.entries.find((entry) => entry.key === "list");
        panel.enterEntry(listEntry);
        panel.openJsonAdd(null);
        panel.jsonDialog.text = "3";
        panel.submitJsonDialog();
        const list = window[key].list.slice();

        return {
          rootFound,
          rootMembers,
          nestedPath,
          valueChanged,
          valueText,
          added,
          invalidError,
          invalidNotWritten,
          deleted,
          replaced,
          list,
          finalPath: panel.path.slice(),
        };
      } finally {
        delete window[key];
        panel.search = "";
        panel.deepSearch = false;
        panel.closeJsonDialog();
        panel.navigateTo([]);
        panel.reloadRootGlobals(true);
      }
    });

    assert.equal(result.rootFound, true, "新加入的全局变量没有出现在根列表");
    assert.ok(result.rootMembers.includes("nested"));
    assert.ok(result.rootMembers.includes("list"));
    assert.deepEqual(result.nestedPath, ["__cheatTestGlobalForUi", "nested"]);
    assert.equal(result.valueChanged, true, "数字输入没有写回全局变量");
    assert.equal(result.valueText, "42");
    assert.equal(result.added, '{"ok":true}', "JSON 新增属性失败");
    assert.ok(result.invalidError, "非法 JSON 没有显示错误");
    assert.equal(result.invalidNotWritten, true, "非法 JSON 被写入全局变量");
    assert.equal(result.deleted, true, "删除属性失败");
    assert.equal(result.replaced, true, "JSON 编辑没有整体替换对象");
    assert.deepEqual(result.list, [1, 2, 3], "数组新增元素失败");
    assert.deepEqual(result.finalPath, ["__cheatTestGlobalForUi", "list"]);
  });

  test("全局变量面板：根筛选 / 深度搜索跳转 / 搜索上限恢复默认", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const key = "__cheatTestGlobalSearch";
      const panel = await api.openPanel(
        "global-variable-panel",
        "GlobalVariablePanel",
      );
      await api.waitFor(() => panel.initialLoaded, 15000, 100);

      window[key] = { deep: { needle: "needle-unique-value" } };

      panel.reloadRootGlobals(true);
      panel.navigateTo([]);

      try {
        const pluginCount = panel.rootScan.plugin.length;

        panel.rootFilter = "plugin";
        panel.rebuildEntries();
        const pluginHasCustom = panel.entries.some(
          (entry) => entry.key === key,
        );

        panel.rootFilter = "rpg";
        panel.rebuildEntries();
        const rpgHasCustom = panel.entries.some((entry) => entry.key === key);
        const rpgHasGameParty = panel.entries.some(
          (entry) => entry.key === "$gameParty",
        );

        // 切到插件筛选后做一次深度搜索：根层只保留插件全局变量，
        // 避免把 $dataMap 这类超大对象也纳入遍历（会先触发搜索上限）。
        panel.rootFilter = "plugin";
        panel.navigateTo([]);

        // 等 rootFilter 的 watcher 跑完，否则它会在后面清掉刚设置的搜索词
        await new Promise((resolve) => setTimeout(resolve, 50));

        panel.deepSearch = true;
        panel.search = "needle-unique-value";
        await panel.runDeepSearch(panel.search);

        await api.waitFor(() => panel.deepSearchResults.length > 0, 5000, 50);

        const searchResult = panel.deepSearchResults[0];
        const searchPath = searchResult?.path?.slice();
        const searchTruncated = panel.deepSearchTruncated;

        panel.jumpToSearchResult(searchResult);
        const jumpedPath = panel.path.slice();
        const jumpedHighlight = panel.highlightKey;
        const searchCleared = panel.search === "";

        // 搜索上限：非法值回退默认，合法值取整
        panel.openSearchLimits();
        panel.limitsDialog.maxDepth = 0;
        panel.limitsDialog.maxResults = -1;
        panel.limitsDialog.maxNodes = "abc";
        panel.limitsDialog.maxKeysPerNode = 2.5;
        panel.limitsDialog.maxTimeMs = "10";
        panel.saveSearchLimits();

        const savedLimits = { ...panel.searchLimits };
        const limitsDialogClosed = panel.limitsDialog.show === false;

        return {
          pluginCount,
          pluginHasCustom,
          rpgHasCustom,
          rpgHasGameParty,
          searchPath,
          searchTruncated,
          jumpedPath,
          jumpedHighlight,
          searchCleared,
          savedLimits,
          limitsDialogClosed,
        };
      } finally {
        delete window[key];
        panel.search = "";
        panel.deepSearch = false;
        panel.navigateTo([]);
        panel.rootFilter = "all";
        panel.resetSearchLimits();
        panel.saveSearchLimits();
        panel.reloadRootGlobals(true);
      }
    });

    assert.ok(result.pluginCount > 0, "窗口扫描没有发现插件全局变量");
    assert.equal(result.pluginHasCustom, true, "插件筛选缺少自定义全局变量");
    assert.equal(result.rpgHasCustom, false, "RPG 筛选混入了插件全局变量");
    assert.equal(result.rpgHasGameParty, true, "RPG 筛选缺少 $gameParty");
    assert.deepEqual(result.searchPath, [
      "__cheatTestGlobalSearch",
      "deep",
      "needle",
    ]);
    assert.equal(result.searchTruncated, false);
    assert.deepEqual(result.jumpedPath, ["__cheatTestGlobalSearch", "deep"]);
    assert.equal(result.jumpedHighlight, "needle");
    assert.equal(result.searchCleared, true, "跳转后没有清空搜索词");
    assert.equal(result.savedLimits.maxDepth, 4, "非法 maxDepth 没有回退默认");
    assert.equal(result.savedLimits.maxResults, 300);
    assert.equal(result.savedLimits.maxNodes, 30000);
    assert.equal(result.savedLimits.maxKeysPerNode, 2, "合法上限没有取整");
    assert.equal(result.savedLimits.maxTimeMs, 10);
    assert.equal(result.limitsDialogClosed, true);
  });
}
