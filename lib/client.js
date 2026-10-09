/**
 * dsh-prompt-optimizer —— 浏览器端（DSH client bundle 形态）
 *
 * 规范：
 *   - 兼容 window.__ModuleLoader__.load({ id, factory(require) }) 机制
 *   - 支持 CJS / ESM 导出 (exports.apply, exports.inject, exports.name)
 *   - 槽位注册：
 *       1. conversation.input.right -> 输入框右侧魔法棒优化按钮 + 快捷齿轮弹窗
 *       2. plugins.bundle.config (key: dsh-prompt-optimizer) -> 插件管理中心详情页原生配置面板
 *       3. plugins.row.config (key: dsh-prompt-optimizer#dsh-prompt-optimizer) -> 单行配置
 *   - 配置持久化：
 *       优先使用 DSH 原生 configForms.get('dsh-prompt-optimizer') 写入 cordis.patch.yml；
 *       同时回退到同源 HTTP 路由 /dsh-prompt-optimizer/config 同步宿主运行时内存。
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-optimizer',
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const ReactDOM = require('react-dom');
    const { useState, useEffect, useRef, useCallback } = React;

    const PLUGIN_ID = 'dsh-prompt-optimizer';
    const SLOT_INPUT = 'conversation.input.right';
    const SLOT_BUNDLE_CONFIG = 'plugins.bundle.config';
    const SLOT_ROW_CONFIG = 'plugins.row.config';
    const OPTIMIZE_ENDPOINT = '/dsh-prompt-optimizer/optimize';
    const CONFIG_ENDPOINT = '/dsh-prompt-optimizer/config';
    const EFFORTS = ['low', 'medium', 'high', 'max'];
    const DEFAULT_MODEL = 'Qwen/Qwen3-30B-A3B-Instruct-2507';
    const DEFAULT_API_URL = 'https://api.siliconflow.cn/v1';

    /** 解包 DSH volatile 活引用 */
    function unwrapVolatile(val) {
      if (val === null || val === undefined) return val;
      if (typeof val === 'object' && typeof val.get === 'function') {
        return unwrapVolatile(val.get());
      }
      return val;
    }

    /** 动态注入精致微样式与动效 */
    function ensureStyles() {
      if (typeof document === 'undefined') return;
      const styleId = 'dsh-prompt-optimizer-custom-styles';
      if (!document.getElementById(styleId)) {
        const el = document.createElement('style');
        el.id = styleId;
        el.textContent = `
          @keyframes dsh-po-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes dsh-po-fade-in {
            from { opacity: 0; transform: translateY(4px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .dsh-po-capsule {
            display: inline-flex;
            align-items: center;
            height: 26px;
            padding: 1px 2px;
            border-radius: 6px;
            background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.035));
            border: 1px solid var(--dsw-alias-border-l1, rgba(127, 133, 143, 0.2));
            box-sizing: border-box;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
          }
          .dsh-po-capsule:hover {
            border-color: var(--dsw-alias-border-l2, rgba(127, 133, 143, 0.35));
            background: var(--dsw-alias-bg-layer-hover, rgba(255, 255, 255, 0.06));
          }
          .dsh-po-btn-opt {
            display: inline-flex;
            align-items: center;
            gap: 4.5px;
            height: 22px;
            padding: 0 7px;
            border-radius: 4px;
            border: none;
            background: transparent;
            color: var(--dsw-alias-label-secondary, #8f959e);
            font: inherit;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            line-height: 1;
            white-space: nowrap;
            transition: all 0.15s ease;
          }
          .dsh-po-btn-opt:hover:not(:disabled) {
            color: var(--dsw-alias-label-primary, #ffffff);
            background: rgba(255, 255, 255, 0.08);
          }
          .dsh-po-btn-opt:active:not(:disabled) {
            transform: scale(0.97);
          }
          .dsh-po-btn-opt:disabled {
            opacity: 0.35;
            cursor: not-allowed;
          }
          .dsh-po-btn-opt.active-text {
            color: var(--dsw-alias-accent, #3b82f6);
          }
          .dsh-po-btn-opt.active-text:hover:not(:disabled) {
            color: #60a5fa;
            background: rgba(59, 130, 246, 0.12);
          }
          .dsh-po-divider {
            width: 1px;
            height: 12px;
            background: var(--dsw-alias-border-l1, rgba(127, 133, 143, 0.2));
            margin: 0 1px;
            flex-shrink: 0;
          }
          .dsh-po-btn-gear {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 4px;
            border: none;
            background: transparent;
            color: var(--dsw-alias-label-tertiary, #717680);
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .dsh-po-btn-gear:hover {
            color: var(--dsw-alias-label-primary, #ffffff);
            background: rgba(255, 255, 255, 0.08);
          }
          .dsh-po-btn-gear.open {
            color: var(--dsw-alias-accent, #3b82f6);
            background: rgba(59, 130, 246, 0.12);
          }
          .dsh-po-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: dsh-po-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .dsh-po-modal-container {
            position: relative;
            background: var(--dsw-alias-bg-layer-2, #1e1e24);
            border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12));
            box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            width: 440px;
            max-width: calc(100vw - 32px);
            max-height: 85vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            box-sizing: border-box;
            z-index: 999999;
            animation: dsh-po-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          }
        `;
        document.head.appendChild(el);
      }
    }

    /** 极简 AI 双星芒图标 */
    function IconSparkles({ size = 13, style }) {
      return React.createElement(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'currentColor',
          style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style },
        },
        React.createElement('path', {
          d: 'M12 2L14.3 9.7L22 12L14.3 14.3L12 22L9.7 14.3L2 12L9.7 9.7L12 2Z',
        }),
        React.createElement('path', {
          d: 'M19 18.5L17.8 15.2L14.5 14L17.8 12.8L19 9.5L20.2 12.8L23.5 14L20.2 15.2L19 18.5Z',
          opacity: 0.65,
        })
      );
    }

    /** 极简线条齿轮图标 */
    function IconGear({ size = 13, style }) {
      return React.createElement(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style },
        },
        React.createElement('circle', { cx: '12', cy: '12', r: '3' }),
        React.createElement('path', {
          d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
        })
      );
    }

    /** 顺滑加载旋转 Spinner */
    function IconSpinner({ size = 13, style }) {
      return React.createElement(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          style: {
            display: 'inline-block',
            verticalAlign: 'middle',
            animation: 'dsh-po-spin 0.8s linear infinite',
            flexShrink: 0,
            ...style,
          },
        },
        React.createElement('path', {
          d: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
          opacity: 0.25,
        }),
        React.createElement('path', {
          d: 'M12 2a10 10 0 0 1 10 10',
        })
      );
    }

    const PRESET_DSH_MODELS = [
      { provider: 'siliconflow', model: 'Qwen/Qwen3-30B-A3B-Instruct-2507', route: 'siliconflow/Qwen/Qwen3-30B-A3B-Instruct-2507', label: 'SiliconFlow / Qwen3-30B (极速推荐, 实测 3.8s)' },
      { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V3', route: 'siliconflow/deepseek-ai/DeepSeek-V3', label: 'SiliconFlow / DeepSeek-V3 (推荐, 4.6s)' },
      { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V3.2', route: 'siliconflow/deepseek-ai/DeepSeek-V3.2', label: 'SiliconFlow / DeepSeek-V3.2 (DP V3.2)' },
      { provider: 'siliconflow', model: 'THUDM/glm-4-9b-chat', route: 'siliconflow/THUDM/glm-4-9b-chat', label: 'SiliconFlow / GLM-4-9B (4.1s)' },
      { provider: 'agnes', model: 'agnes-2.5-flash', route: 'agnes/agnes-2.5-flash', label: 'Agnes / agnes-2.5-flash (极速兜底)' },
      { provider: 'agnes', model: 'agnes-3.0-flash', route: 'agnes/agnes-3.0-flash', label: 'Agnes / agnes-3.0-flash (兜底)' },
      { provider: 'deepseek', model: 'deepseek-chat', route: 'deepseek/deepseek-chat', label: 'DeepSeek / deepseek-chat' },
    ];

    function parseClientJsonResult(rawReply, userPrompt) {
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

    /** 提示词优化接口（支持 Host 端同源路由与浏览器直连双通道回退） */
    async function callOptimizeApi(prompt, sessionId, opts = {}) {
      try {
        const res = await fetch(OPTIMIZE_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, sessionId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok && data.value) return data.value;
        }
      } catch {
        /* empty */
      }

      // 浏览器端直连降级处理
      let apiUrl = (opts.apiUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
      let apiKey = opts.apiKey || '';
      let model = opts.customModel || opts.model || DEFAULT_MODEL;

      if (opts.source === 'dsh' && opts.modelRoute) {
        if (opts.modelRoute.startsWith('agnes/')) {
          apiUrl = 'https://api.agnes.ai/v1';
          model = opts.modelRoute.replace(/^agnes\//, '');
        } else {
          apiUrl = 'https://api.siliconflow.cn/v1';
          model = opts.modelRoute.replace(/^siliconflow\//, '');
        }
      }

      if (!apiKey) {
        throw new Error('未配置 API Key。请在设置面板中填入 API Key，或由 DSH 宿主服务统一托管。');
      }

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 响应失败 (${response.status}): ${errText.slice(0, 150)}`);
      }

      const resData = await response.json();
      const rawText = resData?.choices?.[0]?.message?.content || '';
      return parseClientJsonResult(rawText, prompt);
    }

    /** 回退 HTTP 配置读取 */
    async function fetchConfigFallback() {
      try {
        const res = await fetch(CONFIG_ENDPOINT, { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok) return data.value || {};
        }
      } catch {
        /* ignore */
      }
      return null;
    }

    /** 回退 HTTP 配置写入 */
    async function saveConfigFallback(patch) {
      try {
        await fetch(CONFIG_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch {
        /* ignore */
      }
    }

    /** 获取 DSH 内部已配置的模型列表 */
    async function fetchDshModels() {
      try {
        const res = await fetch('/dsh-prompt-optimizer/models');
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok && Array.isArray(data.models) && data.models.length > 0) return data;
        }
      } catch (err) {
        console.warn(`[${PLUGIN_ID}] 获取 DSH 动态模型列表回退至内置预设:`, err);
      }
      return {
        models: PRESET_DSH_MODELS,
        defaultRoute: 'siliconflow/Qwen/Qwen3-30B-A3B-Instruct-2507',
        currentRoute: 'auto',
      };
    }

    const baseButton = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      height: '28px',
      padding: '0 10px',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l1, rgba(127,133,143,0.35))',
      background: 'var(--dsw-alias-bg-layer-2, transparent)',
      color: 'var(--dsw-alias-label-secondary, #7f858f)',
      font: 'inherit',
      fontSize: '12px',
      lineHeight: '1',
      cursor: 'pointer',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    };

    const badgeStyle = {
      display: 'inline-block',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase',
      border: '1px solid currentColor',
    };

    /**
     * 统一设置面板组件（供「插件管理中心原生配置卡片」和「输入框齿轮快捷弹窗」复用）
     */
    function SettingsPanel({ settingsScope, isModal, onClose, view }) {
      const [loading, setLoading] = useState(true);
      const [saving, setSaving] = useState(false);
      const [testing, setTesting] = useState(false);
      const [msg, setMsg] = useState('');
      const [err, setErr] = useState('');

      const [enabled, setEnabled] = useState(true);
      const [source, setSource] = useState('dsh'); // 'dsh' | 'custom'
      const [modelRoute, setModelRoute] = useState('auto');
      const [dshModels, setDshModels] = useState([]);
      const [customModel, setCustomModel] = useState(DEFAULT_MODEL);
      const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
      const [apiKey, setApiKey] = useState('');
      const [hasApiKey, setHasApiKey] = useState(false);
      const [model, setModel] = useState(DEFAULT_MODEL);
      const [autoEffort, setAutoEffort] = useState(true);
      const [defaultEffort, setDefaultEffort] = useState('low');
      const [autoOptimizeOnSend, setAutoOptimizeOnSend] = useState(false);

      // 订阅 settingsScope 变化以响应外部更新
      useEffect(() => {
        if (!settingsScope || typeof settingsScope.subscribe !== 'function') return;
        return settingsScope.subscribe(() => {
          loadCurrentValues();
        });
      }, [settingsScope]);

      const loadCurrentValues = useCallback(async () => {
        let loaded = false;

        // 异步获取 DSH 内部已配置的模型列表
        try {
          const modelsData = await fetchDshModels();
          if (modelsData && Array.isArray(modelsData.models)) {
            setDshModels(modelsData.models);
          }
          if (modelsData && modelsData.currentRoute) {
            setModelRoute(modelsData.currentRoute);
          }
        } catch {}

        if (settingsScope && typeof settingsScope.getSnapshot === 'function') {
          try {
            const raw = settingsScope.getSnapshot()?.value || {};
            if (raw && Object.keys(raw).length > 0) {
              if (raw.enabled !== undefined) setEnabled(unwrapVolatile(raw.enabled) !== false);
              if (raw.source !== undefined) setSource(unwrapVolatile(raw.source) || 'dsh');
              if (raw.modelRoute !== undefined) setModelRoute(unwrapVolatile(raw.modelRoute) || 'auto');
              if (raw.customModel !== undefined) setCustomModel(unwrapVolatile(raw.customModel) || DEFAULT_MODEL);
              if (raw.apiUrl !== undefined) setApiUrl(unwrapVolatile(raw.apiUrl) || DEFAULT_API_URL);
              const keyVal = unwrapVolatile(raw.apiKey);
              if (typeof keyVal === 'string' && keyVal.trim()) {
                setHasApiKey(true);
              }
              if (raw.model !== undefined) setModel(unwrapVolatile(raw.model) || DEFAULT_MODEL);
              if (raw.autoEffort !== undefined) setAutoEffort(unwrapVolatile(raw.autoEffort) !== false);
              if (raw.defaultEffort !== undefined) setDefaultEffort(unwrapVolatile(raw.defaultEffort) || 'low');
              if (raw.autoOptimizeOnSend !== undefined) setAutoOptimizeOnSend(Boolean(unwrapVolatile(raw.autoOptimizeOnSend)));
              loaded = true;
            }
          } catch (e) {
            console.warn(`[${PLUGIN_ID}] settingsScope 读取失败:`, e);
          }
        }

        // 如果 settingsScope 暂无值，尝试回退从 HTTP 接口同步
        if (!loaded) {
          const fallback = await fetchConfigFallback();
          if (fallback) {
            if (fallback.enabled !== undefined) setEnabled(fallback.enabled);
            if (fallback.source) setSource(fallback.source);
            if (fallback.modelRoute) setModelRoute(fallback.modelRoute);
            if (fallback.customModel) setCustomModel(fallback.customModel);
            if (fallback.apiUrl) setApiUrl(fallback.apiUrl);
            if (fallback.hasApiKey) setHasApiKey(true);
            if (fallback.model) setModel(fallback.model);
            if (fallback.autoEffort !== undefined) setAutoEffort(fallback.autoEffort);
            if (fallback.defaultEffort) setDefaultEffort(fallback.defaultEffort);
            if (fallback.autoOptimizeOnSend !== undefined) setAutoOptimizeOnSend(fallback.autoOptimizeOnSend);
          }
        }
        setLoading(false);
      }, [settingsScope]);

      useEffect(() => {
        loadCurrentValues();
      }, [loadCurrentValues]);

      /** 保存配置 */
      const handleSave = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setSaving(true);
        setMsg('');
        setErr('');

        const patch = {
          enabled,
          source,
          modelRoute: modelRoute.trim(),
          customModel: customModel.trim(),
          apiUrl: apiUrl.trim(),
          model: modelRoute.trim(), // 保持向下兼容
          autoEffort,
          defaultEffort,
          autoOptimizeOnSend,
        };
        if (apiKey.trim()) {
          patch.apiKey = apiKey.trim();
        }

        try {
          let saved = false;
          // 优先通过 settingsScope 写入持久化文档（cordis.patch.yml）
          if (settingsScope && typeof settingsScope.set === 'function') {
            try {
              await settingsScope.set('enabled', patch.enabled);
              await settingsScope.set('source', patch.source);
              await settingsScope.set('modelRoute', patch.modelRoute);
              await settingsScope.set('model', patch.modelRoute);
              await settingsScope.set('customModel', patch.customModel);
              await settingsScope.set('apiUrl', patch.apiUrl);
              if (patch.apiKey) await settingsScope.set('apiKey', patch.apiKey);
              await settingsScope.set('autoEffort', patch.autoEffort);
              await settingsScope.set('defaultEffort', patch.defaultEffort);
              await settingsScope.set('autoOptimizeOnSend', patch.autoOptimizeOnSend);
              saved = true;
            } catch (err) {
              console.warn(`[${PLUGIN_ID}] settingsScope.set 失败，尝试回退路由保存:`, err);
            }
          }

          // 同步回退至 Host 内存
          await saveConfigFallback(patch);

          setMsg('✅ 配置已保存成功，即刻生效！');
          if (apiKey.trim()) {
            setHasApiKey(true);
            setApiKey('');
          }
        } catch (e) {
          setErr(`保存失败: ${e.message || String(e)}`);
        } finally {
          setSaving(false);
        }
      };

      /** 测试连接 */
      const handleTestConnection = async () => {
        setTesting(true);
        setMsg('');
        setErr('');
        const start = Date.now();
        try {
          const res = await callOptimizeApi('你好，测试连接', 'test', {
            source,
            modelRoute,
            apiUrl,
            apiKey,
            customModel,
          });
          const elapsed = Date.now() - start;
          setMsg(`⚡ 连接测试成功！耗时: ${elapsed}ms，复杂度判定: ${res.complexity || 'low'}`);
        } catch (e) {
          setErr(`测试连接失败: ${e.message || String(e)}`);
        } finally {
          setTesting(false);
        }
      };

      const inputStyle = {
        width: '100%',
        boxSizing: 'border-box',
        padding: '7px 10px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,133,143,0.35))',
        background: 'var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.2))',
        color: 'var(--dsw-alias-label-primary, inherit)',
        fontSize: '13px',
        marginTop: '5px',
        outline: 'none',
      };

      const labelStyle = {
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--dsw-alias-label-secondary, #999)',
        marginTop: '14px',
      };

      return React.createElement(
        'div',
        {
          style: {
            background: isModal ? 'var(--dsw-alias-bg-layer-2, rgba(24, 24, 28, 0.96))' : 'transparent',
            backdropFilter: isModal ? 'blur(20px)' : 'none',
            borderRadius: isModal ? '12px' : '8px',
            border: isModal ? '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1))' : 'none',
            boxShadow: isModal ? '0 20px 48px -8px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)' : 'none',
            padding: isModal ? '16px 18px' : '0',
            maxWidth: isModal ? '420px' : '100%',
            width: '100%',
            boxSizing: 'border-box',
            color: 'var(--dsw-alias-label-primary, inherit)',
            fontFamily: 'inherit',
          },
        },
        // 头部标题与状态徽章
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127,133,143,0.15))',
            },
          },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement(IconSparkles, {
              size: 15,
              style: { color: 'var(--dsw-alias-accent, #3b82f6)' },
            }),
            React.createElement(
              'h3',
              { style: { margin: 0, fontSize: '14px', fontWeight: 600, letterSpacing: '-0.2px' } },
              '提示词优化与思考强度',
            ),
            React.createElement(
              'span',
              {
                style: {
                  ...badgeStyle,
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontSize: '10.5px',
                  color: enabled ? '#30a46c' : '#7f858f',
                  borderColor: enabled ? 'rgba(48,164,108,0.35)' : 'rgba(127,133,143,0.25)',
                  background: enabled ? 'rgba(48,164,108,0.12)' : 'rgba(127,133,143,0.08)',
                },
              },
              enabled ? '运行中' : '已停用',
            ),
          ),
          isModal && onClose
            ? React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: onClose,
                  style: {
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--dsw-alias-label-secondary, #888)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  },
                },
                '✕',
              )
            : null,
        ),
        // 简介提示
        React.createElement(
          'div',
          {
            style: {
              fontSize: '12px',
              lineHeight: '1.5',
              color: 'var(--dsw-alias-label-secondary, #888)',
              marginBottom: '14px',
            },
          },
          '点击输入栏右侧优化按钮即可一键扩充为结构化 Prompt；发送时根据复杂度动态自适应思考档位，原生调节主模型思考强度，绝不篡改当前选择的模型。',
        ),
        loading
          ? React.createElement('div', { style: { padding: '24px 0', textAlign: 'center', opacity: 0.7 } }, '正在读取配置…')
          : React.createElement(
              'form',
              { onSubmit: handleSave },
              // 插件总开关
              React.createElement(
                'label',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.03))',
                    border: '1px solid var(--dsw-alias-border-l1, rgba(127,133,143,0.2))',
                  },
                },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: enabled,
                  onChange: (e) => setEnabled(e.target.checked),
                }),
                React.createElement(
                  'span',
                  { style: { color: 'var(--dsw-alias-label-primary, inherit)', fontWeight: 600, fontSize: '13px' } },
                  '启用提示词优化与思考强度自适应功能',
                ),
              ),
              // 模式切换：从 DSH 内部模型选择 VS 自定义外部接口
              React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.03))',
                    borderRadius: '8px',
                    padding: '3px',
                    border: '1px solid var(--dsw-alias-border-l1, rgba(127,133,143,0.2))',
                    marginTop: '12px',
                    marginBottom: '14px',
                    gap: '4px',
                  },
                },
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setSource('dsh'),
                    style: {
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: source === 'dsh' ? 600 : 400,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: source === 'dsh' ? 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.1))' : 'transparent',
                      color: source === 'dsh' ? 'var(--dsw-alias-label-primary, inherit)' : 'var(--dsw-alias-label-secondary, #888)',
                      transition: 'all 0.15s ease',
                      boxShadow: source === 'dsh' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    },
                  },
                  '✨ DSH 系统模型 (免密免填)',
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setSource('custom'),
                    style: {
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: source === 'custom' ? 600 : 400,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: source === 'custom' ? 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.1))' : 'transparent',
                      color: source === 'custom' ? 'var(--dsw-alias-label-primary, inherit)' : 'var(--dsw-alias-label-secondary, #888)',
                      transition: 'all 0.15s ease',
                      boxShadow: source === 'custom' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    },
                  },
                  '⚙️ 自定义外部 API (高级)',
                ),
              ),
              source === 'dsh'
                ? // DSH 内部已配置模型选择
                  React.createElement(
                    'div',
                    null,
                    React.createElement(
                      'label',
                      { style: labelStyle },
                      '优化所用模型 (已同步自 DSH 系统配置)',
                      React.createElement(
                        'select',
                        {
                          style: inputStyle,
                          value: modelRoute,
                          onChange: (e) => setModelRoute(e.target.value),
                        },
                        React.createElement('option', { value: 'auto' }, '✨ 自动选择 (推荐，优先高速低延迟模型)'),
                        dshModels.map((m) =>
                          React.createElement(
                            'option',
                            { key: m.key, value: m.key },
                            `${m.providerName} / ${m.modelName}`
                          )
                        ),
                      ),
                    ),
                    React.createElement(
                      'div',
                      {
                        style: {
                          fontSize: '11px',
                          color: 'var(--dsw-alias-label-secondary, #888)',
                          marginTop: '6px',
                          lineHeight: '1.4',
                        },
                      },
                      '💡 直接复用 DSH 系统设置中已配置的提供商与安全凭证，免填 API Key 与地址，支持硅基流动、Agnes、官方等所有已连通模型。',
                    ),
                  )
                : // 自定义外部 API 设置
                  React.createElement(
                    'div',
                    null,
                    React.createElement(
                      'label',
                      { style: labelStyle },
                      'API 接口地址 (OpenAI 兼容端点)',
                      React.createElement('input', {
                        type: 'text',
                        style: inputStyle,
                        value: apiUrl,
                        onChange: (e) => setApiUrl(e.target.value),
                        placeholder: DEFAULT_API_URL,
                      }),
                    ),
                    React.createElement(
                      'label',
                      { style: labelStyle },
                      `API Key ${hasApiKey ? '(已配置，留空则保持当前密钥)' : '(未配置)'}`,
                      React.createElement('input', {
                        type: 'password',
                        style: inputStyle,
                        value: apiKey,
                        onChange: (e) => setApiKey(e.target.value),
                        placeholder: hasApiKey ? '••••••••••••••••••••' : 'sk-...',
                      }),
                    ),
                    React.createElement(
                      'label',
                      { style: labelStyle },
                      '自定义模型名称',
                      React.createElement('input', {
                        type: 'text',
                        style: inputStyle,
                        value: customModel,
                        onChange: (e) => setCustomModel(e.target.value),
                        placeholder: DEFAULT_MODEL,
                      }),
                    ),
                  ),
              // 自动思考强度调节
              React.createElement(
                'div',
                { style: { display: 'flex', gap: '16px', marginTop: '16px' } },
                React.createElement(
                  'label',
                  { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: autoEffort,
                    onChange: (e) => setAutoEffort(e.target.checked),
                  }),
                  React.createElement('span', null, '自动调节主模型思考强度 (基于复杂度智能匹配)'),
                ),
              ),
              // 默认/兜底思考强度
              React.createElement(
                'label',
                { style: labelStyle },
                '默认 / 兜底思考强度档位',
                React.createElement(
                  'select',
                  {
                    style: inputStyle,
                    value: defaultEffort,
                    onChange: (e) => setDefaultEffort(e.target.value),
                  },
                  EFFORTS.map((ef) =>
                    React.createElement('option', { key: ef, value: ef }, ef.toUpperCase()),
                  ),
                ),
              ),
              // 提示与错误信息
              msg
                ? React.createElement('div', { style: { marginTop: '12px', color: '#30a46c', fontSize: '13px', fontWeight: 500 } }, msg)
                : null,
              err
                ? React.createElement('div', { style: { marginTop: '12px', color: '#e5484d', fontSize: '13px' } }, err)
                : null,
              // 操作按钮栏
              React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '20px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--dsw-alias-border-l1, rgba(127,133,143,0.15))',
                  },
                },
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    onClick: handleTestConnection,
                    disabled: testing,
                    style: {
                      ...baseButton,
                      opacity: testing ? 0.6 : 1,
                    },
                  },
                  testing ? '测试中…' : '🔌 测试连接',
                ),
                React.createElement(
                  'div',
                  { style: { display: 'flex', gap: '8px' } },
                  React.createElement(
                    'button',
                    {
                      type: 'submit',
                      disabled: saving,
                      style: {
                        ...baseButton,
                        background: 'var(--dsw-alias-accent, #3366ff)',
                        color: '#fff',
                        border: 'none',
                        padding: '0 16px',
                        fontWeight: 500,
                        opacity: saving ? 0.6 : 1,
                      },
                    },
                    saving ? '保存中…' : '💾 保存配置',
                  ),
                ),
              ),
            ),
      );
    }

    /**
     * 插件管理中心原生配置卡片插槽组件
     * 挂载在 plugins.bundle.config (key: dsh-prompt-optimizer)
     */
    function BundleConfigCard(props) {
      return React.createElement(
        'div',
        {
          style: {
            padding: '20px',
            border: '1px solid var(--dsw-alias-border-l1, rgba(127,133,143,0.25))',
            borderRadius: '10px',
            background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.02))',
            margin: '12px 0',
          },
        },
        React.createElement(SettingsPanel, {
          settingsScope: props?.settingsScope,
          isModal: false,
          view: props?.view,
        }),
      );
    }

    /**
     * 会话输入栏右侧的组合控件（优化按钮 + 齿轮弹窗）
     * 挂载在 conversation.input.right
     */
    function ComposerControl(props) {
      const { useInput, inputActions, sessionId, settingsScope } = props || {};
      const [loading, setLoading] = useState(false);
      const [effort, setEffort] = useState(null);
      const [error, setError] = useState(null);
      const [showModal, setShowModal] = useState(false);

      // 确保动效微样式注入
      useEffect(() => {
        ensureStyles();
      }, []);

      // 监听 Escape 按键关闭弹窗
      useEffect(() => {
        if (!showModal) return;
        const handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            setShowModal(false);
          }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
      }, [showModal]);

      const hasInput = typeof useInput === 'function';
      const draft = hasInput
        ? useInput((state) => (state && typeof state.draft === 'string' ? state.draft : ''))
        : '';
      const text = typeof draft === 'string' ? draft.trim() : '';
      const canWrite = Boolean(inputActions) && typeof inputActions.setDraft === 'function';

      const handleOptimize = useCallback(async () => {
        if (!text || loading || !canWrite) return;
        setLoading(true);
        setError(null);
        try {
          const res = await callOptimizeApi(text, sessionId || 'global');
          if (res && res.optimized && canWrite) {
            inputActions.setDraft(res.optimized);
            setEffort(res.complexity || null);
          }
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          setError(msg);
          console.warn(`[${PLUGIN_ID}] 优化失败:`, err);
        } finally {
          setLoading(false);
        }
      }, [text, loading, canWrite, inputActions, sessionId]);

      // 模态弹窗 Portal 内容
      const modalPortal =
        showModal && typeof document !== 'undefined' && document.body
          ? ReactDOM.createPortal(
              React.createElement(
                'div',
                {
                  className: 'dsh-po-backdrop',
                  onClick: (e) => {
                    // 点击遮罩层关闭
                    if (e.target === e.currentTarget) {
                      setShowModal(false);
                    }
                  },
                },
                React.createElement(
                  'div',
                  {
                    className: 'dsh-po-modal-container',
                    onClick: (e) => e.stopPropagation(),
                  },
                  React.createElement(SettingsPanel, {
                    settingsScope,
                    isModal: true,
                    onClose: () => setShowModal(false),
                  })
                )
              ),
              document.body
            )
          : null;

      return React.createElement(
        'div',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            position: 'relative',
          },
        },
        // 极简微胶囊控件组
        React.createElement(
          'div',
          { className: 'dsh-po-capsule' },
          // 优化按钮
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleOptimize,
              disabled: !text || loading || !canWrite,
              title: text
                ? '点击一键优化扩充提示词，并判定复杂度'
                : '在输入框键入提示词后即可一键优化',
              className: `dsh-po-btn-opt${text ? ' active-text' : ''}`,
            },
            loading
              ? React.createElement(IconSpinner, { size: 12.5 })
              : React.createElement(IconSparkles, {
                  size: 12.5,
                  style: {
                    color: text ? 'var(--dsw-alias-accent, #3b82f6)' : 'currentColor',
                  },
                }),
            React.createElement('span', null, loading ? '优化中' : '优化'),
            effort
              ? React.createElement(
                  'span',
                  {
                    style: {
                      fontSize: '9.5px',
                      padding: '1px 4px',
                      borderRadius: '3px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: 'var(--dsw-alias-accent, #3b82f6)',
                      lineHeight: 1,
                      marginLeft: '2px',
                    },
                  },
                  effort,
                )
              : null,
          ),
          // 微分割线
          React.createElement('div', { className: 'dsh-po-divider' }),
          // 设置齿轮按钮
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowModal((v) => !v);
              },
              onMouseDown: (e) => {
                // 阻止事件穿透以防止编辑器抢焦点造成失焦
                e.stopPropagation();
              },
              title: '提示词优化与思考强度设置',
              className: `dsh-po-btn-gear${showModal ? ' open' : ''}`,
            },
            React.createElement(IconGear, { size: 12.5 }),
          ),
        ),
        // 挂载到 body 的 Portal 居中弹窗
        modalPortal,
      );
    }

    /** Cordis Client 生命周期 apply */
    function apply(ctx) {
      try {
        const slots = ctx.slots || (ctx.reflect && ctx.reflect.get('slots'));
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
          return;
        }

        // 绑定 configForms settingsScope
        let settingsScope = void 0;
        try {
          const forms = ctx.configForms || (ctx.reflect && ctx.reflect.get('configForms'));
          if (forms !== void 0) {
            let ns = PLUGIN_ID;
            try {
              const served = (forms.describe?.().getSnapshot?.()?.view?.namespaces ?? []).find(
                (entry) => entry.ns === PLUGIN_ID || /prompt-optimizer/i.test(entry.ns)
              );
              if (served !== void 0) ns = served.ns;
            } catch {}
            settingsScope = forms.get?.(ns);
          }
        } catch (err) {
          console.warn(`[${PLUGIN_ID}] configForms 初始化失败:`, err);
        }

        // 1. 注册输入框右侧工具栏按钮及设置弹窗
        slots.inject(SLOT_INPUT, () =>
          slots.register(
            {
              name: SLOT_INPUT,
              id: PLUGIN_ID,
              order: -10,
              label: '提示词优化',
              inject: () => ({ settingsScope }),
            },
            ComposerControl,
          ),
        );

        // 2. 注册插件管理中心详情页的原生配置卡片（对应 key: dsh-prompt-optimizer）
        slots.inject(SLOT_BUNDLE_CONFIG, () =>
          slots.register(
            {
              name: SLOT_BUNDLE_CONFIG,
              key: PLUGIN_ID,
              priority: 30,
              inject: () => ({ settingsScope }),
            },
            BundleConfigCard,
          ),
        );

        // 3. 注册单行插件配置（plugins.row.config）
        slots.inject(SLOT_ROW_CONFIG, () =>
          slots.register(
            {
              name: SLOT_ROW_CONFIG,
              key: `${PLUGIN_ID}#${PLUGIN_ID}`,
              priority: 30,
              inject: () => ({ settingsScope }),
            },
            BundleConfigCard,
          ),
        );
      } catch (err) {
        try {
          console.error(`[${PLUGIN_ID}] 槽位注册异常: ${err && err.message ? err.message : String(err)}`);
        } catch {
          /* ignore */
        }
      }
    }

    exports.name = PLUGIN_ID;
    exports.inject = ['slots'];
    exports.apply = apply;
    return exports;
  },
});
