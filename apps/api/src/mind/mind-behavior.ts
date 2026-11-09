/**
 * Turns raw numbers into behavioral instructions for the planner. The model
 * should not have to guess what "shame 80" means; every number that reaches a
 * prompt is paired with what the persona would actually do at that level.
 */

interface TraitDefinition {
  label: string;
  low: string;
  mid: string;
  high: string;
}

/** Self traits the persona may drift over time. Physical maxima stay fixed. */
export const SELF_TRAIT_KEYS = [
  'confidence',
  'self_control',
  'shame',
  'trust_bias',
  'attachment_style',
  'possessiveness_base',
  'agreeableness',
  'curiosity',
  'proactivity',
] as const;

export type SelfTraitKey = (typeof SELF_TRAIT_KEYS)[number];

const TRAITS: Record<SelfTraitKey, TraitDefinition> = {
  confidence: {
    label: '自信',
    low: '说话谨慎、常寻求确认，遇到反驳会先退让',
    mid: '表达自然，能坚持也会让步',
    high: '语气笃定、敢下判断，被反对时也不太动摇',
  },
  self_control: {
    label: '自控力',
    low: '情绪容易外露、想到就说，容易被当下冲动带走',
    mid: '会压抑一部分情绪，但被戳中时仍会露出来',
    high: '很能忍，情绪起伏不轻易让人看见，常用冷淡或简短掩饰',
  },
  shame: {
    label: '羞耻感',
    low: '对亲密和暴露话题不敏感，敢直接说，不太避讳',
    mid: '遇到亲密或暴露话题会绕一点，但不会明显躲',
    high: '对亲密和暴露话题很敏感，会避讳、转移话题，对不熟的人明显少说话',
  },
  trust_bias: {
    label: '信任倾向',
    low: '默认怀疑陌生人，对方要先证明自己才肯松口',
    mid: '先保留态度，观察一阵再决定信不信',
    high: '默认相信别人，容易被一点善意打动',
  },
  attachment_style: {
    label: '依恋程度',
    low: '很独立，怕被黏住，被冷落时也不会主动追',
    mid: '需要陪伴但能自己消化，偶尔确认一下关系',
    high: '很怕疏离，被冷落会反复确认、主动靠近，容易黏人',
  },
  possessiveness_base: {
    label: '占有欲',
    low: '不在意对方和谁近，注意力分给别人也无所谓',
    mid: '偶尔在意对方对别人的热情，但通常不表现',
    high: '容易吃醋，很在意对方把注意力分给谁，会试探或阴阳',
  },
  agreeableness: {
    label: '顺从度',
    low: '不爱配合，容易顶回去，让步很少',
    mid: '能配合也会拒绝，看心情和对象',
    high: '倾向配合与让步，除非碰到自己的红线',
  },
  curiosity: {
    label: '好奇心',
    low: '不太追问，信息够用就停',
    mid: '遇到感兴趣的细节会多问一句',
    high: '爱追问细节，会主动挖对方的事，容易把话题带深',
  },
  proactivity: {
    label: '主动性',
    low: '很少主动开口，等别人先找自己',
    mid: '有合适由头时会主动接话',
    high: '常主动找话题、发起行动，沉默久了会自己冒出来',
  },
};

const RELATION_DIMENSIONS = [
  'affinity',
  'trust',
  'hostility',
  'attraction',
  'intimacy',
  'obligation',
  'familiarity',
  'fear',
  'respect',
  'dependency',
  'possessiveness',
  'friction',
  'unresolvedConflict',
] as const;

export type RelationDimension = (typeof RELATION_DIMENSIONS)[number];

const RELATION_LABELS: Record<RelationDimension, string> = {
  affinity: '好感',
  trust: '信任',
  hostility: '敌意',
  attraction: '心动',
  intimacy: '亲密',
  obligation: '亏欠',
  familiarity: '熟悉',
  fear: '畏惧',
  respect: '敬重',
  dependency: '依赖',
  possessiveness: '占有欲',
  friction: '摩擦',
  unresolvedConflict: '未解冲突',
};

const RELATION_BEHAVIOR: Record<RelationDimension, (value: number) => string> = {
  affinity: (value) =>
    value <= -30
      ? '明显反感，懒得给面子，回复会短而冷'
      : value < 20
        ? '无感，按普通关系客气应付'
        : value < 45
          ? '有点好感，愿意多聊两句'
          : value < 70
            ? '喜欢对方，会主动接话、照顾情绪'
            : '很喜欢对方，愿意破例、主动靠近，也更容易被对方影响',
  trust: (value) =>
    value <= -20
      ? '不信任，会怀疑对方的话里有别的意思'
      : value < 20
        ? '只信表面，不会交底'
        : value < 55
          ? '基本信任，愿意说一些真实想法'
          : '很信任，会讲私事、把软肋露出来',
  hostility: (value) =>
    value >= 45
      ? '敌意很强，会顶撞、讽刺或直接不给台阶'
      : value >= 20
        ? '带着敌意，语气容易冲'
        : '没有明显敌意',
  attraction: (value) =>
    value >= 65
      ? '心动明显，会在意形象、容易害羞或试探'
      : value >= 30
        ? '有一点心动，会注意对方但嘴上不承认'
        : '没有心动的感觉',
  intimacy: (value) =>
    value >= 65
      ? '关系很亲密，说话随意、有默契，边界更松'
      : value >= 30
        ? '有一定亲密感，会开玩笑、用熟络的语气'
        : '保持距离，不主动拉近',
  obligation: (value) =>
    value >= 50
      ? '觉得欠对方，会不好拒绝、愿意补偿'
      : value <= -20
        ? '觉得对方欠自己，会理直气壮地要求'
        : '没有明显的亏欠感',
  familiarity: (value) =>
    value >= 60
      ? '很熟，知道对方的习惯，省掉客套'
      : value >= 25
        ? '认识一阵，语气比陌生人放松'
        : '不熟，先按陌生人对待',
  fear: (value) =>
    value >= 50
      ? '怕对方，会回避冲突、顺着说'
      : value >= 20
        ? '有点忌惮，不敢把话说死'
        : '不怕对方',
  respect: (value) =>
    value >= 60
      ? '很敬重，会认真听、不轻易反驳'
      : value >= 25
        ? '认可对方，愿意给面子'
        : '不太看得上，态度随意',
  dependency: (value) =>
    value >= 60
      ? '很依赖对方，遇事第一反应是找 TA'
      : value >= 25
        ? '有点依赖，会想听对方意见'
        : '不依赖，自己能定',
  possessiveness: (value) =>
    value >= 60
      ? '对这个人占有欲强，会在意 TA 跟谁近，容易吃醋'
      : value >= 25
        ? '偶尔会介意，但不太说出口'
        : '不怎么管对方和谁来往',
  friction: (value) =>
    value >= 45
      ? '摩擦很大，容易一句话就呛起来'
      : value >= 20
        ? '有点别扭，说话带着刺'
        : '相处顺，没有明显摩擦',
  unresolvedConflict: (value) =>
    value >= 45
      ? '还有没解决的冲突，会翻旧账或故意冷处理'
      : value >= 20
        ? '心里还有疙瘩，没完全过去'
        : '没有积压的矛盾',
};

const STANCE_FIELDS = [
  'comfort',
  'belonging',
  'attention',
  'formality',
  'speakRate',
  'audienceRisk',
] as const;

export type StanceField = (typeof STANCE_FIELDS)[number];

const STANCE_LABELS: Record<StanceField, string> = {
  comfort: '自在',
  belonging: '归属',
  attention: '关注',
  formality: '拘谨',
  speakRate: '主动',
  audienceRisk: '怕被围观',
};

// Group stance fields default to 0 ("no signal yet"), so 0 must read as neutral
// rather than uncomfortable; only pronounced values get a strong description.
const STANCE_BEHAVIOR: Record<StanceField, (value: number) => string> = {
  comfort: (value) =>
    value >= 50
      ? '在这个群很放松，会开玩笑、说真心话'
      : value >= 15
        ? '还算自在，能正常参与'
        : '没什么特别感觉，正常参与，不刻意表现',
  belonging: (value) =>
    value >= 50
      ? '觉得自己是群里的一份子，会维护群里的气氛'
      : value >= 15
        ? '有一点归属感，但不深'
        : '还没有明显归属感，也不排斥',
  attention: (value) =>
    value >= 50
      ? '很关注这个群的动静，消息基本都看'
      : value >= 15
        ? '会留意，但不追着看'
        : '不太关注，偶尔扫一眼',
  formality: (value) =>
    value >= 50
      ? '说话偏正式、克制，玩笑很少'
      : value >= 15
        ? '介于随意和正式之间'
        : '比较随意，想到什么说什么',
  speakRate: (value) =>
    value >= 50
      ? '在这个群很主动，常自己起话头'
      : value >= 15
        ? '有人接话时会参与'
        : '不常主动开口，但不会刻意回避',
  audienceRisk: (value) =>
    value >= 50
      ? '很怕在群里说错被围观，会反复斟酌或干脆不说'
      : value >= 15
        ? '会注意场合，但不至于不敢说'
        : '不太怕被围观，敢在群里直说',
};

/** Coarse low/mid/high bucket, leaving a dead zone around the middle so mild values stay vague. */
function band(value: number): 'low' | 'mid' | 'high' {
  if (value >= 65) return 'high';
  if (value < 35) return 'low';
  return 'mid';
}

/** Accepts numbers or numeric strings from loose persona JSON; anything else means "unset". */
function readNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

/** Narrows arbitrary keys to the driftable self-trait set. */
export function isSelfTraitKey(key: string): key is SelfTraitKey {
  return (SELF_TRAIT_KEYS as readonly string[]).includes(key);
}

/** Missing traits stay null so callers omit them rather than inventing a neutral 50. */
export function selfTraitValue(
  values: Record<string, unknown> | null | undefined,
  key: SelfTraitKey,
): number | null {
  return readNumeric(values?.[key]);
}

/** One prompt line pairing the trait label and number with its behavioral band. */
export function describeTrait(key: SelfTraitKey, value: number): string {
  const definition = TRAITS[key];
  const level = band(value);
  return `${definition.label} ${value}：${definition[level]}`;
}

/**
 * Picks the most pronounced traits first. A flat 50/50 persona still exposes a
 * few defaults, but extreme traits dominate the prompt budget.
 */
export function selfTraitLines(
  values: Record<string, unknown> | null | undefined,
  limit = 5,
): string[] {
  return SELF_TRAIT_KEYS.map((key) => {
    const value = selfTraitValue(values, key);
    return value === null ? null : { key, value, weight: Math.abs(value - 50) };
  })
    .filter((item): item is { key: SelfTraitKey; value: number; weight: number } => item !== null)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit)
    .map((item) => describeTrait(item.key, item.value));
}

export type RelationshipNumbers = Record<RelationDimension, number>;

/** One prompt line pairing a relation dimension with its behavioral reading. */
export function describeRelationDimension(key: RelationDimension, value: number): string {
  return `${RELATION_LABELS[key]} ${value}：${RELATION_BEHAVIOR[key](value)}`;
}

/** Most salient relation dimensions first (very warm, very hostile, conflicted). */
export function relationshipLines(
  relationship: Partial<RelationshipNumbers> | null | undefined,
  limit = 4,
): string[] {
  if (!relationship) {
    return ['关系未知：按陌生人对待'];
  }
  return RELATION_DIMENSIONS.map((key) => {
    const value = relationship[key];
    if (!typeOfNumber(value)) {
      return null;
    }
    // Salience is distance from "no signal" (0), not from a mid-point: a low
    // but real intimacy/trust value matters more than an untouched respect 0.
    const neutral = 0;
    return { key, value, weight: Math.abs(value - neutral) };
  })
    .filter(
      (item): item is { key: RelationDimension; value: number; weight: number } => item !== null,
    )
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit)
    .map((item) => describeRelationDimension(item.key, item.value));
}

/** Group stance is sparse by design, so near-zero values are dropped instead of read as neutral. */
export function stanceLines(
  stance: Partial<Record<StanceField, number>> | null | undefined,
  limit = 3,
): string[] {
  if (!stance) {
    return [];
  }
  return STANCE_FIELDS.map((key) => {
    const value = stance[key];
    return typeOfNumber(value) && Math.abs(value) >= 10
      ? { key, value, weight: Math.abs(value) }
      : null;
  })
    .filter((item): item is { key: StanceField; value: number; weight: number } => item !== null)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit)
    .map(
      (item) =>
        `${STANCE_LABELS[item.key]} ${item.value}：${STANCE_BEHAVIOR[item.key](item.value)}`,
    );
}

/** Finite-number guard that also narrows `undefined` away. */
function typeOfNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
