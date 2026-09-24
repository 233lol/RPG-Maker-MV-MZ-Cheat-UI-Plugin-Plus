# RPG-Maker-MV-MZ-Cheat-UI-Plugin-Plus

基于 [Justype/RPG-Maker-MV-MZ-Cheat-UI-Plugin](https://github.com/Justype/RPG-Maker-MV-MZ-Cheat-UI-Plugin)、[paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin](https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin)、[notch1p/RPG-Maker-MV-MZ-Cheat-UI-Plugin](https://github.com/notch1p/RPG-Maker-MV-MZ-Cheat-UI-Plugin) 修改而来。

Vue 2 + Vuetify 2 迁移至 Vue 3，UI 框架已升级至 Vuetify 4。

## 变化 / 功能
- Vue 3 + Vuetify 4 重构
- Makefile 构建系统
- 诸多 bug 修复
- 添加了角色技能修改
- 添加了「全局变量」面板：以文件夹形式浏览 RPG Maker / 第三方插件定义的 JS 全局变量（自动过滤函数 / 方法），可进入嵌套对象（进入层级时自动清空搜索，避免内部变量被过滤）、直接修改数字 / 字符串 / 布尔值、用 JSON 编辑数组与对象、新增 / 删除属性，支持当前层搜索与递归深度搜索
- 完全离线化
## 构建

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- GNU Make（Windows 可通过 `winget install GnuWin32.Make`、`choco install make` 或 `scoop install make` 安装）

构建脚本不依赖任何 POSIX shell 工具（`find` / `ln` / `printf` / `rm` 已由 `tools/*.mjs` 等替代），Windows / macOS / Linux 上均可直接运行 `make`，无需 Git Bash 或 WSL。

### 构建命令

```shell
# 安装依赖并打包 MV + MZ
pnpm i && make

# 仅打包 MV
make mv

# 仅打包 MZ
make mz

# 使用 Vue 开发构建打包（组件告警 + Devtools，排查问题时用）
make dev

# 切回 Vue 生产构建并重新打包
make prod

# 清理构建产物
make clean
```

`make` / `make mv` / `make mz` 每次构建都会强制使用 Vue 生产构建，即使之前执行过 `make dev`，也不会把开发版误打包进产物；`make dev` 仅在本次打包使用开发构建。

构建产物位于项目根目录：
- `mv-<commit-hash>.zip` / `mz-<commit-hash>.zip`
- `mv-latest.zip` / `mz-latest.zip`（指向最新构建的符号链接；Windows 上无符号链接权限时自动退化为复制）

### 压缩包结构

MV 游戏的可执行文件所在目录下是 `www/`，而 MZ 游戏直接以 `js/`、`index.html` 为游戏根目录，因此两个压缩包的顶层结构不同：

| 压缩包 | 顶层目录 | 说明 |
|---|---|---|
| `mv-*.zip` | `www/cheat/`、`www/js/main.js` | 解压到游戏根目录后文件会进入 `www/` |
| `mz-*.zip` | `cheat/`、`js/main.js` | 解压到游戏根目录后文件直接在根目录 |

两者均直接解压覆盖到游戏根目录（包含 `Game.exe` 的那一层）即可，无需手动切换目录。

### Vendor 构建脚本

| 命令 | 产物 | 说明 |
|---|---|---|
| `pnpm run vendor:shiki` | `cheat-engine/www/cheat/libs/shiki.bundle.mjs` | Shiki 语法高亮引擎（esbuild 打包，生产压缩） |
| `pnpm run vendor:shiki:dev` | `cheat-engine/www/cheat/libs/shiki.bundle.mjs` | 同上但未压缩且内联 sourcemap（排查问题时用） |
| `pnpm run vendor:vuetify` | `cheat-engine/www/cheat/libs/vuetify.js` | Vuetify 4 ESM（esbuild 打包，生产压缩） |
| `pnpm run vendor:vuetify:dev` | `cheat-engine/www/cheat/libs/vuetify.js` | 同上但未压缩（Vuetify 堆栈可读，排查问题时用） |
| `pnpm run vendor:vue` | `cheat-engine/www/cheat/libs/vue.js` | 复制生产构建 `vue.esm-browser.prod.js`（更快） |
| `pnpm run vendor:vue:dev` | `cheat-engine/www/cheat/libs/vue.js` | 复制开发构建 `vue.esm-browser.js`（有告警 + Devtools，排查问题时用） |
| `pnpm run vendor:assets` | `css/vuetify.css`, `css/materialdesignicons.css`, `fonts/*` | 从 npm 包复制 CSS 和字体 |
| `pnpm run vendor:libs` | - | 运行 `vendor:vuetify` + `vendor:vue` + `vendor:assets` |

`make vendor` 可一键执行全部 vendor 构建。

Vendor 构建由 Makefile 依赖自动触发，无需手动执行。

## 项目结构

| 路径 | 说明 |
|---|---|
| `cheat-engine/www/cheat/` | Cheat UI 源码 (Vue 3 + Vuetify 4, ES Module) |
| `cheat-engine/www/cheat/panels/` | 各功能面板组件 |
| `cheat-engine/www/cheat/components/` | 通用 UI 组件 |
| `cheat-engine/www/cheat/js/` | 工具函数 / Cheat API |
| `cheat-engine/www/cheat/init/` | 插件入口 & 初始化 |
| `cheat-engine/www/cheat/libs/` | 第三方库 (Vue, Vuetify, Shiki) |
| `cheat-engine/www/cheat/css/` | 样式文件 |
| `cheat-engine/www/cheat/fonts/` | Material Design Icons 字体 |
| `cheat-engine/www/_cheat_initialize/mv/` | MV 替换用 `main.js` |
| `cheat-engine/www/_cheat_initialize/mz/` | MZ 替换用 `main.js` |
| `tools/` | Vendor 构建脚本 |

## 工作原理

插件替换游戏原始的 `main.js`，加载 `cheat/init/import.js` → `cheat/init/setup.js` (ES Module) → 挂载 `MainComponent`。

可通过点击对应按钮或快捷键呼出/隐藏作弊菜单。

## Git 仓库说明

`libs/`、`css/`、`fonts/` 中的 vendor 文件**未纳入 git 跟踪**（见 `.gitignore`），clone 后需通过以下命令生成：

```shell
pnpm run vendor:libs   # 生成 vue.js + vuetify.js + CSS + fonts
pnpm run vendor:shiki  # 生成 shiki.bundle.mjs
make vendor            # 生成全部 vendor 文件
```

最简单的方式是直接 `pnpm i && make`，构建时会按依赖自动补齐全部 vendor 文件。

## CI

GitHub Actions 在推送到 `main`、`vue-3` 时自动构建并上传 `.zip` 产物。

## 许可证

参见原项目许可证。
MIT License