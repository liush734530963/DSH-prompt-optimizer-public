/**
 * dsh-prompt-optimizer —— 宿主端（bundle 形态）
 *
 * 核心升级（v1.2.0）：
 *  - 模型来源优先直接复用 DSH 系统已配置的模型（通过 ctx.llm.stream），
 *    自动享受 DSH 内置的凭证管理、重试与网络代理，用户无需重新填 API Key！
 *  - 注册 GET /dsh-prompt-optimizer/models 供前端下拉框实时获取 DSH 内已配置的所有模型列表。
 *  - 保留自定义 OpenAI 兼容接口作为高级/备用模式。
 *  - 设计原则不变：绝不篡改用户选定的对话主模型，只做提示词重构 + reasoningEffort 动态自适应。
 */

import Schema from '@deepseek-ai/schemastery';

export const name = 'dsh-prompt-optimizer';
export const inject = ['webServer'];

/** 路由路径 */
const ROUTE_PATH = '/dsh-prompt-optimizer/optimize';
const CONFIG_ROUTE_PATH = '/dsh-prompt-optimizer/config';
const MODELS_ROUTE_PATH = '/dsh-prompt-optimizer/models';

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用提示词优化与思考强度自适应').volatile(),
  source: Schema.union(['dsh', 'custom']).default('dsh').description('模型来源：dsh (从 DSH 已配置的模型选取) 或 custom (自定义外部接口)').volatile(),
  modelRoute: Schema.string().default('auto').description('优化模型选择（provider/model，留空或 auto 为自动选择）').volatile(),
  autoEffort: Schema.boolean().default(true).description('是否根据任务复杂度动态设置主模型思考强度 (low/medium/high/max)').volatile(),
  defaultEffort: Schema.union(['auto', 'low', 'medium', 'high', 'max']).default('auto').description('未指定或判断失败时的兜底思考强度（支持 auto 智能自适应）').volatile(),
  presetStyle: Schema.union(['general', 'coding', 'creative', 'reasoning', 'concise', 'custom']).default('general').description('优化预设风格模板').volatile(),
  systemPrompt: Schema.string().role('textarea').default('').description('自定义系统提示词 / 优化方向（留空则根据 presetStyle 自动匹配）').volatile(),
  autoOptimizeOnSend: Schema.boolean().default(false).description('发送时是否自动优化（预留）').volatile(),
  // 自定义外部接口（备用）
  apiUrl: Schema.string().default('https://api.siliconflow.cn/v1').description('自定义 API 地址（仅当 source 为 custom 时生效）').volatile(),
  apiKey: Schema.string().role('secret').default('').description('自定义 API Key（仅当 source 为 custom 时生效）').volatile(),
  model: Schema.string().default('Qwen/Qwen3-30B-A3B-Instruct-2507').description('兼容旧版模型字段').volatile(),
  customModel: Schema.string().default('Qwen/Qwen3-30B-A3B-Instruct-2507').description('自定义模型名称').volatile(),
});

export const PRESET_PROMPTS = {
  general: `你是一个资深的 AI 提示词架构师与任务复杂度评估专家。
请对用户的原始 Prompt 进行专业重构与意图清晰化，明确背景、核心目标与输出格式要求，并评估该任务的最佳思考强度。

请严格输出以下 JSON 格式（不要包含 markdown 代码块包裹，直接输出纯 JSON 字符串）：
{
  "optimized": "重构后更加清晰、专业、结构化的提示词",
  "complexity": "low|medium|high|max",
  "reason": "评定该复杂度的简述原因（10字以内）"
}

【复杂度评估标准】：
- low: 简单问答、常识咨询、翻译、简短润色、语法修正等轻量级任务。
- medium: 一般性代码编写、功能解释、文本总结、多步操作流程等标准任务。
- high: 复杂算法、系统架构设计、复杂 Bug 根因分析、长逻辑推导、逻辑严密的规划。
- max: 涉及极深度数学推理、跨模块底层重构、攻防博弈、高难度思维链推演。`,

  coding: `你是一个资深全栈软件工程师与系统架构专家。
请将用户的技术问题或需求，重构为具备清晰技术上下文、包含明确技术栈版本、输入输出契约、边界条件防护、性能与安全考量的高标准开发指令，并评估任务思考强度。

请严格输出以下 JSON 格式（不要包含 markdown 代码块包裹，直接输出纯 JSON 字符串）：
{
  "optimized": "重构后严谨、具备技术细节与边界约束的编程提示词",
  "complexity": "low|medium|high|max",
  "reason": "评定该复杂度的简述原因（10字以内）"
}

【复杂度评估标准】：
- low: 查阅函数用法、正则编写、代码格式化、简单语法问答。
- medium: 单一模块功能实现、普通脚本编写、常见框架 API 调用、单元测试编写。
- high: 架构模式设计、高并发与性能调优、跨模块复杂 Bug 排查、分布式系统设计。
- max: 底层内核/虚拟机/编译器实现、复杂数学算法推演、高难度思维链推演。`,

  creative: `你是一个顶级创意总监、文案操盘手与叙事专家。
请将用户的创作意图重构为包含清晰受众画像、独特语气语调、引人入胜的切入点、结构化大纲并严厉杜绝 AI 假大空废话的专业创作指令，并评估任务思考强度。

请严格输出以下 JSON 格式（不要包含 markdown 代码块包裹，直接输出纯 JSON 字符串）：
{
  "optimized": "重构后生动、富有感染力且去 AI 腔调的创作提示词",
  "complexity": "low|medium|high|max",
  "reason": "评定该复杂度的简述原因（10字以内）"
}

【复杂度评估标准】：
- low: 广告短标语、起标题、简短邮件通知、推文配文。
- medium: 社交媒体种草文案、微信公众号推文、产品介绍文案、常规演讲稿。
- high: 深度行业分析长文、品牌定位全套方案、小说/剧本精细化人设与大纲。
- max: 万字深度长篇叙事架构、多线伏笔情节设计、世界观宏大设定。`,

  reasoning: `你是一个严谨的科学研究员、逻辑学家与深度分析顾问。
请将用户的问题重构为具备假设定义、变量控制、反例论证、多角度权衡及强自洽要求的深度探究指令，引导模型展开严密的思维链，并评估任务思考强度。

请严格输出以下 JSON 格式（不要包含 markdown 代码块包裹，直接输出纯 JSON 字符串）：
{
  "optimized": "重构后逻辑严密、具备辩证思维与验证机制的研究型提示词",
  "complexity": "low|medium|high|max",
  "reason": "评定该复杂度的简述原因（10字以内）"
}

【复杂度评估标准】：
- low: 事实检索、概念对比、经典定理引用。
- medium: 现象因果分析、方案利弊权衡、常规数据解读。
- high: 复杂学术论题剖析、多变量因果链推演、理论悖论推导。
- max: 顶级数理难题论证、突破性交叉学科推演、形式化逻辑证明。`,

  concise: `你是一个极致追求高信噪比与极简效率的资深指令工程师。
请精简并提炼用户的 Prompt，去除所有客套修饰与冗余背景，提炼出最核心的指令意图，要求高密度、直截了当、直奔主题，并评估任务思考强度。

请严格输出以下 JSON 格式（不要包含 markdown 代码块包裹，直接输出纯 JSON 字符串）：
{
  "optimized": "去伪存真、极简精炼、高信息密度的核心指令",
  "complexity": "low|medium|high|max",
  "reason": "评定该复杂度的简述原因（10字以内）"
}

【复杂度评估标准】：
- low: 简单命令、一句话确认、格式转换。
- medium: 标准任务直接执行、无废话提取。
- high: 复杂多约束条件的核心指令。
- max: 极致深度推演的紧凑指令。`
};

const DEFAULT_SYSTEM_PROMPT = PRESET_PROMPTS.general;

function getEffectiveSystemPrompt(cfg, overridePrompt) {
  if (typeof overridePrompt === 'string' && overridePrompt.trim()) {
    return overridePrompt.trim();
  }
  const custom = pickStr(cfg.systemPrompt, '').trim();
  if (custom) return custom;
  const style = pickStr(cfg.presetStyle, 'general');
  return PRESET_PROMPTS[style] || PRESET_PROMPTS.general;
}

const EFFORTS = ['auto', 'low', 'medium', 'high', 'max'];
const DEFAULT_MODEL = 'Qwen/Qwen3-30B-A3B-Instruct-2507';
const API_TIMEOUT_MS = 60000;

function deref(value) {
  let cur = value;
  for (let i = 0; i < 5; i += 1) {
    if (cur === null || cur === undefined) return cur;
    if (typeof cur === 'object' && typeof cur.get === 'function') {
      try {
        cur = cur.get();
      } catch {
        return value;
      }
      continue;
    }
    break;
  }
  return cur;
}

function pickStr(value, fallback) {
  let cur = deref(value);
  if (typeof cur === 'function') {
    try {
      cur = cur();
    } catch {}
  }
  if (typeof cur === 'string' && cur.length > 0) return cur;
  if (typeof cur === 'number') return String(cur);
  if (cur && typeof cur === 'object') {
    for (const key of ['value', 'default', 'current', 'text', 'v']) {
      const got = deref(cur[key]);
      if (typeof got === 'string' && got.length > 0) return got;
      if (typeof got === 'number') return String(got);
    }
    if (typeof cur.__jsExpr === 'string' && cur.__jsExpr.length > 0) return cur.__jsExpr;
    for (const key of Object.keys(cur)) {
      const got = deref(cur[key]);
      if (typeof got === 'string' && got.length > 0) return got;
      if (typeof got === 'number') return String(got);
    }
  }
  return fallback;
}

function textOf(message) {
  return (message && message.content ? message.content : [])
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function isOff(value) {
  const cur = deref(value);
  if (cur === false) return true;
  if (typeof cur === 'string') return cur === 'false' || cur === '0';
  if (cur && typeof cur === 'object') {
    if ('value' in cur) return deref(cur.value) === false;
    if ('default' in cur) return deref(cur.default) === false;
  }
  return false;
}

function parseJsonResult(rawReply, userPrompt) {
  let cleaned = (rawReply || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    const parsed = JSON.parse(cleaned);
    return {
      optimized: parsed.optimized || userPrompt,
      complexity: EFFORTS.includes(parsed.complexity) ? parsed.complexity : 'medium',
      reason: parsed.reason || '自动评估',
    };
  } catch {
    return {
      optimized: rawReply || userPrompt,
      complexity: userPrompt.length > 300 ? 'high' : 'medium',
      reason: '文本规则兜底',
    };
  }
}

/** 通过 DSH 内部的 ctx.llm.stream 直接调用已配置的模型（免密免配置） */
async function callDshLlm(ctx, cfg, userPrompt, log, overridePrompt) {
  const llm = ctx.llm || (ctx.reflect && ctx.reflect.get('llm'));
  if (!llm || typeof llm.stream !== 'function') {
    throw new Error('DSH LLM 服务当前不可用');
  }

  let targetProvider = '';
  let targetModel = '';

  const configuredRoute = pickStr(cfg.modelRoute, pickStr(cfg.model, 'auto'));
  if (configuredRoute && configuredRoute !== 'auto' && configuredRoute.includes('/')) {
    const slashIdx = configuredRoute.indexOf('/');
    targetProvider = configuredRoute.slice(0, slashIdx);
    targetModel = configuredRoute.slice(slashIdx + 1);
  } else {
    // 自动在 DSH 已配置的 providers/models 中寻找候选
    const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : [];
    let candidate = null;
    const targetModelName = configuredRoute && configuredRoute !== 'auto' ? configuredRoute : '';

    for (const p of providers) {
      try {
        const models = (await llm.listModels(p.id)) || [];
        for (const m of models) {
          if (targetModelName && (m.id === targetModelName || m.name === targetModelName)) {
            candidate = { provider: p.id, model: m.id };
            break;
          }
          const lowerId = (m.id || '').toLowerCase();
          // 优先选择快速推理/结构化响应较快的模型（Qwen3, Flash, V3.2 等）
          if (!candidate && (lowerId.includes('qwen') || lowerId.includes('flash') || lowerId.includes('v3.2') || lowerId.includes('mini'))) {
            candidate = { provider: p.id, model: m.id };
          }
        }
        if (candidate && targetModelName) break;
      } catch {
        /* ignore */
      }
    }

    // 尝试默认会话模型
    if (!candidate) {
      try {
        const defService = ctx.agentDefaultModel || (ctx.reflect && ctx.reflect.get('agentDefaultModel'));
        if (defService && typeof defService.currentSelection === 'function') {
          const sel = defService.currentSelection();
          if (sel && sel.provider && sel.model) {
            candidate = { provider: sel.provider, model: sel.model };
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 兜底：第一个提供方的第一个模型
    if (!candidate && providers.length > 0) {
      const p = providers[0];
      const models = (await llm.listModels(p.id)) || [];
      if (models && models[0]) {
        candidate = { provider: p.id, model: models[0].id };
      }
    }

    if (candidate) {
      targetProvider = candidate.provider;
      targetModel = candidate.model;
    }
  }

  if (!targetProvider || !targetModel) {
    throw new Error('未在 DSH 中找到可用的模型路由，请检查 DSH 模型配置');
  }

  log(`通过 DSH 内部模型调用: ${targetProvider}/${targetModel}`);

  let createUserMessage;
  try {
    const dshLlm = await import('@deepseek-ai/dsh-llm');
    createUserMessage = dshLlm.createUserMessage;
  } catch {
    createUserMessage = (input) => ({
      ...input,
      role: 'user',
      id: String(Date.now()),
    });
  }

  const messages = [
    createUserMessage({
      content: [{ type: 'text', text: userPrompt }],
      source: { kind: 'dsh-prompt-optimizer' },
    }),
  ];

  const system = getEffectiveSystemPrompt(cfg, overridePrompt);
  const options = {
    provider: targetProvider,
    model: targetModel,
    messages,
    system,
    temperature: 0.3,
    maxTokens: 1200,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    purpose: 'prompt-optimizer',
  };

  let rawReply = '';
  for await (const chunk of llm.stream(options)) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      rawReply += chunk.text;
    } else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
      throw new Error(chunk.reason.failure?.message || 'LLM error');
    }
  }

  if (!rawReply.trim()) {
    throw new Error('DSH LLM 返回内容为空');
  }

  return rawReply;
}

/** 自定义外部 OpenAI 兼容 API 调用（备用） */
async function callCustomApi(cfg, userPrompt, overridePrompt) {
  const base = pickStr(cfg.apiUrl, 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
  const endpoint = `${base}/chat/completions`;
  const envKey =
    typeof process !== 'undefined' && process.env
      ? pickStr(process.env.SILICONFLOW_API_KEY, '')
      : '';
  const apiKey = pickStr(cfg.apiKey, '') || envKey;
  const model = pickStr(cfg.customModel, pickStr(cfg.model, DEFAULT_MODEL));
  if (!apiKey) throw new Error('未配置 apiKey（请在插件配置里填写优化模型 API Key）');

  const system = getEffectiveSystemPrompt(cfg, overridePrompt);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API 响应失败 (${res.status}): ${errText.slice(0, 160)}`);
  }

  const data = await res.json();
  const rawReply = data?.choices?.[0]?.message?.content?.trim() || '';
  return rawReply;
}

/** 综合优化入口：默认优先走 DSH 内部模型，支持自动回退 */
async function callOptimizeApi(ctx, cfg, userPrompt, log, overridePrompt) {
  const source = pickStr(cfg.source, 'dsh');

  if (source !== 'custom') {
    try {
      const raw = await callDshLlm(ctx, cfg, userPrompt, log, overridePrompt);
      return parseJsonResult(raw, userPrompt);
    } catch (err) {
      log(`DSH 内部模型调用未完成: ${err?.message || err}`);
      // 若配有自定义 key 则尝试外部接口回退
      const hasCustomKey = Boolean(pickStr(cfg.apiKey, '') || (typeof process !== 'undefined' && process.env?.SILICONFLOW_API_KEY));
      if (!hasCustomKey) {
        throw new Error(`DSH 模型调用失败: ${err?.message || err}`);
      }
      log('回退到自定义外部 API 调用...');
    }
  }

  const raw = await callCustomApi(cfg, userPrompt, overridePrompt);
  return parseJsonResult(raw, userPrompt);
}

/** 只接受本机 / 同源请求 */
function isTrustedRequest(req) {
  const host = req.headers.host;
  if (typeof host !== 'string' || host.length === 0) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (typeof origin === 'string') {
    if (origin === 'null') return false;
    try {
      if (new URL(origin).host !== hostUrl.host) return false;
    } catch {
      return false;
    }
  }
  const hostname = hostUrl.hostname.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  );
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {};

  const sessionCache = new Map();
  let lastOptimize = null;
  let claimedText = null;

  const log = (msg) => {
    try {
      ctx.logger?.info?.(`[dsh-prompt-optimizer] ${msg}`);
    } catch {}
  };

  ctx.inject(['webServer'], (webServerCtx) => {
    try {
      // 1) 优化接口
      ctx.effect(
        () =>
          webServerCtx.webServer.register({
            kind: 'exact',
            path: ROUTE_PATH,
            handler: async (req, res) => {
              if (!isTrustedRequest(req)) {
                sendJson(res, 403, { ok: false, error: 'forbidden' });
                return;
              }
              if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'method not allowed' });
                return;
              }
              if (isOff(cfg.enabled)) {
                sendJson(res, 409, { ok: false, error: '插件已停用（config.enabled = false）' });
                return;
              }

              let payload;
              try {
                payload = JSON.parse((await readBody(req)) || '{}');
              } catch (err) {
                sendJson(res, 400, { ok: false, error: `请求体不是合法 JSON: ${err?.message ?? err}` });
                return;
              }

              const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
              const sessionId = typeof payload?.sessionId === 'string' && payload.sessionId ? payload.sessionId : 'global';
              const overridePrompt = typeof payload?.systemPrompt === 'string' ? payload.systemPrompt.trim() : '';
              if (!prompt) {
                sendJson(res, 400, { ok: false, error: 'prompt 为空' });
                return;
              }

              try {
                const result = await callOptimizeApi(ctx, cfg, prompt, log, overridePrompt);
                lastOptimize = { ...result, ts: Date.now(), usedTurns: new Set() };
                sessionCache.set(sessionId, lastOptimize);
                log(`优化完成 session=${sessionId} complexity=${result.complexity}`);
                sendJson(res, 200, { ok: true, value: result });
              } catch (err) {
                const message = err?.message || String(err);
                log(`优化失败: ${message}`);
                sendJson(res, 502, { ok: false, error: message });
              }
            },
          }),
        'dsh-prompt-optimizer: optimize route',
      );

      // 2) 获取 DSH 内部已配置的模型列表
      ctx.effect(
        () =>
          webServerCtx.webServer.register({
            kind: 'exact',
            path: MODELS_ROUTE_PATH,
            handler: async (req, res) => {
              if (!isTrustedRequest(req)) {
                sendJson(res, 403, { ok: false, error: 'forbidden' });
                return;
              }
              try {
                const llm = ctx.llm || (ctx.reflect && ctx.reflect.get('llm'));
                const list = [];
                let defaultRoute = '';

                try {
                  const defService = ctx.agentDefaultModel || (ctx.reflect && ctx.reflect.get('agentDefaultModel'));
                  if (defService && typeof defService.currentSelection === 'function') {
                    const sel = defService.currentSelection();
                    if (sel && sel.provider && sel.model) {
                      defaultRoute = `${sel.provider}/${sel.model}`;
                    }
                  }
                } catch {}

                if (llm && typeof llm.listProviders === 'function') {
                  const providers = llm.listProviders() || [];
                  for (const p of providers) {
                    try {
                      const models = (await llm.listModels(p.id)) || [];
                      for (const m of models) {
                        const routeKey = `${p.id}/${m.id}`;
                        const pLabel = p.displayName || p.name || p.id;
                        const mLabel = m.name || m.id;
                        list.push({
                          key: routeKey,
                          provider: p.id,
                          providerName: pLabel,
                          model: m.id,
                          modelName: mLabel,
                          label: `${pLabel} / ${mLabel}`,
                        });
                      }
                    } catch (err) {
                      /* ignore provider failure */
                    }
                  }
                }

                sendJson(res, 200, {
                  ok: true,
                  models: list,
                  defaultRoute: defaultRoute || (list[0] ? list[0].key : ''),
                  currentRoute: pickStr(cfg.modelRoute, pickStr(cfg.model, 'auto')),
                });
              } catch (err) {
                sendJson(res, 500, { ok: false, error: String(err) });
              }
            },
          }),
        'dsh-prompt-optimizer: models route',
      );

      // 3) 配置读写接口
      ctx.effect(
        () =>
          webServerCtx.webServer.register({
            kind: 'exact',
            path: CONFIG_ROUTE_PATH,
            handler: async (req, res) => {
              if (!isTrustedRequest(req)) {
                sendJson(res, 403, { ok: false, error: 'forbidden' });
                return;
              }
              if (req.method === 'GET') {
                const current = {
                  enabled: !isOff(cfg.enabled),
                  source: pickStr(cfg.source, 'dsh'),
                  modelRoute: pickStr(cfg.modelRoute, pickStr(cfg.model, 'auto')),
                  autoEffort: !isOff(cfg.autoEffort),
                  defaultEffort: pickStr(cfg.defaultEffort, 'auto'),
                  presetStyle: pickStr(cfg.presetStyle, 'general'),
                  systemPrompt: pickStr(cfg.systemPrompt, ''),
                  autoOptimizeOnSend: Boolean(deref(cfg.autoOptimizeOnSend)),
                  apiUrl: pickStr(cfg.apiUrl, 'https://api.siliconflow.cn/v1'),
                  apiKey: pickStr(cfg.apiKey, '') ? '******' : '',
                  hasApiKey: Boolean(pickStr(cfg.apiKey, '')),
                  customModel: pickStr(cfg.customModel, DEFAULT_MODEL),
                };
                sendJson(res, 200, { ok: true, value: current });
                return;
              }
              if (req.method === 'POST') {
                let patch;
                try {
                  patch = JSON.parse((await readBody(req)) || '{}');
                } catch (err) {
                  sendJson(res, 400, { ok: false, error: `请求体不是合法 JSON: ${err?.message ?? err}` });
                  return;
                }
                const updates = {};
                if (typeof patch.enabled === 'boolean') updates.enabled = patch.enabled;
                if (typeof patch.source === 'string') updates.source = patch.source;
                if (typeof patch.modelRoute === 'string') {
                  updates.modelRoute = patch.modelRoute.trim();
                  updates.model = patch.modelRoute.trim();
                }
                if (typeof patch.autoEffort === 'boolean') updates.autoEffort = patch.autoEffort;
                if (typeof patch.defaultEffort === 'string' && EFFORTS.includes(patch.defaultEffort)) {
                  updates.defaultEffort = patch.defaultEffort;
                }
                if (typeof patch.presetStyle === 'string') updates.presetStyle = patch.presetStyle;
                if (typeof patch.systemPrompt === 'string') updates.systemPrompt = patch.systemPrompt;
                if (typeof patch.autoOptimizeOnSend === 'boolean') updates.autoOptimizeOnSend = patch.autoOptimizeOnSend;
                if (typeof patch.apiUrl === 'string' && patch.apiUrl.trim()) updates.apiUrl = patch.apiUrl.trim();
                if (typeof patch.apiKey === 'string') {
                  const key = patch.apiKey.trim();
                  if (key && key !== '******') updates.apiKey = key;
                }
                if (typeof patch.customModel === 'string' && patch.customModel.trim()) updates.customModel = patch.customModel.trim();

                try {
                  const settingsService = ctx.settings || (ctx.reflect && ctx.reflect.get('settings'));
                  if (settingsService && typeof settingsService.update === 'function') {
                    await settingsService.update('dsh-prompt-optimizer', updates);
                    log(`已通过 ctx.settings 更新配置: ${Object.keys(updates).join(', ')}`);
                  } else if (settingsService && typeof settingsService.mutate === 'function') {
                    const row = settingsService.describe?.()?.find?.((r) => String(r.ns).includes('prompt-optimizer'));
                    if (row) {
                      await settingsService.mutate(row.ns, Object.entries(updates).map(([k, v]) => ({ op: 'set', path: [k], value: v })), void 0);
                    }
                  }
                } catch (err) {
                  log(`调用 settings 服务保存失败: ${err?.message || err}`);
                }

                // 运行时内存同步
                for (const [k, v] of Object.entries(updates)) {
                  try {
                    cfg[k] = v;
                  } catch {}
                }

                sendJson(res, 200, { ok: true, updated: updates });
                return;
              }
              sendJson(res, 405, { ok: false, error: 'method not allowed' });
            },
          }),
        'dsh-prompt-optimizer: config route',
      );

      log(`已注册 HTTP 路由: ${ROUTE_PATH}, ${MODELS_ROUTE_PATH}, ${CONFIG_ROUTE_PATH}`);
    } catch (err) {
      log(`注册 HTTP 路由失败: ${err?.message || err}`);
    }
  });

  // 2) 拦截 agent/request：纯提示词自适应思考强度
  ctx.on('agent/request', async (req) => {
    if (isOff(cfg.enabled)) return;
    if (isOff(cfg.autoEffort)) return;

    const messages = Array.isArray(req.messages) ? req.messages : [];
    const lastUser = [...messages].reverse().find((m) => m && m.role === 'user');
    const promptText = textOf(lastUser);
    if (!promptText) return;

    let targetEffort = pickStr(cfg.defaultEffort, 'auto');
    let source = '默认兜底';

    if (lastOptimize && !lastOptimize.usedTurns.has(req.turn)) {
      targetEffort = lastOptimize.complexity;
      source = `魔棒优化 (${lastOptimize.reason || '自动评估'})`;
      lastOptimize.usedTurns.add(req.turn);
    } else {
      if (promptText === claimedText) return;
      claimedText = promptText;
      if (targetEffort === 'auto') {
        const len = promptText.length;
        if (len > 500) {
          targetEffort = 'high';
          source = 'Auto智能自适应(长文本规则)';
        } else if (len > 150) {
          targetEffort = 'medium';
          source = 'Auto智能自适应(中等文本规则)';
        } else {
          targetEffort = 'low';
          source = 'Auto智能自适应(短文本规则)';
        }
      } else {
        source = `固定档位 (${targetEffort})`;
      }
    }

    if (!['low', 'medium', 'high', 'max'].includes(targetEffort)) {
      targetEffort = 'low';
    }

    const prevEffort = req.reasoningEffort || '未设置';
    req.reasoningEffort = targetEffort;

    log(
      `保持主模型 ${req.provider}/${req.model}，思考强度 ${prevEffort} -> ${targetEffort} (${source}) (turn ${req.turn ?? '?'})`,
    );
  });
}
