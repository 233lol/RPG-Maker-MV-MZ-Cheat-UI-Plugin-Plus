import assert from "node:assert/strict";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ARROW_RIGHT = {
  key: "ArrowRight",
  code: "ArrowRight",
  windowsVirtualKeyCode: 39,
  nativeVirtualKeyCode: 39,
};

export function registerInputGuard({ test, page }) {
  test("作弊菜单打开时屏蔽游戏输入，地图事件面板除外", async () => {
    const ready = await page.evaluate(() =>
      window.__cheatTest.waitFor(
        () =>
          SceneManager._scene?.constructor?.name === "Scene_Map" &&
          typeof $gameMap !== "undefined" &&
          $gameMap &&
          $gameMap.mapId() > 0,
        5000,
        100,
      ),
    );

    if (!ready) {
      throw new Error("测试需要先进入地图场景");
    }

    try {
      // 1. 普通面板：焦点在作弊菜单里时，方向键不应传给游戏
      await page.evaluate(async () => {
        const api = window.__cheatTest;
        await api.openPanel("general-panel", "GeneralPanel");
        Input.clear();
        TouchInput.clear();

        const modal = document.getElementById("cheat-modal");
        const focusable =
          modal?.querySelector("button, input, [tabindex]") ?? modal;
        focusable?.focus?.();
      });

      await page.send("Input.dispatchKeyEvent", {
        ...ARROW_RIGHT,
        type: "keyDown",
      });
      // 测试窗口是隐藏的，游戏主循环不会自己跑；手动推一帧，验证引擎读不到按键。
      const during = await page.evaluate(() => {
        Input.update();
        return {
          right: !!Input._currentState.right,
          dir4: Input.dir4,
        };
      });
      await page.send("Input.dispatchKeyEvent", {
        ...ARROW_RIGHT,
        type: "keyUp",
      });

      assert.equal(during.right, false, "作弊菜单打开时游戏仍收到了方向键");
      assert.equal(during.dir4, 0, "作弊菜单打开时游戏方向状态被改变");

      // 2. 点击作弊窗口不应触发游戏点击 / 按下
      const mouse = await page.evaluate(() => {
        const modal = document.getElementById("cheat-modal");
        const rect = modal.getBoundingClientRect();
        const point = {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          button: 0,
        };

        modal.dispatchEvent(new MouseEvent("mousedown", point));
        modal.dispatchEvent(new MouseEvent("mouseup", point));

        const immediate = TouchInput._mousePressed;

        Input.update();
        TouchInput.update();

        return {
          immediate,
          pressed: TouchInput._mousePressed,
          triggered: TouchInput.isTriggered(),
        };
      });

      assert.equal(mouse.pressed, false, "点击作弊窗口时游戏仍处于按下状态");
      assert.equal(mouse.triggered, false, "点击作弊窗口触发了游戏点击");

      // 3. 地图事件面板：允许键盘 / 鼠标输入，方便边看地图边操作游戏
      await page.evaluate(async () => {
        const api = window.__cheatTest;
        await api.openPanel("map-event-panel", "MapEventPanel");
        Input.clear();
        TouchInput.clear();
        document.activeElement?.blur?.();
      });

      await page.send("Input.dispatchKeyEvent", {
        ...ARROW_RIGHT,
        type: "keyDown",
      });
      await sleep(100);
      const mapEvent = await page.evaluate(() => {
        Input.update();
        return {
          right: !!Input._currentState.right,
          dir4: Input.dir4,
        };
      });
      await page.send("Input.dispatchKeyEvent", {
        ...ARROW_RIGHT,
        type: "keyUp",
      });

      assert.equal(
        mapEvent.right,
        true,
        "地图事件面板打开时方向键没有传给游戏",
      );
      assert.equal(mapEvent.dir4, 6, "地图事件面板打开时游戏方向没有生效");

      const mapEventMouse = await page.evaluate(() => {
        const canvas = Graphics._canvas;
        const rect = canvas.getBoundingClientRect();
        const point = {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          button: 0,
        };

        canvas.dispatchEvent(new MouseEvent("mousedown", point));
        TouchInput.update();

        const pressed = TouchInput._mousePressed;
        const triggered = TouchInput.isTriggered();

        canvas.dispatchEvent(new MouseEvent("mouseup", point));
        TouchInput.update();

        return { pressed, triggered };
      });

      assert.equal(
        mapEventMouse.pressed,
        true,
        "地图事件面板打开时鼠标按下没有传给游戏",
      );
      assert.equal(
        mapEventMouse.triggered,
        true,
        "地图事件面板打开时鼠标点击没有传给游戏",
      );
    } finally {
      await page.evaluate(() => {
        try {
          Input.clear();
          TouchInput.clear();
          window.__cheatTest.main()?.closeCheatModal?.();
        } catch (error) {
          // ignore
        }
      });
    }
  });
}
