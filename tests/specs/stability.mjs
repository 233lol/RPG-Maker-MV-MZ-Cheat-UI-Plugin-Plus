import assert from "node:assert/strict";

export function registerStability({ test, page }) {
  test("分页 helper：全部 / 空列表 / 越界页码", async () => {
    const result = await page.evaluate(async () => {
      const {
        clampPage,
        getPageBounds,
        getPageCount,
        normalizeItemsPerPage,
        paginate,
      } = await import(
        new URL("cheat/js/PaginationHelper.js", document.baseURI).href
      );

      return {
        all: getPageBounds(23, 3, -1),
        empty: getPageBounds(0, 1, 5),
        overflow: getPageBounds(23, 99, 5),
        normal: getPageBounds(23, 2, 5),
        normalized: [
          normalizeItemsPerPage(-1),
          normalizeItemsPerPage(5),
          normalizeItemsPerPage(0),
          normalizeItemsPerPage(2.7),
          normalizeItemsPerPage("abc"),
        ],
        allPageCount: getPageCount(23, -1),
        invalidCount: getPageCount(Number.NaN, 5),
        clamp: [
          clampPage(-1, 5),
          clampPage("abc", 5),
          clampPage(9, 5),
          clampPage(2, 0),
          clampPage(2.9, 5),
        ],
        paginated: paginate([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, 5),
        paginatedAll: paginate([0, 1, 2], 1, -1),
        paginatedInvalid: paginate(null, 1, 5),
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
    assert.deepEqual(result.normalized, [0, 5, 0, 2, 0]);
    assert.equal(result.allPageCount, 1);
    assert.equal(result.invalidCount, 1, "非法总数没有退化成 1 页");
    assert.deepEqual(result.clamp, [1, 1, 5, 1, 2]);
    assert.deepEqual(result.paginated, [5, 6, 7, 8, 9]);
    assert.deepEqual(result.paginatedAll, [0, 1, 2]);
    assert.deepEqual(result.paginatedInvalid, [], "非数组输入应返回空数组");
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
          panel.teleportLocation(currentMapId, $gameMap.width() + 10, 0) ===
          false;
        const fractionalRejected =
          panel.teleportLocation(currentMapId, 1.5, 0) === false;
        const missingMapRejected =
          panel.teleportLocation(999999, 0, 0) === false;

        const playerX = $gamePlayer.x;
        const playerY = $gamePlayer.y;
        const validAccepted =
          panel.teleportLocation(currentMapId, playerX, playerY) === true;
        const transferReserved = $gamePlayer._newMapId === currentMapId;
        $gamePlayer.clearTransferInfo();

        panel.inputX = String($gameMap.width() + 10);
        panel.inputY = "0";
        panel.sameMapTeleport();
        const sameMapBlocked =
          $gamePlayer.x === playerX && $gamePlayer.y === playerY;

        const targetX =
          playerX + 1 < $gameMap.width()
            ? playerX + 1
            : Math.max(0, playerX - 1);
        panel.inputX = String(targetX);
        panel.inputY = String(playerY);
        panel.sameMapTeleport();
        const sameMapMoved =
          $gamePlayer.x === targetX && $gamePlayer.y === playerY;

        $gamePlayer.setPosition(playerX, playerY);

        return {
          filtered,
          negativeRejected,
          outOfBoundsRejected,
          fractionalRejected,
          missingMapRejected,
          validAccepted,
          transferReserved,
          sameMapBlocked,
          sameMapMoved,
        };
      } finally {
        panel.maps = originalMaps;
        panel.search = "";
      }
    });

    assert.equal(result.filtered, 1, "空名称导致搜索崩溃或结果错误");
    assert.equal(result.negativeRejected, true, "负数坐标没有被拒绝");
    assert.equal(result.outOfBoundsRejected, true, "越界坐标没有被拒绝");
    assert.equal(result.fractionalRejected, true, "小数坐标没有被拒绝");
    assert.equal(result.missingMapRejected, true, "不存在的地图没有被拒绝");
    assert.equal(result.validAccepted, true, "合法传送被拒绝");
    assert.equal(result.transferReserved, true, "合法传送没有设置目标地图");
    assert.equal(result.sameMapBlocked, true, "当前地图越界传送仍然移动了玩家");
    assert.equal(result.sameMapMoved, true, "当前地图合法传送没有移动玩家");
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

      const member = panel.party[0];
      const originalHp = member.hp;
      const originalMp = member.mp;
      let detailThrew = false;
      let detailHp = null;
      let detailMp = null;

      try {
        panel.onDetailChange([
          { _member: member, hp: { hp: 1 }, mp: { mp: 0 } },
        ]);
        detailHp = member.hp;
        detailMp = member.mp;

        // 缺失 _member 的条目必须跳过；null 列表必须安全返回
        panel.onDetailChange([{ _member: null, hp: { hp: 1 }, mp: { mp: 0 } }]);
        panel.onDetailChange(null);
      } catch (error) {
        detailThrew = true;
      } finally {
        panel.onDetailChange([
          {
            _member: member,
            hp: { hp: originalHp },
            mp: { mp: originalMp },
          },
        ]);
      }

      const mapPanel = await api.openPanel("map-event-panel", "MapEventPanel");
      await api.waitFor(() => mapPanel.currentMapId > 0, 10000, 100);

      return {
        threw,
        emptyEnemy,
        emptyParty,
        rawMember,
        rawArray,
        detailThrew,
        detailHp,
        detailMp,
        detailRestored: member.hp === originalHp && member.mp === originalMp,
        mapDataRaw: !isReactive(mapPanel.mapData),
        regularEventsRaw: !isReactive(mapPanel.regularEvents),
      };
    });

    assert.equal(result.threw, false, "游戏数据未就绪时面板初始化抛错");
    assert.equal(result.emptyEnemy, 0);
    assert.equal(result.emptyParty, 0);
    assert.equal(result.rawMember, false, "Game_Actor 被 Vue 响应式代理");
    assert.equal(result.rawArray, false, "角色数组被 Vue 响应式代理");
    assert.equal(result.detailThrew, false, "缺失 _member 的详情条目导致报错");
    assert.equal(result.detailHp, 1, "详情面板没有写入 HP");
    assert.equal(result.detailMp, 0, "详情面板没有写入 MP");
    assert.equal(result.detailRestored, true, "详情面板测试后 HP/MP 没有还原");
    assert.equal(result.mapDataRaw, true, "地图数据被 Vue 响应式代理");
    assert.equal(
      result.regularEventsRaw,
      true,
      "地图事件数组被 Vue 响应式代理",
    );
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
        Backups.readPayload = () => JSON.stringify({ system: {}, party: {} });
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

  test("分页 mixin：过滤后当前页自动收回到有效范围", async () => {
    const result = await page.evaluate(async () => {
      const { paginationWatcherMixin } = await import(
        new URL("cheat/js/PaginationHelper.js", document.baseURI).href
      );
      const { nextTick } = await import(
        new URL("cheat/libs/vue.js", document.baseURI).href
      );

      const fake = { pagination: { page: 5 } };
      paginationWatcherMixin.watch.pageCount.call(fake, 2);
      const clampedByMixin = fake.pagination.page;

      const noPagination = { pagination: null };
      paginationWatcherMixin.watch.pageCount.call(noPagination, 0);

      const zeroPageCount = { pagination: { page: 3 } };
      paginationWatcherMixin.watch.pageCount.call(zeroPageCount, 0);

      const api = window.__cheatTest;
      const panel = await api.openPanel("teleport-panel", "TeleportPanel");
      await api.waitFor(() => panel.maps.length > 0, 5000, 50);

      const originalMaps = panel.maps;
      let integration;

      try {
        panel.maps = Array.from({ length: 5 }, (_, index) => ({
          id: index + 1,
          name: `M${index}`,
          fullPathJoin: `M${index}`,
        }));
        panel.pagination.itemsPerPage = 1;
        panel.pagination.page = 2;
        await nextTick();

        const beforePageCount = panel.pageCount;
        const beforePage = panel.pagination.page;
        panel.search = "__no_such_map__";
        await nextTick();
        await nextTick();

        integration = {
          beforePage,
          beforePageCount,
          afterPageCount: panel.pageCount,
          page: panel.pagination.page,
        };
      } finally {
        panel.search = "";
        panel.maps = originalMaps;
        panel.pagination.itemsPerPage = 5;
        panel.pagination.page = 1;
      }

      return {
        clampedByMixin,
        noPagination: noPagination.pagination,
        zeroPageCount: zeroPageCount.pagination.page,
        integration,
      };
    });

    assert.equal(result.clampedByMixin, 2, "mixin 没有把页码收回到最后一页");
    assert.equal(
      result.noPagination,
      null,
      "没有 pagination 的组件不应被 mixin 修改",
    );
    assert.equal(result.zeroPageCount, 3, "pageCount 为 0 时不应改写页码");
    assert.equal(result.integration.beforePage, 2);
    assert.equal(result.integration.beforePageCount, 5);
    assert.equal(result.integration.afterPageCount, 1);
    assert.equal(result.integration.page, 1, "过滤后页码没有自动收回第一页");
  });

  test("Alert 队列：超出上限丢弃最旧提示并在安装 handler 后清空", async () => {
    const result = await page.evaluate(async () => {
      const { Alert } = await import(
        new URL("cheat/js/AlertHelper.js", document.baseURI).href
      );

      const originalHandler = Alert.handler;
      const originalPending = Alert.pending;
      const originalAlert = window.alert;
      const flushed = [];
      let nativeCalled = false;

      const handler = (level, msg) => {
        flushed.push(`${level}:${msg}`);
      };

      try {
        window.alert = () => {
          nativeCalled = true;
        };
        Alert.setHandler(null);
        Alert.pending = [];

        for (let i = 0; i < 25; i++) {
          Alert.warn(`m${i}`);
        }

        const overflow = Alert.pending.length;
        const oldest = Alert.pending[0]?.msg;

        Alert.setHandler(handler);
        const afterFlush = Alert.pending.length;
        const flushedCount = flushed.length;
        const flushedFirst = flushed[0];

        Alert.clearHandler(handler);
        const cleared = Alert.handler === null;

        Alert.info("after-clear");
        const pendingAfterClear = Alert.pending.length;

        return {
          nativeCalled,
          overflow,
          oldest,
          afterFlush,
          flushedCount,
          flushedFirst,
          cleared,
          pendingAfterClear,
        };
      } finally {
        window.alert = originalAlert;
        Alert.pending = originalPending;
        Alert.setHandler(originalHandler);
      }
    });

    assert.equal(result.nativeCalled, false, "队列模式下仍然调用了原生 alert");
    assert.equal(result.overflow, 20, "待显示提示没有限制在 20 条以内");
    assert.equal(result.oldest, "m5", "超出上限时没有丢弃最旧的提示");
    assert.equal(result.afterFlush, 0, "安装 handler 后队列没有清空");
    assert.equal(
      result.flushedCount,
      20,
      "安装 handler 后没有补显示队列里的提示",
    );
    assert.equal(result.flushedFirst, "warn:m5");
    assert.equal(result.cleared, true, "clearHandler 没有解除当前 handler");
    assert.equal(
      result.pendingAfterClear,
      1,
      "解除 handler 后提示没有回到队列",
    );
  });

  test("GameState：数据未就绪时安全返回 false 并给出一次提示", async () => {
    const result = await page.evaluate(async () => {
      const { Alert } = await import(
        new URL("cheat/js/AlertHelper.js", document.baseURI).href
      );
      const {
        getGameParty,
        getGamePlayer,
        isGameReady,
        isPartyReady,
        isSwitchesReady,
        isVariablesReady,
        requireGameReady,
        requirePartyReady,
        requireSwitchesReady,
        requireVariablesReady,
      } = await import(new URL("cheat/js/GameState.js", document.baseURI).href);

      const originalHandler = Alert.handler;
      const originalPending = Alert.pending;
      const real = {
        player: $gamePlayer,
        party: $gameParty,
        map: $gameMap,
        system: $gameSystem,
        switches: $gameSwitches,
        variables: $gameVariables,
      };
      const messages = [];

      try {
        Alert.pending = [];
        Alert.setHandler((level, msg) => messages.push({ level, msg }));

        const ready = {
          game: isGameReady(),
          party: isPartyReady(),
          switches: isSwitchesReady(),
          variables: isVariablesReady(),
        };

        $gamePlayer = null;
        $gameParty = null;
        $gameSwitches = null;
        $gameVariables = null;

        const notReady = {
          game: isGameReady(),
          party: isPartyReady(),
          switches: isSwitchesReady(),
          variables: isVariablesReady(),
          player: getGamePlayer(),
          partyRef: getGameParty(),
        };

        const results = [
          requireGameReady("穿墙"),
          requirePartyReady("恢复队伍"),
          requireSwitchesReady("修改开关"),
          requireVariablesReady("修改变量"),
        ];

        return { ready, notReady, results, messages };
      } finally {
        $gamePlayer = real.player;
        $gameParty = real.party;
        $gameMap = real.map;
        $gameSystem = real.system;
        $gameSwitches = real.switches;
        $gameVariables = real.variables;
        Alert.pending = originalPending;
        Alert.setHandler(originalHandler);
      }
    });

    assert.deepEqual(result.ready, {
      game: true,
      party: true,
      switches: true,
      variables: true,
    });
    assert.deepEqual(result.notReady, {
      game: false,
      party: false,
      switches: false,
      variables: false,
      player: null,
      partyRef: null,
    });
    assert.deepEqual(result.results, [false, false, false, false]);
    assert.equal(result.messages.length, 4, "每个失败的就绪检查都应提示一次");
    assert.equal(result.messages[0].level, "warn");
    assert.ok(
      result.messages[0].msg.includes("游戏尚未加载完成") &&
        result.messages[0].msg.includes("穿墙"),
      `提示内容不正确: ${result.messages[0].msg}`,
    );
  });

  test("原子写入：自动创建目录、失败时清理临时文件且不破坏已存在目录", async () => {
    const result = await page.evaluate(async () => {
      const { writeJsonAtomic, writeTextAtomic } = await import(
        new URL("cheat/js/AtomicFile.js", document.baseURI).href
      );
      const fs = require("fs");
      const os = require("os");
      const path = require("path");

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheat-atomic-"));

      try {
        const textFile = path.join(dir, "a", "b", "text.txt");
        writeTextAtomic(textFile, "你好");
        const text = fs.readFileSync(textFile, "utf-8");

        const jsonFile = path.join(dir, "c", "data.json");
        writeJsonAtomic(jsonFile, { a: 1, b: "世界" });
        const json = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));

        const targetDir = path.join(dir, "target-dir");
        fs.mkdirSync(targetDir);

        let failed = false;
        try {
          writeTextAtomic(targetDir, "x");
        } catch (error) {
          failed = true;
        }

        const leftovers = fs
          .readdirSync(dir)
          .filter(
            (name) => name.startsWith("target-dir.") && name.endsWith(".tmp"),
          );

        return {
          text,
          json,
          failed,
          leftovers,
          dirKept: fs.statSync(targetDir).isDirectory(),
        };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    assert.equal(result.text, "你好");
    assert.deepEqual(result.json, { a: 1, b: "世界" });
    assert.equal(result.failed, true, "写入目录路径时没有抛错");
    assert.deepEqual(result.leftovers, [], "失败后残留了临时文件");
    assert.equal(result.dirKept, true, "失败后破坏了已存在的目录");
  });

  test("点击守卫：菜单 / snackbar / tooltip 与异常 target", async () => {
    const result = await page.evaluate(async () => {
      const { isCheatUiTarget, shouldIgnoreTouchEvent } = await import(
        new URL("cheat/js/ClickGuard.js", document.baseURI).href
      );

      const make = (className) => {
        const wrapper = document.createElement("div");
        wrapper.className = className;
        const child = document.createElement("span");
        wrapper.appendChild(child);
        document.body.appendChild(wrapper);
        return { wrapper, child };
      };

      const menu = make("v-menu");
      const snackbar = make("v-snackbar");
      const tooltip = make("v-tooltip");

      try {
        const weird = {
          closest() {
            throw new Error("boom");
          },
        };

        return {
          menu: isCheatUiTarget(menu.child),
          snackbar: isCheatUiTarget(snackbar.child),
          tooltip: isCheatUiTarget(tooltip.child),
          menuEvent: shouldIgnoreTouchEvent({ target: menu.child }),
          nullEvent: shouldIgnoreTouchEvent(null),
          emptyEvent: shouldIgnoreTouchEvent({}),
          weirdTarget: isCheatUiTarget(weird),
          nonElement: isCheatUiTarget({ closest: 1 }),
        };
      } finally {
        menu.wrapper.remove();
        snackbar.wrapper.remove();
        tooltip.wrapper.remove();
      }
    });

    assert.equal(result.menu, true, ".v-menu 内的点击没有拦截");
    assert.equal(result.snackbar, true, ".v-snackbar 内的点击没有拦截");
    assert.equal(result.tooltip, true, ".v-tooltip 内的点击没有拦截");
    assert.equal(result.menuEvent, true, "事件形式的菜单点击没有拦截");
    assert.equal(result.nullEvent, false);
    assert.equal(result.emptyEvent, false);
    assert.equal(result.weirdTarget, false, "closest 抛错时应安全返回 false");
    assert.equal(result.nonElement, false);
  });

  test("存读位置：损坏的持久化数据与未就绪状态不会崩溃", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const { KEY_VALUE_STORAGE } = await import(
        new URL("cheat/js/KeyValueStorage.js", document.baseURI).href
      );

      const panel = await api.openPanel("save-recall-panel", "SaveRecallPanel");
      await api.waitFor(() => panel.locations, 5000, 50);

      const originalRaw = KEY_VALUE_STORAGE.getItem("cheat.locations");
      const originalLocations = panel.locations;
      const realPlayer = $gamePlayer;

      try {
        KEY_VALUE_STORAGE.setItem("cheat.locations", "{bad json");
        panel.loadLocations();
        const badJson = panel.locations.length;

        KEY_VALUE_STORAGE.setItem(
          "cheat.locations",
          JSON.stringify([{ name: null, mapId: "x" }]),
        );
        panel.loadLocations();
        const badShape = panel.locations.length;

        KEY_VALUE_STORAGE.setItem(
          "cheat.locations",
          JSON.stringify([{ name: "ok", mapId: 1, x: 0, y: 0 }]),
        );
        panel.loadLocations();
        const good = panel.locations.length;

        panel.locations = [{ name: null, mapId: 999999, x: 0, y: 0 }];
        panel.search = "zzz";
        const nullNameSearch = panel.filteredTableItems.length;
        const missingMapName = panel.tableItems[0]?.mapName;
        panel.search = "";

        $gamePlayer = null;
        const before = panel.locations.length;
        panel.addLocation("blocked");
        const blockedAdd = panel.locations.length === before;
        panel.teleportLocation(1, 0, 0);
        $gamePlayer = realPlayer;

        return {
          badJson,
          badShape,
          good,
          nullNameSearch,
          missingMapName,
          blockedAdd,
        };
      } finally {
        $gamePlayer = realPlayer;
        KEY_VALUE_STORAGE.setItem("cheat.locations", originalRaw ?? "");
        panel.locations = originalLocations;
        panel.search = "";
      }
    });

    assert.equal(result.badJson, 0, "非法 JSON 没有重置为空列表");
    assert.equal(result.badShape, 0, "结构错误的存档位置没有重置为空列表");
    assert.equal(result.good, 1, "合法存档位置没有被加载");
    assert.equal(result.nullNameSearch, 0, "空别名搜索崩溃或结果错误");
    assert.equal(result.missingMapName, "NULL", "缺失地图没有显示 NULL");
    assert.equal(result.blockedAdd, true, "游戏未就绪时仍然写入了保存位置");
  });

  test("物品面板：数量修改、非法输入回滚与全部页码", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const { isReactive } = await import(
        new URL("cheat/libs/vue.js", document.baseURI).href
      );
      const { getPageBounds } = await import(
        new URL("cheat/js/PaginationHelper.js", document.baseURI).href
      );

      await api.openPanel("item-setting-panel", "ItemSettingPanel");
      const tab = await api.waitFor(
        () => api.findComponent("ItemTableTab")?.proxy,
        5000,
        50,
      );
      await api.waitFor(() => tab.tableItems.length > 0, 5000, 50);

      const item =
        tab.tableItems.find(
          (entry) => entry._item && $gameParty.numItems(entry._item) > 0,
        ) || tab.tableItems.find((entry) => entry._item);

      const original = $gameParty.numItems(item._item);
      const target = original > 0 ? original - 1 : 1;

      try {
        item.amount = target;
        tab.onItemChange(item);
        const changed = $gameParty.numItems(item._item);

        item.amount = "abc";
        tab.onItemChange(item);
        const invalidRollback = item.amount === changed;

        item.amount = original;
        tab.onItemChange(item);
        const restored = $gameParty.numItems(item._item);

        const originalPerPage = tab.pagination.itemsPerPage;
        const originalPage = tab.pagination.page;

        tab.pagination.itemsPerPage = -1;
        tab.pagination.page = 1;

        const allBounds = getPageBounds(
          tab.totalCount,
          tab.pagination.page,
          tab.pagination.itemsPerPage,
        );
        const all = {
          start: allBounds.start,
          stop: allBounds.stop,
          pageCount: tab.pageCount,
          total: tab.totalCount,
        };

        tab.pagination.itemsPerPage = originalPerPage;
        tab.pagination.page = originalPage;

        return {
          id: item._item.id,
          original,
          target,
          changed,
          invalidRollback,
          restored,
          all,
          reactive: isReactive(item._item),
        };
      } finally {
        if ($gameParty.numItems(item._item) !== original) {
          item.amount = original;
          tab.onItemChange(item);
        }
      }
    });

    assert.equal(
      result.changed,
      result.target,
      `物品 ${result.id} 数量没有写入`,
    );
    assert.equal(result.invalidRollback, true, "非法数量没有回滚到实际数量");
    assert.equal(result.restored, result.original, "物品数量没有还原");
    assert.equal(result.all.start, 1);
    assert.equal(result.all.stop, result.all.total);
    assert.equal(result.all.pageCount, 1);
    assert.equal(result.reactive, false, "道具数据被 Vue 响应式代理");
  });

  test("技能面板：添加 / 移除技能、已学过滤与分页边界", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const { getPageBounds } = await import(
        new URL("cheat/js/PaginationHelper.js", document.baseURI).href
      );
      const panel = await api.openPanel(
        "skill-setting-panel",
        "SkillSettingPanel",
      );
      await api.waitFor(() => panel.actors.length > 0, 5000, 50);

      const actor = panel.actors[0];
      const gameActor = actor._actor;
      const initialIds = gameActor.skills().map((skill) => skill.id);
      const candidate = panel.allSkills.find(
        (entry) =>
          entry &&
          entry._skill &&
          Number.isInteger(entry._skill.id) &&
          entry._skill.id > 0 &&
          !initialIds.includes(entry._skill.id),
      );

      let added = null;
      let removed = null;

      try {
        actor.onlyLearned = false;
        actor.skillSearch = "";

        if (candidate) {
          panel.addSkill(actor, candidate);
          added = gameActor
            .skills()
            .some((skill) => skill.id === candidate._skill.id);

          panel.removeSkill(actor, candidate);
          removed = !gameActor
            .skills()
            .some((skill) => skill.id === candidate._skill.id);
        }

        actor.pagination.itemsPerPage = 5;
        actor.pagination.page = 999;
        panel.clampActorPage(actor);
        const clamped = {
          page: actor.pagination.page,
          pageCount: panel.pageCountFor(actor),
        };

        actor.pagination.itemsPerPage = -1;
        actor.pagination.page = 1;
        actor.onlyLearned = false;
        actor.skillSearch = "";
        const allTotal = panel.totalCountFor(actor);
        const allBounds = getPageBounds(
          allTotal,
          actor.pagination.page,
          actor.pagination.itemsPerPage,
        );
        const all = {
          total: allTotal,
          start: allBounds.start,
          stop: allBounds.stop,
          pageCount: panel.pageCountFor(actor),
        };

        actor.pagination.itemsPerPage = 5;
        actor.pagination.page = 1;

        actor.onlyLearned = true;
        const learnedFiltered = panel.getFilteredSkills(actor);
        const learnedIds = gameActor.skills().map((skill) => skill.id);
        const onlyLearnedOk = learnedFiltered.every((entry) =>
          learnedIds.includes(entry.id),
        );

        actor.onlyLearned = false;
        actor.skillSearch = "";

        return {
          hasCandidate: !!candidate,
          added,
          removed,
          initial: initialIds.length,
          final: gameActor.skills().length,
          clamped,
          all,
          onlyLearnedOk,
          learnedCount: learnedFiltered.length,
          total: panel.totalCountFor(actor),
        };
      } finally {
        actor.onlyLearned = false;
        actor.skillSearch = "";
        actor.pagination.itemsPerPage = 5;
        actor.pagination.page = 1;
        panel.initializeVariables();
      }
    });

    assert.equal(result.hasCandidate, true, "测试游戏没有可学习的技能");
    assert.equal(result.added, true, "添加技能失败");
    assert.equal(result.removed, true, "移除技能失败");
    assert.equal(result.final, result.initial, "技能数量没有还原");
    assert.equal(result.clamped.page, result.clamped.pageCount);
    assert.ok(result.clamped.page >= 1, "页码没有收回有效范围");
    assert.equal(result.all.start, 1);
    assert.equal(result.all.stop, result.all.total);
    assert.equal(result.all.pageCount, 1);
    assert.equal(result.onlyLearnedOk, true, "已学过滤返回了未学习的技能");
    assert.ok(result.learnedCount <= result.total, "已学过滤数量异常");
  });
}
