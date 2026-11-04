import assert from "node:assert/strict";

export function registerStability({ test, page }) {
  test("分页 helper：全部 / 空列表 / 越界页码", async () => {
    const result = await page.evaluate(async () => {
      const { getPageBounds, getPageCount, normalizeItemsPerPage } =
        await import(new URL("cheat/js/PaginationHelper.js", document.baseURI).href);

      return {
        all: getPageBounds(23, 3, -1),
        empty: getPageBounds(0, 1, 5),
        overflow: getPageBounds(23, 99, 5),
        normal: getPageBounds(23, 2, 5),
        normalized: [
          normalizeItemsPerPage(-1),
          normalizeItemsPerPage(5),
          normalizeItemsPerPage(0),
        ],
        allPageCount: getPageCount(23, -1),
      };
    });

    assert.equal(result.all.pageCount, 1);
    assert.equal(result.all.start, 1);
    assert.equal(result.all.stop, 23);
    assert.equal(result.empty.pageCount, 1);
    assert.equal(result.empty.start, 0);
    assert.equal(result.empty.stop, 0);
    assert.equal(result.overflow.pageCount, 5);
    assert.equal(result.overflow.page, 5);
    assert.equal(result.overflow.start, 21);
    assert.equal(result.overflow.stop, 23);
    assert.equal(result.normal.start, 6);
    assert.equal(result.normal.stop, 10);
    assert.deepEqual(result.normalized, [0, 5, 0]);
    assert.equal(result.allPageCount, 1);
  });

  test("原子写入：文件完整且不残留临时文件", async () => {
    const result = await page.evaluate(async () => {
      const { KeyValueStorage } = await import(
        new URL("cheat/js/KeyValueStorage.js", document.baseURI).href
      );
      const { getCheatSettingsPath } = await import(
        new URL("cheat/js/SettingsPath.js", document.baseURI).href
      );
      const fs = require("fs");
      const path = require("path");

      const file = getCheatSettingsPath("atomic-test.json");
      const storage = new KeyValueStorage(file);

      try {
        storage.setItem("a", JSON.stringify({ x: 1 }));
        storage.setItem("b", "世界");

        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        const dir = path.dirname(file);
        const leftovers = fs
          .readdirSync(dir)
          .filter(
            (name) =>
              name.startsWith("atomic-test.json.") && name.endsWith(".tmp"),
          );

        return {
          a: parsed.a,
          b: parsed.b,
          leftovers,
        };
      } finally {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          // ignore
        }
      }
    });

    assert.equal(result.a, JSON.stringify({ x: 1 }));
    assert.equal(result.b, "世界");
    assert.deepEqual(result.leftovers, []);
  });

  test("Alert 初始化阶段不调用原生 alert", async () => {
    const result = await page.evaluate(async () => {
      const { Alert } = await import(
        new URL("cheat/js/AlertHelper.js", document.baseURI).href
      );

      const originalAlert = window.alert;
      const originalHandler = Alert.handler;
      const originalPending = Alert.pending;
      let nativeCalled = false;

      try {
        window.alert = () => {
          nativeCalled = true;
        };
        Alert.setHandler(null);
        Alert.pending = [];
        Alert.warn("初始化阶段提示");
        return { nativeCalled, pending: Alert.pending.length };
      } finally {
        window.alert = originalAlert;
        Alert.pending = originalPending;
        Alert.setHandler(originalHandler);
      }
    });

    assert.equal(result.nativeCalled, false, "仍然调用了原生 alert");
    assert.equal(result.pending, 1, "未安装 snackbar 时提示没有进入队列");
  });

  test("点击守卫：作弊弹层内的点击被拦截", async () => {
    const result = await page.evaluate(async () => {
      const { isCheatUiTarget } = await import(
        new URL("cheat/js/ClickGuard.js", document.baseURI).href
      );

      const modal = document.createElement("div");
      modal.id = "cheat-modal";
      const modalChild = document.createElement("span");
      modal.appendChild(modalChild);

      const overlay = document.createElement("div");
      overlay.className = "v-overlay__content";
      const overlayChild = document.createElement("button");
      overlay.appendChild(overlayChild);

      const outside = document.createElement("div");

      document.body.appendChild(modal);
      document.body.appendChild(overlay);
      document.body.appendChild(outside);

      try {
        return {
          modal: isCheatUiTarget(modalChild),
          overlay: isCheatUiTarget(overlayChild),
          outside: isCheatUiTarget(outside),
          nullTarget: isCheatUiTarget(null),
        };
      } finally {
        modal.remove();
        overlay.remove();
        outside.remove();
      }
    });

    assert.equal(result.modal, true, "作弊窗口内的点击没有拦截");
    assert.equal(result.overlay, true, "弹层内的点击没有拦截");
    assert.equal(result.outside, false, "普通点击被误拦截");
    assert.equal(result.nullTarget, false);
  });

  test("技能搜索：description / name 缺失不崩溃", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel(
        "skill-setting-panel",
        "SkillSettingPanel",
      );
      await api.waitFor(() => panel.actors.length > 0, 5000, 50);

      const actor = panel.actors[0];
      const originalSkills = panel.allSkills;

      try {
        panel.allSkills = [
          {
            _skill: null,
            id: 99999,
            name: "BrokenSkill",
            description: undefined,
            iconIndex: 0,
          },
        ];
        actor.skillSearch = "broken";
        actor.onlyLearned = false;

        const filtered = panel.getFilteredSkills(actor);
        const extracted = panel.extractSkillData({ id: 1, name: "x" });

        return {
          filteredCount: filtered.length,
          extractedName: extracted.name,
          extractedDescription: extracted.description,
        };
      } finally {
        panel.allSkills = originalSkills;
        panel.initializeVariables();
      }
    });

    assert.equal(result.filteredCount, 1, "缺少 description 时搜索失败");
    assert.equal(result.extractedName, "x");
    assert.equal(result.extractedDescription, "");
  });

  test("变量面板：对象变量通过 JSON 编辑且非法 JSON 不写回", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel(
        "variable-setting-panel",
        "VariableSettingPanel",
      );
      await api.waitFor(() => panel.tableItems.length > 1, 5000, 50);

      const item = panel.tableItems.find((entry) => entry.id > 0);
      const oldValue = $gameVariables.value(item.id);

      try {
        $gameVariables.setValue(item.id, { a: 1, nested: [1, 2] });
        panel.initializeVariables();
        await new Promise((resolve) => setTimeout(resolve, 50));

        const complex = panel.tableItems.find((entry) => entry.id === item.id);
        const detected = panel.isComplexValue(complex.value);

        panel.openJsonEditor(complex);
        panel.jsonDialog.text = '{"b":2}';
        panel.saveJsonEditor();
        const saved = $gameVariables.value(item.id);

        panel.openJsonEditor(complex);
        panel.jsonDialog.text = "{bad json";
        panel.saveJsonEditor();
        const afterInvalid = $gameVariables.value(item.id);
        const errorText = panel.jsonDialog.error;

        panel.closeJsonEditor();

        return {
          detected,
          saved,
          afterInvalid,
          errorText,
          preview: panel.formatValuePreview({ a: 1 }),
        };
      } finally {
        $gameVariables.setValue(item.id, oldValue);
        panel.initializeVariables();
      }
    });

    assert.equal(result.detected, true, "对象变量没有被识别");
    assert.deepEqual(result.saved, { b: 2 });
    assert.deepEqual(result.afterInvalid, { b: 2 }, "非法 JSON 被写回变量");
    assert.ok(result.errorText, "非法 JSON 没有显示错误");
    assert.ok(result.preview.includes("a"), "JSON 预览不正确");
  });

  test("传送面板：空名称搜索与当前地图越界校验", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel("teleport-panel", "TeleportPanel");
      await api.waitFor(() => panel.maps.length > 0, 5000, 50);

      const originalMaps = panel.maps;
      const currentMapId = $gameMap.mapId();

      try {
        panel.maps = [
          { id: 1, name: null, fullPathJoin: null },
          { id: 2, name: "TestMap", fullPathJoin: "A / TestMap" },
        ];
        panel.search = "test";
        const filtered = panel.filteredMaps.length;

        panel.search = "";
        const negativeRejected =
          panel.teleportLocation(currentMapId, -1, 0) === false;
        const outOfBoundsRejected =
          panel.teleportLocation(
            currentMapId,
            $gameMap.width() + 10,
            0,
          ) === false;

        return { filtered, negativeRejected, outOfBoundsRejected };
      } finally {
        panel.maps = originalMaps;
        panel.search = "";
      }
    });

    assert.equal(result.filtered, 1, "空名称导致搜索崩溃或结果错误");
    assert.equal(result.negativeRejected, true, "负数坐标没有被拒绝");
    assert.equal(result.outOfBoundsRejected, true, "越界坐标没有被拒绝");
  });

  test("game-ready 保护与 markRaw", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const { isReactive } = await import(
        new URL("cheat/libs/vue.js", document.baseURI).href
      );

      const panel = await api.openPanel(
        "health-setting-panel",
        "HealthSettingPanel",
      );
      await api.waitFor(() => panel.party.length > 0, 5000, 50);

      const rawMember = isReactive(panel.party[0]);
      const rawArray = isReactive(panel.party);

      const realPlayer = $gamePlayer;
      const realParty = $gameParty;
      let threw = false;
      let emptyEnemy = -1;
      let emptyParty = -1;

      try {
        $gamePlayer = null;
        $gameParty = null;
        panel.initializeVariables();
        emptyEnemy = panel.enemy.length;
        emptyParty = panel.party.length;
      } catch (error) {
        threw = true;
      } finally {
        $gamePlayer = realPlayer;
        $gameParty = realParty;
      }

      panel.initializeVariables();

      return {
        threw,
        emptyEnemy,
        emptyParty,
        rawMember,
        rawArray,
      };
    });

    assert.equal(result.threw, false, "游戏数据未就绪时面板初始化抛错");
    assert.equal(result.emptyEnemy, 0);
    assert.equal(result.emptyParty, 0);
    assert.equal(result.rawMember, false, "Game_Actor 被 Vue 响应式代理");
    assert.equal(result.rawArray, false, "角色数组被 Vue 响应式代理");
  });

  test("旧快照回填：成功读取但无数据时只尝试一次", async () => {
    const result = await page.evaluate(async () => {
      const { SaveBackupCheat: Backups } = await import(
        new URL("cheat/js/SaveBackupHelper.js", document.baseURI).href
      );
      const fs = require("fs");
      const os = require("os");
      const path = require("path");

      const tempDir = path.join(
        os.tmpdir(),
        `cheat-backfill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      );
      fs.mkdirSync(tempDir, { recursive: true });

      const payloadFile = path.join(tempDir, "payload.json");
      const saveFile = path.join(tempDir, "file1.rpgsave");
      fs.writeFileSync(payloadFile, "x", "utf-8");
      fs.writeFileSync(saveFile, "x", "utf-8");

      const entry = {
        id: "manual-s1-test",
        slot: 1,
        createdAt: 0,
        mapId: 0,
        mapName: "",
        playtimeFrames: 0,
        playtime: "",
      };

      const originals = {
        findPayloadPath: Backups.findPayloadPath,
        getSaveFilePath: Backups.getSaveFilePath,
        readPayload: Backups.readPayload,
        readSavefileInfo: Backups.readSavefileInfo,
        readMeta: Backups.readMeta,
        writeMeta: Backups.writeMeta,
      };

      try {
        Backups.findPayloadPath = () => payloadFile;
        Backups.getSaveFilePath = () => saveFile;
        Backups.readPayload = () =>
          JSON.stringify({ system: {}, party: {} });
        Backups.readSavefileInfo = () => null;
        Backups.readMeta = () => null;
        Backups.writeMeta = () => {};

        const entries = [entry];
        const firstChanged = Backups.backfillMapFromIndex(entries);
        const secondChanged = Backups.backfillMapFromIndex(entries);

        return {
          firstChanged,
          secondChanged,
          checked: entry.payloadBackfillChecked === true,
        };
      } finally {
        Object.assign(Backups, originals);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    assert.equal(result.firstChanged, true, "第一次回填没有记录检查标记");
    assert.equal(result.checked, true, "回填后没有设置 payloadBackfillChecked");
    assert.equal(result.secondChanged, false, "已检查过的快照被重复回填");
  });
}
