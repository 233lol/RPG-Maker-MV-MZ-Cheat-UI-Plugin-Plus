// customize mv functions
import { MessageCheat } from "../js/CheatHelper.js";
import { isCheatUiTarget } from "../js/ClickGuard.js";

export function customizeRPGMakerFunctions(mainComponent) {
  if (Utils.RPGMAKER_NAME === "MV") {
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (isCheatUiTarget(event.target)) return;
      this._events.wheelX += event.deltaX;
      this._events.wheelY += event.deltaY;
    };

    // ignore click event when click inside cheat UI (modal / dialogs / menus)
    const TouchInput_onMouseDown = TouchInput._onMouseDown;
    TouchInput._onMouseDown = function (event) {
      if (isCheatUiTarget(event.target)) {
        return;
      }

      TouchInput_onMouseDown.call(this, event);
    };
  } else {
    // MZ Settings
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (isCheatUiTarget(event.target)) return;
      this._newState.wheelX += event.deltaX;
      this._newState.wheelY += event.deltaY;
    };

    // ignore click event when click inside cheat UI (modal / dialogs / menus)
    const TouchInput_onMouseDown = TouchInput._onMouseDown;
    TouchInput._onMouseDown = function (event) {
      if (isCheatUiTarget(event.target)) {
        return;
      }

      TouchInput_onMouseDown.call(this, event);
    };
  }

  MessageCheat.initialize();
}
