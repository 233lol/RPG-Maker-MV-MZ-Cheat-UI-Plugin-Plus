import assert from "node:assert/strict";

const PANELS = [
  { nav: "general-panel", component: "GeneralPanel" },
  { nav: "game-system-panel", component: "GameSystemPanel" },
  { nav: "health-setting-panel", component: "HealthSettingPanel" },
  { nav: "stats-setting-panel", component: "StatsSettingPanel" },
  { nav: "party-panel", component: "PartyPanel" },
  { nav: "item-setting-panel", component: "ItemSettingPanel" },
  { nav: "weapon-setting-panel", component: "WeaponSettingPanel" },
  { nav: "armor-setting-panel", component: "ArmorSettingPanel" },
  { nav: "skill-setting-panel", component: "SkillSettingPanel" },
  { nav: "variable-setting-panel", component: "VariableSettingPanel" },
  { nav: "global-variable-panel", component: "GlobalVariablePanel" },
  { nav: "switch-setting-panel", component: "SwitchSettingPanel" },
  { nav: "save-recall-panel", component: "SaveRecallPanel" },
  { nav: "save-backup-panel", component: "SaveBackupPanel" },
  { nav: "teleport-panel", component: "TeleportPanel" },
  { nav: "map-event-panel", component: "MapEventPanel" },
  { nav: "shortcut-panel", component: "ShortcutPanel" },
];

function isVersionAtLeast(actual, minimum) {
  const parse = (value) =>
    String(value || "0")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(actual);
  const b = parse(minimum);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left !== right) return left > right;
  }

  return true;
}

export function registerCore({ test, page, type, state }) {
  test("nw.js + RPG Maker 环境正常", async () => {
    const info = await page.evaluate(() => ({
      engine: typeof Utils !== "undefined" ? Utils.RPGMAKER_NAME : null,
      nwjs: typeof Utils !== "undefined" ? Utils.isNwjs() : false,
      nwVersion:
        typeof process !== "undefined" ? process.versions["node-webkit"] : null,
      scene: SceneManager._scene?.constructor?.name || null,
      pageError: document.getElementById("errorPrinter")?.innerText || null,
      title: document.title,
    }));

    assert.equal(info.engine, type === "mv" ? "MV" : "MZ");
    assert.equal(info.nwjs, true, "Utils.isNwjs() 应为 true");
    assert.ok(info.nwVersion, "拿不到 nw.js 版本");
    assert.ok(
      isVersionAtLeast(info.nwVersion, "0.44.0"),
      `nw.js 版本过低: ${info.nwVersion}`,
    );
    assert.equal(info.pageError, null, `游戏页面报错:\n${info.pageError}`);
    assert.ok(info.scene, "SceneManager 没有启动任何场景");

    state.environment = info;
  });

  test("作弊 UI 已挂载，样式表与 Vue 组件可用", async () => {
    const info = await page.evaluate(() => {
      const app = document.getElementById("app");
      const application = app?.querySelector(".v-application");
      const styles = [...document.querySelectorAll("link[rel=stylesheet]")]
        .map((link) => link.getAttribute("href"))
        .filter(Boolean);
      const main = window.__cheatTest.main();

      return {
        hasApp: !!app,
        hasVnode: !!app?._vnode,
        hasVuetifyRoot: !!application,
        mainMounted: !!main,
        mainKeys: main ? Object.keys(main).slice(0, 20) : [],
        styles,
        error: document.getElementById("errorPrinter")?.innerText || null,
      };
    });

    assert.equal(info.hasApp, true, "缺少 #app");
    assert.equal(info.hasVnode, true, "#app 上没有 Vue vnode");
    assert.equal(info.hasVuetifyRoot, true, "Vuetify 根节点没有渲染");
    assert.equal(info.mainMounted, true, "MainComponent 没有挂载");
    assert.equal(info.error, null, `游戏页面报错:\n${info.error}`);

    for (const required of [
      "cheat/css/vuetify.css",
      "cheat/css/main.css",
      "cheat/css/materialdesignicons.css",
    ]) {
      assert.ok(
        info.styles.some((href) => href.includes(required)),
        `缺少样式表 ${required}，实际加载: ${info.styles.join(", ")}`,
      );
    }
  });

  test("开始新游戏并进入地图", async () => {
    const game = await page.evaluate(() => window.__cheatTest.startGame());

    assert.equal(game.scene, "Scene_Map");
    assert.ok(game.mapId > 0, `地图 ID 无效: ${game.mapId}`);
    assert.ok(game.party.length > 0, "队伍里没有角色");
    assert.ok(
      game.party.every((actor) => actor.mhp > 0),
      "角色最大 HP 异常",
    );
    assert.ok(Number.isFinite(game.gold), "金币数值异常");

    state.game = game;
  });

  test("Ctrl+C 键盘快捷键打开 / 关闭作弊窗口", async () => {
    await page.evaluate(() => {
      const main = window.__cheatTest.main();
      if (main && main.show) main.show = false;
    });

    await page.dispatchShortcut({
      key: "c",
      code: "KeyC",
      keyCode: 67,
      modifiers: 2, // Ctrl
    });

    const opened = await page.waitFor(
      () => {
        const main = window.__cheatTest.main();
        return main?.show && !!document.querySelector("#cheat-modal");
      },
      { timeout: 5000, label: "Ctrl+C 打开作弊窗口" },
    );

    assert.equal(opened, true);

    const nav = await page.evaluate(() => {
      const modal = document.querySelector("#cheat-modal");
      const items = [...modal.querySelectorAll(".cheat-nav .v-list-item")];
      return {
        count: items.length,
        titles: items
          .map((item) =>
            item.querySelector(".v-list-item-title")?.textContent?.trim(),
          )
          .filter(Boolean),
      };
    });

    assert.ok(nav.count >= 16, `导航项数量异常: ${nav.count}`);
    for (const title of [
      "常用",
      "物品",
      "全局变量",
      "存档时间机器",
      "快捷键",
    ]) {
      assert.ok(nav.titles.includes(title), `导航缺少「${title}」`);
    }

    await page.dispatchShortcut({
      key: "c",
      code: "KeyC",
      keyCode: 67,
      modifiers: 2,
    });

    const closed = await page.waitFor(() => !window.__cheatTest.main()?.show, {
      timeout: 5000,
      label: "Ctrl+C 关闭作弊窗口",
    });

    assert.equal(closed, true);
  });

  test("17 个面板全部能挂载并读取游戏数据", async () => {
    const result = await page.evaluate(async (panels) => {
      const api = window.__cheatTest;
      const output = {};

      for (const { nav, component } of panels) {
        const proxy = await api.openPanel(nav, component);
        const metrics = {
          items: proxy.items?.length,
          actors: proxy.actors?.length,
          partyMembers: proxy.partyRows?.length,
          availableActors: proxy.availableRows?.length,
          allSkills: proxy.allSkills?.length,
          variables: proxy.variableNames?.length,
          switches: proxy.switchNames?.length,
          maps: proxy.maps?.length,
          shortcuts: proxy.shortcuts?.length,
          ready: proxy.ready,
          backups: Array.isArray(proxy.backups)
            ? proxy.backups.length
            : undefined,
          locations: Array.isArray(proxy.locations)
            ? proxy.locations.length
            : undefined,
          entries: Array.isArray(proxy.entries)
            ? proxy.entries.length
            : undefined,
          loaded: proxy.initialLoaded,
          mapId: proxy.currentMapId,
        };

        if (component === "GlobalVariablePanel") {
          await api.waitFor(() => proxy.initialLoaded, 15000, 100);
          metrics.loaded = proxy.initialLoaded;
          metrics.entries = proxy.entries?.length;
        }

        if (component === "MapEventPanel") {
          await api.waitFor(() => proxy.currentMapId > 0, 10000, 100);
          metrics.mapId = proxy.currentMapId;
        }

        output[component] = {
          nav,
          mounted: !!proxy,
          componentName: proxy.$options?.name,
          current: api.main()?.currentComponentName,
          metrics,
        };
      }

      const versionModule = await import(
        new URL("cheat/version.js", document.baseURI).href
      );

      await api.openPanel("general-panel", "GeneralPanel");
      const modalText = document.querySelector("#cheat-modal")?.innerText || "";

      return {
        panels: output,
        version: versionModule.RPGVERSION,
        semver: versionModule.RPGSEMVER,
        modalText,
      };
    }, PANELS);

    for (const { nav, component } of PANELS) {
      const panel = result.panels[component];
      assert.ok(panel, `${component} 没有返回信息`);
      assert.equal(panel.mounted, true, `${component} 没有挂载`);
      assert.equal(panel.nav, nav);
      assert.equal(panel.current, nav, `${component} 对应的导航项没有激活`);
    }

    const metrics = (name) => result.panels[name].metrics;

    assert.equal(
      metrics("GameSystemPanel").ready,
      true,
      "游戏统计面板没有就绪",
    );
    assert.ok(metrics("StatsSettingPanel").actors >= 1, "属性面板没有角色");
    assert.ok(metrics("PartyPanel").partyMembers >= 1, "队伍面板没有队伍成员");
    assert.ok(metrics("ItemSettingPanel").items > 1, "道具列表为空");
    assert.ok(metrics("WeaponSettingPanel").items > 1, "武器列表为空");
    assert.ok(metrics("ArmorSettingPanel").items > 1, "防具列表为空");
    assert.ok(metrics("SkillSettingPanel").actors >= 1, "技能面板没有角色");
    assert.ok(metrics("SkillSettingPanel").allSkills > 0, "技能列表为空");
    assert.ok(metrics("VariableSettingPanel").variables > 0, "变量列表为空");
    assert.ok(metrics("SwitchSettingPanel").switches > 0, "开关列表为空");
    assert.ok(metrics("TeleportPanel").maps > 0, "传送地图列表为空");
    assert.ok(metrics("ShortcutPanel").shortcuts > 0, "快捷键列表为空");
    assert.ok(
      metrics("GlobalVariablePanel").loaded,
      "全局变量面板没有完成初始化",
    );
    assert.ok(metrics("GlobalVariablePanel").entries > 0, "全局变量列表为空");
    assert.equal(
      metrics("MapEventPanel").mapId,
      state.game.mapId,
      "地图事件面板的当前地图 ID 不正确",
    );

    assert.ok(result.version, "version.js 没有导出 RPGVERSION");
    assert.ok(result.semver, "version.js 没有导出 RPGSEMVER");
    assert.ok(
      result.modalText.includes(`v${result.semver}`),
      `界面上没有显示语义化版本（期望 v${result.semver}）`,
    );
    assert.ok(
      result.modalText.includes(result.version),
      `界面上没有显示 commit（期望 ${result.version}）`,
    );

    state.version = result.version;
  });

  test("面板操作过程中没有作弊脚本异常", async () => {
    const errors = page.getCheatErrors();
    assert.deepEqual(errors, [], `作弊脚本产生异常:\n${errors.join("\n")}`);
  });
}
