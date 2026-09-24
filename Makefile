hash  := $(shell git rev-parse --short HEAD)
type  := mv mz
verfn := cheat-engine/www/cheat/version.js
shiki := cheat-engine/www/cheat/libs/shiki.bundle.mjs
vue   := cheat-engine/www/cheat/libs/vue.js
vuetify := cheat-engine/www/cheat/libs/vuetify.js
vuetifycss := cheat-engine/www/cheat/css/vuetify.css
mdicss := cheat-engine/www/cheat/css/materialdesignicons.css
mdifonts := cheat-engine/www/cheat/fonts/materialdesignicons-webfont.woff2

# 打包时要一起打进去的源码：改动其中任意文件都应触发重新打包。
# 用纯 make 的递归通配实现 —— 不能用 `$(shell find ...)`：Windows 的 find 是
# 完全不同的文本搜索工具，且 `2>/dev/null` 不是 cmd 语法。
# 与 find 的唯一差异：不匹配点开头文件（如 libs/.gitkeep，占位文件、内容不变，
# 不影响重建触发）。注意文件名不能含空格（make 以空白分词，find 版本同样如此）。
rwildcard = $(foreach e,$(wildcard $(1)*),$(call rwildcard,$(e)/,$2) $(filter $(subst *,%,$2),$e))
src := $(call rwildcard,cheat-engine/www/cheat/,*) $(call rwildcard,cheat-engine/www/_cheat_initialize/,*)

# 默认生产构建；`make dev` 会以 VUE=dev 覆盖，仅在打包期间使用开发构建
VUE ?= prod

.PHONY: all clean vendor dev prod ui-vendor force-version $(type)

all: $(type)

vendor: $(vuetifycss) $(mdicss) $(mdifonts) ui-vendor

# 每次构建都强制按当前 VUE 重新生成 shiki / vue / vuetify，
# 避免上一次的 dev 构建被误打包进产物
ui-vendor:
	pnpm run vendor:shiki$(if $(filter dev,$(VUE)),:dev)
	pnpm run vendor:vue$(if $(filter dev,$(VUE)),:dev)
	pnpm run vendor:vuetify$(if $(filter dev,$(VUE)),:dev)
	pnpm run vendor:assets$(if $(filter dev,$(VUE)),:dev)

# dev: 使用 Vue 开发构建打包（组件告警 + Devtools），便于排查问题
dev:
	$(MAKE) VUE=dev $(type)

# prod: 使用 Vue 生产构建打包（与 make 等价）
prod:
	$(MAKE) VUE=prod $(type)

$(vuetifycss) $(mdicss) $(mdifonts):
	pnpm run vendor:assets$(if $(filter dev,$(VUE)),:dev)

# 所有删除 / 链接 / 文件生成操作都走 node 脚本（tools/*.mjs），
# 使 Makefile 在 cmd.exe 与 POSIX shell 下都能工作
clean:
	node tools/clean.mjs "*.zip" "*-latest.zip" "$(verfn)" "$(shiki)" "$(vuetify)" "$(vue)" "$(vuetifycss)" "$(mdicss)" "cheat-engine/www/cheat/fonts/materialdesignicons-webfont.*"

# tools/pack.mjs prefixes MV archives with www/ and leaves MZ archives at the
# root, so both can be extracted directly into the game root directory.
%-$(hash).zip: $(src) $(verfn) ui-vendor $(vuetifycss) $(mdicss) $(mdifonts)
	node tools/pack.mjs $* $@
	node tools/link-latest.mjs $@ $*-latest.zip

$(type):%:%-$(hash).zip
	@echo finished packing $@

# version.js 必须始终反映当前 commit：切换 commit 后若不重新生成，
# zip 文件名用新 hash 而包内显示旧 hash，版本链接会指向错误的 commit。
# force-version 是 phony 的，保证每次构建都执行下面这条规则；
# gen-version.mjs 自行比对内容，未变化时不重写文件。
force-version:

$(verfn): force-version
	node tools/gen-version.mjs $(hash)
