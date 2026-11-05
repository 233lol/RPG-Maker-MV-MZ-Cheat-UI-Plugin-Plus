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
