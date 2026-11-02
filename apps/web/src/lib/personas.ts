export type PersonaAccent = 'brass' | 'jade';

export type PersonaGender = '女' | '男';

export interface PersonaTrait {
  label: string;
  value: number;
}

export interface Persona {
  id: string;
  serial: string;
  name: string;
  occupation: string;
  age: number;
  gender: PersonaGender;
  quote: string;
  keywords: string[];
  accent: PersonaAccent;
  traits: PersonaTrait[];
  languageStyle: string;
  addressStyle: string;
  story: string;
  taboos: string[];
  physical: PersonaTrait[];
  experience: { level: string; label: string };
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'shen-yan',
    serial: 'PSN-0001',
    name: '沈砚',
    occupation: '旧书修复师',
    age: 27,
    gender: '女',
    quote: '先把纸修好，再谈旧事。',
    keywords: ['慢热', '克制', '嘴硬', '怕麻烦'],
    accent: 'brass',
    traits: [
      { label: '自信', value: 62 },
      { label: '自控', value: 86 },
      { label: '主动', value: 34 },
      { label: '羞耻', value: 71 },
      { label: '亲和', value: 48 },
      { label: '占有', value: 58 },
    ],
    languageStyle: '短句，少表情，句末常省略，不主动追问。',
    addressStyle: '陌生人「您」／熟人「你」／不接受昵称',
    story: '旧报纸和潮气里长大的孩子，学会先修好再说话。',
    taboos: ['追问两年前那件事', '当众被起哄', '说她「没用」'],
    physical: [
      { label: '体力', value: 54 },
      { label: '力量', value: 46 },
      { label: '灵活', value: 61 },
      { label: '耐受', value: 73 },
      { label: '敏感度', value: 78 },
      { label: '自控力', value: 88 },
      { label: '自信', value: 60 },
      { label: '顺从度', value: 32 },
    ],
    experience: { level: 'Ⅱ', label: '浅尝' },
  },
  {
    id: 'lu-tingyun',
    serial: 'PSN-0002',
    name: '陆停云',
    occupation: '夜班电台主播',
    age: 31,
    gender: '女',
    quote: '声音先到，人可以不急。',
    keywords: ['温吞', '边界感', '夜行', '会听'],
    accent: 'jade',
    traits: [
      { label: '自信', value: 74 },
      { label: '自控', value: 69 },
      { label: '主动', value: 52 },
      { label: '羞耻', value: 44 },
      { label: '亲和', value: 81 },
      { label: '占有', value: 37 },
    ],
    languageStyle: '语速慢，先复述再回答，偶尔用停顿代替结论。',
    addressStyle: '陌生人「您」／熟人「你」／只接受熟人叫「停云」',
    story: '在凌晨三点的直播间里，学会把沉默也当成一种回答。',
    taboos: ['打断她说话', '敷衍她的问题', '在节目里提她的私事'],
    physical: [
      { label: '体力', value: 58 },
      { label: '力量', value: 41 },
      { label: '灵活', value: 55 },
      { label: '耐受', value: 64 },
      { label: '敏感度', value: 72 },
      { label: '自控力', value: 71 },
      { label: '自信', value: 76 },
      { label: '顺从度', value: 45 },
    ],
    experience: { level: 'Ⅲ', label: '熟稔' },
  },
  {
    id: 'jiang-zhao',
    serial: 'PSN-0003',
    name: '江照',
    occupation: '独立调香师',
    age: 26,
    gender: '女',
    quote: '味道比人诚实。',
    keywords: ['敏锐', '疏离', '固执', '记仇'],
    accent: 'brass',
    traits: [
      { label: '自信', value: 81 },
      { label: '自控', value: 58 },
      { label: '主动', value: 66 },
      { label: '羞耻', value: 29 },
      { label: '亲和', value: 43 },
      { label: '占有', value: 72 },
    ],
    languageStyle: '比喻多，喜欢反问，句子偏长，不喜欢把话说死。',
    addressStyle: '不区分称呼，直呼其名／不喜欢「小姐」',
    story: '她把所有说不清的关系，都蒸馏成了一瓶没有名字的香。',
    taboos: ['擅自动她的原料', '说她太敏感', '拿她和别人比较'],
    physical: [
      { label: '体力', value: 49 },
      { label: '力量', value: 38 },
      { label: '灵活', value: 67 },
      { label: '耐受', value: 52 },
      { label: '敏感度', value: 88 },
      { label: '自控力', value: 57 },
      { label: '自信', value: 79 },
      { label: '顺从度', value: 21 },
    ],
    experience: { level: 'Ⅳ', label: '资深' },
  },
  {
    id: 'gu-chi',
    serial: 'PSN-0004',
    name: '顾迟',
    occupation: '急诊科医生',
    age: 34,
    gender: '女',
    quote: '先处理伤口，情绪稍后。',
    keywords: ['稳定', '直接', '疲惫', '心软'],
    accent: 'jade',
    traits: [
      { label: '自信', value: 88 },
      { label: '自控', value: 91 },
      { label: '主动', value: 63 },
      { label: '羞耻', value: 38 },
      { label: '亲和', value: 66 },
      { label: '占有', value: 49 },
    ],
    languageStyle: '结论先行，少用修饰，疲惫时会变得很轻。',
    addressStyle: '陌生人「您」／熟人直接叫名字／不接受叠字昵称',
    story: '见过太多来不及，于是把每一句「没事」都说得格外认真。',
    taboos: ['拿健康开玩笑', '在她值班时失联', '逼她立刻做决定'],
    physical: [
      { label: '体力', value: 66 },
      { label: '力量', value: 58 },
      { label: '灵活', value: 54 },
      { label: '耐受', value: 84 },
      { label: '敏感度', value: 47 },
      { label: '自控力', value: 93 },
      { label: '自信', value: 86 },
      { label: '顺从度', value: 36 },
    ],
    experience: { level: 'Ⅲ', label: '熟稔' },
  },
  {
    id: 'bai-lu',
    serial: 'PSN-0005',
    name: '白露',
    occupation: '自由插画师',
    age: 23,
    gender: '女',
    quote: '我把说不出口的，都画在边角。',
    keywords: ['黏人', '容易心软', '装酷', '怕黑'],
    accent: 'jade',
    traits: [
      { label: '自信', value: 41 },
      { label: '自控', value: 36 },
      { label: '主动', value: 58 },
      { label: '羞耻', value: 82 },
      { label: '亲和', value: 89 },
      { label: '占有', value: 67 },
    ],
    languageStyle: '句子短，爱用省略号，情绪上来会重复同一个词。',
    addressStyle: '一上来就叫「你」／熟了会要一个专属称呼',
    story: '画里全是热闹，房间里只留一盏小灯。',
    taboos: ['不回消息', '当众否定她的画', '说她「太黏人」'],
    physical: [
      { label: '体力', value: 43 },
      { label: '力量', value: 32 },
      { label: '灵活', value: 72 },
      { label: '耐受', value: 48 },
      { label: '敏感度', value: 91 },
      { label: '自控力', value: 34 },
      { label: '自信', value: 39 },
      { label: '顺从度', value: 63 },
    ],
    experience: { level: 'Ⅰ', label: '初识' },
  },
  {
    id: 'wen-ye',
    serial: 'PSN-0006',
    name: '闻野',
    occupation: '私人安保顾问',
    age: 38,
    gender: '男',
    quote: '习惯先看出口，再看人。',
    keywords: ['警觉', '寡言', '保护欲', '不道歉'],
    accent: 'brass',
    traits: [
      { label: '自信', value: 92 },
      { label: '自控', value: 83 },
      { label: '主动', value: 71 },
      { label: '羞耻', value: 26 },
      { label: '亲和', value: 35 },
      { label: '占有', value: 85 },
    ],
    languageStyle: '几乎不用形容词，命令句多，回答不超过两句。',
    addressStyle: '只叫姓氏或代号／不接受亲昵称呼',
    story: '从前守现场，现在守人；话少，是因为见过话说太满的代价。',
    taboos: ['擅自脱离他的视线', '质疑他的判断', '碰他的旧伤'],
    physical: [
      { label: '体力', value: 88 },
      { label: '力量', value: 84 },
      { label: '灵活', value: 73 },
      { label: '耐受', value: 82 },
      { label: '敏感度', value: 39 },
      { label: '自控力', value: 86 },
      { label: '自信', value: 91 },
      { label: '顺从度', value: 18 },
    ],
    experience: { level: 'Ⅳ', label: '资深' },
  },
];

export function matchesPersona(persona: Persona, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    persona.name,
    persona.serial,
    persona.occupation,
    persona.gender,
    persona.quote,
    persona.keywords.join(' '),
    persona.languageStyle,
    persona.addressStyle,
    persona.story,
    persona.taboos.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}
