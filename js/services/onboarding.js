// 问卷向导业务：答案 → 生成 profile.md → 生成 plans/current.md → 落盘

import { vfs } from '../vfs.js';
import { settings } from '../settings.js';
import { chatStream } from '../ai/client.js';
import { dateISO } from '../utils/format.js';

/** 问卷题目定义（向导 UI 与生成都用它） */
export const WIZARD_STEPS = [
  {
    key: 'basic',
    title: '基本信息',
    desc: '让教练认识你',
    fields: [
      { key: 'nickname', label: '怎么称呼你', type: 'text', placeholder: '比如：小白' },
      { key: 'gender', label: '性别', type: 'chips', options: ['男', '女'], required: true },
      { key: 'age', label: '年龄', type: 'number', placeholder: '如 28' },
      { key: 'height', label: '身高 (cm)', type: 'number', placeholder: '如 175' },
      { key: 'weight', label: '体重 (kg)', type: 'number', placeholder: '如 70' },
      { key: 'goal', label: '主要目标', type: 'chips', options: ['减脂', '增肌', '塑形', '保持健康'], required: true },
      { key: 'targetWeight', label: '目标体重 (kg，可空)', type: 'number', placeholder: '如 65' },
      { key: 'duration', label: '期望达成周期（可空）', type: 'text', placeholder: '如 3 个月' },
      { key: 'injury', label: '伤病/禁忌（没有可不填）', type: 'textarea', placeholder: '如 左膝旧伤、腰不舒服' },
    ],
  },
  {
    key: 'training',
    title: '训练条件',
    desc: '教练好安排动作和强度',
    fields: [
      { key: 'experience', label: '训练经验', type: 'chips', options: ['完全新手', '少于1年', '1-3年', '3年以上'], required: true },
      { key: 'daysPerWeek', label: '每周能练几天', type: 'chips', options: ['1', '2', '3', '4', '5', '6'], required: true },
      { key: 'minutesPerSession', label: '每次能练多久', type: 'chips', options: ['30分钟', '45分钟', '60分钟', '90分钟'], required: true },
      { key: 'equipment', label: '可用器械（可多选）', type: 'chips', options: ['健身房全套', '哑铃', '壶铃', '弹力带', '单杠', '跑步机', '纯自重'], multi: true },
      { key: 'equipmentNote', label: '器械补充说明（可空）', type: 'text', placeholder: '如 小区健身房没有深蹲架' },
    ],
  },
  {
    key: 'diet',
    title: '饮食情况',
    desc: '营养师好安排吃什么',
    fields: [
      { key: 'avoid', label: '忌口/过敏（可多选）', type: 'chips', options: ['香菜', '内脏', '辣', '海鲜', '乳制品', '麸质'], multi: true },
      { key: 'avoidNote', label: '其他忌口（可空）', type: 'text', placeholder: '如 不吃羊肉' },
      { key: 'preference', label: '饮食偏好（可多选）', type: 'chips', options: ['清淡', '重口味', '爱吃肉', '偏素食', '外卖为主', '自己做饭'], multi: true },
      { key: 'mealsPerDay', label: '每天几餐', type: 'chips', options: ['2餐', '3餐', '3餐+加餐'] },
      { key: 'diningNote', label: '就餐环境（可空）', type: 'text', placeholder: '如 工作日吃食堂、常出差' },
    ],
  },
  {
    key: 'lifestyle',
    title: '作息与补充',
    desc: '最后几步',
    fields: [
      { key: 'sleep', label: '平均睡眠', type: 'chips', options: ['少于6小时', '6-7小时', '7-8小时', '8小时以上'] },
      { key: 'activity', label: '日常活动量', type: 'chips', options: ['久坐为主', '通勤走路较多', '体力劳动'] },
      { key: 'extra', label: '还有什么想告诉教练的（可空）', type: 'textarea', placeholder: '任何你觉得重要的：偏好运动、怕什么动作、目标细节…' },
    ],
  },
];

/** 把答案对象格式化成给 AI 看的问卷文本 */
export function formatAnswers(answers) {
  const lines = [];
  for (const step of WIZARD_STEPS) {
    for (const f of step.fields) {
      const v = answers[`${step.key}.${f.key}`];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
      const val = Array.isArray(v) ? v.join('、') : v;
      lines.push(`- ${f.label.replace(/（.*）/, '')}：${val}`);
    }
  }
  return lines.join('\n');
}

const PROFILE_PROMPT = (answerText, existingProfile) => `请根据以下问卷结果，为用户生成一份个人健身档案（markdown）。
${existingProfile ? '用户已有一份旧档案，请在旧档案基础上做增量修订（保留仍然有效的信息，更新变化的部分）：\n\n' + existingProfile + '\n' : ''}
问卷结果：
${answerText}

要求：
- 以「# 个人档案」开头，用清晰的 ## 分节：基本信息、目标、训练条件、饮食档案（忌口过敏要单列醒目）、作息与生活方式、注意事项。
- 客观、简洁、信息密度高，总量控制在 500 字以内（这是给 AI 当长期记忆用的，不是作文）。
- 直接输出档案 markdown 全文，放在 \`\`\`profile 围栏中，围栏外不要有其他内容。`;

const PLAN_PROMPT = (profileMd, answerText) => `以下是用户的个人档案与问卷要点：

【个人档案】
${profileMd}

【问卷要点】
${answerText}

请生成用户的第一版「训练与饮食计划」。要求：
- 以「# 训练与饮食计划」开头。
- 训练部分：按「### 周一」到「### 周日」分节（7 天都要有，休息日写休息/主动恢复内容）；每个训练日列出：当日主题、动作清单（动作名 组数×次数，新手附一句话要点）、组间休息、结束拉伸。
- 饮食部分：包含一行「每日热量目标：约 XXXX kcal」（根据目标测算），蛋白质/碳水/脂肪克数分配，每餐的示例搭配（贴合用户的就餐环境与忌口），外食/食堂的应对建议。
- 强度贴合经验水平；总量控制在 800 字以内，信息密度优先。
- 直接输出完整计划 markdown，放在 \`\`\`plan 围栏中，围栏外不要有其他内容。`;

/** 从围栏里抠出内容（带兜底：整段文本像 markdown 就直接用） */
function extractTagged(text, tag) {
  const re = new RegExp('```' + tag + '[^\\n]*\\n([\\s\\S]*?)```', 'i');
  const m = (text || '').match(re);
  if (m && m[1].trim()) return m[1].trim();
  const stripped = (text || '').replace(/```[\s\S]*?```/g, '').trim();
  if (stripped.startsWith('#')) return stripped; // 模型没按协议来，但内容可用
  return null;
}

/** 生成个人档案（流式） */
export async function generateProfile(answers, onDelta, signal) {
  const provider = await settings.getDefaultProvider();
  if (!provider.apiKey) throw new Error('尚未配置 API Key，请先到设置页填写。');
  const existing = await vfs.read('profile.md');
  const { content } = await chatStream({
    provider,
    messages: [{ role: 'user', content: PROFILE_PROMPT(formatAnswers(answers), existing) }],
    signal,
    onDelta,
    temperature: 0.4,
  });
  const md = extractTagged(content, 'profile');
  if (!md) throw new Error('生成档案失败（模型输出格式异常），请重试。');
  return md;
}

/** 生成训练饮食计划（流式） */
export async function generatePlan(profileMd, answers, onDelta, signal) {
  const provider = await settings.getDefaultProvider();
  const { content } = await chatStream({
    provider,
    messages: [{ role: 'user', content: PLAN_PROMPT(profileMd, formatAnswers(answers)) }],
    signal,
    onDelta,
    temperature: 0.4,
  });
  const md = extractTagged(content, 'plan');
  if (!md) throw new Error('生成计划失败（模型输出格式异常），请重试。');
  return md;
}

/** 完成向导：写档案与计划 */
export async function finishOnboarding(profileMd, planMd, answers = {}) {
  await vfs.write('profile.md', profileMd.trim() + '\n');
  const nickname = answers['basic.nickname'];
  if (nickname) await settings.set('nickname', nickname);
  const old = await vfs.read('plans/current.md');
  if (old) await vfs.write(`versions/plans/${dateISO()}_wizard.md`, old);
  await vfs.write('plans/current.md', `<!-- 生成于 ${dateISO()} -->\n${planMd.trim()}\n`);
  await settings.set('onboardingDone', true);
  await settings.set('onboardingDraft', null);
}
