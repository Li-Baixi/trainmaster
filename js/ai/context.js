// 上下文组装器：让 AI「永远记得」用户情况的五段式 system prompt
// 以及从 AI 回复中提取围栏内容（```plan / ```mealjson / ```profile）

import { vfs } from '../vfs.js';
import { settings } from '../settings.js';
import { dateISO, weekdayCN, prettyDate, daysAgoISO, truncateHead, truncateMiddle } from '../utils/format.js';
import { tx, reqAsPromise } from '../db.js';

const BUDGET_PROFILE = 2500;
const BUDGET_PLAN = 3500;
const BUDGET_LOG_PER_DAY = 900;
const HISTORY_MAX_MESSAGES = 20;
const HISTORY_MSG_MAX_CHARS = 4000;

const PERSONA_COACH = `你是「教练」，一位严格但贴心的私人健身教练兼营养师，用户唯一信任的随身指导。
规则：
- 全部用中文回复，善用 markdown（标题、列表、表格）让内容清晰。
- 回答具体可执行，给出次数、组数、重量建议（不知道时先问）。
- 用户的状态可能变化，遇到疼痛、头晕、胸闷等一律先建议停下并就医，医学问题提醒咨询医生。
- 用户档案与当前计划在下方自动注入，直接引用即可，不要复述全文。`;

const PERSONA_NUTRITIONIST = `你是一位专业营养师，负责根据用户上传的餐食照片做识别、估算与建议。全部用中文。`;

const OUTPUT_PROTOCOL = (forMeal) => {
  const today = `${dateISO()} 周${weekdayCN()}`;
  if (forMeal) {
    return `## 输出协议（重要）
- 先用 1-3 句说明照片里有什么、整体评价，然后必须在 \`\`\`mealjson 围栏中输出严格的 JSON（不要输出其他围栏）：
\`\`\`mealjson
{
  "title": "这餐的简短名称",
  "items": [{ "name": "食物名", "grams": 估重克数, "kcal": 估算热量, "protein": 蛋白质克, "carbs": 碳水克, "fat": 脂肪克 }],
  "totals": { "kcal": 总热量, "protein": 总蛋白, "carbs": 总碳水, "fat": 总脂肪 },
  "advice": "结合用户当前饮食计划给出的具体建议：哪些吃完、哪些少吃、大概吃多少"
}
\`\`\`
- 数字用整数；估重给出常见分量（如一碗米饭约200克）。
- 看不清的食物标注「（不确定）」并在 advice 里提醒确认。
- 今天是 ${today}。`;
  }
  return `## 输出协议（重要）
- 当用户要求修改、生成或重排训练/饮食计划时：正文先用几句话说明改了什么、为什么，然后把**完整的新计划全文**放在一个 \`\`\`plan 围栏中输出。围栏内是纯 markdown，要求：
  - 以「# 训练与饮食计划」开头；
  - 训练部分按「### 周一」到「### 周日」分节（休息日写明休息/主动恢复）；
  - 饮食部分包含一行「每日热量目标：约 XXXX kcal」及蛋白质/碳水/脂肪的大致分配；
  - 内容是替换旧计划的完整版本，不是片段。
- 用户确认后系统会用围栏内容整体替换当前计划，旧版自动归档。
- 日常问答不要输出 plan 围栏。今天日期星期几按「今天是 ${today}」判断。`;
};

/** 拼五段式 system prompt（普通对话用） */
export async function buildChatSystemPrompt() {
  const [profile, plan, recent] = await Promise.all([
    vfs.read('profile.md'),
    vfs.read('plans/current.md'),
    buildRecentDigest(),
  ]);

  let s = PERSONA_COACH + '\n\n';

  if (profile) {
    s += `## 用户档案（自动注入，请始终基于它个性化回答）\n${truncateHead(profile, BUDGET_PROFILE)}\n\n`;
  }
  if (plan) {
    s += `## 当前训练与饮食计划（自动注入）\n${truncateMiddle(plan, BUDGET_PLAN)}\n\n`;
  }
  if (recent) {
    s += `## 最近动态（日志摘要，供参考）\n${recent}\n\n`;
  }
  s += OUTPUT_PROTOCOL(false);
  return s;
}

/** 识餐用的精简上下文 */
export async function buildMealSystemPrompt() {
  const profile = await vfs.read('profile.md');
  const plan = await vfs.read('plans/current.md');
  let s = PERSONA_NUTRITIONIST + '\n\n';
  if (profile) {
    const dietProfile = extractSections(profile, ['忌口', '过敏', '偏好', '饮食']);
    if (dietProfile) s += `## 用户饮食档案（自动注入）\n${dietProfile}\n\n`;
  }
  if (plan) {
    const diet = extractSections(plan, ['饮食', '营养', '热量']);
    if (diet) s += `## 当前饮食计划要点（自动注入）\n${truncateHead(diet, 1500)}\n\n`;
  }
  s += OUTPUT_PROTOCOL(true);
  return s;
}

/** 最近 N 天动态摘要（对话压单行 + 餐食汇总行） */
async function buildRecentDigest() {
  const prefs = await settings.getCtxPrefs();
  const days = Math.max(0, Math.min(7, prefs.logDays));
  if (!days) return null;
  const lines = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = daysAgoISO(i);
    const dayLines = [];
    const meals = await tx('meals', 'readonly', s => reqAsPromise(s.index('by_date').getAll(iso)));
    for (const m of meals) {
      dayLines.push(`${m.time || ''}${m.mealType || '餐'}：${m.title || ''} 约${m.totals?.kcal ?? '?'}kcal`);
    }
    const msgs = await tx('messages', 'readonly', s => reqAsPromise(s.index('by_date').getAll(iso)));
    for (const msg of msgs) {
      if (msg.role === 'user') {
        const brief = (msg.content || '').replace(/\s+/g, ' ').slice(0, 60);
        dayLines.push(`用户说：${brief}`);
      }
    }
    if (dayLines.length) {
      const budget = dayLines.join('\n');
      lines.push(`### ${prettyDate(iso)}\n${truncateHead(budget, BUDGET_LOG_PER_DAY)}`);
    }
  }
  return lines.length ? lines.join('\n') : null;
}

/**
 * 对话历史（供 messages 参数）：最近 N 条，早于最近一轮的图片省略。
 * 返回 OpenAI 格式数组，不含 system。
 */
export async function buildHistoryMessages() {
  const all = await tx('messages', 'readonly', s => reqAsPromise(s.getAll()));
  const recent = all.slice(-HISTORY_MAX_MESSAGES);
  // 找最近一条带图的用户消息位置
  let lastImageIdx = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].role === 'user' && Array.isArray(recent[i].images) && recent[i].images.length) {
      lastImageIdx = i;
      break;
    }
  }
  return recent.map((m, i) => {
    const text = (m.content || '').slice(0, HISTORY_MSG_MAX_CHARS);
    if (Array.isArray(m.images) && m.images.length && i === lastImageIdx) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: text || '（图片）' },
          ...m.images.map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      };
    }
    return { role: m.role, content: text };
  });
}

/** 从标题关键词抽取 profile/plan 的相关分节（## 级别） */
function extractSections(md, keywords) {
  if (!md) return null;
  const sections = md.split(/\n(?=## )/);
  const hits = sections.filter(sec => keywords.some(k => sec.slice(0, 80).includes(k)));
  return hits.length ? hits.join('\n') : null;
}

/**
 * 从 AI 回复中提取 ```tag 围栏内容（宽松：```tag、```tag.md、``` tag 均可）。
 * 返回围栏内文本或 null。
 */
export function extractFence(text, tag) {
  if (!text) return null;
  const re = new RegExp('```' + tag + '[^\\n]*\\n([\\s\\S]*?)```', 'i');
  const m = text.match(re);
  if (m && m[1].trim()) return m[1].trim();
  // 兜底：只要全文像一份完整计划且被要求输出时只有一个无标签围栏——不启用，避免误判
  return null;
}

/** 从回复正文里去掉围栏块（展示用） */
export function stripFences(text) {
  return (text || '').replace(/```(?:plan|mealjson|profile)[^\n]*\n[\s\S]*?```/gi, '').trim();
}
