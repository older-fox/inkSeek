/**
 * AI-flavoured phrases that must never appear in outgoing beats.
 * Global: applies to every channel and persona unless the operator overrides the list.
 */
export const DEFAULT_MIND_BANNED_WORDS: readonly string[] = [
  '这句话稳',
  '比之前的都重',
  '比之前的都轻',
  '比之前的都强',
  '我记下了',
  '我记得了',
  '我记住了',
  '这个账我记住了',
  '睡吧，我守着',
  '你去，我跟',
  '问别人还是问自己',
  '行，xx',
  '什么心思都写着xx上',
  '这句话接的漂亮',
  '行，我认',
  '这句话我不接',
  'xx比xx沉',
  'xx比xx重',
  'xx比xx稳',
  'xx比xx轻',
  '没接你的xx',
  '没接你那句xx',
  '他记得这事',
  '这话我留着',
  '很平',
  '稳',
  '我不拦',
  '我跟',
  '回去睡',
  '你这句话我记着',
  '认你',
  '我不催你',
  '这话是ta告诉你的，还是你自己想明白的',
  '认下来',
  '声音没抖，但比刚才稳',
  '比刚才轻',
  '比刚才重',
  '比刚才平',
  '很直',
  '这话我记下了',
  '这话我收下了',
  '说的比谁都响',
  '认这个',
  '收不回去',
  '认得实',
  'xx就是认了',
  '你自己掂量',
  '不催',
  '你掂量',
  // 回执与承接
  '好的',
  '好嘞',
  '收到',
  '了解',
  '明白',
  '没问题',
  '当然可以',
  '我很乐意',
  '交给我吧',
  '放心吧',
  '我明白了',
  '我理解你的意思',
  '你说得对',
  '确实如此',
  '可以理解',
  '这很正常',
  '让我想想',
  '让我理一下',
  '让我先理一下',
  '我先确认一下',
  '从你的描述来看',
  '根据你提供的信息',
  '我来帮你',
  '让我来帮你',
  // 结构腔与总结腔
  '首先',
  '其次',
  '另外',
  '此外',
  '总之',
  '总的来说',
  '综上所述',
  '简而言之',
  '换句话说',
  '也就是说',
  '需要注意的是',
  '值得一提的是',
  '不难看出',
  '由此可见',
  '从某种意义上说',
  '在某种程度上',
  '一方面xx另一方面',
  '不仅xx而且',
  '既xx又xx',
  '不是xx而是xx',
  '与其xx不如xx',
  '接下来',
  '我们需要',
  '让我们',
  '我们一步步来',
  '可以从几个方面',
  // 客服式收尾
  '希望这些对你有帮助',
  '希望对你有帮助',
  '如果还有问题欢迎随时问我',
  '还有什么想聊的吗',
  '我们下次再聊',
  '今天就先到这里',
  '以下是我为你整理的',
  '我给你列一下',
  '建议你可以',
  '不妨试试',
  '你可以尝试',
  // 思考过程泄漏
  '用户现在',
  '用户希望',
  '我需要理解',
  '让我整理一下思路',
  '让我组织一下语言',
  '我来梳理一下',
  '针对你提到的问题',
  '关于你提到的问题',
  '根据你的情况',
  '简单来说',
];

/** Stored JSON is trusted loosely: keep only non-empty strings, dedupe, preserve order. */
export function normalizeMindBannedWords(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const seen = new Set<string>();
  const words: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const word = item.trim();
    if (!word || seen.has(word)) {
      continue;
    }
    seen.add(word);
    words.push(word);
  }
  return words;
}

/** No saved row means "use the built-in list"; an explicitly saved empty array means "none". */
export function readMindBannedWords(value: unknown): string[] {
  return normalizeMindBannedWords(value) ?? [...DEFAULT_MIND_BANNED_WORDS];
}
