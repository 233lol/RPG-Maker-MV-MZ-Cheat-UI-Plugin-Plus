import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import PageJump from "../../cheat-engine/www/cheat/components/PageJump.js";
import PaginationFooter from "../../cheat-engine/www/cheat/components/PaginationFooter.js";
import SearchField from "../../cheat-engine/www/cheat/components/SearchField.js";
import RefreshButton from "../../cheat-engine/www/cheat/components/RefreshButton.js";
import KeyInputField from "../../cheat-engine/www/cheat/components/KeyInputField.js";
import PanelErrorBoundary from "../../cheat-engine/www/cheat/components/PanelErrorBoundary.js";
import AlertSnackbar from "../../cheat-engine/www/cheat/components/AlertSnackbar.js";
import ConfirmDialog from "../../cheat-engine/www/cheat/components/ConfirmDialog.js";
import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";
import { Key } from "../../cheat-engine/www/cheat/js/KeyCodes.js";
import {
  getPageBounds,
  getItemsPerPageOptions,
} from "../../cheat-engine/www/cheat/js/PaginationHelper.js";
import { formatPanelError } from "../../cheat-engine/www/cheat/js/PanelError.js";
import { ConfirmDialog as ConfirmDialogService } from "../../cheat-engine/www/cheat/js/DialogHelper.js";

afterEach(() => {
  Alert.handler = null;
  Alert.pending = [];
});

test("PageJump：输入合法页码时 emit，否则只把输入框恢复成当前页", () => {
  const emitted = [];
  const panel = {
    page: 2,
    pageCount: 5,
    inputVal: 2,
    $emit(event, value) {
      emitted.push([event, value]);
    },
  };

  Object.assign(panel, PageJump.methods);

  panel.inputVal = "4";
  panel.jump();
  assert.deepEqual(emitted, [["jump", 4]]);
  assert.equal(panel.inputVal, 2);

  panel.inputVal = "0";
  panel.jump();
  panel.inputVal = "6";
  panel.jump();
  assert.deepEqual(emitted, [["jump", 4]]);
  assert.equal(panel.inputVal, 2);

  panel.inputVal = "not-a-number";
  panel.jump();
  assert.deepEqual(emitted, [["jump", 4]]);
});

test("PageJump：data / watch 会跟随父组件的 page", () => {
  const data = PageJump.data.call({ page: 3 });
  assert.equal(data.inputVal, 3);

  const panel = { inputVal: 1 };
  PageJump.watch.page.call(panel, 7);
  assert.equal(panel.inputVal, 7);

  assert.deepEqual(PageJump.emits, ["jump"]);
  assert.equal(PageJump.props.page.required, true);
  assert.equal(PageJump.props.pageCount.required, true);
});

test("PaginationFooter：分页范围、页数与文案", () => {
  const panel = {
    total: 12,
    page: 2,
    itemsPerPage: 5,
    pageCount: null,
  };

  Object.defineProperty(panel, "bounds", {
    get() {
      return PaginationFooter.computed.bounds.call(this);
    },
  });

  assert.equal(PaginationFooter.computed.perPageLabel.call(panel), "每页");

  assert.deepEqual(
    PaginationFooter.computed.bounds.call(panel),
    getPageBounds(12, 2, 5),
  );
  assert.equal(PaginationFooter.computed.resolvedPageCount.call(panel), 3);
  assert.equal(PaginationFooter.computed.rangeText.call(panel), "6-10 / 12");

  panel.pageCount = 9;
  assert.equal(PaginationFooter.computed.resolvedPageCount.call(panel), 9);

  panel.pageCount = 0;
  assert.equal(PaginationFooter.computed.resolvedPageCount.call(panel), 0);

  const empty = { total: 0, page: 1, itemsPerPage: 5, pageCount: null };
  Object.defineProperty(empty, "bounds", {
    get() {
      return PaginationFooter.computed.bounds.call(this);
    },
  });
  assert.equal(PaginationFooter.computed.rangeText.call(empty), "0-0 / 0");
});

test("PaginationFooter / SearchField / RefreshButton：props 默认值保持可用", () => {
  assert.deepEqual(PaginationFooter.props.itemsPerPageOptions.default(), []);
  assert.deepEqual(
    PaginationFooter.computed.resolvedItemsPerPageOptions.call({
      itemsPerPageOptions: [],
    }),
    getItemsPerPageOptions(),
  );
  assert.equal(PaginationFooter.props.total.default, 0);
  assert.equal(PaginationFooter.props.itemsPerPage.default, 5);

  assert.equal(SearchField.props.label.default, "");
  const resolvedLabel = SearchField.computed.resolvedLabel.call({ label: "" });
  assert.equal(typeof resolvedLabel, "string");
  assert.notEqual(resolvedLabel, "");
  assert.equal(SearchField.props.fieldClass.default, "flex-grow-1");
  assert.equal(SearchField.props.modelValue.default, "");

  assert.equal(RefreshButton.props.tooltip.default, "");
  const resolvedTooltip = RefreshButton.computed.resolvedTooltip.call({
    tooltip: "",
  });
  assert.equal(typeof resolvedTooltip, "string");
  assert.notEqual(resolvedTooltip, "");
  assert.equal(RefreshButton.props.color.default, "pink");
  assert.equal(RefreshButton.props.icon.default, "mdi-refresh");

  assert.deepEqual(SearchField.emits, ["update:modelValue"]);
  assert.deepEqual(RefreshButton.emits, ["click"]);
});

test("KeyInputField：显示、可删除状态与样式变体", () => {
  const key = Key.fromString("ctrl c");
  const panel = {
    modelValue: key,
    deletable: true,
    outlined: false,
    solo: false,
  };

  Object.assign(panel, KeyInputField.methods);

  assert.equal(KeyInputField.computed.showingText.call(panel), "Ctrl + C");
  assert.equal(KeyInputField.computed.canDelete.call(panel), true);

  panel.deletable = false;
  assert.equal(KeyInputField.computed.canDelete.call(panel), false);

  panel.deletable = true;
  panel.modelValue = Key.createEmpty();
  assert.equal(KeyInputField.computed.canDelete.call(panel), false);

  assert.equal(KeyInputField.computed.variant.call(panel), undefined);
  panel.outlined = true;
  assert.equal(KeyInputField.computed.variant.call(panel), "outlined");
  panel.outlined = false;
  panel.solo = true;
  assert.equal(KeyInputField.computed.variant.call(panel), "solo");
});

test("KeyInputField.onDeleteClick：只清除可删除的键，并同时 emit change", () => {
  const events = [];
  const panel = {
    modelValue: Key.fromString("ctrl c"),
    deletable: true,
    canDelete: true,
    $emit(event, value) {
      events.push([event, value]);
    },
  };

  Object.assign(panel, KeyInputField.methods);

  panel.onDeleteClick();

  assert.equal(events.length, 2);
  assert.equal(events[0][0], "update:modelValue");
  assert.equal(events[1][0], "change");
  assert.equal(events[0][1].isEmpty(), true);
  assert.equal(events[1][1].isEmpty(), true);

  events.length = 0;
  panel.canDelete = false;
  panel.onDeleteClick();
  assert.deepEqual(events, []);
});

test("KeyInputField.onShortcutInput：过滤不可表示 / 纯组合键，键变化才 emit", () => {
  const events = [];
  const panel = {
    modelValue: Key.createEmpty(),
    combiningKeyAlone: false,
    $emit(event, value) {
      events.push([event, value]);
    },
  };

  Object.assign(panel, KeyInputField.methods);

  panel.onShortcutInput({
    keyCode: 67,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });

  assert.equal(events.length, 2);
  assert.equal(events[0][1].asString(), "ctrl c");
  assert.equal(events[1][1].asString(), "ctrl c");

  // 与当前值相同：不重复 emit
  events.length = 0;
  panel.modelValue = Key.fromString("ctrl c");
  panel.onShortcutInput({
    keyCode: 67,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert.deepEqual(events, []);

  // 未登记键码（PrintScreen / IME）无法写进配置
  panel.onShortcutInput({
    keyCode: 226,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert.deepEqual(events, []);

  // 只按修饰键默认忽略，除非面板显式允许
  panel.combiningKeyAlone = false;
  panel.onShortcutInput({
    keyCode: 17,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert.deepEqual(events, []);

  panel.combiningKeyAlone = true;
  panel.onShortcutInput({
    keyCode: 17,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert.equal(events.length, 2);
  assert.equal(events[0][1].asString(), "ctrl");
});

test("PanelErrorBoundary：错误的 message / stack / info 被展示，并可重试清除", () => {
  const panel = {
    ...PanelErrorBoundary.methods,
    panelName: "test-panel",
    errorMessage: "",
    errorStack: "",
    errorInfo: "",
  };

  assert.equal(PanelErrorBoundary.computed.hasError.call(panel), false);
  assert.equal(PanelErrorBoundary.computed.errorText.call(panel), "");

  const error = new Error("boom");
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);

  try {
    const result = PanelErrorBoundary.errorCaptured.call(
      panel,
      error,
      {},
      "render function",
    );

    assert.equal(result, false, "返回 false 阻止错误继续冒泡");
    assert.equal(panel.errorMessage, "boom");
    assert.ok(panel.errorStack.includes("Error: boom"));
    assert.equal(panel.errorInfo, "render function");
    assert.equal(PanelErrorBoundary.computed.hasError.call(panel), true);
    assert.ok(
      PanelErrorBoundary.computed.errorText
        .call(panel)
        .includes("render function"),
    );
    assert.equal(logged.length, 1);
  } finally {
    console.error = originalError;
  }

  panel.retry();
  assert.equal(panel.errorMessage, "");
  assert.equal(panel.errorStack, "");
  assert.equal(panel.errorInfo, "");
  assert.equal(PanelErrorBoundary.computed.hasError.call(panel), false);

  panel.errorMessage = "x";
  panel.errorStack = "y";
  panel.errorInfo = "z";
  PanelErrorBoundary.watch.panelName.call(panel);
  assert.equal(panel.errorMessage, "");
  assert.equal(panel.errorStack, "");
  assert.equal(panel.errorInfo, "");
});

test("PanelErrorBoundary：formatPanelError 与错误边界展示内容一致", () => {
  const error = new Error("same");
  const panel = {
    ...PanelErrorBoundary.methods,
    panelName: "",
    errorMessage: "",
    errorStack: "",
    errorInfo: "",
  };

  const originalError = console.error;
  console.error = () => {};

  try {
    PanelErrorBoundary.errorCaptured.call(panel, error, {}, "info");
  } finally {
    console.error = originalError;
  }

  const formatted = formatPanelError(error, "info");
  assert.equal(panel.errorMessage, formatted.message);
  assert.equal(panel.errorStack, formatted.stack);
  assert.equal(panel.errorInfo, formatted.info);
});

test("AlertSnackbar：不同级别映射颜色 / 超时，错误附带 cause 并写 console", () => {
  const shown = [];
  const panel = {
    ...AlertSnackbar.methods,
    alertHandler: null,
    show(options) {
      shown.push(options);
    },
  };

  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);

  try {
    AlertSnackbar.mounted.call(panel);

    Alert.success("ok");
    Alert.info("hi");
    Alert.warn("warn");
    Alert.error("bad", new Error("cause"), 100);
    Alert.alertInternal("debug", "debug-msg");

    assert.equal(shown.length, 5);
    assert.deepEqual(
      shown.map((item) => item.color),
      ["green", "blue", "orange", "red", "blue-grey"],
    );
    assert.equal(shown[0].timeout, 1500);
    assert.equal(shown[2].timeout, 3000);
    assert.equal(shown[3].timeout, 5000);
    assert.match(shown[3].text, /^bad\n\[cause\] Error: cause$/);
    assert.equal(shown[4].timeout, 1500);
    assert.equal(logged.length, 1);

    AlertSnackbar.beforeUnmount.call(panel);
    assert.equal(Alert.handler, null);
  } finally {
    console.error = originalError;
  }
});

test("AlertSnackbar.show：文本按行拆分、递增 key 并更新颜色 / 超时", () => {
  const panel = {
    text: "",
    timeout: 1000,
    color: "black",
    snackbarKey: 0,
    showSnackbar: false,
  };

  Object.assign(panel, AlertSnackbar.methods);

  panel.show({ text: "a\nb", color: "red", timeout: 3000 });

  assert.deepEqual(panel.text, ["a", "b"]);
  assert.equal(panel.timeout, 3000);
  assert.equal(panel.color, "red");
  assert.equal(panel.snackbarKey, 1);
  assert.equal(panel.showSnackbar, true);

  panel.show({ text: "c", timeout: 1000 });
  assert.equal(panel.color, "red", "未提供颜色时保留上一次颜色");
  assert.equal(panel.snackbarKey, 2);
  assert.deepEqual(panel.text, ["c"]);
});

test("ConfirmDialog：默认设置、嵌套合并与关闭", () => {
  const panel = {
    ...ConfirmDialog.methods,
    showDialog: false,
    options: undefined,
    close() {
      this.showDialog = false;
      this.options = undefined;
    },
  };

  const defaults = panel.defaultSettings();
  assert.equal(defaults.width, 400);
  assert.equal(defaults.message, "");
  assert.equal(defaults.actions.length, 1);
  assert.equal(typeof defaults.actions[0].label, "string");

  panel.show({
    width: 520,
    message: "第一行\n第二行",
    actions: [{ icon: "mdi-check", label: "确定", color: "green" }],
  });

  assert.equal(panel.showDialog, true);
  assert.equal(panel.options.width, 520);
  assert.deepEqual(ConfirmDialog.computed.messageArray.call(panel), [
    "第一行",
    "第二行",
  ]);
  assert.equal(panel.options.actions.length, 1);
  assert.equal(panel.options.actions[0].label, "确定");

  panel.close();
  assert.equal(panel.showDialog, false);
  assert.equal(panel.options, undefined);
  assert.deepEqual(ConfirmDialog.computed.messageArray.call(panel), []);
});

test("组件 data 工厂返回可用的初始状态", () => {
  assert.deepEqual(KeyInputField.data.call({}), {});

  assert.deepEqual(PanelErrorBoundary.data.call({}), {
    errorMessage: "",
    errorStack: "",
    errorInfo: "",
  });

  assert.deepEqual(ConfirmDialog.data(), {
    showDialog: false,
    options: undefined,
  });

  assert.deepEqual(AlertSnackbar.data(), {
    showSnackbar: false,
    snackbarKey: 0,
    text: "",
    timeout: 1000,
    color: "black",
  });
});

test("ConfirmDialog.close 清空对话框状态", () => {
  const panel = {
    showDialog: true,
    options: { message: "hi" },
  };

  ConfirmDialog.methods.close.call(panel);

  assert.equal(panel.showDialog, false);
  assert.equal(panel.options, undefined);
});

test("ConfirmDialog.copyObjectProps：递归合并对象、数组整体替换", () => {
  const panel = { ...ConfirmDialog.methods };

  const dest = {
    options: { width: 1, nested: { a: 1, b: 2 } },
    list: ["old"],
  };

  panel.copyObjectProps(
    {
      options: { nested: { b: 9 }, extra: true },
      list: ["new", "items"],
    },
    dest,
  );

  assert.deepEqual(dest, {
    options: { width: 1, nested: { a: 1, b: 9 }, extra: true },
    list: ["new", "items"],
  });
});

test("ConfirmDialog：挂载时接管静态服务，卸载时只清理自己的回调", () => {
  const panel = {
    ...ConfirmDialog.methods,
    show() {},
    close() {},
  };

  ConfirmDialog.mounted.call(panel);
  assert.equal(ConfirmDialogService.show, panel.show);
  assert.equal(ConfirmDialogService.close, panel.close);

  const otherShow = () => {};
  ConfirmDialogService.show = otherShow;

  ConfirmDialog.beforeUnmount.call(panel);
  assert.equal(
    ConfirmDialogService.show,
    otherShow,
    "静态方法已被其他实例接管时不能清空",
  );

  ConfirmDialogService.show = panel.show;
  ConfirmDialogService.close = panel.close;
  ConfirmDialog.beforeUnmount.call(panel);

  assert.equal(typeof ConfirmDialogService.show, "function");
  assert.equal(typeof ConfirmDialogService.close, "function");
  assert.notEqual(ConfirmDialogService.show, panel.show);
  assert.notEqual(ConfirmDialogService.close, panel.close);
});
