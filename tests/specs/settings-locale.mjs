import assert from "node:assert/strict";

export function registerSettingsLocale({ test, page }) {
  test("切换界面语言立即生效且不重载游戏", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const strings = await import(
        new URL("cheat/js/strings.js", document.baseURI).href
      );

      const original = strings.getLocale();
      const target = original === "en" ? "ja" : "en";
      const sceneBefore = SceneManager._scene;
      const mapIdBefore =
        typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0;

      const panel = await api.openPanel("general-panel", "GeneralPanel");
      const textBefore = strings.t("common.add");

      panel.onLocaleChange(target);
      await api.waitFor(() => strings.getLocale() === target, 5000, 50);

      const textAfter = strings.t("common.add");
      const htmlLangAfter = document.documentElement.lang;
      const sameScene = SceneManager._scene === sceneBefore;
      const mapIdAfter =
        typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0;

      // 切换语言会重挂作弊窗口，等待新的「常用」面板后再切回去。
      const restoredPanel = await api.waitFor(
        () => {
          const current = api.panel("GeneralPanel");
          return current && current !== panel ? current : null;
        },
        5000,
        50,
      );

      if (!restoredPanel) {
        throw new Error("切换语言后常用面板没有重新挂载");
      }

      restoredPanel.onLocaleChange(original);
      await api.waitFor(() => strings.getLocale() === original, 5000, 50);

      return {
        original,
        target,
        textBefore,
        textAfter,
        htmlLangAfter,
        sameScene,
        mapIdBefore,
        mapIdAfter,
        restored: strings.getLocale(),
      };
    });

    assert.equal(
      result.textAfter === result.textBefore,
      false,
      "切换语言后界面文案没有变化",
    );
    assert.equal(result.htmlLangAfter, result.target, "<html lang> 没有同步");
    assert.equal(result.sameScene, true, "切换语言时游戏场景被重载了");
    assert.equal(
      result.mapIdAfter,
      result.mapIdBefore,
      "切换语言后当前地图发生了变化",
    );
    assert.equal(result.restored, result.original, "界面语言没有还原");
  });

  test("地图事件面板设置写入 map-event.json，不再依赖 localStorage", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const fs = require("fs");
      const { getCheatSettingsPath } = await import(
        new URL("cheat/js/SettingsPath.js", document.baseURI).href
      );

      const filePath = getCheatSettingsPath("map-event.json");
      const key = "mapEventPanel_limitedView";
      const panel = await api.openPanel("map-event-panel", "MapEventPanel");
      const original = panel.limitedView;
      const toggled = !original;

      const localKeys = () => {
        const keys = [];

        try {
          for (let index = 0; index < localStorage.length; index++) {
            const name = localStorage.key(index);
            if (name && name.includes("mapEventPanel")) keys.push(name);
          }
        } catch (error) {
          // 没有 localStorage 时按空列表处理
        }

        return keys;
      };

      const readFile = () => {
        try {
          return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (error) {
          return null;
        }
      };

      const keysBefore = localKeys();

      panel.limitedView = toggled;
      await api.waitFor(
        () => readFile()?.[key] === JSON.stringify(toggled),
        5000,
        50,
      );
      const savedValue = readFile()?.[key] ?? null;
      const keysAfter = localKeys();

      panel.limitedView = original;
      await api.waitFor(
        () => readFile()?.[key] === JSON.stringify(original),
        5000,
        50,
      );

      return {
        filePath,
        key,
        savedValue,
        expectedValue: JSON.stringify(toggled),
        valueAfterRestore: readFile()?.[key] ?? null,
        expectedRestored: JSON.stringify(original),
        newLocalKeys: keysAfter.filter((name) => !keysBefore.includes(name)),
      };
    });

    assert.equal(
      result.savedValue,
      result.expectedValue,
      `设置没有写入 ${result.filePath}`,
    );
    assert.equal(
      result.valueAfterRestore,
      result.expectedRestored,
      "设置没有还原",
    );
    assert.deepEqual(
      result.newLocalKeys,
      [],
      "地图事件设置再次写入了 localStorage",
    );
  });
}
