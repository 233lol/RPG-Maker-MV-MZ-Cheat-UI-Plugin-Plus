import assert from "node:assert/strict";

// 地图事件面板是唯一允许在作弊窗口打开时继续操作游戏的页面，
// 这里验证它真正把地图画出来、并且点击坐标能换算成正确的格子。
export function registerMapEvent({ test, page }) {
  test("地图事件面板：渲染画布、限制视图、点击传送与设置持久化", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel("map-event-panel", "MapEventPanel");

      const ready = await api.waitFor(
        () =>
          panel.currentMapId === $gameMap.mapId() &&
          !!panel.mapData &&
          !!panel.$refs.mapCanvas,
        10000,
        100,
      );

      if (!ready) {
        throw new Error("地图事件面板没有在 10 秒内加载地图数据");
      }

      const storage = panel.getSettingsStorage();
      const oldLimitedView = panel.limitedView;
      const oldReadInterval = panel.readInterval;
      const oldPosition = { x: $gamePlayer.x, y: $gamePlayer.y };

      try {
        // 1. 固定为限制视图后强制渲染一次，检查画布尺寸 / 视口记录 / 像素输出
        panel.limitedView = true;
        panel.isCanvasVisible = true;
        panel.needsRedraw = true;
        panel.updateCanvasSize();
        panel.renderMap();

        const canvas = panel.$refs.mapCanvas;
        const view = panel.renderedView;
        const ctx = canvas.getContext("2d");
        const sampleWidth = Math.min(canvas.width, 16);
        const sampleHeight = Math.min(canvas.height, 16);
        const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        let opaquePixels = 0;

        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] > 0) opaquePixels++;
        }

        // 2. 点击视口内的格子，确认角色被传送到对应地图坐标
        const targetX = Math.min(
          panel.mapData.width - 1,
          view.startX + (panel.mapData.width > 1 ? 1 : 0),
        );
        const targetY = Math.min(
          panel.mapData.height - 1,
          view.startY + (panel.mapData.height > 1 ? 1 : 0),
        );
        const rect = canvas.getBoundingClientRect();
        const half = Math.floor(view.cellSize / 2);

        $gamePlayer.setPosition(oldPosition.x, oldPosition.y);
        panel.onCanvasClick({
          clientX: rect.left + (targetX - view.startX) * view.cellSize + half,
          clientY: rect.top + (targetY - view.startY) * view.cellSize + half,
        });
        const afterClick = { x: $gamePlayer.x, y: $gamePlayer.y };

        // 3. 画布外的点击不能移动角色（保留上一步的位置做对比）
        panel.onCanvasClick({
          clientX: rect.left - 1000 * view.cellSize,
          clientY: rect.top - 1000 * view.cellSize,
        });
        const afterOutOfBoundsClick = {
          x: $gamePlayer.x,
          y: $gamePlayer.y,
        };

        // 4. 切换限制视图 / 修改读取间隔，设置应写回 map-event.json
        panel.limitedView = !oldLimitedView;
        // Vue 的 watch 默认异步刷新，等一个任务再读磁盘设置
        await new Promise((resolve) => setTimeout(resolve, 0));
        const limitedViewSaved = storage.getItem("mapEventPanel_limitedView");

        panel.readInterval = 42;
        panel.onReadIntervalChange();
        const readIntervalValue = panel.readInterval;
        const readIntervalSaved = storage.getItem("mapEventPanel_readInterval");

        return {
          mapId: panel.currentMapId,
          gameMapId: $gameMap.mapId(),
          mapWidth: panel.mapData.width,
          mapHeight: panel.mapData.height,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          expectedCanvasWidth: panel.canvasWidth,
          expectedCanvasHeight: panel.canvasHeight,
          view: {
            limitedView: view.limitedView,
            startX: view.startX,
            startY: view.startY,
            cellSize: view.cellSize,
          },
          opaquePixels,
          target: { x: targetX, y: targetY },
          afterClick,
          afterOutOfBoundsClick,
          limitedViewSaved,
          limitedViewValue: panel.limitedView,
          readIntervalValue,
          readIntervalSaved,
          eventCounts: {
            all: panel.mapEvents.length,
            regular: panel.regularEvents.length,
            enemies: panel.enemies.length,
            treasure: panel.treasureBoxes.length,
          },
        };
      } finally {
        panel.limitedView = oldLimitedView;
        // 等 watcher 把恢复后的值写回设置文件
        await new Promise((resolve) => setTimeout(resolve, 0));
        panel.readInterval = oldReadInterval;
        panel.onReadIntervalChange();
        $gamePlayer.setPosition(oldPosition.x, oldPosition.y);
        $gamePlayer.center(oldPosition.x, oldPosition.y);
      }
    });

    assert.equal(result.mapId, result.gameMapId, "面板地图 ID 没有同步");
    assert.ok(result.mapWidth > 0 && result.mapHeight > 0, "地图尺寸异常");

    assert.ok(result.view, "渲染后没有记录视口");
    assert.equal(result.view.limitedView, true, "默认应使用限制视图");
    assert.equal(
      result.canvasWidth,
      result.expectedCanvasWidth,
      "画布宽度与面板计算不一致",
    );
    assert.equal(
      result.canvasHeight,
      result.expectedCanvasHeight,
      "画布高度与面板计算不一致",
    );
    assert.ok(result.opaquePixels > 0, "画布没有被真正绘制（像素全透明）");

    assert.deepEqual(
      result.afterClick,
      result.target,
      "点击地图格没有把角色传送到对应坐标",
    );
    assert.deepEqual(
      result.afterOutOfBoundsClick,
      result.afterClick,
      "越界点击仍然移动了角色",
    );

    assert.equal(
      result.limitedViewSaved,
      JSON.stringify(result.limitedViewValue),
      "限制视图设置没有写入 map-event.json",
    );
    assert.equal(result.readIntervalValue, 100, "读取间隔没有收敛到 100ms");
    assert.equal(
      result.readIntervalSaved,
      JSON.stringify(result.readIntervalValue),
      "读取间隔没有写入 map-event.json",
    );

    const { all, regular, enemies, treasure } = result.eventCounts;
    assert.equal(
      regular + enemies + treasure,
      all,
      "事件分类结果之和应等于事件总数",
    );
  });
}
