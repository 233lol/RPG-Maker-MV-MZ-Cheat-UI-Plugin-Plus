// @ts-check
// customize mv functions
import { MessageCheat } from "../js/CheatHelper.js";
import { isCheatUiTarget, isGameInputBlocked } from "../js/ClickGuard.js";

const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']";

function isEditableTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  try {
    return !!target.closest(EDITABLE_SELECTOR);
  } catch (error) {
    return false;
  }
}

// 地图事件面板允许操作游戏，但如果焦点在输入框里（例如调轮询间隔），
// 方向键仍然只应该编辑文本，不能顺带移动角色。
function hasEditableFocus() {
  try {
    return isEditableTarget(
      typeof document !== "undefined" ? document.activeElement : null,
    );
  } catch (error) {
    return false;
  }
}

// 把 Input / TouchInput 的输入回调包一层：作弊菜单打开期间（地图事件面板除外）
// 直接忽略输入，避免焦点在菜单里时方向键 / 点击还让角色移动。
// 只包 DOM 冒泡不够，游戏插件可能在 window / document 捕获阶段监听。
function guardGameInputMethod(owner, name, guardFlag) {
  const original = owner && owner[name];

  if (typeof original !== "function" || original[guardFlag]) {
    return;
  }

  const wrapped = function (event) {
    if (isGameInputBlocked()) {
      return;
    }

    // 在输入框里打字时也不要让引擎把方向键当成移动 / 菜单操作。
    if (isEditableTarget(event && event.target)) {
      return;
    }

    return original.call(this, event);
  };

  wrapped[guardFlag] = true;
  owner[name] = wrapped;
}

// 引擎在启动时就把 Input._onKeyDown / TouchInput._onMouseDown 绑定到了
// document 上，之后替换方法名拦不到已经绑定的回调。Input.update /
// TouchInput.update 是每帧动态调用的，在这里清空状态才能保证游戏逻辑
// 读不到菜单期间的按键 / 点击。
function guardUpdateMethod(owner, name) {
  const original = owner && owner[name];

  if (typeof original !== "function" || original.__cheatUpdateGuard) {
    return;
  }

  const wrapped = function () {
    if (isGameInputBlocked() || hasEditableFocus()) {
      clearGameInput();
      return;
    }

    return original.apply(this, arguments);
  };

  wrapped.__cheatUpdateGuard = true;
  owner[name] = wrapped;
}

// 把 TouchInput 的输入回调包一层：落在作弊 UI 上的点击 / 触摸 / 指针事件
// 不再传给游戏。MV/MZ 同时绑定了 mouse、touch、pointer 三套事件，
// 只包 _onMouseDown 会让触屏设备点作弊按钮时顺带触发游戏操作。
function guardTouchInputMethod(name) {
  const original = TouchInput[name];

  if (typeof original !== "function" || original.__cheatTouchGuard) {
    return;
  }

  const wrapped = function (event) {
    if (isGameInputBlocked() || (event && isCheatUiTarget(event.target))) {
      return;
    }

    return original.call(this, event);
  };

  wrapped.__cheatTouchGuard = true;
  TouchInput[name] = wrapped;
}

// 关闭作弊菜单 / 释放按键时，把引擎里可能残留的按下状态清掉，
// 否则打开菜单前按住的键会让角色继续走。
export function clearGameInput() {
  try {
    if (
      typeof Input !== "undefined" &&
      Input &&
      typeof Input.clear === "function"
    ) {
      Input.clear();
    }
  } catch (error) {
    // ignore
  }

  try {
    if (
      typeof TouchInput !== "undefined" &&
      TouchInput &&
      typeof TouchInput.clear === "function"
    ) {
      TouchInput.clear();
    }
  } catch (error) {
    // ignore
  }
}

export function customizeRPGMakerFunctions() {
  if (Utils.RPGMAKER_NAME === "MV") {
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (isGameInputBlocked() || isCheatUiTarget(event.target)) return;
      this._events.wheelX += event.deltaX;
      this._events.wheelY += event.deltaY;
    };
    TouchInput._onWheel.__cheatTouchGuard = true;
  } else {
    // MZ Settings
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (isGameInputBlocked() || isCheatUiTarget(event.target)) return;
      this._newState.wheelX += event.deltaX;
      this._newState.wheelY += event.deltaY;
    };
    TouchInput._onWheel.__cheatTouchGuard = true;
  }

  for (const name of [
    "_onMouseDown",
    "_onTouchStart",
    "_onTouchMove",
    "_onTouchEnd",
    "_onTouchCancel",
    "_onPointerDown",
    "_onPointerMove",
    "_onPointerUp",
    "_onPointerCancel",
  ]) {
    guardTouchInputMethod(name);
  }

  if (typeof Input !== "undefined" && Input) {
    guardGameInputMethod(Input, "_onKeyDown", "__cheatInputGuard");
    guardGameInputMethod(Input, "_onKeyUp", "__cheatInputGuard");
    guardUpdateMethod(Input, "update");
  }

  if (typeof TouchInput !== "undefined" && TouchInput) {
    guardUpdateMethod(TouchInput, "update");
  }

  MessageCheat.initialize();
}
