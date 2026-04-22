/**
 * 评估框架 - 共享配置和类型定义
 */

import axios from 'axios';

// ============================================================
// 类型定义
// ============================================================

/** 评估维度 */
export type Dimension = 'opening_bid' | 'bidding_analysis' | 'bid_suggestion';

/** 维度中文名 */
export const DIMENSION_NAMES: Record<Dimension, string> = {
  opening_bid: '开叫评估',
  bidding_analysis: '叫牌进程分析',
  bid_suggestion: '叫牌建议',
};

/** 维度对应的 API 端点 */
export const DIMENSION_ENDPOINTS: Record<Dimension, string> = {
  opening_bid: '/api/analyze-hand',
  bidding_analysis: '/api/analyze-bidding',
  bid_suggestion: '/api/suggest-bid',
};

/** 模型配置 */
export interface ModelConfig {
  key: string;              // providerId:modelId
  provider: string;
  model: string;
  requestIntervalMs: number;
}

/** 开叫测试用例 */
export interface OpeningBidTestCase {
  dimension: 'opening_bid';
  id: string;
  name: string;
  description: string;
  hand: { spades: string; hearts: string; diamonds: string; clubs: string; position?: string; vulnerability?: string };
  system?: string;
  actualHCP: number;
  expectedBid?: string;
  expectedPoints?: string[];
}

/** 叫牌进程分析测试用例 */
export interface BiddingAnalysisTestCase {
  dimension: 'bidding_analysis';
  id: string;
  name: string;
  description: string;
  biddingSequence: Array<{ bid: string; position?: string }>;
  vulnerability?: string;
  dealer?: string;
  system?: string;
  expectedPoints?: string[];
}

/** 叫牌建议测试用例 */
export interface BidSuggestionTestCase {
  dimension: 'bid_suggestion';
  id: string;
  name: string;
  description: string;
  hand: { spades: string; hearts: string; diamonds: string; clubs: string };
  biddingSequence: Array<{ bid: string; position?: string }>;
  position?: string;
  vulnerability?: string;
  system?: string;
  actualHCP: number;
  expectedBid?: string;
  expectedPoints?: string[];
}

export type TestCase = OpeningBidTestCase | BiddingAnalysisTestCase | BidSuggestionTestCase;

/** 单次测试结果 */
export interface TestResult {
  testCaseId: string;
  testCaseName: string;
  dimension: Dimension;
  modelKey: string;
  success: boolean;
  content: string;
  usage?: Record<string, number>;
  model?: string;
  error?: string;
  latencyMs: number;
  evaluation?: {
    bidMatch: boolean;
    hcpCorrect: boolean;
    hcpMentioned: number;    // -1 表示未提及
    pointMatch: number;      // 0-1
    formatScore: number;     // 0-10
    hasConclusion: boolean;
    hasHCP: boolean;
    hasReasoning: boolean;
    hasFollowUp: boolean;
    wordCount: number;
    notes: string[];
  };
}

// ============================================================
// 配置
// ============================================================

export const BASE_URL = process.env.BASE_URL || 'http://localhost:10240';
export const API_PREFIX = `${BASE_URL}/bridge-bidding-assistant-server`;
export const REPORT_BASE_DIR = '/sessions/69e6d1fa41619118b795ef9e/workspace/docs/model_evaluation_reports';

/** 要测试的模型 */
export const MODELS_TO_TEST: ModelConfig[] = [
  // ---- 智谱 AI ----
  { key: 'zhipu:GLM-4-Flash', provider: 'zhipu', model: 'GLM-4-Flash', requestIntervalMs: 2000 },
  // ---- GitHub Models ----
  { key: 'github:gpt-4o-mini', provider: 'github', model: 'gpt-4o-mini', requestIntervalMs: 8000 },
  { key: 'github:Meta-Llama-3.1-8B-Instruct', provider: 'github', model: 'Llama 3.1 8B', requestIntervalMs: 8000 },
];

// ============================================================
// 工具函数
// ============================================================

/** 从模型回答中提取 HCP 数值 */
export function extractHCP(content: string): number | null {
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

/** 调用 API */
export async function callAPI(dimension: Dimension, body: Record<string, any>, modelKey: string): Promise<{
  success: boolean;
  content?: string;
  usage?: Record<string, number>;
  model?: string;
  error?: string;
  latencyMs: number;
}> {
  const endpoint = `${API_PREFIX}${DIMENSION_ENDPOINTS[dimension]}`;
  const startTime = Date.now();
  try {
    const response = await axios.post(endpoint, { ...body, model: modelKey, stream: false }, {
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
    });
    const latencyMs = Date.now() - startTime;
    if (response.data?.success) {
      return { success: true, content: response.data.data.content, usage: response.data.data.usage, model: response.data.data.model, latencyMs };
    }
    return { success: false, error: response.data?.error || '未知错误', latencyMs };
  } catch (error: any) {
    return { success: false, error: error.response?.data?.error || error.message || '请求失败', latencyMs: Date.now() - startTime };
  }
}

/** 评估回答质量（通用） */
export function evaluateResponse(
  content: string,
  opts: {
    expectedBid?: string;
    actualHCP?: number;
    expectedPoints?: string[];
  } = {}
): TestResult['evaluation'] {
  const notes: string[] = [];
  let score = 0;

  // 1. 开叫匹配
  const bidMatch = opts.expectedBid ? content.includes(opts.expectedBid) : true;
  if (bidMatch) score += 3; else notes.push(`未提到期望叫品 "${opts.expectedBid}"`);

  // 2. HCP 准确性
  const hcpMentioned = opts.actualHCP !== undefined ? extractHCP(content) : null;
  const hcpCorrect = hcpMentioned !== null && hcpMentioned === opts.actualHCP;
  if (hcpCorrect) score += 3;
  else if (hcpMentioned !== null && opts.actualHCP !== undefined) notes.push(`HCP错误: 模型说${hcpMentioned}, 实际${opts.actualHCP}`);
  else if (opts.actualHCP !== undefined) notes.push('未提及HCP数值');

  // 3. 要点匹配
  let pointMatchCount = 0;
  if (opts.expectedPoints) {
    for (const point of opts.expectedPoints) {
      if (content.includes(point)) pointMatchCount++;
    }
  }
  const pointMatch = opts.expectedPoints ? pointMatchCount / opts.expectedPoints.length : 1;

  // 4. 格式检查
  const hasConclusion = /结论|建议|应.*开|📌/.test(content);
  const hasHCP = /HCP|大牌点|高牌点|点力|🃏/.test(content);
  const hasReasoning = /理由|原因|因为|由于|基于|💡/.test(content);
  const hasFollowUp = /后续|计划|搭档|应叫|📋/.test(content);

  if (hasConclusion) score += 1; else notes.push('缺少结论');
  if (hasReasoning) score += 1; else notes.push('缺少理由分析');
  if (hasFollowUp) score += 1; else notes.push('缺少后续规划');

  const wordCount = content.replace(/\s/g, '').length;
  if (wordCount > 500) notes.push(`回答过长 (${wordCount}字)`);

  return {
    bidMatch,
    hcpCorrect: hcpCorrect || false,
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
