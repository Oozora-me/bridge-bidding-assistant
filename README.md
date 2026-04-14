# ♠ 桥牌叫牌助手 (Bridge Bidding Assistant)

基于 Vue 3 + Express + TypeScript 的智能桥牌叫牌助手，集成智谱 AI (GLM-4-Flash) 提供牌型分析、叫牌进程分析和叫牌建议功能。

## 功能特性

- **牌型分析** — 输入手牌，AI 给出开叫建议及理由
- **叫牌进程分析** — 记录叫牌序列，AI 评估叫牌进程
- **叫牌建议** — 结合手牌和当前叫牌进程，推荐下一步叫品
- **多体系支持** — NS/EW 独立选择叫牌体系（自然二盖一 / 精确叫牌）
- **约定叫配置** — 内置常用约定叫（斯台曼、雅各比转移、黑木问叫等），可开关
- **方位选择** — 支持设置开叫人（北/东/南/西）
- **结构化输出** — AI 结果按 📌结论 / 🃏牌力 / 💡理由 / 📋后续 四维度展示

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite |
| 后端 | Express + TypeScript |
| AI | 智谱 GLM-4-Flash API |
| 构建 | npm workspaces (monorepo) |

## 项目结构

```
bridge-bidding-assistant/
├── packages/
│   ├── backend/                  # 后端服务
│   │   ├── src/
│   │   │   ├── index.ts          # Express 入口，速率限制中间件
│   │   │   ├── config/
│   │   │   │   └── bidding.ts    # 叫牌体系配置（规则/约定叫）
│   │   │   ├── prompts/
│   │   │   │   └── bridge.ts     # AI 提示词模板
│   │   │   ├── routes/
│   │   │   │   └── api.ts        # API 路由
│   │   │   └── services/
│   │   │       ├── logger.ts     # 日志服务（可配置等级/输出）
│   │   │       └── zhipu.ts      # 智谱 AI 客户端
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/                 # 前端应用
│       ├── src/
│       │   ├── main.ts           # Vue 入口
│       │   ├── App.vue           # 主布局（左右分栏）
│       │   ├── api/
│       │   │   └── bridge.ts     # API 调用封装
│       │   ├── components/
│       │   │   ├── HandInput.vue       # 手牌输入
│       │   │   ├── BiddingPad.vue      # 叫牌面板
│       │   │   ├── BiddingSequence.vue # 叫牌序列
│       │   │   ├── AnalysisResult.vue  # 分析结果展示
│       │   │   └── SystemSelector.vue  # 体系选择器
│       │   ├── composables/
│       │   │   └── useBridge.ts  # 桥牌逻辑（HCP计算/发牌等）
│       │   └── styles/
│       │       └── main.css      # 全局样式
│       ├── package.json
│       └── tsconfig.json
├── package.json                  # 根配置（workspaces）
├── .gitignore
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

### 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# 智谱 AI API Key（必填）
ZHIPU_API_KEY=your_api_key_here

# 服务端口（可选，默认 3001）
PORT=3001

# 速率限制（可选，默认 10 次/分钟）
RATE_LIMIT_PER_MINUTE=10

# 日志配置（可选）
LOG_LEVEL=info          # debug | info | warn | error
LOG_CONSOLE=true        # 是否控制台输出，默认 true
LOG_DIR=./logs          # 日志文件目录，默认 ./logs
```

### 启动开发服务

```bash
# 同时启动前端和后端
npm run dev

# 或分别启动
npm run dev:backend     # 后端 http://localhost:3001
npm run dev:frontend    # 前端 http://localhost:5173
```

### 生产构建

```bash
npm run build
npm run start           # 启动后端服务
```

## API 接口

### POST /api/analyze-hand — 分析牌型

```json
{
  "hand": { "spades": "AKQJ", "hearts": "5432", "diamonds": "A3", "clubs": "K2" },
  "nsSystem": "natural-2over1",
  "ewSystem": "natural-2over1"
}
```

### POST /api/analyze-bidding — 分析叫牌进程

```json
{
  "biddingSequence": [
    { "player": "N", "bid": "1♠" },
    { "player": "E", "bid": "Pass" },
    { "player": "S", "bid": "2♥" },
    { "player": "W", "bid": "Pass" }
  ],
  "dealer": "N",
  "nsSystem": "natural-2over1",
  "ewSystem": "precision"
}
```

### POST /api/suggest-bid — 叫牌建议

```json
{
  "hand": { "spades": "AKQJ", "hearts": "5432", "diamonds": "A3", "clubs": "K2" },
  "biddingSequence": [
    { "player": "N", "bid": "1♠" },
    { "player": "E", "bid": "Pass" }
  ],
  "position": "S",
  "nsSystem": "natural-2over1",
  "ewSystem": "natural-2over1"
}
```

## 叫牌体系

### 自然二盖一体系 (Natural 2/1 GF)

- 1NT: 15-17 HCP，均型
- 2NT: 20-21 HCP，均型
- 5张高花优先开叫
- 二盖一应叫逼叫到局

### 精确叫牌体系 (Precision)

- 1♣: 16+ HCP，强逼叫
- 1♦/1♥/1♠: 11-15 HCP
- 1NT: 13-15 HCP，均型

### 内置约定叫

斯台曼问叫、雅各比转移、黑木问叫、格伯问叫、扣叫、负加倍、支持性加倍、新低花逼叫、第四花色逼叫等。

## 日志系统

日志按日期分文件存储在 `logs/` 目录下，支持通过环境变量配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_LEVEL` | 输出等级 (debug/info/warn/error) | `info` |
| `LOG_CONSOLE` | 是否同时输出到控制台 | `true` |
| `LOG_DIR` | 日志文件存储目录 | `./logs` |

## License

MIT
