// @ts-check
/**
 * 全局变量（JS 全局对象树）辅助函数入口。
 *
 * 具体实现按职责拆到 `global-object/` 下：
 * - names.js：RPG Maker / 浏览器内置全局变量名
 * - format.js：类型判断、预览、输入解析
 * - edit.js：读取 / 修改 / 删除 / JSON 序列化
 * - scan.js：扫描 window、按路径读取、递归搜索
 *
 * 这里只做统一 re-export，面板继续从 `GlobalObjectHelper.js` 导入即可。
 */

export * from "./global-object/names.js";
export * from "./global-object/format.js";
export * from "./global-object/edit.js";
export * from "./global-object/scan.js";

import { prewarmGlobalObjectHelper } from "./global-object/scan.js";

// cheat 初始化（模块加载）时预热，首次打开全局变量面板不再付 iframe 创建成本
if (typeof window !== "undefined" && typeof document !== "undefined") {
  prewarmGlobalObjectHelper();
}
