import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

const timers = new Map();
let nextTimerId = 1;
const cleared = [];

globalThis.window = {
  setInterval(fn, ms) {
    const id = nextTimerId++;
    timers.set(id, { fn, ms });
    return id;
  },
  clearInterval(id) {
    cleared.push(id);
    timers.delete(id);
  },
};

const { LockService } =
  await import("../../cheat-engine/www/cheat/js/LockService.js");

function resetLocks() {
  LockService.setSwitchLocks({});
  LockService.setVariableLocks({});
  delete globalThis.$gameSwitches;
  delete globalThis.$gameVariables;
}

afterEach(() => {
  resetLocks();
});

test("LockService：加载时清理非法 / 未启用的锁定项", () => {
  const locks = LockService.setSwitchLocks({
    0: { lockEnabled: true, lockValue: true },
    1: { lockEnabled: true, lockValue: 1 },
    2: { lockEnabled: false, lockValue: true },
    3: { lockEnabled: true, lockValue: 0 },
    "-1": { lockEnabled: true, lockValue: true },
    abc: { lockEnabled: true, lockValue: true },
    4: null,
  });

  assert.deepEqual(locks, {
    1: { lockEnabled: true, lockValue: 1 },
    3: { lockEnabled: true, lockValue: 0 },
  });

  assert.equal(LockService.hasAnyLock(), true);

  LockService.setSwitchLocks(null);
  assert.deepEqual(LockService.getSwitchLocks(), {});
  assert.equal(LockService.hasAnyLock(), false);
});

test("LockService：变量锁定值会深拷贝，游戏原地修改不影响锁", () => {
  const source = { nested: [1, 2] };
  const locks = LockService.setVariableLocks({
    5: { lockEnabled: true, lockValue: source },
  });

  assert.notEqual(locks[5].lockValue, source);
  assert.notEqual(locks[5].lockValue.nested, source.nested);

  source.nested.push(3);
  assert.deepEqual(locks[5].lockValue, { nested: [1, 2] });
});

test("LockService：应用开关锁时归一化为布尔，重复应用不再改动", () => {
  const values = new Map([
    [1, false],
    [2, true],
  ]);
  const writes = [];

  globalThis.$gameSwitches = {
    value(id) {
      return values.get(id) ?? false;
    },
    setValue(id, value) {
      values.set(id, value);
      writes.push([id, value]);
    },
  };

  LockService.setSwitchLocks({
    1: { lockEnabled: true, lockValue: 1 },
    2: { lockEnabled: true, lockValue: 0 },
  });

  // setSwitchLocks 会立即应用一次
  assert.deepEqual(writes, [
    [1, true],
    [2, false],
  ]);
  assert.equal(LockService.applySwitchLocks(), false);
});

test("LockService：变量锁保留 Date / Map / Set / 嵌套对象类型", () => {
  const values = new Map([
    [1, new Date(0)],
    [2, new Map([["a", 1]])],
    [3, new Set([1, 2])],
    [4, { a: [1] }],
  ]);

  globalThis.$gameVariables = {
    value(id) {
      return values.get(id);
    },
    setValue(id, value) {
      values.set(id, value);
    },
  };

  LockService.setVariableLocks({
    1: { lockEnabled: true, lockValue: new Date(1234) },
    2: { lockEnabled: true, lockValue: new Map([["b", 2]]) },
    3: { lockEnabled: true, lockValue: new Set([3]) },
    4: { lockEnabled: true, lockValue: { a: [2] } },
  });

  // setVariableLocks 会立即应用一次
  assert.equal(values.get(1).getTime(), 1234);
  assert.ok(values.get(1) instanceof Date);
  assert.deepEqual([...values.get(2)], [["b", 2]]);
  assert.ok(values.get(2) instanceof Map);
  assert.deepEqual([...values.get(3)], [3]);
  assert.ok(values.get(3) instanceof Set);
  assert.deepEqual(values.get(4), { a: [2] });

  // 再次应用时值已相等，不应重复写
  assert.equal(LockService.applyVariableLocks(), false);
});

test("LockService：按单个 ID 应用锁，并容忍游戏数据缺失", () => {
  const writes = [];
  globalThis.$gameSwitches = {
    value: () => false,
    setValue: (id) => writes.push(id),
  };
  globalThis.$gameVariables = {
    value: () => 0,
    setValue: (id) => writes.push(`v${id}`),
  };

  LockService.setSwitchLocks({
    1: { lockEnabled: true, lockValue: true },
    2: { lockEnabled: true, lockValue: true },
  });
  LockService.setVariableLocks({
    3: { lockEnabled: true, lockValue: 9 },
  });

  writes.length = 0;
  assert.equal(LockService.applySwitchLock(2), true);
  assert.deepEqual(writes, [2]);

  writes.length = 0;
  assert.equal(LockService.applySwitchLock(99), false);
  assert.deepEqual(writes, []);

  writes.length = 0;
  assert.equal(LockService.applyVariableLock(3), true);
  assert.deepEqual(writes, ["v3"]);

  delete globalThis.$gameSwitches;
  delete globalThis.$gameVariables;

  assert.equal(LockService.applySwitchLocks(), false);
  assert.equal(LockService.applyVariableLocks(), false);
  assert.equal(LockService.applySwitchLock(1), false);
  assert.equal(LockService.applyVariableLock(3), false);
});

test("LockService：有锁时启动定时器，清空后停止", () => {
  cleared.length = 0;
  timers.clear();

  LockService.setSwitchLocks({
    1: { lockEnabled: true, lockValue: true },
  });

  assert.equal(timers.size, 1);
  const [id, timer] = [...timers.entries()][0];
  assert.equal(timer.ms, 1000);

  LockService.setSwitchLocks({});
  assert.equal(timers.size, 0);
  assert.deepEqual(cleared, [id]);

  LockService.setVariableLocks({
    2: { lockEnabled: true, lockValue: 1 },
  });
  assert.equal(timers.size, 1);

  LockService.setVariableLocks({});
  assert.equal(timers.size, 0);
});

test("LockService.readStorage / writeStorage 损坏与写失败时降级", () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    assert.deepEqual(
      LockService.readStorage({
        getItem() {
          return "{bad";
        },
      }),
      {},
    );
    assert.deepEqual(
      LockService.readStorage({
        getItem() {
          return JSON.stringify([1, 2]);
        },
      }),
      [1, 2],
    );
    assert.deepEqual(
      LockService.readStorage({
        getItem() {
          throw new Error("read failed");
        },
      }),
      {},
    );

    assert.doesNotThrow(() =>
      LockService.writeStorage(
        {
          setItem() {
            throw new Error("write failed");
          },
        },
        {},
      ),
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 3);
});

test("LockService.applyAllLocks 无锁时停止，有锁时应用两类", () => {
  timers.clear();
  cleared.length = 0;

  const switched = [];
  globalThis.$gameSwitches = {
    value: () => false,
    setValue: (id, value) => switched.push(["s", id, value]),
  };
  const variables = [];
  globalThis.$gameVariables = {
    value: () => 0,
    setValue: (id, value) => variables.push(["v", id, value]),
  };

  LockService.setSwitchLocks({});
  LockService.setVariableLocks({});
  LockService.start();

  LockService.applyAllLocks();
  assert.equal(LockService.timer, null);
  assert.equal(timers.size, 0);

  LockService.setSwitchLocks({
    1: { lockEnabled: true, lockValue: true },
  });
  LockService.setVariableLocks({
    2: { lockEnabled: true, lockValue: 5 },
  });

  switched.length = 0;
  variables.length = 0;
  LockService.applyAllLocks();
  assert.deepEqual(switched, [["s", 1, true]]);
  assert.deepEqual(variables, [["v", 2, 5]]);
});

test("LockService.start 幂等，stop 无定时器时安全", () => {
  timers.clear();
  LockService.stop();

  LockService.start();
  assert.equal(timers.size, 1);
  const first = LockService.timer;

  LockService.start();
  assert.equal(timers.size, 1);
  assert.equal(LockService.timer, first);

  LockService.stop();
  assert.equal(timers.size, 0);
  assert.equal(LockService.timer, null);
  assert.doesNotThrow(() => LockService.stop());
});

test("LockService 复杂值不相等时重新写入", () => {
  const values = new Map([
    [1, { a: 1 }],
    [2, new Map([["a", 1]])],
    [3, new Set([1, 2])],
    [4, [1, 2]],
    [5, { a: 1 }],
  ]);
  const writes = [];

  globalThis.$gameVariables = {
    value(id) {
      return values.get(id);
    },
    setValue(id, value) {
      values.set(id, value);
      writes.push(id);
    },
  };

  LockService.setVariableLocks({
    1: { lockEnabled: true, lockValue: { a: 1, b: 2 } },
    2: { lockEnabled: true, lockValue: new Map([["b", 2]]) },
    3: { lockEnabled: true, lockValue: new Set([3]) },
    4: { lockEnabled: true, lockValue: [1, 2, 3] },
    5: { lockEnabled: true, lockValue: { a: 1, b: undefined } },
  });

  assert.deepEqual(writes.sort(), [1, 2, 3, 4, 5]);
});

test("LockService 克隆失败时回退并保留原值", () => {
  const originalClone = globalThis.structuredClone;
  globalThis.structuredClone = () => {
    throw new Error("cannot clone");
  };

  const circular = {};
  circular.self = circular;

  try {
    const locks = LockService.setVariableLocks({
      1: { lockEnabled: true, lockValue: circular },
    });

    assert.equal(locks[1].lockValue, circular);
  } finally {
    globalThis.structuredClone = originalClone;
  }
});

test("LockService 跳过非法 / 未启用的手动锁记录", () => {
  const writes = [];
  globalThis.$gameSwitches = {
    value: () => false,
    setValue: (id) => writes.push(`s${id}`),
  };
  globalThis.$gameVariables = {
    value: () => 0,
    setValue: (id) => writes.push(`v${id}`),
  };

  LockService.switchLocks = {
    0: { lockEnabled: true, lockValue: true },
    abc: { lockEnabled: true, lockValue: true },
    2: { lockEnabled: false, lockValue: true },
    3: { lockEnabled: true, lockValue: true },
  };
  LockService.variableLocks = {
    0: { lockEnabled: true, lockValue: 1 },
    abc: { lockEnabled: true, lockValue: 1 },
    2: { lockEnabled: false, lockValue: 1 },
    3: { lockEnabled: true, lockValue: 1 },
  };

  LockService.applySwitchLocks();
  LockService.applyVariableLocks();
  assert.deepEqual(writes, ["s3", "v3"]);

  writes.length = 0;
  assert.equal(LockService.applyVariableLock(2), false, "未启用的锁跳过");
  assert.equal(LockService.applyVariableLock(999), false, "不存在的锁跳过");
  assert.deepEqual(writes, []);

  // 手动注入的记录不经过 sanitize，会直接按下标查找
  assert.equal(LockService.applyVariableLock(0), true);
  assert.deepEqual(writes, ["v0"]);
});
