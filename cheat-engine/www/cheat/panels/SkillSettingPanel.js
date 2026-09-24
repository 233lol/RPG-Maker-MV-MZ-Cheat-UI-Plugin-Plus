import PageJump from "../components/PageJump.js";
import { markRaw } from "../libs/vue.js";

// 模块级缓存：getFilteredSkills 每轮渲染被调用 5 次（表格 items + 4 个分页方法），
// 缓存过滤结果避免重复全量 map+filter；搜索/过滤开关/已学技能/刷新数据任一变化即失效。
// 按 actor.id 存储，entry 内校验 actor 引用，重建 actors 后自动重算，不会堆积泄漏。
const filteredSkillsCache = new Map();

export default {
  name: "SkillSettingPanel",

  components: { PageJump },

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
                        label="只显示已学习技能">
                    </v-checkbox>
                    <v-spacer></v-spacer>
                    <v-tooltip
                        location="bottom">
                        <template #activator="{ props }">
                            <v-btn
                                color="pink"
                                size="small"
                                icon
                                variant="elevated"
                                v-bind="props"
                                @click="initializeVariables">
                                <v-icon>mdi-refresh</v-icon>
                            </v-btn>
                        </template>
                        <span>重新加载游戏数据</span>
                    </v-tooltip>
                </v-card-actions>

                <v-text-field
                    label="搜索技能..."
                    variant="solo"
                    bg-color="grey-darken-3"
                    v-model="actor.skillSearch"
                    density="compact"
                    hide-details
                    @focus="$event.target.select()"
                    @keydown.stop>
                </v-text-field>

                <v-data-table
                    density="compact"
                    :headers="skillHeaders"
                    :items="getFilteredSkills(actor)"
                    v-model:page="actor.pagination.page"
                    v-model:items-per-page="actor.pagination.itemsPerPage"
                    :items-per-page-options="[5, 10, 15, { title: 'All', value: -1 }]"
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
                        <div class="d-flex align-center justify-space-between pa-2">
                            <div class="d-flex align-center">
                                <span class="text-body-small mr-2">每页</span>
                                <v-select
                                    v-model="actor.pagination.itemsPerPage"
                                    :items="[5, 10, 15, 20]"
                                    density="compact"
                                    hide-details
                                    variant="outlined"
                                    style="width: 90px;"
                                ></v-select>
                            </div>
                            <div class="d-flex align-center ga-2">
                                <span class="text-body-small text-no-wrap">{{ paginationStartFor(actor) }}-{{ paginationStopFor(actor) }} / {{ totalCountFor(actor) }}</span>
                                <v-pagination v-model="actor.pagination.page" :length="pageCountFor(actor)" density="compact" :total-visible="5" size="small"></v-pagination>
                                <page-jump
                                    :page="actor.pagination.page"
                                    :page-count="pageCountFor(actor)"
                                    @jump="(page) => jumpToPage(actor, page)">
                                </page-jump>
                            </div>
                        </div>
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

  methods: {
    extractSkillData(skill) {
      return {
        _skill: skill,
        id: skill.id,
        name: skill.name,
        description: skill.description,
        iconIndex: skill.iconIndex,
      };
    },

    extractActorData(actor) {
      const learnedSkillIds = actor
        .skills()
        .filter((s) => !!s)
        .map((s) => s.id);

      return {
        _actor: actor,
        id: actor._actorId,
        name: actor._name,
        level: actor.level,
        onlyLearned: false,
        skillSearch: "",
        learnedSkillIds: learnedSkillIds,
        pagination: { page: 1, itemsPerPage: 5 },
      };
    },

    initializeVariables() {
      // Load all skills from game data.
      // markRaw：技能表只读展示且结构静态，无需 deep Proxy 响应式化
      this.allSkills = markRaw(
        ($dataSkills || [])
          .filter((skill) => !!skill && skill.name)
          .map((skill) => this.extractSkillData(skill)),
      );

      // Load actors
      this.actors = $gameParty
        .members()
        .map((actor) => this.extractActorData(actor));
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
            !skill.name.toLowerCase().includes(search) &&
            !skill.description.toLowerCase().includes(search)
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

    paginationStartFor(actor) {
      const total = this.getFilteredSkills(actor).length;
      if (total === 0) return 0;
      return (actor.pagination.page - 1) * actor.pagination.itemsPerPage + 1;
    },

    paginationStopFor(actor) {
      const total = this.getFilteredSkills(actor).length;
      return Math.min(actor.pagination.page * actor.pagination.itemsPerPage, total);
    },

    totalCountFor(actor) {
      return this.getFilteredSkills(actor).length;
    },

    pageCountFor(actor) {
      return Math.ceil(this.getFilteredSkills(actor).length / actor.pagination.itemsPerPage) || 1;
    },

    addSkill(actor, skillItem) {
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
    },

    removeSkill(actor, skillItem) {
      const actorObj = actor._actor;
      const skill = skillItem._skill;

      // Forget the skill
      actorObj.forgetSkill(skill.id);

      // Refresh the actor's learned skill ids
      actor.learnedSkillIds = actorObj
        .skills()
        .filter((s) => !!s)
        .map((s) => s.id);
    },
  },
};