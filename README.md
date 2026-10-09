# DSH-prompt-optimizer

> DeepSeek Harness 提示词智能优化与思考强度自适应插件

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: DeepSeek Harness](https://img.shields.io/badge/Platform-DeepSeek%20Harness-blueviolet.svg)](https://github.com/deepseek-ai)

---

## 🌟 核心特性

1. **🔒 绝对主模型控制权**：
   * 无论如何优化，**用户在 DSH 选中的主力模型（Provider / Model）100% 保持不变**，坚决不越权替换底层会话模型。
2. **🔄 灵活双模型来源 (DSH 原生配置 / 自定义第三方)**：
   * **DSH 已配置模型（免密免填，首推）**：直接读取 DSH 中已绑定的服务商与模型（如 SiliconFlow、Agnes、DeepSeek 官方等），用户无需再次输入 API Key 或 Base URL，在下拉列表中点选即可！
   * **自定义第三方模型**：自由填入任意 OpenAI 兼容端点（如自建 vLLM、Ollama、OneAPI 等）及自定义 Key。
3. **⚡ 轻量极速提示词重构**：
   * 借助高速优化模型（如 `Qwen/Qwen3-30B-A3B-Instruct-2507`、`deepseek-ai/DeepSeek-V3`、`agnes-2.5-flash` 等），一键将简略口语草稿扩充为高质量、结构化的专业级 Prompt。
4. **🧠 思考强度动态自适应 (Auto Reasoning Effort)**：
   * 结合用户意图与任务复杂度分析，动态将主模型的思考强度自适应设置为 `low` / `medium` / `high` / `max`，省时省算力。
5. **🎨 极简精致交互 (Composer Capsule)**：
   * 在 DSH 会话输入框右侧内嵌精致胶囊控制条：SVG 极简矢量「✨ 优化」按钮与「⚙️ 快速设置」齿轮。
   * 支持一键弹窗即时切换模型来源、选配模型与调试连接，无需跳转设置页即可全局配置。
6. **🎛️ 完整图形化配置界面**：
   * 在 DSH **插件管理 -> dsh-prompt-optimizer 详情页** 拥有原生配置面板；
   * 支持在线配置与修改 API 接口地址、API Key、模型来源、思考强度自适应开关、默认思考档位等；
   * 包含一键「🔌 测试连接」功能，实时检测连通性与响应耗时。
   * 配置通过 DSH 原生 `configForms` 实时持久化至 profile 的 `cordis.patch.yml`，修改即刻生效，无需重启。

---

## 📸 界面效果

* **会话输入框**：输入简略提问，点击右侧 `✨ 优化提示词` 按钮，自动将内容扩充重构为结构清晰的专业 Prompt，并显示匹配的复杂度徽标（如 `low` / `medium` / `high` / `max`）。
* **插件详情页**：点击 DSH 侧边栏 `插件` -> 找到 `dsh-prompt-optimizer` -> 打开详情页，即可看到完整的图形化配置表单。

---

## ⚙️ 配置说明

### 方式一：输入框右侧胶囊弹窗（随时就地配置）

在会话输入框右侧的胶囊组件中点击 `⚙️` 齿轮按钮，即可呼出毛玻璃快捷配置面板，支持随时切换模型来源（DSH 已配置模型 / 自定义第三方）并测试连通性，保存后全量生效。

### 方式二：DSH 图形化界面

1. 打开 DeepSeek Harness 客户端，点击侧边栏 **插件**。
2. 找到 **dsh-prompt-optimizer**，点击进入详情页。
3. 在详情页内可直接配置：
   * **启用开关**：开启或暂停插件功能；
   * **模型来源**：
     * **从 DSH 已配置模型选择（免密免填，首推）**：自动载入 DSH 已配置的 SiliconFlow、Agnes 等服务商模型；
     * **自定义第三方 OpenAI 兼容 API**：自定义填入任何 OpenAI 格式端点（如 `https://api.siliconflow.cn/v1`，或本地 Ollama / vLLM）和 Key；
   * **自动调节主模型思考强度**：勾选后根据意图复杂度动态设定思考档位；
   * **默认/兜底思考强度**：可选 `low` / `medium` / `high` / `max`。
4. 点击 **🔌 测试连接** 验证配置，点击 **💾 保存配置** 即刻生效。

### 方式三：配置文件 `cordis.patch.yml`

在你的 profile `cordis.patch.yml` 中配置：

```yaml
- id: dsh-prompt-optimizer
  name: 'dsh-prompt-optimizer'
  config:
    enabled: true
    source: dsh  # 或 custom
    modelRoute: siliconflow/Qwen/Qwen3-30B-A3B-Instruct-2507
    autoEffort: true
    defaultEffort: low
    autoOptimizeOnSend: false
```

---

## 🚀 模型选型与实测耗时参考

| 模型名称 | 服务商 | 实测耗时 | 推荐场景 |
| :--- | :--- | :--- | :--- |
| `Qwen/Qwen3-30B-A3B-Instruct-2507` | SiliconFlow (免费/极速) | **3.8s** | ⚡ **强烈推荐（默认）**：提示词优化质量高、响应最快 |
| `deepseek-ai/DeepSeek-V3` | SiliconFlow | **4.6s** | 结构化推理能力优秀，通用表达佳 |
| `THUDM/glm-4-9b-chat` | SiliconFlow | **4.1s** | 轻量快速，中文语感自然 |
| `deepseek-ai/DeepSeek-V3.2` | SiliconFlow | 22.5s | 偏慢，适合离线长文优化 |

---

## 🛠️ 项目结构

```text
DSH-prompt-optimizer/
├── cordis.patch.yml        # Cordis 宿主包挂载清单
├── package.json            # 插件清单与 Client 注入声明
├── README.md               # 项目使用文档
├── LICENSE                 # MIT 开源协议
└── lib/
    ├── index.js            # Host 宿主端（同源 HTTP 路由 + 请求拦截与思考强度适配）
    └── client.js           # Client 浏览器端（输入框魔棒按钮 + 插件详情页原生配置面板）
```

---

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源。
