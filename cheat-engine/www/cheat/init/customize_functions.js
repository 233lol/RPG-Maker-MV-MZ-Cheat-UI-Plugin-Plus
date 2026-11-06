// customize mv functions
import { MessageCheat } from "../js/CheatHelper.js";
import { isCheatUiTarget } from "../js/ClickGuard.js";

// 把 TouchInput 的输入回调包一层：落在作弊 UI 上的点击 / 触摸 / 指针事件
// 不再传给游戏。MV/MZ 同时绑定了 mouse、touch、pointer 三套事件，
// 只包 _onMouseDown 会让触屏设备点作弊按钮时顺带触发游戏操作。
function guardTouchInputMethod(name) {
  const original = TouchInput[name];

  if (typeof original !== "function" || original.__cheatTouchGuard) {
    return;
  }

  const wrapped = function (event) {
    if (event && isCheatUiTarget(event.target)) {
      return;
    }

    return original.call(this, event);
  };

  wrapped.__cheatTouchGuard = true;
  TouchInput[name] = wrapped;
}

export function customizeRPGMakerFunctions() {
  if (Utils.RPGMAKER_NAME === "MV") {
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (isCheatUiTarget(event.target)) return;
      this._events.wheelX += event.deltaX;
      this._events.wheelY += event.deltaY;
    };
    TouchInput._onWheel.__cheatTouchGuard = true;
  } else {
    // MZ Settings
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (isCheatUiTarget(event.target)) return;
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

  MessageCheat.initialize();
}
