/**
 * 桥牌叫牌助手 - AI 模型评估测试脚本
 *
 * 功能：
 * 1. 可配置各种牌型、模型供应商、模型
 * 2. 调用后端 AI 分析接口
 * 3. 汇总分析结果，生成 Markdown 评估报告
 *
 * 用法：
 *   npx tsx scripts/test-model-eval.ts
 *   BASE_URL=http://localhost:10240 npx tsx scripts/test-model-eval.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 配置区
// ============================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:10240';
const API_PREFIX = `${BASE_URL}/bridge-bidding-assistant-server/api`;
const REPORT_DIR = path.resolve('/sessions/69e6d1fa41619118b795ef9e/workspace/docs/model_evaluation_reports');

/** 测试用牌型定义 */
interface TestCase {
  id: string;
  name: string;
  description: string;
  hand: {
    spades: string;
    hearts: string;
    diamonds: string;
    clubs: string;
    position?: string;
    vulnerability?: string;
  };
  system?: string;
  /** 实际 HCP（用于验证模型是否算对） */
  actualHCP: number;
  /** 期望的正确开叫（用于评估） */
  expectedBid?: string;
  /** 期望的关键分析要点（用于评估） */
  expectedPoints?: string[];
}

/** 模型配置 */
interface ModelConfig {
  key: string;              // providerId:modelId
  provider: string;
  model: string;
  requestIntervalMs?: number;
}

/** 单次测试结果 */
interface TestResult {
  testCaseId: string;
  testCaseName: string;
  modelKey: string;
  success: boolean;
  content: string;
  usage?: Record<string, number>;
  model?: string;
  error?: string;
  latencyMs: number;
  evaluation?: {
    bidMatch: boolean;
    hcpCorrect: boolean;     // 模型报告的 HCP 是否与实际一致
    hcpMentioned: number;    // 模型提到的 HCP 数值
    pointMatch: number;
    formatScore: number;
    hasConclusion: boolean;
    hasHCP: boolean;
    hasReasoning: boolean;
    hasFollowUp: boolean;
    wordCount: number;
    notes: string[];
  };
}

// ============================================================
// 典型测试用例（6 个精选场景）
// ============================================================

const TEST_CASES: TestCase[] = [
  {
    id: 'TC01',
    name: '强1NT开叫',
    description: '15HCP, 4-3-3-3均型，经典1NT开叫',
    hand: { spades: 'AK43', hearts: 'KQ2', diamonds: 'J75', clubs: 'A62', position: 'N', vulnerability: 'None' },
    system: 'natural-2over1',
    actualHCP: 15,
    expectedBid: '1NT',
    expectedPoints: ['15', '均型'],
  },
  {
    id: 'TC02',
    name: '1♠高花开叫',
    description: '12HCP, 5张黑桃，标准1♠开叫',
    hand: { spades: 'AKJ75', hearts: 'Q43', diamonds: '852', clubs: 'K4', position: 'N', vulnerability: 'None' },
    system: 'natural-2over1',
    actualHCP: 12,
    expectedBid: '1♠',
    expectedPoints: ['12', '5张黑桃'],
  },
  {
    id: 'TC03',
    name: '2♣强开叫',
    description: '22HCP, 超强牌力，2♣人为强开叫',
    hand: { spades: 'AKQ', hearts: 'AKJ', diamonds: 'AKQ54', clubs: 'A3', position: 'N', vulnerability: 'None' },
    system: 'natural-2over1',
    actualHCP: 22,
    expectedBid: '2♣',
    expectedPoints: ['22', '强'],
  },
  {
    id: 'TC04',
    name: '弱二阻击',
    description: '6HCP, 6张黑桃，弱二♠阻击开叫',
    hand: { spades: 'QJ10875', hearts: '843', diamonds: 'K2', clubs: '95', position: 'W', vulnerability: 'None' },
    system: 'natural-2over1',
    actualHCP: 6,
    expectedBid: '2♠',
    expectedPoints: ['弱二', '阻击', '6张'],
  },
  {
    id: 'TC05',
    name: '极弱牌 Pass',
    description: '5HCP, 4-4-3-2型，不够开叫',
    hand: { spades: 'J753', hearts: 'Q862', diamonds: '954', clubs: '83', position: 'N', vulnerability: 'None' },
    system: 'natural-2over1',
    actualHCP: 5,
    expectedBid: 'Pass',
    expectedPoints: ['5', '不够', 'Pass'],
  },
  {
    id: 'TC06',
    name: '精确1♣强开叫',
    description: '16HCP, 精确体系中1♣强开叫',
    hand: { spades: 'AK5', hearts: 'KQ4', diamonds: 'AJ8', clubs: 'K73', position: 'N', vulnerability: 'None' },
    system: 'precision',
    actualHCP: 16,
    expectedBid: '1♣',
    expectedPoints: ['16', '强', '精确'],
  },
];

// ============================================================
// 要测试的模型列表
// ============================================================

const MODELS_TO_TEST: ModelConfig[] = [
  { key: 'zhipu:GLM-4-Flash', provider: 'zhipu', model: 'GLM-4-Flash', requestIntervalMs: 2000 },
  { key: 'zhipu:GLM-4.7-Flash', provider: 'zhipu', model: 'GLM-4.7-Flash', requestIntervalMs: 65000 },
];

// ============================================================
// 核心测试逻辑
// ============================================================

async function callAnalyzeHand(testCase: TestCase, modelKey: string): Promise<{
  success: boolean;
  content?: string;
  usage?: Record<string, number>;
  model?: string;
  error?: string;
  latencyMs: number;
}> {
  const startTime = Date.now();
  try {
    const response = await axios.post(`${API_PREFIX}/analyze-hand`, {
      hand: testCase.hand,
      system: testCase.system || 'natural-2over1',
      model: modelKey,
      stream: false,
    }, {
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
    });

    const latencyMs = Date.now() - startTime;

    if (response.data?.success) {
      return {
        success: true,
        content: response.data.data.content,
        usage: response.data.data.usage,
        model: response.data.data.model,
        latencyMs,
      };
    } else {
      return {
        success: false,
        error: response.data?.error || '未知错误',
        latencyMs,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '请求失败',
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * 从模型回答中提取 HCP 数值
 */
function extractHCP(content: string): number | null {
  // 匹配各种 HCP 表述：15 HCP, 15点, 15HCP, 大牌点15, HCP：15 等
  const patterns = [
    /(\d+)\s*HCP/i,
    /HCP[：:\s]*(\d+)/i,
    /大牌点[：:\s]*(\d+)/i,
    /高牌点[：:\s]*(\d+)/i,
    /(\d+)\s*点(?:力)?(?:，|。|,|\.|\s)/,
    /(\d+)\s*大牌点/,
  ];
  for (const pat of patterns) {
    const m = content.match(pat);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function evaluateResponse(testCase: TestCase, content: string): TestResult['evaluation'] {
  const notes: string[] = [];
  let score = 0;

  // 1. 开叫匹配
  const bidMatch = testCase.expectedBid
    ? content.includes(testCase.expectedBid)
    : true;
  if (bidMatch) {
    score += 3;
  } else {
    notes.push(`未提到期望开叫 "${testCase.expectedBid}"`);
  }

  // 2. HCP 准确性
  const hcpMentioned = extractHCP(content);
  const hcpCorrect = hcpMentioned !== null && hcpMentioned === testCase.actualHCP;
  if (hcpCorrect) {
    score += 3;
  } else if (hcpMentioned !== null) {
    notes.push(`HCP错误: 模型说${hcpMentioned}, 实际${testCase.actualHCP}`);
  } else {
    notes.push('未提及HCP数值');
  }

  // 3. 要点匹配
  let pointMatchCount = 0;
  if (testCase.expectedPoints) {
    for (const point of testCase.expectedPoints) {
      if (content.includes(point)) {
        pointMatchCount++;
      }
    }
  }
  const pointMatch = testCase.expectedPoints
    ? pointMatchCount / testCase.expectedPoints.length
    : 1;

  // 4. 格式检查
  const hasConclusion = /结论|建议|应.*开|📌/.test(content);
  const hasHCP = /HCP|大牌点|高牌点|点力|🃏/.test(content);
  const hasReasoning = /理由|原因|因为|由于|基于|💡/.test(content);
  const hasFollowUp = /后续|计划|搭档|应叫|📋/.test(content);

  if (hasConclusion) score += 1; else notes.push('缺少结论');
  if (hasReasoning) score += 1; else notes.push('缺少理由分析');
  if (hasFollowUp) score += 1; else notes.push('缺少后续规划');

  const wordCount = content.replace(/\s/g, '').length;
  if (wordCount > 500) {
    notes.push(`回答过长 (${wordCount}字)`);
  }

  return {
    bidMatch,
    hcpCorrect,
    hcpMentioned: hcpMentioned ?? -1,
    pointMatch: Math.round(pointMatch * 100) / 100,
    formatScore: score,
    hasConclusion,
    hasHCP,
    hasReasoning,
    hasFollowUp,
    wordCount,
    notes,
  };
}

async function runSingleTest(testCase: TestCase, model: ModelConfig): Promise<TestResult> {
  console.log(`  [${testCase.id}] ${testCase.name} @ ${model.key} ...`);

  const result = await callAnalyzeHand(testCase, model.key);

  const testResult: TestResult = {
    testCaseId: testCase.id,
    testCaseName: testCase.name,
    modelKey: model.key,
    success: result.success,
    content: result.content || '',
    usage: result.usage,
    model: result.model,
    error: result.error,
    latencyMs: result.latencyMs,
  };

  if (result.success && result.content) {
    testResult.evaluation = evaluateResponse(testCase, result.content);
  }

  const status = result.success ? '✅' : '❌';
  const ev = testResult.evaluation;
  const hcpInfo = ev ? (ev.hcpMentioned >= 0 ? `HCP=${ev.hcpMentioned}${ev.hcpCorrect ? '✓' : '✗'}` : 'HCP=?') : '';
  console.log(`    ${status} ${result.latencyMs}ms, ${result.usage?.total_tokens || '?'} tokens ${hcpInfo}`);

  return testResult;
}

// ============================================================
// 报告生成
// ============================================================

function generateReport(results: TestResult[]): string {
  const L: string[] = [];
  const now = new Date().toISOString().slice(0, 10);

  L.push(`# 桥牌叫牌助手 - AI 模型评估汇总报告`);
  L.push('');
  L.push(`> 日期: ${now}`);
  L.push(`> 测试场景: ${TEST_CASES.length} 个典型牌型`);
  L.push(`> 测试模型: ${MODELS_TO_TEST.map(m => m.key).join(', ')}`);
  L.push(`> 总请求: ${results.length}, 成功: ${results.filter(r => r.success).length}`);
  L.push('');

  // ---- 1. 模型概览 ----
  L.push('## 1. 模型概览');
  L.push('');
  L.push('| 模型 | 供应商 | 成功率 | 平均延迟 | 平均Token | 开叫正确率 | HCP准确率 | 格式分 |');
  L.push('|------|--------|--------|----------|-----------|-----------|----------|--------|');

  for (const model of MODELS_TO_TEST) {
    const mr = results.filter(r => r.modelKey === model.key);
    const ms = mr.filter(r => r.success);
    const me = ms.filter(r => r.evaluation);

    if (me.length === 0) {
      L.push(`| ${model.key} | ${model.provider} | ${ms.length}/${mr.length} | - | - | - | - | - |`);
      continue;
    }

    const avgLat = Math.round(ms.reduce((s, r) => s + r.latencyMs, 0) / ms.length);
    const avgTok = Math.round(ms.reduce((s, r) => s + (r.usage?.total_tokens || 0), 0) / ms.length);
    const bidOk = me.filter(r => r.evaluation!.bidMatch).length;
    const hcpOk = me.filter(r => r.evaluation!.hcpCorrect).length;
    const avgScore = (me.reduce((s, r) => s + r.evaluation!.formatScore, 0) / me.length).toFixed(1);

    L.push(`| ${model.key} | ${model.provider} | ${ms.length}/${mr.length} | ${avgLat}ms | ${avgTok} | ${bidOk}/${me.length} | ${hcpOk}/${me.length} | ${avgScore}/10 |`);
  }
  L.push('');

  // ---- 2. 逐场景对比 ----
  L.push('## 2. 逐场景对比');
  L.push('');

  for (const tc of TEST_CASES) {
    L.push(`### ${tc.id}: ${tc.name}`);
    L.push('');
    L.push(`**牌型**: ♠${tc.hand.spades}  ♥${tc.hand.hearts}  ♦${tc.hand.diamonds}  ♣${tc.hand.clubs}`);
    L.push(`**实际HCP**: ${tc.actualHCP} | **期望开叫**: ${tc.expectedBid || '-'} | **体系**: ${tc.system || 'natural-2over1'}`);
    L.push('');
    L.push('| 模型 | 开叫 | HCP | 延迟 | Token | 格式分 | 备注 |');
    L.push('|------|------|-----|------|-------|--------|------|');

    for (const model of MODELS_TO_TEST) {
      const r = results.find(x => x.testCaseId === tc.id && x.modelKey === model.key);
      if (!r || !r.success) {
        L.push(`| ${model.key} | - | - | - | - | - | ${r?.error || '失败'} |`);
        continue;
      }
      const ev = r.evaluation!;
      const bidStr = ev.bidMatch ? `✅ ${tc.expectedBid}` : '❌';
      const hcpStr = ev.hcpMentioned >= 0
        ? `${ev.hcpMentioned} ${ev.hcpCorrect ? '✅' : `❌(实际${tc.actualHCP})`}`
        : '?';
      const notesStr = ev.notes.filter(n => !n.startsWith('HCP错误') && !n.startsWith('未提到期望') && !n.startsWith('未提及HCP')).join('; ') || '-';
      L.push(`| ${model.key} | ${bidStr} | ${hcpStr} | ${r.latencyMs}ms | ${r.usage?.total_tokens || '-'} | ${ev.formatScore}/10 | ${notesStr} |`);
    }
    L.push('');

    // 模型回答详情
    for (const model of MODELS_TO_TEST) {
      const r = results.find(x => x.testCaseId === tc.id && x.modelKey === model.key);
      if (!r || !r.success || !r.content) continue;
      L.push(`<details><summary>${model.key} 完整回答</summary>`);
      L.push('');
      L.push('```');
      L.push(r.content);
      L.push('```');
      L.push('');
      L.push('</details>');
    }
    L.push('');
  }

  // ---- 3. HCP 准确性专项分析 ----
  L.push('## 3. HCP 准确性专项分析');
  L.push('');
  L.push('HCP（高牌点）计算是桥牌分析的基础。以下是各模型对每个场景的 HCP 计算情况：');
  L.push('');
  L.push('| 场景 | 实际HCP |');

  for (const model of MODELS_TO_TEST) {
    L.push(` ${model.model} |`);
  }
  L.push('|------|---------|' + MODELS_TO_TEST.map(() => '---------|').join(''));

  for (const tc of TEST_CASES) {
    let row = `| ${tc.id} | ${tc.actualHCP} |`;
    for (const model of MODELS_TO_TEST) {
      const r = results.find(x => x.testCaseId === tc.id && x.modelKey === model.key);
      const ev = r?.evaluation;
      if (!ev || ev.hcpMentioned < 0) {
        row += ' ? |';
      } else if (ev.hcpCorrect) {
        row += ` ✅ ${ev.hcpMentioned} |`;
      } else {
        row += ` ❌ ${ev.hcpMentioned} |`;
      }
    }
    L.push(row);
  }
  L.push('');

  // HCP 统计
  for (const model of MODELS_TO_TEST) {
    const me = results.filter(r => r.modelKey === model.key && r.success && r.evaluation);
    const hcpOk = me.filter(r => r.evaluation!.hcpCorrect).length;
    L.push(`- **${model.key}**: HCP 准确率 ${hcpOk}/${me.length} (${me.length > 0 ? Math.round(hcpOk/me.length*100) : 0}%)`);
  }
  L.push('');

  // ---- 4. 核心发现 ----
  L.push('## 4. 核心发现');
  L.push('');

  const allEval = results.filter(r => r.success && r.evaluation);

  // HCP 问题
  const totalHcpOk = allEval.filter(r => r.evaluation!.hcpCorrect).length;
  if (totalHcpOk < allEval.length) {
    L.push('### 🔴 HCP 计算不准确');
    L.push('');
    L.push(`在 ${allEval.length} 次成功请求中，仅 ${totalHcpOk} 次 HCP 计算正确 (${Math.round(totalHcpOk/allEval.length*100)}%)。`);
    L.push('模型倾向于"幻觉"出一个固定的 HCP 值（如 14），而非根据实际手牌计算。');
    L.push('');
    L.push('**影响**: HCP 是所有开叫决策的基础，HCP 错误会导致后续开叫建议全部不可靠。');
    L.push('');
  }

  // 格式问题
  const noConclusion = allEval.filter(r => !r.evaluation!.hasConclusion).length;
  if (noConclusion > 0) {
    L.push('### 🟡 格式规范问题');
    L.push('');
    for (const model of MODELS_TO_TEST) {
      const me = allEval.filter(r => r.modelKey === model.key);
      const nc = me.filter(r => !r.evaluation!.hasConclusion).length;
      if (nc > 0) {
        L.push(`- **${model.key}**: ${nc}/${me.length} 个回答缺少"结论先行"`);
      }
    }
    L.push('');
  }

  // 速度问题
  L.push('### 🟢 速度与可用性');
  L.push('');
  for (const model of MODELS_TO_TEST) {
    const ms = results.filter(r => r.modelKey === model.key && r.success);
    if (ms.length > 0) {
      const avg = Math.round(ms.reduce((s, r) => s + r.latencyMs, 0) / ms.length);
      L.push(`- **${model.key}**: 平均 ${avg}ms${avg > 10000 ? ' (较慢，推理型模型)' : ' (响应迅速)'}`);
    }
    const failed = results.filter(r => r.modelKey === model.key && !r.success);
    if (failed.length > 0) {
      L.push(`- **${model.key}**: ${failed.length} 次失败 (${failed.map(r => r.error?.slice(0, 30)).join(', ')})`);
    }
  }
  L.push('');

  // ---- 5. 改进建议 ----
  L.push('## 5. 改进建议');
  L.push('');
  L.push('1. **后端预计算 HCP**（优先级最高）: 在 prompt 中直接提供准确的 HCP 和牌型分布，不依赖模型自行计算');
  L.push('2. **Prompt 添加 Few-shot 示例**: 在 system prompt 中加入 1-2 个正确分析的示例，引导模型格式');
  L.push('3. **结构化输出**: 要求模型以 JSON 格式返回（开叫建议、HCP、理由），便于后端校验');
  L.push('4. **结果校验层**: 后端对模型返回的 HCP 进行校验，偏差过大时自动重试或提示');
  L.push('');

  return L.join('\n');
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   桥牌叫牌助手 - AI 模型评估测试            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`API: ${API_PREFIX}`);
  console.log(`场景: ${TEST_CASES.length} 个 | 模型: ${MODELS_TO_TEST.map(m => m.key).join(', ')}`);
  console.log(`输出: ${REPORT_DIR}`);
  console.log('');

  // 健康检查
  try {
    const health = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    console.log(`✅ 后端正常: ${health.data.status}`);
  } catch {
    console.log('❌ 后端不可用，请先启动: npx tsx packages/backend/src/index.ts');
    process.exit(1);
  }

  // 获取可用模型
  try {
    const modelsResp = await axios.get(`${API_PREFIX}/models`, { timeout: 5000 });
    const providers = modelsResp.data.data as Array<{ name: string; models: any[] }>;
    console.log(`✅ 可用: ${providers.map(p => `${p.name}(${p.models.length})`).join(', ')}`);
  } catch {
    console.log('⚠️  无法获取模型列表');
  }

  console.log('');
  console.log('开始测试...');
  console.log('─'.repeat(50));

  const allResults: TestResult[] = [];

  for (const model of MODELS_TO_TEST) {
    console.log(`\n📦 ${model.key}`);
    console.log('─'.repeat(40));

    for (const testCase of TEST_CASES) {
      const interval = model.requestIntervalMs || 2000;
      if (interval > 5000) {
        console.log(`    ⏳ 等待 ${interval/1000}s...`);
      }
      await new Promise(resolve => setTimeout(resolve, interval));

      const result = await runSingleTest(testCase, model);
      allResults.push(result);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('✅ 测试完成！生成报告...');

  // 确保输出目录存在
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  // 生成报告
  const report = generateReport(allResults);
  const dateStr = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(REPORT_DIR, `${dateStr}-summary.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`📄 报告: ${reportPath}`);

  // 保存 JSON
  const jsonPath = path.join(REPORT_DIR, `${dateStr}-summary.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`📊 数据: ${jsonPath}`);

  // 简要汇总
  console.log('');
  console.log('══════════════════════════════════════════════');
  for (const model of MODELS_TO_TEST) {
    const mr = allResults.filter(r => r.modelKey === model.key);
    const ms = mr.filter(r => r.success);
    const me = ms.filter(r => r.evaluation);
    const bidOk = me.filter(r => r.evaluation?.bidMatch).length;
    const hcpOk = me.filter(r => r.evaluation?.hcpCorrect).length;
    console.log(`  ${model.key}:`);
    console.log(`    成功 ${ms.length}/${mr.length} | 开叫 ${bidOk}/${me.length} | HCP ${hcpOk}/${me.length}`);
  }
  console.log('══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
