import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

import GlobalVariablePanel from "../../cheat-engine/www/cheat/panels/GlobalVariablePanel.js";
import { ConfirmDialog } from "../../cheat-engine/www/cheat/js/DialogHelper.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";

const originalDialogShow = ConfirmDialog.show;
const originalDialogClose = ConfirmDialog.close;

function makePanel(overrides = {}) {
  return {
    ...GlobalVariablePanel.methods,
    ...GlobalVariablePanel.data.call({}),
    $refs: {},
    $nextTick(callback) {
      this.ticks = this.ticks || [];
      this.ticks.push(callback);
    },
    ...overrides,
  };
}

function captureAlerts() {
  const messages = [];
  Alert.setHandler((level, msg, err) => messages.push({ level, msg, err }));
  return messages;
}

function makeTimerWindow() {
  const timeouts = new Map();
  const intervals = new Map();
  let nextId = 1;

  globalThis.window = {
    setTimeout(fn, ms) {
      const id = nextId++;
      timeouts.set(id, {
        ms,
        fn() {
          timeouts.delete(id);
          fn();
        },
      });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(fn, ms) {
      const id = nextId++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
  };

  return { timeouts, intervals };
}

beforeEach(() => {
  Alert.handler = null;
  Alert.pending = [];
  delete globalThis.window;
  delete globalThis.document;
});

afterEach(() => {
  ConfirmDialog.show = originalDialogShow;
  ConfirmDialog.close = originalDialogClose;
  Alert.handler = null;
  Alert.pending = [];
  delete globalThis.window;
  delete globalThis.document;
});

test("GlobalVariablePanel：基础 computed", () => {
  const panel = makePanel({
    rootScan: { rpg: [], plugin: ["p1", "p2"] },
    path: [],
    container: {},
    entries: [
      { key: "a", name: "alpha", preview: "1" },
      { key: "b", name: "beta", preview: "2" },
    ],
    search: "",
    deepSearch: true,
    pagination: { page: 1, itemsPerPage: 1 },
  });

  assert.equal(
    GlobalVariablePanel.computed.panelStateId.call(panel),
    "global-variables",
  );
  assert.equal(GlobalVariablePanel.computed.isRoot.call(panel), true);
  assert.equal(GlobalVariablePanel.computed.pluginCount.call(panel), 2);
  assert.equal(
    GlobalVariablePanel.computed.currentContainerLabel.call(panel),
    "新增属性",
  );

  panel.container = [];
  assert.equal(
    GlobalVariablePanel.computed.currentContainerLabel.call(panel),
    "新增元素",
  );

  assert.deepEqual(
    GlobalVariablePanel.computed.breadcrumbItems
      .call(panel)
      .map((item) => item.label),
    ["全局变量"],
  );

  assert.equal(
    GlobalVariablePanel.computed.searchActive.call(panel),
    false,
    "搜索词为空时不启用深度搜索",
  );
  panel.search = "a";
  assert.equal(GlobalVariablePanel.computed.searchActive.call(panel), true);

  panel.deepSearch = false;
  assert.equal(GlobalVariablePanel.computed.searchActive.call(panel), false);

  panel.deepSearch = true;
  panel.search = "";
  assert.equal(
    GlobalVariablePanel.computed.effectiveItemsPerPage.call(panel),
    1,
  );
  panel.pagination.itemsPerPage = -1;
  assert.equal(
    GlobalVariablePanel.computed.effectiveItemsPerPage.call(panel),
    0,
  );
  panel.pagination.itemsPerPage = "bad";
  assert.equal(
    GlobalVariablePanel.computed.effectiveItemsPerPage.call(panel),
    0,
  );

  panel.filteredEntries =
    GlobalVariablePanel.computed.filteredEntries.call(panel);
  assert.equal(panel.filteredEntries.length, 2);
  panel.search = "alph";
  panel.filteredEntries =
    GlobalVariablePanel.computed.filteredEntries.call(panel);
  assert.equal(panel.filteredEntries.length, 1);
  assert.equal(GlobalVariablePanel.computed.totalCount.call(panel), 1);

  panel.pagination.itemsPerPage = 5;
  assert.deepEqual(
    GlobalVariablePanel.computed.pagedEntries
      .call(panel)
      .map((item) => item.key),
    ["a"],
  );

  panel.pageCount = 1;
  assert.equal(GlobalVariablePanel.computed.showPagination.call(panel), false);
  panel.pageCount = 2;
  assert.equal(GlobalVariablePanel.computed.showPagination.call(panel), true);
});

test("GlobalVariablePanel：行 key / 高亮 / 定位页码", () => {
  const panel = makePanel({
    highlightKey: "b",
    pagination: { page: 1, itemsPerPage: 2 },
    filteredEntries: [{ key: "a" }, { key: "b" }, { key: "c" }],
    effectiveItemsPerPage: 2,
  });

  assert.equal(panel.rowKey({ key: "a" }, 3), "a-3");
  assert.equal(panel.isHighlighted({ key: "b" }), true);
  assert.equal(panel.isHighlighted({ key: "a" }), false);

  assert.equal(panel.findPageOfKey("a"), 1);
  assert.equal(panel.findPageOfKey("b"), 1);
  assert.equal(panel.findPageOfKey("c"), 2);
  assert.equal(panel.findPageOfKey("missing"), 1);

  panel.pagedEntries = [{ key: "a" }, { key: "b" }];
  const scrolls = [];
  panel.$refs = {
    row: [
      { $el: { scrollIntoView: () => scrolls.push("a") } },
      { $el: { scrollIntoView: () => scrolls.push("b") } },
    ],
  };

  panel.scrollToHighlight();
  assert.deepEqual(scrolls, ["b"]);

  panel.highlightKey = null;
  panel.scrollToHighlight();
  assert.deepEqual(scrolls, ["b"]);

  panel.highlightKey = "missing";
  panel.scrollToHighlight();
  assert.deepEqual(scrolls, ["b"]);
});

test("GlobalVariablePanel.navigateTo / goUp / enterEntry / onBreadcrumbClick", () => {
  const panel = makePanel({
    path: [],
    search: "old",
    deepSearchResults: [{ a: 1 }],
    deepSearchTruncated: true,
    deepSearchLimitReason: "limit",
    pagination: { page: 1, itemsPerPage: 10 },
    rebuildEntries() {
      this.rebuilt = (this.rebuilt || 0) + 1;
    },
    findPageOfKey(key) {
      this.foundKey = key;
      return 4;
    },
    scrollToHighlight() {
      this.scrolled = true;
    },
  });

  panel.navigateTo(["root"], { highlightKey: 123 });

  assert.deepEqual(panel.path, ["root"]);
  assert.equal(panel.search, "");
  assert.deepEqual(panel.deepSearchResults, []);
  assert.equal(panel.deepSearchTruncated, false);
  assert.equal(panel.deepSearchLimitReason, "");
  assert.equal(panel.highlightKey, "123");
  assert.equal(panel.foundKey, "123");
  assert.equal(panel.rebuilt, 1);
  assert.equal(panel.pagination.page, 1);

  assert.equal(panel.ticks.length, 1);
  panel.ticks[0]();
  assert.equal(panel.pagination.page, 4);
  assert.equal(panel.ticks.length, 2);
  panel.ticks[1]();
  assert.equal(panel.scrolled, true);

  // 没有高亮目标时回到第 1 页
  panel.ticks = [];
  panel.navigateTo(undefined);
  assert.deepEqual(panel.path, []);
  assert.equal(panel.highlightKey, null);
  panel.ticks[0]();
  assert.equal(panel.pagination.page, 1);

  panel.navigateTo(["a", "b"]);
  panel.goUp();
  assert.deepEqual(panel.path, ["a"]);

  panel.onBreadcrumbClick({ path: [] });
  assert.deepEqual(panel.path, []);

  panel.enterEntry({ isContainer: false, key: "x" });
  assert.deepEqual(panel.path, []);

  panel.enterEntry({ isContainer: true, key: "x" });
  assert.deepEqual(panel.path, ["x"]);

  panel.enterEntry(null);
  assert.deepEqual(panel.path, ["x"]);
});

test("GlobalVariablePanel.isEditingInput：区分普通输入框与搜索框", () => {
  const panel = makePanel();
  const active = { tagName: "INPUT" };
  globalThis.document = { activeElement: active };

  assert.equal(panel.isEditingInput(), false);

  panel.$el = { contains: () => false };
  assert.equal(panel.isEditingInput(), false);

  panel.$el = { contains: () => true };
  assert.equal(panel.isEditingInput(), true);

  panel.$refs = {
    searchField: { $el: { contains: (node) => node === active } },
  };
  assert.equal(panel.isEditingInput(), false);

  panel.$refs = {};
  active.tagName = "DIV";
  assert.equal(panel.isEditingInput(), false);

  active.tagName = "TEXTAREA";
  assert.equal(panel.isEditingInput(), true);

  active.isContentEditable = true;
  active.tagName = "DIV";
  assert.equal(panel.isEditingInput(), true);
});

test("GlobalVariablePanel.onValueInput / onBoolInput / applyValue", () => {
  const alerts = captureAlerts();
  const applied = [];
  let refreshes = 0;

  const panel = makePanel({
    container: { a: 1 },
    applyValue(entry, value) {
      applied.push([entry.key, value]);
    },
    refresh(force) {
      refreshes++;
      assert.equal(force, true);
    },
  });

  panel.onValueInput({ key: "a", kind: "number" }, "12");
  assert.deepEqual(applied, [["a", 12]]);

  panel.onValueInput({ key: "a", kind: "number" }, "bad");
  assert.equal(alerts.at(-1).level, "warn");
  assert.equal(refreshes, 1);

  panel.onValueInput({ key: "a", kind: "boolean" }, "true");
  assert.deepEqual(applied.at(-1), ["a", true]);

  panel.onBoolInput({ key: "a" }, true);
  assert.deepEqual(applied.at(-1), ["a", true]);
  panel.onBoolInput({ key: "a" }, "truthy");
  assert.deepEqual(applied.at(-1), ["a", false]);

  refreshes = 0;
  GlobalVariablePanel.methods.applyValue.call(panel, { key: "a" }, 2);
  assert.equal(panel.container.a, 2);
  assert.equal(refreshes, 1);

  GlobalVariablePanel.methods.applyValue.call(panel, { key: "__proto__" }, 1);
  assert.equal(alerts.at(-1).level, "error");
  assert.equal(refreshes, 2);

  panel.container = null;
  GlobalVariablePanel.methods.applyValue.call(panel, { key: "a" }, 1);
  assert.equal(refreshes, 2);
});

test("GlobalVariablePanel.openJsonEditor / openJsonAdd / closeJsonDialog", () => {
  const alerts = captureAlerts();
  const panel = makePanel({
    path: ["root"],
    container: {
      obj: { a: 1 },
      arr: [1, 2],
    },
  });

  panel.openJsonEditor({ key: "obj", isContainer: true });
  assert.equal(panel.jsonDialog.show, true);
  assert.equal(panel.jsonDialog.mode, "edit");
  assert.equal(panel.jsonDialog.targetKey, "obj");
  assert.equal(panel.jsonDialog.text, '{\n  "a": 1\n}');
  assert.match(panel.jsonDialog.title, /root/);

  panel.openJsonEditor({ key: "obj", isContainer: false });
  assert.equal(panel.jsonDialog.show, true, "非容器条目直接忽略，保留原对话框");

  panel.openJsonAdd({ key: "arr" });
  assert.equal(panel.jsonDialog.mode, "add");
  assert.equal(panel.jsonDialog.requireKey, false);
  assert.equal(panel.jsonDialog.text, "null");
  assert.equal(panel.jsonDialog.targetKey, "arr");

  panel.openJsonAdd();
  assert.equal(panel.jsonDialog.requireKey, true);
  assert.equal(panel.jsonDialog.targetKey, null);

  panel.closeJsonDialog();
  assert.equal(panel.jsonDialog.show, false);
  assert.equal(panel.jsonDialog.error, "");

  panel.container = null;
  panel.openJsonEditor({ key: "obj", isContainer: true });
  assert.equal(alerts.length, 0);
  panel.openJsonAdd();
  assert.equal(alerts.length, 0);
});

test("GlobalVariablePanel.resolveDialogTargetContainer", () => {
  const panel = makePanel({
    container: { child: { a: 1 } },
    jsonDialog: { mode: "edit", targetKey: null },
  });

  assert.deepEqual(panel.resolveDialogTargetContainer(), {
    ok: true,
    value: panel.container,
  });

  panel.jsonDialog = { mode: "add", targetKey: null };
  assert.deepEqual(panel.resolveDialogTargetContainer(), {
    ok: true,
    value: panel.container,
  });

  panel.jsonDialog = { mode: "add", targetKey: "child" };
  assert.deepEqual(panel.resolveDialogTargetContainer(), {
    ok: true,
    value: panel.container.child,
  });

  panel.container = null;
  assert.equal(panel.resolveDialogTargetContainer().ok, false);
});

test("GlobalVariablePanel.submitJsonDialog：修改 / 新增数组 / 新增属性 / 错误分支", () => {
  const alerts = captureAlerts();
  let rebuilt = 0;
  const panel = makePanel({
    container: { obj: { a: 1 }, arr: [1] },
    rebuildEntries() {
      rebuilt++;
    },
    jsonDialog: {
      show: true,
      mode: "edit",
      targetKey: "obj",
      text: '{"a":2}',
      error: "",
      keyText: "",
      requireKey: false,
    },
  });

  panel.submitJsonDialog();
  assert.deepEqual(panel.container.obj, { a: 2 });
  assert.equal(panel.jsonDialog.show, false);
  assert.equal(rebuilt, 1);
  assert.equal(alerts.at(-1).level, "success");

  panel.jsonDialog = {
    show: true,
    mode: "add",
    targetKey: "arr",
    text: "3",
    error: "",
    keyText: "ignored",
    requireKey: false,
  };
  panel.submitJsonDialog();
  assert.deepEqual(panel.container.arr, [1, 3]);

  panel.jsonDialog = {
    show: true,
    mode: "add",
    targetKey: null,
    text: "true",
    error: "",
    keyText: "  flag  ",
    requireKey: true,
  };
  panel.submitJsonDialog();
  assert.equal(panel.container.flag, true);

  panel.jsonDialog = {
    show: true,
    mode: "add",
    targetKey: null,
    text: "1",
    error: "",
    keyText: "   ",
    requireKey: true,
  };
  panel.submitJsonDialog();
  assert.match(panel.jsonDialog.error, /属性名|键|key/i);
  assert.equal(panel.jsonDialog.show, true);

  panel.jsonDialog = {
    show: true,
    mode: "edit",
    targetKey: "obj",
    text: "{bad",
    error: "",
    keyText: "",
    requireKey: false,
  };
  panel.submitJsonDialog();
  assert.match(panel.jsonDialog.error, /JSON|json/);

  panel.jsonDialog = {
    show: true,
    mode: "add",
    targetKey: "missing",
    text: "1",
    error: "",
    keyText: "x",
    requireKey: true,
  };
  panel.submitJsonDialog();
  assert.notEqual(panel.jsonDialog.error, "");

  panel.container = null;
  panel.jsonDialog = {
    show: true,
    mode: "edit",
    targetKey: "obj",
    text: "1",
    error: "",
  };
  panel.submitJsonDialog();
  assert.notEqual(panel.jsonDialog.error, "");
});

test("GlobalVariablePanel.deleteEntry / confirmDeleteEntry", () => {
  const alerts = captureAlerts();
  const dialogs = [];
  let rebuilt = 0;

  ConfirmDialog.show = (options) => dialogs.push(options);
  ConfirmDialog.close = () => {};

  const panel = makePanel({
    container: { a: 1, b: 2 },
    path: [],
    rebuildEntries() {
      rebuilt++;
    },
  });

  panel.deleteEntry({ key: "a", name: "a" });
  assert.deepEqual(panel.container, { b: 2 });
  assert.equal(rebuilt, 1);
  assert.equal(alerts.at(-1).level, "success");

  panel.deleteEntry({ key: "__proto__", name: "bad" });
  assert.equal(alerts.at(-1).level, "error");

  panel.container = null;
  panel.deleteEntry({ key: "b" });
  assert.equal(rebuilt, 1);

  panel.container = { a: 1 };
  panel.confirmDeleteEntry({ key: "a", isRoot: true });
  assert.equal(dialogs.length, 0);

  panel.confirmDeleteEntry({ key: "a", name: "a", isRoot: false });
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].width, 460);

  dialogs[0].actions[1].action();
  assert.deepEqual(panel.container, {});
  assert.equal(rebuilt, 2);
});

test("GlobalVariablePanel.scheduleSearch / cancelDeepSearch", () => {
  const { timeouts } = makeTimerWindow();
  const panel = makePanel({
    search: "abc",
    deepSearch: true,
    pagination: { page: 5, itemsPerPage: 10 },
    searchActive: true,
    runDeepSearch(keyword) {
      this.searched = keyword;
    },
  });

  panel.scheduleSearch();
  assert.equal(panel.pagination.page, 1);
  assert.equal(timeouts.size, 1);

  const [timer] = [...timeouts.values()];
  timer.fn();
  assert.equal(panel.searched, "abc");

  panel.scheduleSearch(false);
  assert.equal(panel.pagination.page, 1, "resetPage=false 不重置页码");

  panel.searchActive = false;
  panel.scheduleSearch();
  assert.equal(timeouts.size, 0);
  assert.deepEqual(panel.deepSearchResults, []);
  assert.equal(panel.deepSearchTruncated, false);
  assert.equal(panel.deepSearchLimitReason, "");

  panel.__deepSearchToken = 4;
  panel.deepSearching = true;
  panel.cancelDeepSearch();
  assert.equal(panel.__deepSearchToken, 5);
  assert.equal(panel.deepSearching, false);
});

test("GlobalVariablePanel.loadSearchLimits / saveSearchLimits / open / reset", () => {
  const { timeouts } = makeTimerWindow();
  const stored = new Map();
  const alerts = captureAlerts();

  const panel = makePanel({
    limitStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
    searchLimits: {},
    limitsDialog: {},
    deepSearch: true,
    search: "",
    scheduleSearch() {
      this.scheduled = (this.scheduled || 0) + 1;
    },
  });

  panel.loadSearchLimits();
  const defaults = { ...panel.searchLimits };
  assert.ok(defaults.maxDepth > 0);
  assert.ok(defaults.maxResults > 0);

  stored.set(
    "limits",
    JSON.stringify({ maxDepth: 9, maxResults: 0, maxNodes: "bad" }),
  );
  panel.loadSearchLimits();
  assert.equal(
    panel.searchLimits.maxDepth,
    defaults.maxDepth,
    "已缓存时不再读盘",
  );

  // 重新加载模块级缓存不可直接清空，这里验证写入优先级与落盘格式
  panel.limitsDialog = {
    show: true,
    maxDepth: 12.9,
    maxResults: 0,
    maxNodes: "bad",
    maxTimeMs: 1500,
  };
  panel.saveSearchLimits();

  assert.equal(panel.searchLimits.maxDepth, 12);
  assert.equal(panel.searchLimits.maxResults, defaults.maxResults);
  assert.equal(panel.searchLimits.maxNodes, defaults.maxNodes);
  assert.equal(panel.searchLimits.maxTimeMs, 1500);
  assert.equal(panel.limitsDialog.show, false);
  assert.equal(panel.scheduled, 1);

  const saved = JSON.parse(stored.get("limits"));
  assert.deepEqual(saved, panel.searchLimits);

  panel.openSearchLimits();
  assert.equal(panel.limitsDialog.show, true);
  assert.equal(panel.limitsDialog.maxDepth, 12);

  panel.resetSearchLimits();
  assert.equal(panel.limitsDialog.show, true);
  assert.equal(panel.limitsDialog.maxDepth, defaults.maxDepth);

  panel.limitStorage.setItem = () => {
    throw new Error("disk full");
  };
  panel.saveSearchLimits();
  assert.equal(alerts.at(-1).level, "warn");
  assert.ok(timeouts.size >= 0);
});

test("GlobalVariablePanel.runDeepSearch / buildSearchRoot / jumpToSearchResult", async () => {
  const { timeouts } = makeTimerWindow();
  const panel = makePanel({
    search: "needle",
    deepSearch: true,
    searchActive: true,
    path: ["root"],
    container: { needle: 1, nested: { needle: 2 }, other: 3 },
    searchLimits: {
      maxDepth: 4,
      maxResults: 100,
      maxNodes: 1000,
      maxTimeMs: 1000,
    },
    navigateTo(path, options) {
      this.navigated = { path, options };
    },
  });

  assert.equal(panel.buildSearchRoot(), panel.container);

  await panel.runDeepSearch("needle");

  assert.ok(panel.deepSearchResults.length > 0);
  assert.equal(panel.deepSearching, false);

  const first = panel.deepSearchResults[0];
  panel.jumpToSearchResult(first);
  assert.equal(panel.navigated.path.length, first.path.length - 1);
  assert.equal(
    panel.navigated.options.highlightKey,
    first.path[first.path.length - 1],
  );

  panel.jumpToSearchResult(null);
  assert.equal(panel.navigated.path.length, first.path.length - 1);

  // 搜索关闭后直接返回，不进入扫描
  panel.searchActive = false;
  await panel.runDeepSearch("needle");

  // 旧 token 的结果被新搜索丢弃
  panel.searchActive = true;
  panel.search = "needle";
  const pending = panel.runDeepSearch("needle");
  panel.cancelDeepSearch();
  await pending;
  assert.equal(panel.deepSearching, false);
  assert.ok(timeouts.size >= 0);
});

test("GlobalVariablePanel.restartAutoRefresh / stopAutoRefresh", () => {
  const { intervals } = makeTimerWindow();
  let refreshes = 0;
  const panel = makePanel({
    autoRefresh: true,
    refreshIntervalMs: 2000,
    jsonDialog: { show: false },
    refresh(force) {
      refreshes++;
      assert.equal(force, false);
    },
  });

  panel.restartAutoRefresh();
  assert.equal(intervals.size, 1);
  const [timer] = [...intervals.values()];
  assert.equal(timer.ms, 2000);

  timer.fn();
  assert.equal(refreshes, 1);

  panel.jsonDialog.show = true;
  timer.fn();
  assert.equal(refreshes, 1);

  panel.stopAutoRefresh();
  assert.equal(intervals.size, 0);
  assert.equal(panel.refreshTimer, null);
  assert.doesNotThrow(() => panel.stopAutoRefresh());

  panel.autoRefresh = false;
  panel.restartAutoRefresh();
  assert.equal(intervals.size, 0);

  panel.autoRefresh = true;
  panel.refreshIntervalMs = 0;
  panel.restartAutoRefresh();
  assert.equal(intervals.size, 0);
});

test("GlobalVariablePanel.refresh / rebuildEntries / resolveContainer", () => {
  const panel = makePanel({
    path: [],
    container: null,
    entries: [{ key: "a", preview: "1" }],
    isEditingInput: () => true,
    rebuildEntries: GlobalVariablePanel.methods.rebuildEntries,
  });
  let rebuilt = 0;
  panel.rebuildEntries = () => rebuilt++;

  panel.refresh();
  assert.equal(rebuilt, 0);
  panel.refresh(true);
  assert.equal(rebuilt, 1);

  globalThis.window = { a: { b: 2 } };
  panel.path = ["a"];
  panel.rebuildEntries = GlobalVariablePanel.methods.rebuildEntries;
  panel.buildEntries = () => [{ key: "b", preview: "2" }];

  panel.rebuildEntries();
  assert.deepEqual(panel.entries, [{ key: "b", preview: "2" }]);
  const before = panel.entries;
  panel.rebuildEntries();
  assert.equal(panel.entries, before, "值未变化时复用数组");

  assert.equal(panel.resolveContainer(), true);
  assert.equal(panel.container, globalThis.window.a);

  panel.path = ["missing"];
  assert.equal(panel.resolveContainer(), false);
  assert.equal(panel.container, null);
  assert.notEqual(panel.containerError, "");

  globalThis.window = { value: 1 };
  panel.path = ["value"];
  assert.equal(panel.resolveContainer(), false);
  assert.notEqual(panel.containerError, "");
});

test("GlobalVariablePanel.scheduleInitialLoad / cancelInitialLoad / runInitialLoad", () => {
  const { timeouts } = makeTimerWindow();
  const panel = makePanel({
    initialLoadPending: false,
    initialLoaded: false,
    initialIdleHandle: null,
    initialLoadTimer: null,
    loadSearchLimits() {
      this.loadedLimits = true;
    },
    reloadRootGlobals() {
      this.reloaded = true;
    },
    rebuildEntries() {
      this.rebuilt = true;
    },
    restartAutoRefresh() {
      this.restarted = true;
    },
  });

  panel.scheduleInitialLoad();
  assert.equal(panel.initialLoadPending, true);
  assert.equal(timeouts.size, 1);

  // 重复调度不会创建第二个定时器
  panel.scheduleInitialLoad();
  assert.equal(timeouts.size, 1);

  const [timer] = [...timeouts.values()];
  timer.fn();
  assert.equal(panel.loadedLimits, true);
  assert.equal(panel.reloaded, true);
  assert.equal(panel.rebuilt, true);
  assert.equal(panel.restarted, true);
  assert.equal(panel.initialLoaded, true);
  assert.equal(panel.entriesLoading, false);

  panel.scheduleInitialLoad();
  assert.equal(timeouts.size, 0, "已加载后不再调度");

  panel.initialLoaded = false;
  panel.initialLoadPending = true;
  panel.initialLoadTimer = 99;
  panel.cancelInitialLoad();
  assert.equal(panel.initialLoadPending, false);
  assert.equal(panel.initialLoadTimer, null);

  // 取消后即使定时器回调执行也不再加载
  panel.scheduleInitialLoad();
  const [pendingTimer] = [...timeouts.values()];
  panel.cancelInitialLoad();
  pendingTimer.fn();
  assert.equal(panel.initialLoaded, false);

  panel.loadSearchLimits = () => {
    throw new Error("boom");
  };
  panel.scheduleInitialLoad();
  const failing = [...timeouts.values()].at(-1);
  failing.fn();
  assert.match(panel.containerError, /boom/);
  assert.equal(panel.entriesLoading, false);
});

test("GlobalVariablePanel.created / mounted / activated / deactivated / beforeUnmount", () => {
  globalThis.window = { marker: true };

  const panel = makePanel({
    scheduleInitialLoad() {
      this.scheduled = (this.scheduled || 0) + 1;
    },
    refresh(force) {
      this.refreshed = force;
    },
    restartAutoRefresh() {
      this.restarted = (this.restarted || 0) + 1;
    },
    stopAutoRefresh() {
      this.stopped = (this.stopped || 0) + 1;
    },
    clearSearchTimer() {
      this.searchCleared = (this.searchCleared || 0) + 1;
    },
    cancelDeepSearch() {
      this.deepCancelled = (this.deepCancelled || 0) + 1;
    },
    cancelInitialLoad() {
      this.initialCancelled = (this.initialCancelled || 0) + 1;
    },
  });

  GlobalVariablePanel.created.call(panel);
  assert.equal(panel.container, globalThis.window);
  assert.equal(typeof panel.limitStorage.getItem, "function");
  assert.equal(typeof panel.limitStorage.setItem, "function");

  GlobalVariablePanel.mounted.call(panel);
  assert.equal(panel.scheduled, 1);

  panel.initialLoaded = true;
  GlobalVariablePanel.activated.call(panel);
  assert.equal(panel.refreshed, true);
  assert.equal(panel.restarted, 1);

  panel.initialLoaded = false;
  GlobalVariablePanel.activated.call(panel);
  assert.equal(panel.scheduled, 2);

  GlobalVariablePanel.deactivated.call(panel);
  assert.equal(panel.stopped, 1);
  assert.equal(panel.searchCleared, 1);
  assert.equal(panel.deepCancelled, 1);
  assert.equal(panel.initialCancelled, 1);

  GlobalVariablePanel.beforeUnmount.call(panel);
  assert.equal(panel.stopped, 2);
  assert.equal(panel.searchCleared, 2);
  assert.equal(panel.deepCancelled, 2);
  assert.equal(panel.initialCancelled, 2);
});

test("GlobalVariablePanel.watch 触发搜索、根筛选与自动刷新", () => {
  const calls = [];
  const panel = makePanel({
    path: [],
    isRoot: true,
    __restoringPanelState: false,
    deepSearchResults: [1],
    deepSearchTruncated: true,
    deepSearchLimitReason: "x",
    scheduleSearch(immediate) {
      calls.push(["search", immediate]);
    },
    navigateTo(path, options) {
      calls.push(["navigate", path, options]);
    },
    restartAutoRefresh() {
      calls.push(["restart"]);
    },
  });

  GlobalVariablePanel.watch.search.call(panel);
  assert.deepEqual(calls.at(-1), ["search", true]);

  panel.__restoringPanelState = true;
  GlobalVariablePanel.watch.search.call(panel);
  assert.deepEqual(calls.at(-1), ["search", false]);

  panel.__restoringPanelState = false;
  GlobalVariablePanel.watch.deepSearch.call(panel);
  assert.deepEqual(panel.deepSearchResults, []);
  assert.equal(panel.deepSearchTruncated, false);
  assert.equal(panel.deepSearchLimitReason, "");
  assert.deepEqual(calls.at(-1), ["search", true]);

  GlobalVariablePanel.watch.rootFilter.call(panel);
  assert.deepEqual(calls.at(-1), ["navigate", [], {}]);

  panel.__restoringPanelState = true;
  const before = calls.length;
  GlobalVariablePanel.watch.rootFilter.call(panel);
  assert.equal(calls.length, before, "恢复状态时不导航");

  panel.__restoringPanelState = false;
  panel.path = ["nested"];
  panel.isRoot = false;
  GlobalVariablePanel.watch.rootFilter.call(panel);
  assert.equal(calls.length, before, "非根路径不导航");

  GlobalVariablePanel.watch.autoRefresh.call(panel);
  GlobalVariablePanel.watch.refreshIntervalMs.call(panel);
  assert.equal(calls.at(-1)[0], "restart");
});

test("GlobalVariablePanel.reloadAll / reloadRootGlobals / toggleDeepSearch", () => {
  const alerts = captureAlerts();
  const panel = makePanel({
    reloadRootGlobals(force) {
      this.forced = force;
    },
    rebuildEntries() {
      this.rebuilt = true;
    },
    deepSearch: false,
  });

  panel.reloadAll();
  assert.equal(panel.forced, true);
  assert.equal(panel.rebuilt, true);
  assert.equal(alerts.at(-1).level, "success");

  panel.toggleDeepSearch();
  assert.equal(panel.deepSearch, true);
  panel.toggleDeepSearch();
  assert.equal(panel.deepSearch, false);
});

test("GlobalVariablePanel.requestIdleCallback scheduling and cancel", () => {
  const idle = new Map();
  let nextId = 1;

  globalThis.window = {
    requestIdleCallback(callback, options) {
      const id = nextId++;
      idle.set(id, { callback, options });
      return id;
    },
    cancelIdleCallback(id) {
      idle.delete(id);
    },
  };

  const panel = makePanel({
    initialLoaded: false,
    initialLoadPending: false,
    initialLoadTimer: null,
    initialIdleHandle: null,
    runInitialLoad() {
      this.ran = true;
    },
  });

  panel.scheduleInitialLoad();
  assert.equal(panel.initialLoadPending, true);
  assert.equal(idle.size, 1);
  assert.equal(typeof panel.initialIdleHandle, "number");

  const [{ callback }] = [...idle.values()];
  panel.cancelInitialLoad();
  assert.equal(idle.size, 0);
  assert.equal(panel.initialLoadPending, false);

  callback();
  assert.equal(panel.ran, undefined);
});

test("GlobalVariablePanel.runInitialLoad resumes search after load", () => {
  const panel = makePanel({
    searchActive: true,
    entriesLoading: true,
    loadSearchLimits() {},
    reloadRootGlobals() {},
    rebuildEntries() {},
    restartAutoRefresh() {},
    scheduleSearch() {
      this.searchScheduled = true;
    },
  });

  panel.runInitialLoad();

  assert.equal(panel.initialLoaded, true);
  assert.equal(panel.entriesLoading, false);
  assert.equal(panel.searchScheduled, true);
});

test("GlobalVariablePanel.reloadRootGlobals scans the window", () => {
  globalThis.window = {
    $gameParty: { members: () => [] },
    $plugins: [],
    customGlobal: 1,
  };

  const panel = makePanel();
  panel.reloadRootGlobals(true);

  assert.ok(Array.isArray(panel.rootScan.rpg));
  assert.ok(Array.isArray(panel.rootScan.plugin));
  assert.equal(typeof panel.pluginNameMap, "object");
});

test("GlobalVariablePanel.resolveContainer / rebuildEntries handle broken paths", () => {
  globalThis.window = {};

  const panel = makePanel({
    path: ["missing"],
    container: { stale: true },
    entries: [1],
  });

  assert.equal(panel.resolveContainer(), false);
  assert.equal(panel.container, null);
  assert.notEqual(panel.containerError, "");

  panel.entries = [{ key: "a" }];
  panel.resolveContainer = () => false;
  panel.rebuildEntries();
  assert.deepEqual(panel.entries, []);
});

test("GlobalVariablePanel.buildEntries / goUp / buildSearchRoot", () => {
  const navigations = [];
  const panel = makePanel({
    container: { a: 1 },
    path: [],
    rootScan: { rpg: ["$gameParty"], plugin: [] },
    rootFilter: "all",
    pluginNameMap: {},
    isRoot: true,
    navigateTo(path, options) {
      navigations.push([path, options]);
    },
  });

  assert.ok(Array.isArray(panel.buildEntries()));

  panel.goUp();
  assert.equal(navigations.length, 0, "root path does not navigate up");

  panel.path = ["nested"];
  panel.goUp();
  assert.deepEqual(navigations.at(-1), [[], undefined]);

  globalThis.window = { $gameParty: { members: () => [] } };
  const root = panel.buildSearchRoot();
  assert.equal(typeof root, "object");
  assert.ok(Object.hasOwn(root, "$gameParty"));

  panel.isRoot = false;
  panel.container = { nested: true };
  assert.equal(panel.buildSearchRoot(), panel.container);
});
