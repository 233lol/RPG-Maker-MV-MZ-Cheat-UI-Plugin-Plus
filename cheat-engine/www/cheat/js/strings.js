// 共享 UI 文案。
//
// 面板里大量文案是一次性的游戏名词，继续留在各自模板里更易读；这里集中
// 的是「多个地方会复用、改一次要全局生效」的通用文案（搜索、分页、刷新、
// 导航名称等）。新增共享文案时优先放这里，避免同一个词在不同面板里出现
// 两种写法。
//
// 用法：
//   import { t } from "../js/strings.js";
//   t("common.search")
//   t("common.reloadTarget", { target: "游戏数据" })
export const STRINGS = {
  common: {
    search: "搜索...",
    perPage: "每页",
    all: "全部",
    reloadGameData: "重新加载游戏数据",
    reloadSaveData: "重新加载存档数据",
    reloadTarget: "重新加载{target}",
  },

  nav: {
    general: "常用",
    battle: "战斗",
    stats: "等级/属性",
    items: "物品",
    item: "道具",
    weapon: "武器",
    armor: "防具",
    skill: "技能",
    variable: "变量",
    globalVariable: "全局变量",
    switch: "开关",
    saveLocation: "存读位置",
    saveBackup: "存档时间机器",
    teleport: "传送",
    mapEvent: "地图事件",
    shortcut: "快捷键",
  },
};

function lookup(key) {
  return key
    .split(".")
    .reduce(
      (node, part) =>
        node && Object.hasOwnProperty.call(node, part) ? node[part] : undefined,
      STRINGS,
    );
}

export function t(key, params = {}) {
  const text = lookup(key);

  if (typeof text !== "string") {
    // 缺失的 key 回显自身，方便开发时发现拼写错误，而不是静默显示空字符串。
    return key;
  }

  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}
