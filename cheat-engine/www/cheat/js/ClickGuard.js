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
