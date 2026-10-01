# RPG-Maker-MV-MZ-Cheat-UI-Plugin-Plus

基于 [Justype/RPG-Maker-MV-MZ-Cheat-UI-Plugin](https://github.com/Justype/RPG-Maker-MV-MZ-Cheat-UI-Plugin)、[paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin](https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin)、[notch1p/RPG-Maker-MV-MZ-Cheat-UI-Plugin](https://github.com/notch1p/RPG-Maker-MV-MZ-Cheat-UI-Plugin) 修改而来。

Vue 2 + Vuetify 2 迁移至 Vue 3，UI 框架已升级至 Vuetify 4。

## 变化 / 功能
- Vue 3 + Vuetify 4 重构
- Makefile 构建系统
- 诸多 bug 修复
- 添加了角色技能修改
- 添加了「全局变量」面板：以文件夹形式浏览 RPG Maker / 第三方插件定义的 JS 全局变量（自动过滤函数 / 方法），可进入嵌套对象（进入层级时自动清空搜索，避免内部变量被过滤）、直接修改数字 / 字符串 / 布尔值、用 JSON 编辑数组与对象、新增 / 删除属性，支持当前层搜索与递归深度搜索
- 添加了「存档时间机器」面板：为任意存档槽留快照、一键回滚、导入导出（详见下文）
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

## 存档时间机器

作弊最怕把存档改坏，这个面板提供「后悔药」。默认快捷键 <kbd>Ctrl</kbd>+<kbd>B</kbd>（可在「快捷键」面板改）。

| 功能 | 说明 |
|---|---|
| 全自动快照 | 快照只有两个产生时机，都由插件自动完成：**游戏内存档后**、**每次还原前**。没有「手动新建」，也不需要填备注 |
| 存档时自动快照 | 接管 `DataManager.saveGame`，游戏内存档后自动留一份。**默认关闭**，需要在面板上打开（不主动往玩家硬盘写东西） |
| 还原前自动快照 | 每次还原前自动为「被覆盖的那一份」留快照，所以还原本身也能再还原回去。**不受开关影响，始终保留** |
| 保留份数 | 每个存档槽只保留最近 N 份（可调，默认 5） |
| 还原到原槽位 | 把快照写回它自己的存档槽；覆盖前会自动为被覆盖的存档留一份快照，所以这一步也能再回退 |
| 还原到其他槽位 | 把这份快照复制成**另一个**存档槽（原槽位不受影响），用来把旧进度拉成一份新存档 |
| 导入 / 导出 | 全部快照导出成一个 JSON（含数据），可在别的机器 / 别的存档号导入，导入不会覆盖已有快照 |
| 清空 | 清空全部快照 |

「每 N 次存档留一份」的语义是**存档次数是 N 的整数倍时留档**（N=1 即每次都留），
所以改动 N 之后触发点会跟着变。

每一行都列出了区分快照所需的信息：**槽位**（`#N`，当前载入的槽位高亮并带 ⬇ 标记）、**第几次存档**、
**地图名**、**存档内时长**、**文件大小**、**该存档的存档时间**，以及**快照自身的抓取时间与相对时间**
（被还原过的快照还会标出还原次数）。

自动快照两道保险，避免刷爆磁盘：

- 用 `$gameSystem._saveCount` 去重 —— 保证「一次存档 = 最多一份快照」（引擎内部的重复调用不会重复留档）；
- 存档失败（`saveGame` 返回 false）时不留快照；钩子里的任何异常都被吞掉并只打警告，**绝不影响游戏本身的存档流程**。

「还原前快照」也按存档次数精确判定：当前存档已经留过档就不再重复留，没留过（例如插件关闭期间存的档）就一定补一份，保证任何一次还原都有退路。
还原到**空槽位**时不会去备份那个空槽位（否则会凭空多出一份空快照）。

自动快照设置存在 `www/cheat-settings/save-backups/config.json`（默认值即下面这份）：

```json
{ "autoOnSave": false, "autoSaveInterval": 1, "autoKeep": 5 }
```

存档内进度（地图 / 时长 / 存档时间）：

- 时长 / 存档时间优先取引擎自己的存档头 `DataManager.loadSavefileInfo`（就是 `global.rpgsave` 里那份摘要），
  与游戏内「读取」列表显示的值一致；
- 地图信息靠解压整份存档，MV/MZ 的 `.rpgsave` 都是 LZString base64。注意 `www/js/libs/lz-string.js`
  是 UMD 包装，**在 nw.js 下只挂 `module.exports`、不会设置 `window.LZString`**，
  所以本插件按「全局 → 模块 → require 两个备选路径」依次取用；
- 部分老版本 MV 的存档里根本没有 `_playtime`，这种情况时长显示「未记录」，不会瞎编；
- 地图 ID 的位置因版本而异，`player.map._mapId` 与顶层 `map._mapId` 都会尝试；
- 打开面板时会用存档头给**旧版本建的快照**补上缺失的时长 / 存档时间（只改元数据，不动快照数据）；
  存档头里也没有时长时（老版本 MV），会从快照自己那份存档数据里读 `system._framesOnSave`
  —— 这正是引擎算 `playtime` 的原料（`_framesOnSave + _frames`，存档那刻 `_frames` 归零）；
- 缺地图名的旧快照会从快照自己的载荷里补 `map._mapId` / `player.map._mapId`，
  但仅当「快照之后该槽位被重新存过档」时才补（否则快照拍的进度比磁盘更靠后，回填会写错）；
- 快照自己没记时长时，表格会实时借用该槽位存档头的值来显示（不写回，避免把近似值固化成事实）。

数据位置：`www/cheat-settings/save-backups/`

```
index.json                    # 快照索引（元数据）
<id>.json                     # 单份快照的元数据
<id>.rpgsave                  # 快照数据（与 .rpgsave 同格式：JSON + LZString 压缩）
```

快照文件刻意与 `.rpgsave` 保持一致，所以也可以直接改名成 `fileN.rpgsave` 丢回 `www/save/` 使用。

两点注意：

- 读写全部走引擎自身的 `StorageManager` API，因此 nw.js（`file://`）与浏览器（`http://`）部署都能用；但快照文件本身依赖文件系统，浏览器环境下该面板不可用。
- 还原的是**磁盘上的存档**。如果你正在游玩的就是那个槽位，游戏内存里仍是旧进度，需要先在游戏内存一次档（或切到别的槽读档）再读取，改动才会生效 —— 面板会弹窗明确提示这一点。

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