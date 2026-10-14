// settings 仓的高层 API + 默认值

import { tx, reqAsPromise } from './db.js';

export const settings = {
  async get(key, defaultValue = null) {
    const rec = await tx('settings', 'readonly', s => reqAsPromise(s.get(key)));
    return rec ? rec.value : defaultValue;
  },

  async set(key, value) {
    await tx('settings', 'readwrite', s => s.put({ key, value }));
  },

  /** 服务商列表（至少一条，默认 DeepSeek） */
  async getProviders() {
    const list = await settings.get('providers');
    if (Array.isArray(list) && list.length) return list;
    return [defaultDeepSeekProvider()];
  },

  async setProviders(list) {
    await settings.set('providers', list);
  },

  /** 默认服务商：isDefault 标记的，否则第一条 */
  async getDefaultProvider() {
    const list = await settings.getProviders();
    return list.find(p => p.isDefault) || list[0];
  },

  async getWorkerUrl() {
    return (await settings.get('workerUrl')) || '';
  },

  async setWorkerUrl(url) {
    await settings.set('workerUrl', (url || '').trim().replace(/\/+$/, ''));
  },

  async getCtxPrefs() {
    return { logDays: 3, ...(await settings.get('ctxPrefs') || {}) };
  },

  async setCtxPrefs(prefs) {
    await settings.set('ctxPrefs', { ...(await settings.getCtxPrefs()), ...prefs });
  },
};

/** DeepSeek 预置服务商（模型名可改，以官方文档为准）
 * 2026-10 官方在售模型：deepseek-flash（快/便宜/支持看图）、deepseek-v4-pro（更强/贵）。
 * 默认全用 flash（识餐、日常对话够用）；想要更高质量的日常对话可在设置页改成 deepseek-v4-pro。 */
export function defaultDeepSeekProvider() {
  return {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    chatModel: 'deepseek-flash',
    visionModel: 'deepseek-flash',
    isDefault: true,
  };
}
