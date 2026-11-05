import test from "node:test";
import assert from "node:assert/strict";

import { MapEventClassifier } from "../../cheat-engine/www/cheat/js/map-event/classifier.js";

function page(moveType = 0, list = [], characterName = "") {
  return {
    image: { characterName },
    moveType,
    list,
  };
}

function gameEvent(options) {
  const pages = options.pages || [];
  return {
    _eventId: options.eventId,
    event: () => (options.eventThrows ? null : { pages }),
    page: () =>
      options.pageThrows ? null : (options.currentPage ?? pages[0] ?? null),
  };
}

test("isEnemyEvent：识别 301 战斗处理", () => {
  const event = gameEvent({
    pages: [page(0, [{ code: 301, parameters: [] }], "Actor1")],
  });

  assert.equal(MapEventClassifier.isEnemyEvent(event), true);
});

test("isEnemyEvent：识别移动事件，但玩家自己不算敌人", () => {
  const moving = gameEvent({
    eventId: 9002,
    pages: [page(2, [], "")],
  });

  assert.equal(MapEventClassifier.isEnemyEvent(moving), true);

  globalThis.$gamePlayer = { _eventId: 9002 };

  try {
    assert.equal(
      MapEventClassifier.isEnemyEvent(moving),
      false,
      "玩家自己的移动事件不应被识别成敌人",
    );
  } finally {
    delete globalThis.$gamePlayer;
  }
});

test("isEnemyEvent：识别 108 / 408 注释里的敌人关键词", () => {
  const byComment = gameEvent({
    pages: [page(0, [{ code: 108, parameters: ["boss fight"] }], "Actor1")],
  });
  const byContinuation = gameEvent({
    pages: [page(0, [{ code: 408, parameters: ["monster"] }], "Actor1")],
  });

  assert.equal(MapEventClassifier.isEnemyEvent(byComment), true);
  assert.equal(MapEventClassifier.isEnemyEvent(byContinuation), true);
});

test("isEnemyEvent：识别敌人立绘文件名", () => {
  const event = gameEvent({
    pages: [page(0, [], "Monster1")],
  });

  assert.equal(MapEventClassifier.isEnemyEvent(event), true);
});

test("isEnemyEvent：普通事件 / 无页面 / 异常事件都返回 false", () => {
  assert.equal(
    MapEventClassifier.isEnemyEvent(
      gameEvent({ pages: [page(0, [], "Actor1")] }),
    ),
    false,
  );
  assert.equal(MapEventClassifier.isEnemyEvent({}), false);
  assert.equal(
    MapEventClassifier.isEnemyEvent(gameEvent({ pages: [], pageThrows: true })),
    false,
  );
  assert.equal(
    MapEventClassifier.isEnemyEvent({
      event() {
        throw new Error("boom");
      },
    }),
    false,
  );
});

test("isTreasureEvent：事件名 / 立绘名命中宝物关键词", () => {
  assert.equal(
    MapEventClassifier.isTreasureEvent({ name: "Treasure Chest" }),
    true,
  );
  assert.equal(MapEventClassifier.isTreasureEvent({ name: "宝箱" }), true);
  assert.equal(
    MapEventClassifier.isTreasureEvent({
      name: "normal",
      _characterName: "chest-gold",
    }),
    true,
  );
  assert.equal(MapEventClassifier.isTreasureEvent({ name: "normal" }), false);
});

test("isTreasureEvent：页面立绘与获取道具 / 金币指令", () => {
  assert.equal(
    MapEventClassifier.isTreasureEvent({
      name: "normal",
      pages: [page(0, [], "gem-crystal")],
    }),
    true,
  );

  for (const code of [125, 126, 127, 128]) {
    assert.equal(
      MapEventClassifier.isTreasureEvent({
        name: "normal",
        pages: [page(0, [{ code, parameters: [] }], "Actor1")],
      }),
      true,
      `指令 ${code} 应识别为宝物`,
    );
  }
});

test("isTreasureEvent：提示文本命中宝物关键词", () => {
  assert.equal(
    MapEventClassifier.isTreasureEvent({
      name: "normal",
      pages: [
        page(0, [{ code: 401, parameters: ["你获得了 100 金币"] }], "Actor1"),
      ],
    }),
    true,
  );

  assert.equal(
    MapEventClassifier.isTreasureEvent({
      name: "normal",
      pages: [
        page(
          0,
          [{ code: 101, parameters: ["You found a treasure!"] }],
          "Actor1",
        ),
      ],
    }),
    true,
  );
});

test("isTreasureEvent：普通事件 / 异常数据返回 false", () => {
  assert.equal(
    MapEventClassifier.isTreasureEvent({
      name: "normal",
      pages: [page(0, [{ code: 401, parameters: ["Hello there"] }], "Actor1")],
    }),
    false,
  );
  assert.equal(MapEventClassifier.isTreasureEvent({}), false);
  assert.equal(
    MapEventClassifier.isTreasureEvent({
      get name() {
        throw new Error("boom");
      },
    }),
    false,
  );
  assert.equal(
    MapEventClassifier.isTreasureEvent({
      name: "normal",
      pages: [null, { image: null, list: null }],
    }),
    false,
  );
});
