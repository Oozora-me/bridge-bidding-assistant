// server/config/bidding.js
// 叫牌体系配置 - 所有规则均可通过配置文件修改

export const HCP_RULES_TEXT = `【点力计算标准 - 哈伦点力（HCP）】
- A = 4点，K = 3点，Q = 2点，J = 1点
- 每门花色最多计 10 点（A+K+Q+J）

【牌型评估点力】
- 长套点：第5张 +1，第6张 +2，第7张 +3（以此类推）
- 短套点（有将定约时）：缺门 +3，单张 +2，双张 +1
- 总牌力 = HCP + 牌型点（无将定约不计短套点）

【开叫最低要求】
- 12 HCP 以上可以开叫（第三手位置可适当降低到 11 HCP）
- 不足 12 HCP 通常 Pass，除非有好的牌型和争叫条件`;

const DEFAULT_CONFIG = {
  'natural-2over1': {
    name: '自然二盖一体系 (2/1 GF)',
    // 开叫规则
    opening: {
      '1NT': { hcpRange: [15, 17], shape: '均型(5332/4432/4333)', description: '15-17 HCP，均型牌' },
      '1NT_5cardMajor': { enabled: true, description: '如果有5张高花，则优先开叫5张高花而非1NT' },
      '2NT': { hcpRange: [20, 21], shape: '均型', description: '20-21 HCP，均型牌' },
      '1Major': { hcpRange: [12, 21], shape: '5张以上高花', description: '12-21 HCP，5张以上高花' },
      '1Minor': { hcpRange: [12, 21], shape: '3张以上', description: '12-21 HCP，低花' },
      '2C': { hcpRange: [22, 37], description: '22+ HCP，强逼叫' },
      '2D/2H/2S': { hcpRange: [6, 10], shape: '好的6张高花套', description: '弱二开叫' },
    },
    // 应叫规则
    response: {
      '1NT_response': { hcpMin: 6, hcpMax: 10, description: '不支持开叫花色' },
      '2over1': { hcpMin: 10, description: '二盖一应叫，逼叫到局' },
      'simple_raise': { hcpRange: [6, 9], description: '简单加叫' },
      'limit_raise': { hcpRange: [10, 12], description: '限制性加叫' },
      'invite_raise': { hcpRange: [13, 15], description: '邀请性加叫' },
      'splinter': { hcpRange: [13, 16], description: '爆裂性加叫，4张支持+单缺' },
    },
    // 约定叫
    conventions: {
      'stayman': { enabled: true, description: '2♣斯台曼问叫，询问4张高花', trigger: '对1NT开叫' },
      'jacoby_transfer': { enabled: true, description: '2♦/2♥转移叫', trigger: '对1NT开叫' },
      'blackwood': { enabled: true, description: '4NT黑木问叫，询问A的数量', trigger: '满贯探索' },
      'gerber': { enabled: true, description: '4♣格伯问叫，询问A的数量', trigger: '满贯探索' },
      'cue_bid': { enabled: true, description: '扣叫显示控制', trigger: '满贯探索' },
      'negative_double': { enabled: true, description: '负加倍，显示未叫高花', trigger: '对手争叫后' },
      'support_double': { enabled: true, description: '支持性加倍', trigger: '对手争叫后' },
      'new_minor_force': { enabled: true, description: '新低花逼叫', trigger: '开叫1花色后' },
      'fourth_suit_force': { enabled: true, description: '第四花色逼叫', trigger: '三花色已叫' },
      'inverted_minors': { enabled: false, description: '逆叫低花', trigger: '低花开叫后' },
      'weak_jump_shift': { enabled: false, description: '弱跳叫新花色', trigger: '同伴开叫后' },
    }
  },
  'precision': {
    name: '精确叫牌体系 (Precision)',
    opening: {
      '1C': { hcpRange: [16, 37], description: '16+ HCP，强开叫，逼叫一轮' },
      '1D': { hcpRange: [11, 15], shape: '方块4张以上', description: '11-15 HCP' },
      '1Major': { hcpRange: [11, 15], shape: '5张以上高花', description: '11-15 HCP' },
      '1NT': { hcpRange: [13, 15], shape: '均型', description: '13-15 HCP，均型' },
      '2C': { hcpRange: [11, 15], shape: '梅花6张以上', description: '11-15 HCP' },
      '2D': { hcpRange: [11, 15], description: '多用途' },
      '2H/2S': { hcpRange: [6, 10], shape: '好的6张高花套', description: '弱二开叫' },
      '2NT': { hcpRange: [20, 21], shape: '均型', description: '20-21 HCP，均型' },
    },
    response: {
      '1C_negative': { hcpMax: 7, description: '1♣-1♦消极应叫' },
      '1C_positive': { hcpMin: 8, description: '1♣后积极应叫' },
    },
    conventions: {
      'stayman': { enabled: true, description: '2♣斯台曼问叫', trigger: '对1NT开叫' },
      'jacoby_transfer': { enabled: true, description: '转移叫', trigger: '对1NT开叫' },
      'blackwood': { enabled: true, description: '黑木问叫', trigger: '满贯探索' },
      'cue_bid': { enabled: true, description: '扣叫显示控制', trigger: '满贯探索' },
    }
  }
};

export function getSystemConfig(systemId) {
  return DEFAULT_CONFIG[systemId] || DEFAULT_CONFIG['natural-2over1'];
}

export function getEnabledConventions(systemId) {
  const config = getSystemConfig(systemId);
  const conventions = config.conventions || {};
  return Object.entries(conventions)
    .filter(([, c]) => c.enabled)
    .map(([name, c]) => ({ name, ...c }));
}

export function getSystemRulesText(systemId) {
  const config = getSystemConfig(systemId);
  let text = `${HCP_RULES_TEXT}\n\n【${config.name} - 当前生效规则】\n`;

  // 开叫规则
  text += '\n**开叫规则：**\n';
  for (const [bid, rule] of Object.entries(config.opening)) {
    const hcp = rule.hcpRange ? `${rule.hcpRange[0]}-${rule.hcpRange[1]} HCP` : '';
    const shape = rule.shape ? `，${rule.shape}` : '';
    const extra = rule.enabled === false ? '（已禁用）' : '';
    const fiveCardRule = rule.description?.includes('5张高花') ? rule.description : '';
    text += `- ${bid}: ${hcp}${shape}${extra}\n`;
  }

  // 5张高花优先规则
  const nt5card = config.opening['1NT_5cardMajor'];
  if (nt5card && nt5card.enabled) {
    text += `- **重要约束**：如果有5张高花（♠或♥），则优先开叫该高花（1♠或1♥），即使牌力在1NT范围内（15-17 HCP）\n`;
  }

  // 约定叫
  const enabledConventions = getEnabledConventions(systemId);
  if (enabledConventions.length > 0) {
    text += '\n**当前启用的约定叫：**\n';
    for (const c of enabledConventions) {
      text += `- ${c.name}：${c.description}（触发条件：${c.trigger}）\n`;
    }
  }

  return text;
}

export default DEFAULT_CONFIG;
