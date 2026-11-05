import PaginationFooter from "../components/PaginationFooter.js";
import RefreshButton from "../components/RefreshButton.js";
import SearchField from "../components/SearchField.js";
import { markRaw } from "../libs/vue.js";
import {
  ITEMS_PER_PAGE_OPTIONS,
  getPageCount,
} from "../js/PaginationHelper.js";
import { isPartyReady, requirePartyReady } from "../js/GameState.js";
import { gameDataWatcherMixin } from "../js/GameDataWatcher.js";
import { panelStateMixin } from "../js/PanelState.js";

// 模块级缓存：getFilteredSkills 每轮渲染被调用 5 次（表格 items + 4 个分页方法），
// 缓存过滤结果避免重复全量 map+filter；搜索/过滤开关/已学技能/刷新数据任一变化即失效。
// 按 actor.id 存储，entry 内校验 actor 引用，重建 actors 后自动重算，不会堆积泄漏。
const filteredSkillsCache = new Map();

export default {
  name: "SkillSettingPanel",

  mixins: [gameDataWatcherMixin, panelStateMixin],

  components: { PaginationFooter, RefreshButton, SearchField },

  template: `
<v-card flat class="ma-0 pa-0">
    <v-tabs
        v-model="selectedTab"
        bg-color="grey-darken-3"
        show-arrows>
        <v-tab
            v-for="actor in actors"
            :key="actor.id"
            :value="actor.id">
            {{actor.name}}
        </v-tab>
    </v-tabs>
    <v-window
        v-model="selectedTab">
        <v-window-item
            v-for="actor in actors"
            :key="actor.id"
            :value="actor.id">
            <v-card
                flat
                class="ma-0">
                <v-card-actions
                    class="pa-0">
                    <v-checkbox
                        v-model="actor.onlyLearned"
                        density="compact"
                        hide-details
                        label="只显示已学习技能"
                        @update:model-value="clampActorPage(actor)">
                    </v-checkbox>
                    <v-spacer></v-spacer>
                    <refresh-button
                        variant="elevated"
                        @click="initializeVariables">
                    </refresh-button>
                </v-card-actions>

                <search-field
                    v-model="actor.skillSearch"
                    label="搜索技能..."
                    field-class=""
                    @update:model-value="clampActorPage(actor)">
                </search-field>

                <v-data-table
                    density="compact"
                    :headers="skillHeaders"
                    :items="getFilteredSkills(actor)"
                    v-model:page="actor.pagination.page"
                    v-model:items-per-page="actor.pagination.itemsPerPage"
                    :items-per-page-options="itemsPerPageOptions"
                    no-data-text="没有匹配的技能"
                    class="mt-2">
                    <template #header.isLearned="{ column }">
                        <span class="text-no-wrap">{{ column.title }}</span>
                    </template>
                    <template #item.isLearned="{ item }">
                        <v-icon
                            size="small"
                            :color="item.isLearned ? 'green' : 'grey darken-2'">
                            {{item.isLearned ? 'mdi-check-circle' : 'mdi-circle-outline'}}
                        </v-icon>
                    </template>
                    <template #item.actions="{ item }">
                        <v-btn
                            v-if="item.isLearned"
                            size="small"
                            color="error"
                            @click="removeSkill(actor, item)"
                            class="ma-0">
                            <v-icon size="small">mdi-close</v-icon>
                            <span class="ml-1">移除</span>
                        </v-btn>
                        <v-btn
                            v-else
                            size="small"
                            color="success"
                            @click="addSkill(actor, item)"
                            class="ma-0">
                            <v-icon size="small">mdi-plus</v-icon>
                            <span class="ml-1">添加</span>
                        </v-btn>
                    </template>
                    <template #bottom>
                        <pagination-footer
                            v-model:page="actor.pagination.page"
                            v-model:items-per-page="actor.pagination.itemsPerPage"
                            :total="totalCountFor(actor)"
                            :page-count="pageCountFor(actor)"
                            :items-per-page-options="[5, 10, 15, 20]"
                            @jump="(page) => jumpToPage(actor, page)">
                        </pagination-footer>
                    </template>
                </v-data-table>
            </v-card>
        </v-window-item>
    </v-window>
</v-card>
    `,

  data() {
    return {
      selectedTab: null,
      actors: [],
      allSkills: [],
      itemsPerPageOptions: ITEMS_PER_PAGE_OPTIONS,
      skillHeaders: [
        {
          title: "已学",
          key: "isLearned",
          sortable: false,
          align: "center",
          width: 50,
        },
        {
          title: "名称",
          key: "name",
          sortable: true,
        },
        {
          title: "描述",
          key: "description",
          sortable: false,
        },
        {
          title: "操作",
          key: "actions",
          sortable: false,
          align: "center",
        },
      ],
    };
  },

  created() {
    this.initializeVariables();
  },

  computed: {
    panelStateId() {
      return "skills";
    },
  },

  methods: {
    getPanelStateSnapshot() {
      return {
        selectedTab: this.selectedTab,
        actors: this.actors.map((actor) => ({
          id: actor.id,
          onlyLearned: actor.onlyLearned,
          skillSearch: actor.skillSearch,
          pagination: actor.pagination,
        })),
      };
    },

    applyPanelState(state) {
      this.selectedTab = state.selectedTab;

      const savedById = new Map(
        (state.actors || []).map((entry) => [entry.id, entry]),
      );

      for (const actor of this.actors) {
        const saved = savedById.get(actor.id);
        if (!saved) {
          continue;
        }

        if (typeof saved.onlyLearned === "boolean") {
          actor.onlyLearned = saved.onlyLearned;
        }

        if (typeof saved.skillSearch === "string") {
          actor.skillSearch = saved.skillSearch;
        }

        if (saved.pagination && typeof saved.pagination === "object") {
          actor.pagination = { ...actor.pagination, ...saved.pagination };
        }
      }
    },

    extractSkillData(skill) {
      return {
        _skill: markRaw(skill),
        id: skill.id,
        name: String(skill.name ?? ""),
        description: String(skill.description ?? ""),
        iconIndex: skill.iconIndex,
      };
    },

    extractActorData(actor) {
      const learnedSkillIds = actor
        .skills()
        .filter((s) => !!s)
        .map((s) => s.id);

      return {
        _actor: markRaw(actor),
        id: actor._actorId,
        name: String(actor._name ?? actor.name?.() ?? ""),
        level: actor.level,
        onlyLearned: false,
        skillSearch: "",
        learnedSkillIds: learnedSkillIds,
        pagination: { page: 1, itemsPerPage: 5 },
      };
    },

    initializeVariables() {
      if (!isPartyReady()) {
        this.allSkills = [];
        this.actors = [];
        return;
      }

      // Load all skills from game data.
      // markRaw：技能表只读展示且结构静态，无需 deep Proxy 响应式化
      this.allSkills = markRaw(
        ($dataSkills || [])
          .filter((skill) => !!skill && skill.name)
          .map((skill) => this.extractSkillData(skill)),
      );

      // 保留刷新前的筛选 / 分页状态：读档后 Game_Actor 会重建，
      // 但玩家正在看的过滤条件不应该跟着重置。
      const previousById = new Map(
        this.actors.map((actor) => [
          actor.id,
          {
            onlyLearned: actor.onlyLearned,
            skillSearch: actor.skillSearch,
            pagination: actor.pagination,
          },
        ]),
      );

      // Load actors
      this.actors = $gameParty.members().map((actor) => {
        const data = this.extractActorData(actor);
        const previous = previousById.get(data.id);

        if (previous) {
          data.onlyLearned = previous.onlyLearned;
          data.skillSearch = previous.skillSearch;
          data.pagination = previous.pagination;
        }

        return data;
      });

      if (!this.actors.some((actor) => actor.id === this.selectedTab)) {
        this.selectedTab = this.actors[0]?.id ?? null;
      }
    },

    getFilteredSkills(actor) {
      const search = (actor.skillSearch || "").toLowerCase().trim();
      const onlyLearned = !!actor.onlyLearned;
      const learnedKey = Array.isArray(actor.learnedSkillIds)
        ? actor.learnedSkillIds.join(",")
        : "";
      const allSkills = this.allSkills;

      const cached = filteredSkillsCache.get(actor.id);
      if (
        cached &&
        cached.actor === actor &&
        cached.allSkills === allSkills &&
        cached.search === search &&
        cached.onlyLearned === onlyLearned &&
        cached.learnedKey === learnedKey
      ) {
        return cached.result;
      }

      const result = allSkills
        .map((skill) => {
          const isLearned = actor.learnedSkillIds.includes(skill.id);
          return {
            ...skill,
            isLearned: isLearned,
          };
        })
        .filter((skill) => {
          // Only learned filter
          if (onlyLearned && !skill.isLearned) {
            return false;
          }
          // Search filter
          if (
            search &&
            !String(skill.name ?? "")
              .toLowerCase()
              .includes(search) &&
            !String(skill.description ?? "")
              .toLowerCase()
              .includes(search)
          ) {
            return false;
          }
          return true;
        });

      filteredSkillsCache.set(actor.id, {
        actor,
        allSkills,
        search,
        onlyLearned,
        learnedKey,
        result,
      });

      return result;
    },

    jumpToPage(actor, page) {
      actor.pagination.page = page;
    },

    totalCountFor(actor) {
      return this.getFilteredSkills(actor).length;
    },

    pageCountFor(actor) {
      return getPageCount(
        this.totalCountFor(actor),
        actor.pagination.itemsPerPage,
      );
    },

    clampActorPage(actor) {
      if (!actor || !actor.pagination) {
        return;
      }

      const pageCount = this.pageCountFor(actor);
      if (actor.pagination.page > pageCount) {
        actor.pagination.page = pageCount;
      }
    },

    addSkill(actor, skillItem) {
      if (!requirePartyReady("添加技能")) return;

      const actorObj = actor._actor;
      const skill = skillItem._skill;

      // Check if actor already knows this skill
      if (actorObj.isLearnedSkill(skill.id)) {
        return;
      }

      // Learn the skill
      actorObj.learnSkill(skill.id);

      // Refresh the actor's learned skill ids
      actor.learnedSkillIds = actorObj
        .skills()
        .filter((s) => !!s)
        .map((s) => s.id);

      this.clampActorPage(actor);
    },

    removeSkill(actor, skillItem) {
      if (!requirePartyReady("移除技能")) return;

      const actorObj = actor._actor;
      const skill = skillItem._skill;

      // Forget the skill
      actorObj.forgetSkill(skill.id);

      // Refresh the actor's learned skill ids
      actor.learnedSkillIds = actorObj
        .skills()
        .filter((s) => !!s)
        .map((s) => s.id);

      this.clampActorPage(actor);
    },
  },
};
