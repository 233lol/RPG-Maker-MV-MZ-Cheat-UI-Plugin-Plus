// @ts-check
// 判断事件目标是否落在作弊 UI / 弹层上。
//
// 作弊窗口本身有 #cheat-modal，但确认框、JSON 编辑框、REPL、菜单、snackbar
// 都会被 Vuetify teleport 到 #app 下的 overlay 容器，不在 #cheat-modal 内。
// 如果只按 #cheat-modal 的矩形判断，这些弹层上的点击会继续传给游戏。
const CHEAT_UI_SELECTORS = [
  "#cheat-modal",
  ".v-overlay",
  ".v-overlay__content",
  ".v-overlay__scrim",
  ".v-snackbar",
  ".v-menu",
  ".v-tooltip",
];

export function isCheatUiTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  try {
    return CHEAT_UI_SELECTORS.some((selector) => !!target.closest(selector));
  } catch (error) {
    return false;
  }
}

// 作弊窗口打开且当前面板不是地图事件时，引擎层的键盘 / 鼠标输入会被整块忽略。
// 只在 DOM 冒泡阶段拦截不够：游戏插件可能在 window / document 的捕获阶段监听，
// 焦点在作弊菜单里时事件仍会被引擎的 Input / TouchInput 收到。
let gameInputBlocked = false;

export function setGameInputBlocked(blocked) {
  gameInputBlocked = !!blocked;
}

export function isGameInputBlocked() {
  return gameInputBlocked;
}
