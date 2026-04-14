/**
 * 桥牌提示词模板模块
 *
 * 包含牌型分析、叫牌进程分析、叫牌建议等提示词生成函数。
 * 支持自然二盖一体系(Natural 2/1)和精确叫牌体系(Precision)。
 * 支持 NS/EW 独立体系，动态注入叫牌体系规则和约定叫信息。
 */

import { getSystemRulesText, getEnabledConventions, HCP_RULES_TEXT } from '../config/bidding.js';

// ============================================================
// 通用系统提示词
// ============================================================

const BASE_SYSTEM_PROMPT = `你是一位世界级桥牌专家和叫牌教练。

${HCP_RULES_TEXT}

【回答格式要求 - 必须严格遵守】
1. **结论先行**：第一句话直接给出结论或建议（1-2句话），不要铺垫
2. HCP 和牌型分析**简洁带过**即可（一句话总结，如"14 HCP，5-4-3-1型"），不要展开逐花色计算
3. 重点放在**叫牌逻辑、建议理由、后续规划**上
4. 使用 Markdown 格式，但保持紧凑，避免过多空行
5. 如有多个选择，用简洁的对比说明`;

// ============================================================
// 提示词生成函数
// ============================================================

export function analyzeHandPrompt(hand, system = 'natural-2over1') {
  const rulesText = getSystemRulesText(system);
  const conventions = getEnabledConventions(system);

  let conventionsText = '';
  if (conventions.length > 0) {
    conventionsText = '\n【当前启用的约定叫】\n';
    for (const c of conventions) {
      conventionsText += `- ${c.name}：${c.description}（触发条件：${c.trigger}）\n`;
    }
  }

  const userPrompt = `请先给出开叫建议（一句话），然后简要说明理由和后续规划。HCP 和牌型用一句话总结即可。

【手牌信息】
- 位置：${hand.position || '未知'}
- 局况：${hand.vulnerability || '未知'}
- ♠ 黑桃：${hand.spades || '无'}
- ♥ 红心：${hand.hearts || '无'}
- ♦ 方块：${hand.diamonds || '无'}
- ♣ 梅花：${hand.clubs || '无'}`;

  return {
    system: `${BASE_SYSTEM_PROMPT}\n\n${rulesText}${conventionsText}`,
    user: userPrompt
  };
}

export function analyzeBiddingPrompt(params, nsSystem = 'natural-2over1', ewSystem = 'natural-2over1') {
  const nsRulesText = getSystemRulesText(nsSystem);
  const ewRulesText = getSystemRulesText(ewSystem);
  const nsConventions = getEnabledConventions(nsSystem);
  const ewConventions = getEnabledConventions(ewSystem);

  let conventionsText = '';
  if (nsConventions.length > 0) {
    conventionsText += '\n【NS 方当前启用的约定叫】\n';
    for (const c of nsConventions) {
      conventionsText += `- ${c.name}：${c.description}（触发条件：${c.trigger}）\n`;
    }
  }
  if (ewConventions.length > 0) {
    conventionsText += '\n【EW 方当前启用的约定叫】\n';
    for (const c of ewConventions) {
      conventionsText += `- ${c.name}：${c.description}（触发条件：${c.trigger}）\n`;
    }
  }

  const { biddingSequence, vulnerability, dealer } = params;

  let sequenceStr = '';
  if (biddingSequence && biddingSequence.length > 0) {
    const positions = ['N', 'E', 'S', 'W'];
    let dealerIdx = positions.indexOf(dealer) !== -1 ? positions.indexOf(dealer) : 0;

    sequenceStr = '```\n';
    sequenceStr += '  N     E     S     W\n';
    sequenceStr += '------------------------\n';

    let row = '  '.repeat(dealerIdx);
    let col = dealerIdx;

    biddingSequence.forEach((item) => {
      const bid = item.bid || 'Pass';
      const displayBid = bid.length < 4 ? bid.padEnd(5) : bid.padEnd(5);
      row += displayBid;

      col++;
      if (col === 4) {
        sequenceStr += row + '\n';
        row = '';
        col = 0;
      }
    });

    if (col > 0) {
      sequenceStr += row + '\n';
    }
    sequenceStr += '```\n';
  }

  const userPrompt = `请先给出叫牌进程评估结论（1-2句话），然后分析关键决策点和后续发展。

【叫牌信息】
- 局况：${vulnerability || '未知'}
- 庄家：${dealer || '未知'}

【叫牌序列】
${sequenceStr}`;

  return {
    system: `${BASE_SYSTEM_PROMPT}\n\n【NS 方体系规则】\n${nsRulesText}\n\n【EW 方体系规则】\n${ewRulesText}${conventionsText}`,
    user: userPrompt
  };
}

export function suggestBidPrompt(params, nsSystem = 'natural-2over1', ewSystem = 'natural-2over1') {
  const nsRulesText = getSystemRulesText(nsSystem);
  const ewRulesText = getSystemRulesText(ewSystem);
  const nsConventions = getEnabledConventions(nsSystem);
  const ewConventions = getEnabledConventions(ewSystem);

  let conventionsText = '';
  if (nsConventions.length > 0) {
    conventionsText += '\n【NS 方当前启用的约定叫】\n';
    for (const c of nsConventions) {
      conventionsText += `- ${c.name}：${c.description}（触发条件：${c.trigger}）\n`;
    }
  }
  if (ewConventions.length > 0) {
    conventionsText += '\n【EW 方当前启用的约定叫】\n';
    for (const c of ewConventions) {
      conventionsText += `- ${c.name}：${c.description}（触发条件：${c.trigger}）\n`;
    }
  }

  const { hand, biddingSequence, vulnerability, position } = params;

  const handStr = `♠ ${hand.spades || '-'}  |  ♥ ${hand.hearts || '-'}  |  ♦ ${hand.diamonds || '-'}  |  ♣ ${hand.clubs || '-'}`;

  let sequenceStr = '';
  if (biddingSequence && biddingSequence.length > 0) {
    sequenceStr = biddingSequence.map(item => `${item.position}: ${item.bid}`).join(' → ');
  } else {
    sequenceStr = '尚无叫牌';
  }

  const userPrompt = `请先给出推荐的叫品（一句话），然后说明理由和后续规划。

【手牌信息】
- 你的位置：${position || '未知'}
- 局况：${vulnerability || '未知'}
- 手牌：${handStr}

【当前叫牌进程】
${sequenceStr}`;

  return {
    system: `${BASE_SYSTEM_PROMPT}\n\n【NS 方体系规则】\n${nsRulesText}\n\n【EW 方体系规则】\n${ewRulesText}${conventionsText}`,
    user: userPrompt
  };
}

export { BASE_SYSTEM_PROMPT };
