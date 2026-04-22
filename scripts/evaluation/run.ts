/**
 * 桥牌叫牌助手 - AI 模型评估框架
 *
 * 按维度运行测试，生成 Markdown + JSON 评估报告
 *
 * 用法：
 *   npx tsx scripts/evaluation/run.ts                    # 运行全部维度
 *   npx tsx scripts/evaluation/run.ts opening_bid        # 只运行开叫评估
 *   npx tsx scripts/evaluation/run.ts bidding_analysis   # 只运行叫牌进程分析
 *   npx tsx scripts/evaluation/run.ts bid_suggestion     # 只运行叫牌建议
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import {
  type Dimension, type TestCase, type TestResult,
  DIMENSION_NAMES, REPORT_BASE_DIR, MODELS_TO_TEST,
  callAPI, evaluateResponse,
} from './config.js';
import { OPENING_BID_CASES } from './cases/opening_bid.js';
import { BIDDING_ANALYSIS_CASES } from './cases/bidding_analysis.js';
import { BID_SUGGESTION_CASES } from './cases/bid_suggestion.js';

// ============================================================
// 用例注册
// ============================================================

const ALL_CASES: Record<Dimension, TestCase[]> = {
  opening_bid: OPENING_BID_CASES,
  bidding_analysis: BIDDING_ANALYSIS_CASES,
  bid_suggestion: BID_SUGGESTION_CASES,
};

// ============================================================
// 构建请求体
// ============================================================

function buildRequestBody(tc: TestCase): Record<string, any> {
  switch (tc.dimension) {
    case 'opening_bid': {
      const c = tc as any;
      return { hand: c.hand, system: c.system || 'natural-2over1' };
    }
    case 'bidding_analysis': {
      const c = tc as any;
      return {
        biddingSequence: c.biddingSequence,
        vulnerability: c.vulnerability,
        dealer: c.dealer,
        system: c.system || 'natural-2over1',
      };
    }
    case 'bid_suggestion': {
      const c = tc as any;
      return {
        hand: c.hand,
        biddingSequence: c.biddingSequence,
        position: c.position,
        vulnerability: c.vulnerability,
        system: c.system || 'natural-2over1',
      };
    }
  }
}

// ============================================================
// 运行单个测试
// ============================================================

async function runTest(tc: TestCase, modelKey: string): Promise<TestResult> {
  const body = buildRequestBody(tc);
  const result = await callAPI(tc.dimension, body, modelKey);

  const testResult: TestResult = {
    testCaseId: tc.id,
    testCaseName: tc.name,
    dimension: tc.dimension,
    modelKey,
    success: result.success,
    content: result.content || '',
    usage: result.usage,
    model: result.model,
    error: result.error,
    latencyMs: result.latencyMs,
  };

  if (result.success && result.content) {
    const tcAny = tc as any;
    testResult.evaluation = evaluateResponse(result.content, {
      expectedBid: tcAny.expectedBid,
      actualHCP: tcAny.actualHCP,
      expectedPoints: tcAny.expectedPoints,
    });
  }

  return testResult;
}

// ============================================================
// 报告生成
// ============================================================

function generateReport(dimension: Dimension, results: TestResult[], cases: TestCase[]): string {
  const L: string[] = [];
  const now = new Date().toISOString().slice(0, 10);
  const dimName = DIMENSION_NAMES[dimension];

  L.push(`# ${dimName} - AI 模型评估报告`);
  L.push('');
  L.push(`> 日期: ${now}`);
  L.push(`> 维度: ${dimName}`);
  L.push(`> 测试场景: ${cases.length} 个`);
  L.push(`> 测试模型: ${MODELS_TO_TEST.map(m => m.key).join(', ')}`);
  L.push(`> 总请求: ${results.length}, 成功: ${results.filter(r => r.success).length}`);
  L.push('');

  // ---- 1. 模型概览 ----
  L.push('## 1. 模型概览');
  L.push('');
  L.push('| 模型 | 成功率 | 平均延迟 | 平均Token | 叫品正确率 | HCP准确率 | 格式分 |');
  L.push('|------|--------|----------|-----------|-----------|----------|--------|');

  for (const model of MODELS_TO_TEST) {
    const mr = results.filter(r => r.modelKey === model.key);
    const ms = mr.filter(r => r.success);
    const me = ms.filter(r => r.evaluation);

    if (me.length === 0) {
      L.push(`| ${model.key} | ${ms.length}/${mr.length} | - | - | - | - | - |`);
      continue;
    }

    const avgLat = Math.round(ms.reduce((s, r) => s + r.latencyMs, 0) / ms.length);
    const avgTok = Math.round(ms.reduce((s, r) => s + (r.usage?.total_tokens || 0), 0) / ms.length);
    const bidOk = me.filter(r => r.evaluation!.bidMatch).length;
    const hcpTests = me.filter(r => r.evaluation!.hcpMentioned >= 0);
    const hcpOk = hcpTests.filter(r => r.evaluation!.hcpCorrect).length;
    const avgScore = (me.reduce((s, r) => s + r.evaluation!.formatScore, 0) / me.length).toFixed(1);

    L.push(`| ${model.key} | ${ms.length}/${mr.length} | ${avgLat}ms | ${avgTok} | ${bidOk}/${me.length} | ${hcpOk}/${hcpTests.length} | ${avgScore}/10 |`);
  }
  L.push('');

  // ---- 2. 逐场景对比 ----
  L.push('## 2. 逐场景对比');
  L.push('');

  for (const tc of cases) {
    L.push(`### ${tc.id}: ${tc.name}`);
    L.push('');
    L.push(`**描述**: ${tc.description}`);
    L.push('');

    // 显示输入信息
    const tcAny = tc as any;
    if (tc.dimension === 'opening_bid' || tc.dimension === 'bid_suggestion') {
      const h = tcAny.hand;
      L.push(`**手牌**: ♠${h.spades}  ♥${h.hearts}  ♦${h.diamonds}  ♣${h.clubs}`);
      if (tcAny.actualHCP !== undefined) L.push(`**实际HCP**: ${tcAny.actualHCP}`);
      if (tcAny.position) L.push(`**位置**: ${tcAny.position}`);
    }
    if (tc.dimension === 'bidding_analysis' || tc.dimension === 'bid_suggestion') {
      const seq = tcAny.biddingSequence || [];
      if (seq.length > 0) {
        L.push(`**叫牌进程**: ${seq.map((b: any) => `${b.position || '?'}:${b.bid}`).join(' → ')}`);
      }
    }
    if (tcAny.expectedBid) L.push(`**期望叫品**: ${tcAny.expectedBid}`);
    if (tcAny.vulnerability) L.push(`**局况**: ${tcAny.vulnerability}`);
    if (tcAny.system) L.push(`**体系**: ${tcAny.system}`);
    L.push('');

    // 对比表
    L.push('| 模型 | 叫品匹配 | HCP | 延迟 | Token | 格式分 | 备注 |');
    L.push('|------|----------|-----|------|-------|--------|------|');

    for (const model of MODELS_TO_TEST) {
      const r = results.find(x => x.testCaseId === tc.id && x.modelKey === model.key);
      if (!r || !r.success) {
        L.push(`| ${model.key} | - | - | - | - | - | ${r?.error?.slice(0, 40) || '失败'} |`);
        continue;
      }
      const ev = r.evaluation!;
      const bidStr = ev.bidMatch ? `✅ ${tcAny.expectedBid || '✓'}` : '❌';
      const hcpStr = ev.hcpMentioned >= 0
        ? `${ev.hcpMentioned}${ev.hcpCorrect ? ' ✅' : ` ❌(实际${tcAny.actualHCP || '?'})`}`
        : '-';
      const notesStr = ev.notes.filter(n => !n.startsWith('HCP错误') && !n.startsWith('未提到期望') && !n.startsWith('未提及HCP')).join('; ') || '-';
      L.push(`| ${model.key} | ${bidStr} | ${hcpStr} | ${r.latencyMs}ms | ${r.usage?.total_tokens || '-'} | ${ev.formatScore}/10 | ${notesStr} |`);
    }
    L.push('');

    // 模型回答详情
    for (const model of MODELS_TO_TEST) {
      const r = results.find(x => x.testCaseId === tc.id && x.modelKey === model.key);
      if (!r || !r.success || !r.content) continue;
      L.push(`<details><summary>${model.model} 完整回答</summary>`);
      L.push('');
      L.push('```');
      L.push(r.content);
      L.push('```');
      L.push('');
      L.push('</details>');
    }
    L.push('');
  }

  // ---- 3. HCP 准确性（仅适用于有 HCP 的维度） ----
  const hasHCP = results.some(r => r.evaluation && r.evaluation.hcpMentioned >= 0);
  if (hasHCP) {
    L.push('## 3. HCP 准确性分析');
    L.push('');

    const hcpCases = cases.filter((c: any) => c.actualHCP !== undefined);
    if (hcpCases.length > 0) {
      L.push('| 场景 | 实际HCP |');
      for (const model of MODELS_TO_TEST) L.push(` ${model.model} |`);
      L.push('|------|---------|' + MODELS_TO_TEST.map(() => '---------|').join(''));

      for (const tc of hcpCases) {
        let row = `| ${tc.id} | ${(tc as any).actualHCP} |`;
        for (const model of MODELS_TO_TEST) {
          const r = results.find(x => x.testCaseId === tc.id && x.modelKey === model.key);
          const ev = r?.evaluation;
          if (!ev || ev.hcpMentioned < 0) row += ' - |';
          else if (ev.hcpCorrect) row += ` ✅ ${ev.hcpMentioned} |`;
          else row += ` ❌ ${ev.hcpMentioned} |`;
        }
        L.push(row);
      }
      L.push('');

      for (const model of MODELS_TO_TEST) {
        const me = results.filter(r => r.modelKey === model.key && r.success && r.evaluation && r.evaluation.hcpMentioned >= 0);
        const hcpOk = me.filter(r => r.evaluation!.hcpCorrect).length;
        L.push(`- **${model.key}**: HCP 准确率 ${hcpOk}/${me.length} (${me.length > 0 ? Math.round(hcpOk / me.length * 100) : 0}%)`);
      }
      L.push('');
    }
  }

  // ---- 4. 核心发现 ----
  L.push('## 4. 核心发现');
  L.push('');

  const allEval = results.filter(r => r.success && r.evaluation);

  // HCP 问题
  if (hasHCP) {
    const hcpTests = allEval.filter(r => r.evaluation!.hcpMentioned >= 0);
    const hcpOk = hcpTests.filter(r => r.evaluation!.hcpCorrect).length;
    if (hcpOk < hcpTests.length) {
      L.push(`### 🔴 HCP 计算不准确 (${hcpOk}/${hcpTests.length} 正确)`);
      L.push('');
      L.push('模型无法准确计算手牌 HCP，倾向于"幻觉"固定值而非根据实际手牌计算。');
      L.push('');
    }
  }

  // 格式问题
  const noConclusion = allEval.filter(r => !r.evaluation!.hasConclusion).length;
  if (noConclusion > 0) {
    L.push(`### 🟡 格式问题 (${noConclusion}/${allEval.length} 缺少结论先行)`);
    L.push('');
    for (const model of MODELS_TO_TEST) {
      const me = allEval.filter(r => r.modelKey === model.key);
      const nc = me.filter(r => !r.evaluation!.hasConclusion).length;
      if (nc > 0) L.push(`- **${model.key}**: ${nc}/${me.length} 缺少结论先行`);
    }
    L.push('');
  }

  // 速度
  L.push('### 🟢 速度');
  L.push('');
  for (const model of MODELS_TO_TEST) {
    const ms = results.filter(r => r.modelKey === model.key && r.success);
    if (ms.length > 0) {
      const avg = Math.round(ms.reduce((s, r) => s + r.latencyMs, 0) / ms.length);
      L.push(`- **${model.key}**: 平均 ${avg}ms`);
    }
  }
  L.push('');

  // ---- 5. 改进建议 ----
  L.push('## 5. 改进建议');
  L.push('');
  L.push('| 优先级 | 建议 |');
  L.push('|--------|------|');
  L.push('| P0 | 后端预计算 HCP，在 prompt 中直接提供准确值 |');
  L.push('| P1 | 添加 Few-shot 示例引导格式 |');
  L.push('| P2 | 结构化 JSON 输出便于校验 |');
  L.push('| P3 | 后端结果校验层 |');
  L.push('');

  return L.join('\n');
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const dimensions: Dimension[] = args.length > 0
    ? args.filter(a => a in DIMENSION_NAMES) as Dimension[]
    : ['opening_bid', 'bidding_analysis', 'bid_suggestion'];

  if (dimensions.length === 0) {
    console.log('用法: npx tsx scripts/evaluation/run.ts [opening_bid|bidding_analysis|bid_suggestion]');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   桥牌叫牌助手 - AI 模型评估框架            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`维度: ${dimensions.map(d => DIMENSION_NAMES[d]).join(', ')}`);
  console.log(`模型: ${MODELS_TO_TEST.map(m => m.key).join(', ')}`);
  console.log('');

  // 健康检查
  try {
    const health = await axios.get(`${process.env.BASE_URL || 'http://localhost:10240'}/health`, { timeout: 5000 });
    console.log(`✅ 后端正常: ${health.data.status}`);
  } catch {
    console.log('❌ 后端不可用，请先启动: npx tsx packages/backend/src/index.ts');
    process.exit(1);
  }

  // 逐维度运行
  for (const dim of dimensions) {
    const cases = ALL_CASES[dim];
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  ${DIMENSION_NAMES[dim]} (${cases.length} 个场景)`);
    console.log(`${'═'.repeat(50)}`);

    const allResults: TestResult[] = [];

    for (const model of MODELS_TO_TEST) {
      console.log(`\n📦 ${model.key}`);
      console.log('─'.repeat(40));

      for (const tc of cases) {
        const interval = model.requestIntervalMs || 2000;
        if (interval > 3000) console.log(`    ⏳ 等待 ${interval / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, interval));

        const result = await runTest(tc, model.key);
        allResults.push(result);

        const status = result.success ? '✅' : '❌';
        const ev = result.evaluation;
        const hcpInfo = ev ? (ev.hcpMentioned >= 0 ? `HCP=${ev.hcpMentioned}${ev.hcpCorrect ? '✓' : '✗'}` : '') : '';
        const bidInfo = ev ? (ev.bidMatch ? '✓' : '✗') : '';
        console.log(`  [${tc.id}] ${status} ${result.latencyMs}ms ${bidInfo} ${hcpInfo}`);
      }
    }

    // 生成报告
    const reportDir = path.join(REPORT_BASE_DIR, dim);
    fs.mkdirSync(reportDir, { recursive: true });

    const dateStr = new Date().toISOString().slice(0, 10);
    const report = generateReport(dim, allResults, cases);

    const mdPath = path.join(reportDir, `${dateStr}-report.md`);
    fs.writeFileSync(mdPath, report, 'utf-8');
    console.log(`\n📄 报告: ${mdPath}`);

    const jsonPath = path.join(reportDir, `${dateStr}-results.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`📊 数据: ${jsonPath}`);

    // 简要汇总
    const ms = allResults.filter(r => r.success);
    const me = ms.filter(r => r.evaluation);
    const bidOk = me.filter(r => r.evaluation?.bidMatch).length;
    console.log(`\n  汇总: 成功 ${ms.length}/${allResults.length} | 叫品 ${bidOk}/${me.length}`);
  }

  console.log('\n✅ 全部完成！');
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
