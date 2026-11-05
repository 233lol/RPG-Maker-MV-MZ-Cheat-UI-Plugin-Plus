# Changelog

本项目的版本号遵循 [Semantic Versioning](https://semver.org/)，
记录格式参考 [Keep a Changelog](https://keepachangelog.com/)。

发布时请同时更新 `package.json` 的 `version` 和本文件；构建脚本会把
`package.json` 的版本写进 `cheat/version.js`，面板底部会显示
`v<版本> · <commit>`。

## [Unreleased]

### Added

- 界面多语言：简体中文 / English / 日本語，可在「常用」面板切换；导航、通用文案与常用面板已接入。
- 面板状态持久化：搜索词、过滤开关、分页大小与页码会写入 `panel-state.json`，下次打开自动恢复。
- 主窗口支持拖动、缩放并记住尺寸 / 位置；打开时自动聚焦、Tab 焦点循环，并拦截游戏键盘输入。
- 记住上次打开的面板；新增 Esc 关闭窗口和右上角关闭按钮。
- 统一游戏数据状态层：读档、新游戏、战斗结束、地图切换后自动刷新当前面板。
- `pnpm run typecheck`（TypeScript 检查带 `// @ts-check` 的文件），并接入 `make check` 与 CI。

### Changed

- 拆分超大模块：`SaveBackupHelper` → `save-backup/*`，`GlobalObjectHelper` → `global-object/*`，地图事件识别 → `map-event/classifier.js`，全局变量行构建 → `GlobalVariableRows.js`。

### Fixed

- 快速读档补齐 `Scene_Load` 的地图重载、`onAfterLoad` 与淡出收尾，避免读档后地图/插件状态不同步。
- 存档时间机器导出改为原子写入；导入增加文件大小、格式版本与快照条数上限。
- 移动速度配置读取增加 1–10 范围校验，损坏的 `speed.json` 不再能把角色速度设成非法值。
- 修正 vendor 资源脚本中的乱码注释，并在 README 增加界面预览截图。

## [1.3.0] - 2026-11-04

### Added

- 存档时间机器：游戏内存档后 / 每次还原前自动快照，支持还原到原槽位或其他槽位、导入导出、按份数保留。
- 全局变量面板：以目录形式浏览 `window` 上的 RPG Maker / 插件全局变量，支持搜索、JSON 编辑、增删属性。
- MV / MZ 无头测试：nw.js + CDP 驱动 15 个面板、快捷键、存档时间机器与压缩包结构。
- 代码规范：Prettier、ESLint flat config、`.editorconfig`。
- 单元测试：`node --test` 覆盖分页、按键、快捷键映射、原子写入、设置路径、存档元数据格式化等纯逻辑。
- CI：lint、格式检查、单元测试、压缩包结构测试。
- `CHANGELOG.md` 与语义化版本号（`RPGSEMVER`）。

### Changed

- Vue 3 + Vuetify 4 重构后的完整界面与导航。
- 面板搜索框、刷新按钮、分页栏抽成公共组件，减少重复模板。
- 构建产物继续使用 commit 短哈希命名，界面同时显示语义化版本。

### Fixed

- 修复 MZ 设置目录迁移、存档时间机器兼容性与存档安全问题。
- 修复快捷键未分配显示不全、传送页面空白过多、文字重叠等界面问题。

## [1.2.0] - 2026-09-28

- 修复快捷键未分配显示不全和传送页面空白过多的问题。

## [1.1.0] - 2026-09-24

- 移除无效代码，整理项目结构。

## [1.0.0] - 2026-09-20

- 初始发布：Vue 3 + Vuetify 4 重构、Makefile 构建系统与基础作弊面板。
