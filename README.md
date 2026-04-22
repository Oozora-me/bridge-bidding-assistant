# ♠ 桥牌叫牌助手 (Bridge Bidding Assistant)

基于 Vue 3 + Express + TypeScript 的智能桥牌叫牌助手，集成多个 AI 模型提供商提供牌型分析、叫牌进程分析和叫牌建议功能。

## 功能特性

- **牌型分析** — 输入手牌，AI 给出开叫建议及理由
- **叫牌进程分析** — 记录叫牌序列，AI 评估叫牌进程
- **叫牌建议** — 结合手牌和当前叫牌进程，推荐下一步叫品
- **多体系支持** — NS/EW 独立选择叫牌体系（自然二盖一 / 精确叫牌）
- **完整体系文档** — 内置自然 2/1 GF 和精确叫牌体系的详细规则说明，作为 AI 提示词基础
- **约定叫配置** — 内置常用约定叫（斯台曼、雅各比转移、黑木问叫等），可开关
- **体系说明查看** — 点击体系选择器旁的 📖 按钮查看完整规则文档
- **多模型提供商** — 支持智谱AI、DeepSeek、GitHub Models，前端可切换
- **用量监控** — 点击 📊 按钮查看各模型的今日用量、限额和剩余次数
- **多维度限速** — 按分钟（per-IP）、每日（全局）、并发数（全局）三维限速
- **方位选择** — 支持设置开叫人（北/东/南/西）
- **结构化输出** — AI 结果按 📌结论 / 🃏牌力 / 💡理由 / 📋后续 四维度展示
- **移动端适配** — 响应式布局，支持手机/平板访问

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite |
| 后端 | Express + TypeScript |
| AI | 智谱AI / DeepSeek / GitHub Models（多提供商） |
| 构建 | npm workspaces (monorepo) |

## 项目结构

```
bridge-bidding-assistant/
├── packages/
│   ├── backend/                  # 后端服务
│   │   ├── config/
│   │   │   ├── providers.json.example # Provider 配置模板（复制为 providers.json 并填入 Key）
│   │   │   └── providers.json         # Provider 统一配置（含 API Key，已在 .gitignore 中排除）
│   │   ├── src/
│   │   │   ├── index.ts          # Express 入口
│   │   │   ├── config/
│   │   │   │   ├── bidding.ts    # 叫牌体系配置（规则/约定叫）
│   │   │   │   ├── systemDocs.ts # 体系文档加载模块
│   │   │   │   └── providersConfig.ts # Provider 配置管理
│   │   │   ├── prompts/
│   │   │   │   └── bridge.ts     # AI 提示词模板
│   │   │   ├── routes/
│   │   │   │   └── api.ts        # API 路由
│   │   │   └── services/
│   │   │       ├── logger.ts     # 日志服务
│   │   │       ├── usageTracker.ts # 用量追踪
│   │   │       └── providers/
│   │   │           ├── zhipu.ts   # 智谱 AI 客户端
│   │   │           ├── deepseek.ts # DeepSeek 客户端
│   │   │           ├── github.ts  # GitHub Models 客户端
│   │   │           ├── registry.ts # Provider 注册表
│   │   │           └── types.ts   # Provider 接口定义
│   │   └── ...
│   └── frontend/                 # 前端应用
│       ├── src/
│       │   ├── App.vue           # 主布局
│       │   ├── api/
│       │   │   └── bridge.ts     # API 调用封装
│       │   └── components/
│       │       ├── HandInput.vue       # 手牌输入
│       │       ├── BiddingPad.vue      # 叫牌面板
│       │       ├── BiddingSequence.vue # 叫牌序列
│       │       ├── AnalysisResult.vue  # 分析结果展示
│       │       ├── SystemSelector.vue  # 体系选择器
│       │       ├── SystemDocModal.vue  # 体系说明弹窗
│       │       └── UsageModal.vue      # 用量查看弹窗
│       └── ...
├── docs/                         # 文档
│   ├── bidding-systems/           # 体系规则文档（单一数据源）
│   │   ├── 2-1-GF-System.md      # 自然 2/1 GF 体系
│   │   └── Precision-System.md   # 精确叫牌体系
│   ├── problems/                 # 问题分析报告
│   │   └── ai-response-quality-analysis.md
│   └── model_evaluation_reports/ # AI 模型评估报告
│       ├── opening_bid/          # 开叫评估
│       ├── bidding_analysis/     # 叫牌进程分析评估
│       └── bid_suggestion/       # 叫牌建议评估
├── scripts/
│   ├── evaluation/               # AI 模型评估框架
│   │   ├── config.ts             # 共享配置和类型
│   │   ├── run.ts                # 评估运行器（支持按维度运行）
│   │   └── cases/                # 测试用例
│   │       ├── opening_bid.ts    # 开叫场景（10 个）
│   │       ├── bidding_analysis.ts # 叫牌进程分析场景（8 个）
│   │       └── bid_suggestion.ts # 叫牌建议场景（8 个）
│   └── build.mjs                 # 构建脚本
├── package.json
└── README.md
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 配置 Provider

```bash
# 复制配置模板
cp packages/backend/config/providers.json.example packages/backend/config/providers.json
```

编辑 `providers.json`，填入 API Key 并启用需要的提供商。配置模板中包含所有支持的模型及注释说明。

**API Key 获取**：
- 智谱AI：https://open.bigmodel.cn
- DeepSeek：https://platform.deepseek.com
- GitHub Models：GitHub → Settings → Developer settings → Personal access tokens（需 `models:read` 权限）

### 启动开发服务

```bash
npm run dev
# 后端 http://localhost:10240
# 前端 http://localhost:10000/bridge-bidding-assistant/
```

### 生产构建

```bash
npm run build:dist
# 产物：dist/backend/、dist/frontend/、dist/backend.zip、dist/frontend.zip
```

## API 接口

所有接口前缀：`/bridge-bidding-assistant-server/api`

### 业务接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analyze-hand` | 分析牌型 |
| POST | `/api/analyze-bidding` | 分析叫牌进程 |
| POST | `/api/suggest-bid` | 叫牌建议 |

### 管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 获取可用模型列表 |
| GET | `/api/providers/config` | 获取 Provider 配置（Key 脱敏） |
| PUT | `/api/providers/config/:providerId` | 更新 Provider 配置 |
| GET | `/api/usage` | 获取所有模型用量情况 |
| GET | `/api/system-docs` | 获取体系文档列表 |
| GET | `/api/system-docs/:systemId` | 获取指定体系文档 |

## Provider 配置说明

`config/providers.json` 中每个模型支持以下限速参数：

| 参数 | 说明 | 维度 |
|------|------|------|
| `maxConcurrency` | 最大并发请求数 | 全局 |
| `defaultRateLimit` | 每分钟最大请求数 | Per-IP |
| `dailyLimit` | 每日最大请求数（不设置则不限） | 全局 |

## 叫牌体系

### 自然二盖一体系 (Natural 2/1 GF)

完整规则文档见 [docs/bidding-systems/2-1-GF-System.md](docs/bidding-systems/2-1-GF-System.md)

### 精确叫牌体系 (Precision)

完整规则文档见 [docs/bidding-systems/Precision-System.md](docs/bidding-systems/Precision-System.md)

### 添加新体系

1. 在 `docs/bidding-systems/` 中新增 Markdown 文件
2. 在 `config/systemDocs.ts` 的 `initSystemDocs()` 中注册
3. 在 `config/bidding.ts` 中添加体系配置和约定叫

## 日志系统

日志按日期分文件存储在 `logs/` 目录下：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_LEVEL` | 输出等级 (debug/info/warn/error) | `info` |
| `LOG_CONSOLE` | 是否同时输出到控制台 | `true` |
| `LOG_DIR` | 日志文件存储目录 | `./logs` |

查看完整的 AI 请求/响应体：

```bash
LOG_LEVEL=0 npm run dev
```

## AI 模型评估

项目内置评估框架，可对 AI 模型的桥牌分析能力进行自动化测试和多模型对比。

### 评估维度

| 维度 | API | 用例数 | 说明 |
|------|-----|--------|------|
| 开叫评估 | `/api/analyze-hand` | 10 | 根据手牌判断正确开叫 |
| 叫牌进程分析 | `/api/analyze-bidding` | 8 | 分析已有叫牌序列的含义 |
| 叫牌建议 | `/api/suggest-bid` | 8 | 结合手牌和进程推荐下一步叫品 |

### 运行评估

```bash
# 运行全部维度
npx tsx scripts/evaluation/run.ts

# 只运行某个维度
npx tsx scripts/evaluation/run.ts opening_bid
npx tsx scripts/evaluation/run.ts bidding_analysis
npx tsx scripts/evaluation/run.ts bid_suggestion
```

评估结果输出到 `docs/model_evaluation_reports/{维度}/` 目录，包含 Markdown 报告和 JSON 原始数据。

### 自定义测试

- 编辑 `scripts/evaluation/config.ts` 中的 `MODELS_TO_TEST` 配置要测试的模型
- 编辑 `scripts/evaluation/cases/` 下的用例文件添加新场景

## License

MIT
