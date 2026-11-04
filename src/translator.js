'use strict';
/**
 * 金手指名称自动汉化引擎
 *
 * 策略（按优先级）：
 *  1) 整句精确匹配短语库      —— 最准确，如 "Godmode" → "无敌"
 *  2) 规则模式匹配             —— 如 "Max XXX" / "Infinite XXX" / "XXX x99"
 *  3) 词组替换（长词优先）    —— 在剩余文本上做多词短语替换
 *  4) 保留未识别内容原样        —— 数字、按键、符号、专有名词不乱动
 *
 * 目标：产出「玩家看着舒服」的中文名，而不是逐字硬翻。
 */

// ---------------------------------------------------------------- 词库

/** 整句 / 强特征短语：左边英文，右边中文。匹配时忽略大小写与首尾空格 */
const PHRASES = {
  // —— 无敌 / 生存 ——
  'god mode': '无敌',
  'godmode': '无敌',
  'god mode on': '开启无敌',
  'godmode on': '开启无敌',
  'immortal': '不死之身',
  'invincible': '无敌',
  'invincibility': '无敌',
  'no damage': '免伤',
  'no damage taken': '免受伤害',
  'damage immunity': '伤害免疫',
  'cannot die': '不死',
  'never die': '不死',
  'undying': '不灭',
  'survival mode': '生存模式',
  'one hit kill': '一击必杀',
  '1 hit kill': '一击必杀',
  'one-shot kill': '一击必杀',
  'one shot kill': '一击必杀',
  'instant kill': '秒杀',
  'kill all enemies': '秒杀全部敌人',
  'kill all': '秒杀全部',
  'health': '生命值',
  'player health': '玩家生命值',
  'infinite health': '无限生命值',
  'max health': '最大生命值',
  'hp': '生命值',
  'health regen': '生命回复',
  'health regeneration': '生命回复',
  'regeneration': '生命回复',

  // —— 无限 / 不消耗 ——
  'infinite': '无限',
  'inf': '无限',
  'unlimited': '无限',
  'unlimited ammo': '无限弹药',
  'infinite ammo': '无限弹药',
  'infinite money': '无限金钱',
  'infinite resources': '无限资源',
  'infinite energy': '无限能量',
  'infinite stamina': '无限体力',
  'infinite skill points': '无限技能点',
  'infinite skillpoints': '无限技能点',
  'infinite skills points': '无限技能点',
  'infinite items': '无限道具',
  'all items': '全部道具',
  'all items unlocked': '解锁全部道具',
  'infinite items unlocked': '解锁全部道具',
  'unlock all items': '解锁全部道具',
  'infinite arrows': '无限箭矢',
  'infinite bullets': '无限子弹',
  'infinite grenades': '无限手雷',
  'infinite medkits': '无限医疗包',
  'infinite fuel': '无限燃料',
  'infinite battery': '无限电池',
  'infinite potions': '无限药水',
  'infinite rockets': '无限火箭',
  'infinite missile barrage': '无限导弹齐射',
  'infinite ammo and grenade usage': '无限弹药与手雷',
  'infinite afterburner': '无限推进器',
  'infinite supermeter': '无限超能槽',
  'infinite gauge': '无限能量槽',
  'infinite claw': '无限爪击',
  'infinite mp': '无限魔力',
  'infinite skill point': '无限技能点',
  'infinite score': '无限分数',
  'infinite lives': '无限命数',
  'infinite ammunition': '无限弹药',
  'infinite item': '无限道具',
  'infinite super meter': '无限超能槽',
  'infinite points': '无限点数',
  'infinite coins': '无限金币',

  // —— 数值类 ——
  'max': '最大',
  'maximum': '最大',
  'max level': '满级',
  'max money': '满金钱',
  'max score': '满分数',
  'max xp': '满经验',
  'max exp': '满经验',
  'max xp level': '满经验等级',
  'max player xp level': '玩家满经验等级',
  'max ammo': '满弹药',
  'max health': '最大生命值',
  'max items': '道具全收集',
  'max resources': '资源全满',
  'max resources on get': '获取时资源全满',
  'max xp on get': '获取时经验全满',
  'max skillpoints': '技能点全满',
  'max inf hp': '无限满生命',
  'max inf fury': '无限满怒火',
  'max inf ammo': '无限满弹药',
  'max inf canteen': '无限满水壶',
  'max inf fuel': '无限满燃料',
  'max inf scraps': '无限满废料',
  'max special combo': '满必杀连段',
  'max combo': '满连段',
  'max money on pick': '拾取时满金钱',
  'max access cards': '通行证全满',
  'max arsenal keys': '军械库钥匙全满',
  'max scraps and canteen': '废料与水壶全满',
  'max batmobile health': '蝙蝠车满血',
  'max batmobile armour': '蝙蝠车满装甲',
  'hit for max special combo': '命中触发满必杀连段',
  'super': '超级',
  'super meter': '超能槽',
  'special combo': '必杀连段',
  'combo': '连段',

  // —— 金币 / 货币 / 分数 ——
  'money': '金钱',
  'cash': '现金',
  'coins': '金币',
  'gold': '金币',
  'currency': '货币',
  'score': '分数',
  'points': '点数',
  'skill points': '技能点',
  'skillpoints': '技能点',
  'xp': '经验值',
  'exp': '经验值',
  'experience': '经验值',
  'level': '等级',
  'lums': '卢姆',
  'shards': '碎片',
  'shard': '碎片',
  'scrap': '废料',
  'scraps': '废料',
  'resources': '资源',
  'material': '材料',
  'materials': '材料',

  // —— 弹药 / 武器 ——
  'ammo': '弹药',
  'ammunition': '弹药',
  'no reload': '无需装填',
  'reload': '装填',
  'no reloading': '无需装填',
  'infinite reload': '无限装填',
  'weapon': '武器',
  'weapons': '武器',
  'weapon slot': '武器栏',
  'all weapons': '全部武器',
  'unlock all weapons': '解锁全部武器',
  'arsenal': '军械库',
  'grenade': '手雷',
  'grenades': '手雷',
  'grenates': '手雷',
  'missile': '导弹',
  'missiles': '导弹',
  'missile barrage': '导弹齐射',
  'rocket': '火箭',
  'rockets': '火箭',
  'bomb': '炸弹',
  'bombs': '炸弹',
  'arrow': '箭矢',
  'arrows': '箭矢',
  'bullet': '子弹',
  'bullets': '子弹',
  'medkit': '医疗包',
  'medkits': '医疗包',
  'fuel': '燃料',
  'battery': '电池',
  'durability': '耐久度',
  'inf ammunition': '无限弹药',
  'damage': '伤害',
  'attack': '攻击',
  'defense': '防御',
  'speed': '速度',
  'fast': '快速',
  'slow': '缓慢',
  'slow motion': '慢动作',
  'slow mo': '慢动作',
  'bullet time': '子弹时间',
  'time slow': '时间减速',

  // —— 技能 / 能力 ——
  'skill': '技能',
  'skills': '技能',
  'skill point': '技能点',
  'skill points': '技能点',
  'points of use': '使用次数',
  'power': '力量',
  'strength': '力量',
  'agility': '敏捷',
  'reflex': '反应',
  'intelligence': '智力',
  'ability': '能力',
  'abilities': '能力',
  'power up': '强化',
  'upgrade': '升级',
  'unlock': '解锁',
  'unlocked': '已解锁',
  'unlock all': '全部解锁',
  'unlock everything': '解锁全部',
  'all unlocked': '全部解锁',

  // —— 物品 / 消耗品 ——
  'item': '道具',
  'items': '道具',
  'potion': '药水',
  'potions': '药水',
  'elixir': '灵药',
  'food': '食物',
  'health pack': '医疗包',
  'armour': '装甲',
  'armor': '装甲',
  'shield': '护盾',
  'immortality': '不朽',

  // —— 敌人 / 战斗 ——
  'enemy': '敌人',
  'enemies': '敌人',
  'boss': '首领',
  'bosses': '首领',
  'battle': '战斗',
  'combat': '战斗',
  'fight': '战斗',
  'all enemies': '全部敌人',
  'enemy health': '敌人生命值',
  'infinite armour': '无限装甲',

  // —— 时间 / 计时 ——
  'timer': '计时器',
  'timers': '计时器',
  'freeze timer': '冻结计时器',
  'freeze countdown timer': '冻结倒计时',
  'freeze elapse timer': '冻结经过时间',
  'no waiting time': '无需等待',
  'countdown': '倒计时',
  'time': '时间',
  'instant': '瞬间',
  'instantly': '瞬间',
  'instant kill all': '瞬间秒杀全部',

  // —— 状态 / 开关 ——
  'disable': '禁用',
  'disable all': '禁用全部',
  'enable': '启用',
  'enabled': '已启用',
  'toggle': '开关',
  'toggel': '开关',
  'always': '始终',
  'never': '永不',
  'no cooldown': '无冷却',
  'cooldown': '冷却时间',
  'zero cooldown': '零冷却',
  'freeze': '冻结',
  'invincible player': '无敌玩家',
  'invisible': '隐形',
  'stealth': '潜行',
  'no wait': '无需等待',
  'free': '免费',
  'free buy': '免费购买',
  'free shop': '免费商店',
  'buy': '购买',
  'sell': '出售',
  'get': '获取',
  'gain': '获得',
  'spend': '消耗',
  'use': '使用',
  'on gain': '获得时',
  'on get': '获取时',
  'after': '之后',
  'before': '之前',
  'must be on': '必须开启',
  'master code': '主代码',
  'mastercode': '主代码',
  'mc': '主代码',
  'mc must be on': '主代码必须开启',
  'player 1': '玩家1',
  'player 2': '玩家2',
  'player': '玩家',
  'all player': '所有玩家',
  'all client': '所有客户端',
  'difficulty': '难度',
  'easy': '简单',
  'normal': '普通',
  'hard': '困难',
  'mode': '模式',
  'mode enabled': '模式已开启',
  'score multiplier': '分数倍率',
  'multiplier': '倍率',
  'damage multiplier': '伤害倍率',
  'speed multiplier': '速度倍率',
  'x2': 'x2',
  'x3': 'x3',
  'x5': 'x5',
  'x10': 'x10',
  'x99': 'x99',
  'x999': 'x999',
  '999': '999',
  '9999': '9999',
  '99999': '99999',
  '999999': '999999',
  '9999999': '9999999',
  '99999999': '99999999',
  '999999999': '999999999',
  '9999999999': '9999999999',
  'change to 999': '改为999',
  'change timer to 999': '计时器改为999',
  'all items unlocked': '解锁全部道具',
  'infinite lums': '无限卢姆',
  'infinite claw': '无限爪击',
  'super meter': '超能槽',
  'infinite supermeter': '无限超能槽',
  'items unlocked': '道具已解锁',
  'instant teensy unlock all': '瞬间解锁全部',
  'instant lucky ticket': '瞬间幸运券',
  'instant quicktime events': '瞬间跳过演出',
  'quicktime events': '跳过演出',
  'skip cutscene': '跳过过场',
  'no cutscene': '无过场',
  'instant enemies kill': '瞬间秒杀敌人',
  'weapon dmg': '武器伤害',
  'weapon damage': '武器伤害',
  'fire rate': '射速',
  'recoil': '后坐力',
  'aim assist': '瞄准辅助',
  'no recoil': '无后坐力',
  'bullet damage': '子弹伤害',
  'explosion': '爆炸',
  'explosive': '爆炸',
  'nuke': '核弹',
  'godly sword': '神剑',
  'infinite arrows unlocked': '无限箭矢已解锁',
  'max ryo': '最大两',
  'ryo': '两',
  'max orbs': '最大宝珠',
  'orbs': '宝珠',
  'max seals': '最大印',
  'seals': '印',
  'max tantrums': '最大怒气',
  'max ki': '最大气',
  'max chakra': '最大查克拉',
  'max ren': '最大仁',
  'max special': '最大必杀',
  'infinite ninjutsu': '无限忍术',
  'infinite chakra': '无限查克拉',
  'infinite ki': '无限气',
  'infinite meter': '无限能量槽',
  'infinite focus': '无限专注',
  'infinite breath': '无限气息',
  'infinite special': '无限必杀',
  'infinite bullets': '无限子弹',
  'infinite shells': '无限弹壳',
  'infinite arrows': '无限箭矢',
  'infinite crossbow': '无限弩箭',
  'infinite poison': '无限中毒',
  'infinite difficulty': '无限难度',
  'infinite lag': '无限延迟',
  'no lag': '无延迟',
  'no fall damage': '无视坠落伤害',
  'no sprint': '禁止冲刺',
  'fast travel': '快速旅行',
  'auto': '自动',
  'auto win': '自动胜利',
  'auto farm': '自动刷取',
  'auto collect': '自动收集',
  'one more': '再来一次',
  'no ads': '无广告',
  'god mode all': '全局无敌',
  'all stats': '全部属性',
  'stats': '属性',
  'stat': '属性',
  'infinite special ability': '无限特殊能力',
  'cooldown reduction': '冷却缩减',
  'infinite cooldown': '无限冷却',
  'no cooldown timer': '无冷却计时',
  'godly damage': '神圣伤害',
  'critical hit': '暴击',
  'crit': '暴击',
  'infinite crit': '无限暴击',
  'infinite damage': '无限伤害',
  'max damage': '最大伤害',
  'infinite health regen': '无限生命回复',
  'unlimited health': '无限生命',
  'unlimited ammo': '无限弹药',
  'unlimited money': '无限金钱',
  'unlimited resources': '无限资源',
  'unlimited items': '无限道具',
  'unlock everything': '解锁所有',
  'free items': '免费道具',
  'free weapons': '免费武器',
  'free skills': '免费技能',
  'all weapons unlocked': '全部武器解锁',
  'all skills unlocked': '全部技能解锁',
};

/** 单词级替换：长词优先匹配 */
const WORDS = {
  // 修饰词
  infinite: '无限',
  unlimited: '无限',
  invincibility: '无敌',
  invincible: '无敌',
  immortal: '不死',
  godmode: '无敌',
  maximum: '最大',
  max: '最大',
  super: '超级',
  ultra: '究极',
  infinite: '无限',
  infinite: '无限',
  // 动作
  unlock: '解锁',
  unlocked: '解锁',
  disable: '禁用',
  enable: '启用',
  freeze: '冻结',
  refill: '补充',
  refillable: '可补充',
  instant: '瞬间',
  instantly: '瞬间',
  auto: '自动',
  never: '永不',
  always: '始终',
  free: '免费',
  easy: '简单',
  normal: '普通',
  hard: '困难',
  instant: '瞬间',
  // 名词
  health: '生命值',
  stamina: '体力',
  energy: '能量',
  mana: '法力',
  focus: '专注',
  breath: '气息',
  ammo: '弹药',
  ammunition: '弹药',
  money: '金钱',
  gold: '金币',
  coins: '金币',
  cash: '现金',
  score: '分数',
  points: '点数',
  level: '等级',
  exp: '经验',
  xp: '经验',
  skill: '技能',
  skills: '技能',
  skillpoints: '技能点',
  resource: '资源',
  resources: '资源',
  material: '材料',
  materials: '材料',
  item: '道具',
  items: '道具',
  weapon: '武器',
  weapons: '武器',
  ammo: '弹药',
  grenade: '手雷',
  grenades: '手雷',
  missile: '导弹',
  missiles: '导弹',
  rocket: '火箭',
  rockets: '火箭',
  bomb: '炸弹',
  bombs: '炸弹',
  bullet: '子弹',
  bullets: '子弹',
  arrow: '箭矢',
  arrows: '箭矢',
  medkit: '医疗包',
  medkits: '医疗包',
  potion: '药水',
  potions: '药水',
  elixir: '灵药',
  fuel: '燃料',
  battery: '电池',
  armour: '装甲',
  armor: '装甲',
  shield: '护盾',
  durability: '耐久',
  timer: '计时器',
  timer: '计时器',
  countdown: '倒计时',
  cooldown: '冷却',
  speed: '速度',
  damage: '伤害',
  attack: '攻击',
  defense: '防御',
  power: '力量',
  strength: '力量',
  agility: '敏捷',
  reflex: '反应',
  intelligence: '智力',
  ability: '能力',
  abilities: '能力',
  upgrade: '升级',
  multiplier: '倍率',
  enemy: '敌人',
  enemies: '敌人',
  boss: '首领',
  difficulty: '难度',
  mode: '模式',
  player: '玩家',
  difficulty: '难度',
  score: '分数',
  lums: '卢姆',
  shards: '碎片',
  scrap: '废料',
  scraps: '废料',
  points: '点数',
  meter: '能量槽',
  gauge: '能量槽',
  supermeter: '超能槽',
  combo: '连段',
  special: '必杀',
  fury: '怒火',
  canteen: '水壶',
  fuel: '燃料',
  batmobile: '蝙蝠车',
  // 动词
  gain: '获得',
  get: '获取',
  buy: '购买',
  sell: '出售',
  use: '使用',
  spend: '消耗',
  kill: '秒杀',
  hit: '命中',
  jump: '跳跃',
  run: '奔跑',
  swim: '游泳',
  fly: '飞行',
  ride: '骑乘',
  drop: '投掷',
  shoot: '射击',
  // 副词/连接
  infinite: '无限',
  and: '与',
  the: '',
  of: '',
  to: '',
  on: '',
  in: '',
  for: '',
  with: '携带',
  when: '当',
  after: '之后',
  before: '之前',
  per: '每',
  no: '无',
  not: '不',
  all: '全部',
  any: '任意',
  every: '每个',
  player: '玩家',
  all: '全部',
  // 状态
  infinite: '无限',
  infinite: '无限',
  on: '开启',
  off: '关闭',
  must: '必须',
  be: '',
  client: '客户端',
  players: '玩家',
};

/** 整句直接翻译的长句（按整句匹配，优先级最高） */
const EXACT = {
  'godmode': '无敌',
  'god mode': '无敌',
  'infinite health': '无限生命值',
  'infinite ammo': '无限弹药',
  'infinite money': '无限金钱',
  'one hit kill': '一击必杀',
  '1 hit kill': '一击必杀',
  'all items unlocked': '解锁全部道具',
  'unlock all items': '解锁全部道具',
  'max level': '满级',
  'no damage': '免伤',
  'infinite stamina': '无限体力',
  'infinite resources': '无限资源',
  'infinite energy': '无限能量',
  'infinite skillpoints': '无限技能点',
  'infinite items': '无限道具',
  'infinite bullets': '无限子弹',
  'infinite arrows': '无限箭矢',
  'infinite grenades': '无限手雷',
  'infinite missiles': '无限导弹',
  'infinite rockets': '无限火箭',
  'infinite fuel': '无限燃料',
  'infinite battery': '无限电池',
  'infinite potions': '无限药水',
  'infinite medkits': '无限医疗包',
  'infinite lives': '无限命数',
  'infinite score': '无限分数',
  'infinite gauge': '无限能量槽',
  'infinite supermeter': '无限超能槽',
  'infinite ammo and grenade usage': '无限弹药与手雷',
  'max level true hero': '真英雄满级',
  'max level infamous': '立场满级',
  'max combo (mc)': '满连段（主代码）',
  'max money on pick': '拾取时满金钱',
  'max xp on get': '获取时经验全满',
  'max resources on get': '获取时资源全满',
  'max skillpoints': '技能点全满',
  'max special combo': '满必杀连段',
  'freeze timer': '冻结计时器',
  'freeze countdown timer': '冻结倒计时',
  'change timer to 999': '计时器改为999',
  'all client infinite ammo': '所有客户端无限弹药',
  'all client godmode': '所有客户端无敌',
  'invisible (run disable / turn off before entering room)': '隐形（进房间前先运行禁用）',
  'infinite batmobile health/armour': '蝙蝠车无限生命/装甲',
  'infinite missile barrage': '无限导弹齐射',
  'infinite afterburner': '无限推进器',
  'instant teensy unlock all': '瞬间解锁全部',
  'instant lucky ticket': '瞬间幸运券',
  'instant 1m lums': '瞬间100万卢姆',
  'instant quicktime events': '瞬间跳过演出',
  '1 hit kill (disable inf skillpoints)': '一击必杀（需先禁用无限技能点）',
  'inf skillpoints (disable 1 hit before using)': '无限技能点（使用前先禁用一击必杀）',
  'hit for max special combo': '命中触发满必杀连段',
  'infinite health (enable mc)': '无限生命值（需开启主代码）',
  'infinite health/1 hit kill (master code/must be on)': '无限生命/一击必杀（主代码须开启）',
  'infinite health/1 hit kill/drone (mastercode/must be on)': '无限生命/一击必杀/无人机（主代码须开启）',
  'no reload/infinite grenades': '无需装填/无限手雷',
  'no waiting time for use drone': '无人机无需等待',
  'infinite number of adrenaline (health regeneration)': '无限肾上腺素（生命回复）',
  'max access cards ( on gain - use )': '通行证全满（获得时使用）',
  'max arsenal keys ( on gain - use )': '军械库钥匙全满（获得时使用）',
  'max scraps and canteen': '废料与水壶全满',
  'max inf hp': '无限满生命',
  'max inf fury': '无限满怒火',
  'max inf ammo': '无限满弹药',
  'max inf canteen': '无限满水壶',
  'max inf fuel': '无限满燃料',
  'max inf scraps': '无限满废料',
  'max fury r3+l2 on r3+r2 off': '满怒火 R3+L2开启 / R3+R2关闭',
};

/**
 * 高频变体与缩写补充。
 * 来源：对 HEN-Cheats-Collection 全量 12330 条去重条目的未命中分析。
 */
const VARIANTS = {
  // 缩写变体（未命中 TOP1：inf 219 / infi 56 / infinit 7 / infinity 12）
  'inf hp': '无限生命值',
  'inf lives': '无限命数',
  'inf ammo': '无限弹药',
  'inf money': '无限金钱',
  'inf health': '无限生命值',
  'inf energy': '无限能量',
  'inf items': '无限道具',
  'inf resource': '无限资源',
  'inf resources': '无限资源',
  'inf skillpoints': '无限技能点',
  'inf skill points': '无限技能点',
  'inf stamina': '无限体力',
  'inf boost': '无限加速',
  'inf skills': '无限技能',
  'inf score': '无限分数',
  'inf points': '无限点数',
  'inf arrows': '无限箭矢',
  'inf bullets': '无限子弹',
  'inf grenades': '无限手雷',
  'inf fuel': '无限燃料',
  'inf focus': '无限专注',
  'inf meter': '无限能量槽',
  'inf fury': '无限怒火',
  'infinity hp': '无限生命值',
  'infinity ammo': '无限弹药',
  'infinity money': '无限金钱',
  'infinity health': '无限生命值',
  'infinity energy': '无限能量',
  'infinity items': '无限道具',
  'infinity skillpoints': '无限技能点',
  'infinity lives': '无限命数',
  'infinity': '无限',
  'infinit': '无限',
  'infinit ammo': '无限弹药',
  'infinit money': '无限金钱',
  'infinit health': '无限生命值',
  // 否定 / 开关
  'no hunger': '无饥饿',
  'no thirst': '无口渴',
  'no fatigue': '无疲劳',
  'no gravity': '无重力',
  'no weight': '无重量',
  '0 weight': '零重量',
  'low gravity': '低重力',
  'no fog': '无雾',
  'no darkness': '无黑暗',
  'no rain': '无雨',
  'no sound': '静音',
  'no music': '无音乐',
  'no enemies': '无敌人',
  'no damage taken': '免受伤害',
  'no touchpad': '禁用触摸板',
  'untouchable': '无敌',
  'no hit': '免受击打',
  'no fall': '无视坠落',
  'no cost': '免费',
  'no cooldown': '无冷却',
  'no charge': '不消耗',
  'no durability loss': '耐久不消耗',
  'no durability': '不消耗耐久',
  'no ammo consumption': '弹药不消耗',
  'no ammo cost': '弹药不消耗',
  'no consumption': '不消耗',
  'no limit': '无限制',
  'no limits': '无限制',
  'no penalty': '无惩罚',
  'no respawn': '不重生',
  'no teleport': '禁止传送',
  'no sprint': '禁止冲刺',
  'no jump': '禁止跳跃',
  'no reload': '无需装填',
  'no ads': '无广告',
  'no cutscene': '无过场',
  'no waiting': '无需等待',
  'no blood': '无血迹',
  'no recoil': '无后坐力',
  'no vibration': '关闭震动',
  'no lag': '无延迟',
  'no slow mo': '无慢动作',
  'stop': '停止',
  'stop timer': '停止计时器',
  'stop countdown': '停止倒计时',
  'stop all': '全部停止',
  'stop enemy': '停止敌人',
  'stop enemies': '停止敌人',
  'freeze enemies': '冻结敌人',
  'frozen': '冻结',
  'set': '设置',
  'set to': '设为',
  'set time': '设置时间',
  'set timer': '设置计时器',
  'set health': '设置生命值',
  'set speed': '设置速度',
  'set player': '设置玩家',
  'set all': '全部设置',
  'change': '改变',
  'change to': '改为',
  'change time': '改变时间',
  'change speed': '改变速度',
  'change player': '改变玩家',
  'change all': '全部改变',
  'activate': '激活',
  'deactivate': '停用',
  'increase': '增加',
  'decrease': '减少',
  'add': '增加',
  'reset': '重置',
  'enable all': '全部启用',
  'disable all': '全部禁用',
  'have': '拥有',
  'has': '拥有',
  'can': '可以',
  'will': '将会',
  'with': '携带',
  'without': '不含',
  // 战斗 / 移动
  'fast': '快速',
  'fast movement': '快速移动',
  'faster': '加速',
  'movement faster': '移动加速',
  'movement speed': '移动速度',
  'slow': '缓慢',
  'rapid': '快速',
  'rapid fire': '快速射击',
  'rapid shot': '快速射击',
  'teleport': '传送',
  'fly': '飞行',
  'flight': '飞行',
  'zero gravity': '零重力',
  'blood': '血迹',
  'no blood': '无血迹',
  'untouchable ( press circle to active after supermove)': '无敌（按住圆键在超级移动后激活）',
  // 任务 / 事件
  'mission': '任务',
  'missions': '任务',
  'all missions': '全部任务',
  'complete missions': '完成任务',
  'complete all missions': '完成所有任务',
  'skip missions': '跳过任务',
  'event': '事件',
  'events': '事件',
  'all events': '全部事件',
  'master switch': '主开关',
  'master switch (enable this first)': '主开关（请先启用此项）',
  'bottomless clip': '无限子弹',
  'parts (99999 on use)': '零件（使用时99999）',
  'extra carry on loot bag': '额外战利品携带量',
  'forward day time': '快进白天时间',
  'movement faster': '移动加速',
  // 数值 / 其他
  'points of use': '使用次数',
  'full laser bar by 1 point': '激光槽充满1点',
  '0 weight': '零重量',
  'metal': '金属',
  'buffs': '增益',
  'activate buff': '激活增益',
  'deactivate buff': '停用增益',
  'save': '保存',
  'save game': '保存游戏',
  'load': '读取',
  'load game': '读取游戏',
  'vehicle': '载具',
  'vehicles': '载具',
  'drone': '无人机',
  'drones': '无人机',
  'shotgun': '霰弹枪',
  'vehicle health': '载具生命值',
  'infinite vehicle health': '无限载具生命值',
  'japanese': '日语',
  'japanese voice': '日语语音',
  'english voice': '英语语音',
  'increase damage': '增加伤害',
  'decrease damage': '减少伤害',
  'increase speed': '增加速度',
  'decrease speed': '降低速度',
  'increase jump': '提高跳跃',
  'tackling': '擒抱',
  'stat': '属性',
  'stats': '属性',
  'max stats': '全部属性最大',
  'xp': '经验值',
  '0': '零',
  '1': '一',
  // 葡语 / 西语 / 其他语言常见金手指用语
  'vida infinita': '无限生命',
  'vida infinita': '无限生命',
  'dinheiro infinito': '无限金钱',
  'dinheiro infinito': '无限金钱',
  'municao infinita': '无限弹药',
  'municao infinita': '无限弹药',
  'armas infinitas': '无限武器',
  'luz infinita': '无限光',
  'luz infinita': '无限光',
  'nivel maximo': '满级',
  'nivel maximo': '满级',
  'perola azul infinita': '无限蓝珍珠',
  'energia infinita': '无限能量',
  'energia infinita': '无限能量',
  'poder infinito': '无限力量',
  'poder infinito': '无限力量',
  'vida maxima': '最大生命',
  'salto infinito': '无限跳跃',
  'tiro infinito': '无限子弹',
  'faca infinita': '无限小刀',
  'sem recarga': '无需装填',
  'god': '上帝',
  'god mode': '无敌',
  // 拼写变体（infinity / infinit / infinte 前缀）
  'infinity hp': '无限生命值',
  'infinity ammo': '无限弹药',
  'infinity money': '无限金钱',
  'infinity health': '无限生命值',
  'infinity energy': '无限能量',
  'infinity items': '无限道具',
  'infinity lives': '无限命数',
  'infinity skillpoints': '无限技能点',
  'infinit hp': '无限生命值',
  'infinit ammo': '无限弹药',
  'infinit money': '无限金钱',
  'infinit health': '无限生命值',
  'infinit energy': '无限能量',
  'infinit items': '无限道具',
  'infinit lives': '无限命数',
  'infinit stamina': '无限体力',
  'infinit souls': '无限灵魂',
  'infinit consumable': '无限消耗品',
  'infinit consumable': '无限消耗品',
  'infinit time': '无限时间',
  'infinite hp': '无限生命值',
  'infinite mp': '无限魔力',
  'infinite uv': '无限紫外线',
  'infinite ink': '无限墨水',
  'infinite nitro': '无限氮气',
  'infinite nitro ': '无限氮气',
  'infinite smithing': '无限锻造',
  'infinite life': '无限生命',
  'infinite death': '无限生命',
  'infinite evil': '无限邪恶',
  'infinite wrath': '无限愤怒',
  'infinite red': '无限红色',
  'infinite blue': '无限蓝色',
  'infinite crystals': '无限水晶',
  'infinite horse': '无限马匹',
  'infinite credits': '无限金币',
  'infinite throwables': '无限投掷物',
  'infinite crafting': '无限制作',
  'infinite car': '无限载具',
  'infinite health regen': '无限生命回复',
  'infinite special ability': '无限特殊能力',
  'infinite difficulty': '无限难度',
  'infinite ninjutsu': '无限忍术',
  'infinite chakra': '无限查克拉',
  'infinite ki': '无限气',
  'infinite breath': '无限气息',
  'infinite focus': '无限专注',
  'infinite meter': '无限能量槽',
  'infinite special': '无限必杀',
  'infinite shells': '无限弹壳',
  'infinite crossbow': '无限弩箭',
  'infinite poison': '无限中毒',
  'infinite lag': '无限延迟',
  'infinite night': '无限夜晚',
  'infinite day': '无限白天',
  'infinite lap': '无限圈数',
  'infinite time': '无限时间',
  'unlimited ammo ': '无限弹药',
  'unlimited money ': '无限金钱',
  'unlimited health ': '无限生命值',
  'unlimited items ': '无限道具',
  'unlimited resources ': '无限资源',
  'unlimited skillpoints ': '无限技能点',
  'unlimited stamina ': '无限体力',
  'unlimited energy ': '无限能量',
  'unlimited lives ': '无限命数',
  // 常见动作/状态补充
  'mission': '任务',
  'missions': '任务',
  'all missions': '全部任务',
  'complete mission': '完成任务',
  'complete all missions': '完成所有任务',
  'skip mission': '跳过任务',
  'event': '事件',
  'events': '事件',
  'all events': '全部事件',
  'fast': '快速',
  'faster': '加速',
  'stop': '停止',
  'stop timer': '停止计时器',
  'teleport': '传送',
  'change': '改变',
  'change to': '改为',
  'set': '设置',
  'set to': '设为',
  'have': '拥有',
  'handgun': '手枪',
  'shotgun': '霰弹枪',
  'rifle': '步枪',
  'sniper': '狙击枪',
  'pistol': '手枪',
  'blade': '刀',
  'sword': '剑',
  'staff': '法杖',
  'bow': '弓',
  'crossbow': '弩',
  'grenade launcher': '榴弹发射器',
  'minigun': '机枪',
  'bazooka': '火箭筒',
  'rocket launcher': '火箭筒',
  'flamethrower': '火焰喷射器',
  'gravity': '重力',
  'jump height': '跳跃高度',
  'jump power': '跳跃力',
  'high jump': '超级跳跃',
  'double jump': '二段跳',
  'triple jump': '三段跳',
  'wall jump': '蹬墙跳',
  'speed boost': '速度加成',
  'damage boost': '伤害加成',
  'attack boost': '攻击加成',
  'defense boost': '防御加成',
  'invisibility': '隐形',
  'god hand': '神之手',
  'one shot': '一击必杀',
  'one button': '单键',
  'cpu': 'CPU',
  'fps': '帧率',
  'fps boost': '提升帧率',
  'resolution': '分辨率',
  'anti aliasing': '抗锯齿',
  'bloom': '泛光',
  'motion blur': '动态模糊',
  'depth of field': '景深',
  'vignette': '暗角',
  'widescreen': '宽屏',
  'uncut': '未删减',
  'unlock all skins': '解锁所有皮肤',
  'all skins': '所有皮肤',
  'skin': '皮肤',
  'skins': '皮肤',
  'outfit': '服装',
  'outfits': '服装',
  'costume': '服装',
  'character': '角色',
  'characters': '角色',
  'model': '模型',
  'models': '模型',
  'unlock all': '全部解锁',
  'all weapons and items': '全部武器与道具',
  'infinite weapon': '无限武器',
  'weapon ammo': '武器弹药',
  'infinite ammo all weapons': '全部武器无限弹药',
  // —— 补充：训练点 / 预算 等常见游戏术语 ——
  'training point': '训练点',
  'training points': '训练点',
  'train point': '训练点',
  'train points': '训练点',
  'budget': '预算',
  'money budget': '金钱预算',
  'ml budget': 'ML预算',
  'budget': '预算',
  'focus training': '专注训练',
  'skill training': '技能训练',
  'stamina training': '体力训练',
  'training': '训练',
  'use 10': '使用10',
  'balance': '余额',
  'bank': '银行',
  'wallet': '钱包',
  'credit': '信用点',
  'credits': '信用点',
  'premium': '高级版',
  'vip': 'VIP',
  'dlc': 'DLC',
  'season pass': '季票',
  'battle pass': '战令',
  'loot box': '战利品箱',
  'crate': '补给箱',
  'supply crate': '补给箱',
  'drop rate': '掉率',
  'loot rate': '掉率',
  'discount': '折扣',
  'sale': '特卖',
  'shop': '商店',
  'store': '商店',
  'market': '市场',
  'exchange': '兑换',
  'redeem': '兑换',
  'reward': '奖励',
  'rewards': '奖励',
  'bonus': '奖励',
  'daily bonus': '每日奖励',
  'login bonus': '登录奖励',
  'achievement': '成就',
  'achievements': '成就',
  'trophy': '奖杯',
  'trophies': '奖杯',
  'platinum': '白金',
  'gold trophy': '金杯',
  'bronze': '铜',
  'silver': '银',
  'rare': '稀有',
  'legendary': '传说',
  'common': '普通',
  'uncommon': '优良',
  'epic': '史诗',
  'weapon slot': '武器槽',
  'grip': '握把',
  'barrel': '枪管',
  'scope': '瞄准镜',
  'magazine': '弹匣',
  'clip': '弹匣',
  'recoil control': '后坐力控制',
  'aim': '瞄准',
  'spread': '散布',
  'fire rate': '射速',
  'reload speed': '换弹速度',
  'headshot': '爆头',
  'one shot kill': '一击必杀',
  'no fall damage': '无视坠落伤害',
  'no gravity': '无重力',
  'fly mode': '飞行模式',
  'walk through walls': '穿墙',
  'noclip': '穿墙',
  'free camera': '自由视角',
  'photo mode': '拍照模式',
  'slow motion': '慢动作',
  'time dilation': '时间减速',
  'high gravity': '高重力',
  'super jump': '超级跳跃',
  'double jump': '二段跳',
  'triple jump': '三段跳',
  'hover': '悬停',
  'swim': '游泳',
  'fly': '飞行',
  'teleport': '传送',
  'speed boost': '速度提升',
  'damage boost': '伤害提升',
  'infinite stamina': '无限体力',
  'stamina regen': '体力回复',
  'health regen': '生命回复',
  'regenerate': '回复',
  'lifesteal': '吸血',
  'steal health': '吸血',
  'shield': '护盾',
  'armor': '护甲',
  'armour': '护甲',
  'refill': '补充',
  'auto refill': '自动补充',
  'auto-reload': '自动装填',
  'auto reload': '自动装填',
  'auto aim': '自动瞄准',
  'auto jump': '自动跳跃',
  'auto run': '自动奔跑',
  'unlimited': '无限',
  'more damage': '更高伤害',
  'less damage': '更低伤害',
  'increase damage': '增加伤害',
  'decrease damage': '减少伤害',
  'godly': '神圣',
  'savage': '野蛮',
  'brutal': '残暴',
  'nuke': '核弹',
  'boom': '爆炸',
  'explode': '爆炸',
  'explosion': '爆炸',
  'chain': '连锁',
  'chain lightning': '连锁闪电',
  'lightning': '闪电',
  'thunder': '雷霆',
  'poison': '中毒',
  'burn': '燃烧',
  'freeze': '冰冻',
  'stun': '眩晕',
  'root': '定身',
  'silence': '沉默',
  'blind': '致盲',
  'slow': '减速',
  'haste': '加速',
  'rage': '狂怒',
  'berserk': '狂暴',
  'crit': '暴击',
  'critical': '暴击',
  'backstab': '背刺',
  'stealth kill': '暗杀',
  'assassinate': '刺杀',
  'execute': '处决',
  'finisher': '终结技',
  'ultimate': '终极技能',
  'super move': '超必杀',
  'combo counter': '连段计数',
  'combo meter': '连段槽',
  'rage meter': '怒气槽',
  'super meter': '超能槽',
  'health bar': '生命槽',
  'stamina bar': '体力槽',
  'energy bar': '能量槽',
  'focus bar': '专注槽',
  'ki bar': '气槽',
  'spirit bar': '精神槽',
  'mana bar': '魔力槽',
  'weapon unlock': '武器解锁',
  'unlock weapon': '解锁武器',
  'unlock all weapons': '解锁全部武器',
  'unlock costume': '解锁服装',
  'unlock outfit': '解锁服装',
  'unlock skin': '解锁皮肤',
  'unlock all skins': '解锁所有皮肤',
  'unlock game': '解锁游戏',
  'unlock levels': '解锁关卡',
  'unlock stage': '解锁关卡',
  'all levels': '所有关卡',
  'all stages': '所有关卡',
  'skip stage': '跳过关卡',
  'skip cutscene': '跳过过场',
  'cutscene': '过场动画',
  'intro': '片头',
  'outro': '片尾',
  'movie': '过场动画',
  'cinematic': '过场动画',
  'scene': '场景',
  'level select': '选关',
  'level skip': '跳关',
  'next level': '下一关',
  'end level': '结束关卡',
  'win level': '过关',
  'skip minigame': '跳过小游戏',
  'minigame': '小游戏',
  'loading': '读取中',
  'loading screen': '读取画面',
  'fps cap': '帧数上限',
  'uncapped fps': '解除帧数限制',
  '60 fps': '60帧',
  '120 fps': '120帧',
  'hdr': '高动态范围',
  'bloom effect': '泛光效果',
  'anti aliasing': '抗锯齿',
  'texture': '材质',
  'resolution': '分辨率',
  'shadow': '阴影',
  'shadow density': '阴影密度',
  'quality': '画质',
  'graphics': '画质',
  'texture quality': '材质质量',
  'model quality': '模型质量',
  'shadow quality': '阴影质量',
  'reflection': '反射',
  'ambient occlusion': '环境光遮蔽',
  'motion blur': '动态模糊',
  'depth of field': '景深',
  'vignette': '暗角',
  'chromatic aberration': '色差',
  'widescreen': '宽屏',
  'letterbox': '宽银幕',
  'uncut': '未删减',
  'language': '语言',
  'subtitle': '字幕',
  'dub': '配音',
  'voice': '语音',
  'chinese': '中文',
  'english': '英文',
  'japanese': '日语',
  'korean': '韩语',
  'german': '德语',
  'french': '法语',
  'spanish': '西班牙语',
  'portuguese': '葡萄牙语',
  'italian': '意大利语',
  'russian': '俄语',
  'arabic': '阿拉伯语',
};

/**
 * 拼音提示映射。
 * 很多金作者会在括号里用拼音标注含义（如 "ML Budget (xin zi)"），
 * 这些是原作者留下的中文注释，只是编码损坏成了拼音。
 */
const PINYIN = {
  'xin zi': '资金',
  'jiao dian': '焦点',
  'xun lian dian': '训练点',
  'zi jin': '资金',
  'sheng ming': '生命',
  'ti li': '体力',
  'jin huo': '金币',
  'qian': '钱',
  'dao piao': '刀片',
  'qiang': '枪',
  'shou qiang': '手枪',
  'long dao': '龙刀',
  'ji qing': '激情',
  'gan ji': '干击',
  'bao chong': '暴冲',
  'da ji': '打击',
  'ji shu': '技术',
  'dian shu': '点数',
  'jing yan': '经验',
  'ji neng': '技能',
  'wu qi': '武器',
  'bei bao': '背包',
  'wu qiang': '武器',
  'zhan dou': '战斗',
  'sheng hu': '升级',
  'juan zong': '卷宗',
};

// ---------------------------------------------------------------- 工具

/** 归一化：便于比较 */
function norm(s) {
  return String(s == null ? '' : s)
    .replace(/[　\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 判断是否已含中文 */
function hasCJK(s) {
  return /[\u4e00-\u9fa5]/.test(String(s || ''));
}

/**
 * 拆出需要保护的片段：数字、按键符号、缩写、方括号内容
 * 返回 token 数组
 */
const PROTECT = /(\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>|\b[A-Z0-9]{1,4}\b|\d+(?:[.,]\d+)*[kKmM]?\b|x\d+|\bx\s*\d+)/g;

/**
 * 主翻译函数
 * @param {string} src 原始英文名
 * @returns {{text:string, hit:boolean, reason:string}}
 */
function translate(src) {
  const original = String(src == null ? '' : src);
  if (!original.trim()) return { text: original, hit: false, reason: '空' };
  if (hasCJK(original)) return { text: original, hit: false, reason: '已含中文' };

  const key = norm(original);

  // 1) 整句精确
  if (EXACT[key] !== undefined) {
    return { text: EXACT[key], hit: true, reason: '整句匹配' };
  }

  // 1) 括号内拼音 + 乱码清理
  //    原作者常写成 "ML Budget 999,999,900,000 (xin zi)???? ??"，
  //    中文因编码损坏变成 ?，但拼音提示能反推含义。
  const cleaned = cleanPinyinHints(original);
  if (cleaned) {
    // 清洗后的文本整体可能仍译不出（如 "ML Budget 999,999,900,000 (资金)"），
    // 这时用片段替换把能译的部分译出来，保留其余原文。
    const cn = translate(cleaned.text);
    if (cn.hit) return { text: cn.text, hit: true, reason: cn.reason + '+拼音清理' };
    const seg = translateFragment(cleaned.text);
    if (seg.hit) return { text: seg.text, hit: true, reason: '片段替换+拼音清理' };
  }

  // 1.5) 前缀规则：Inf XXX / Inf-XXX / Inf.XXX / No XXX 等
  //      数据来源：HEN 集合中 2239 条以 Inf 开头，实际形态高度规整
  const pre = applyPrefixRules(original);
  if (pre) return { text: pre, hit: true, reason: '前缀规则' };

  // 2) 短语库 / 变体库：整串就是一个已知短语
  if (PHRASES[key] !== undefined) {
    return { text: PHRASES[key], hit: true, reason: '短语匹配' };
  }
  if (VARIANTS[key] !== undefined) {
    return { text: VARIANTS[key], hit: true, reason: '变体匹配' };
  }

  // 3) 组合式：按分隔符切成片段，逐段替换
  //    例："Infinite Ammo / Infinite Grenades" → "无限弹药 / 无限手雷"
  const parts = original.split(/\s*(\/|\||,|;|\+|\band\b|\bAnd\b)\s*/);
  let allHit = true;
  let anyHit = false;
  const outParts = parts.map((seg, i) => {
    // 分隔符原样保留
    if (i % 2 === 1) return seg;
    const k = norm(seg);
    if (!k) return seg;
    if (EXACT[k] !== undefined) { anyHit = true; return EXACT[k]; }
    // 「ML Budget」「BAL Infinite ...」这类：先剥掉 2-4 字母的前缀缩写再试
    const abbr = /^([A-Za-z]{2,4})\s+(.+)$/.exec(seg);
    if (abbr) {
      const rest = norm(abbr[2]);
      if (PHRASES[rest] !== undefined || VARIANTS[rest] !== undefined || EXACT[rest] !== undefined) {
        anyHit = true;
        const base = PHRASES[rest] !== undefined ? PHRASES[rest]
                   : (VARIANTS[rest] !== undefined ? VARIANTS[rest] : EXACT[rest]);
        return abbr[1].toUpperCase() + ' ' + base;
      }
      const restPre = applyPrefixRules(abbr[2]);
      if (restPre) { anyHit = true; return abbr[1].toUpperCase() + ' ' + restPre; }
    }
    if (PHRASES[k] !== undefined) { anyHit = true; return PHRASES[k]; }
    if (VARIANTS[k] !== undefined) { anyHit = true; return VARIANTS[k]; }
    // 片段级前缀规则（如 "Inf Ammo" / "Max Money"）
    const preFrag = applyPrefixRules(seg);
    if (preFrag) { anyHit = true; return preFrag; }
    // 整体带括号内容：先剥掉括号翻译主体，再拼回括号
    const wrapped = /^(.*?)\s*(\([^()]*\)|\[[^\[\]]*\])\s*$/.exec(seg);
    if (wrapped) {
      const head = wrapped[1];
      const brk = wrapped[2];
      const hk = norm(head);
      // 主体优先用前缀规则（能正确处理 Max Money / Inf Ammo 这类）
      const headPre = applyPrefixRules(head);
      let base = null;
      if (headPre) base = headPre;
      else if (EXACT[hk] !== undefined) base = EXACT[hk];
      else if (PHRASES[hk] !== undefined) base = PHRASES[hk];
      else if (VARIANTS[hk] !== undefined) base = VARIANTS[hk];
      if (base) {
        anyHit = true;
        const bk = norm(brk.slice(1, -1));
        const bn = (PHRASES[bk] !== undefined) ? PHRASES[bk]
                   : (EXACT[bk] !== undefined ? EXACT[bk]
                   : (VARIANTS[bk] !== undefined ? VARIANTS[bk]
                   : (PINYIN[bk] !== undefined ? PINYIN[bk] : null)));
        return bn ? base + '（' + bn + '）' : base + ' ' + brk;
      }
    }
    const w = translateFragment(seg);
    if (w.hit) anyHit = true; else allHit = false;
    return w.text;
  });

  if (anyHit && allHit) {
    return { text: tidy(outParts.join('')), hit: true, reason: '组合替换' };
  }
  if (anyHit) {
    // 部分命中：整体走片段替换（保留未识别部分）
    return { text: tidy(outParts.join('')), hit: true, reason: '部分替换' };
  }

  return { text: original, hit: false, reason: '未识别' };
}

/**
 * 清理括号里的拼音提示与乱码问号。
 * "ML Budget 999,999,900,000 (xin zi)???? ??" → "ML Budget 999,999,900,000 (资金)"
 * 返回 null 表示无可清理之处。
 */
function cleanPinyinHints(src) {
  const s = String(src);
  if (!/\(\s*[a-zA-Z\s]{2,}\s*\)/.test(s)) return null;

  let changed = false;
  let out = s.replace(/\(([^)]*)\)/g, (m0, inner) => {
    const raw = inner.trim();
    // 去掉乱码问号后看是不是纯拼音
    const core = raw.replace(/[?？]+/g, '').trim();
    if (!core) return m0;
    const key = norm(core);
    if (PINYIN[key] !== undefined) {
      changed = true;
      return '(' + PINYIN[key] + ')';
    }
    // 拼音 + 乱码：只保留可翻译部分
    if (/[?？]/.test(raw) && PHRASES[key] !== undefined) {
      changed = true;
      return '(' + PHRASES[key] + ')';
    }
    return m0;
  });

  // 去掉中文后面的连续问号（编码损坏残留）
  const before = out;
  out = out.replace(/[?？]{2,}/g, '').replace(/\s+/g, ' ').trim();
  if (out !== before) changed = true;

  if (!changed) return null;
  return { text: out };
}

/**
 * 前缀规则引擎。
 * 处理 Inf / Infinity / No / Max / All 等前缀 + 主体词的组合，
 * 覆盖真实数据里 2000+ 条高度规整的条目。
 */
const INF_PREFIX = /^(?:inf|infinite|infinity|infinit|infinte|unlimited|unlmtd)\b[\s\-_.]*(.*)$/i;
const NO_PREFIX  = /^(?:no|never|without|disable)\b[\s\-_.]*(.*)$/i;
const MAX_PREFIX = /^(?:max|maximum)\b[\s\-_.]*(.*)$/i;
const ALL_PREFIX = /^(?:all|every|any)\b[\s\-_.]*(.*)$/i;

function applyPrefixRules(src) {
  const s = String(src).trim();
  if (!s) return null;

  // Inf + 主体 → 无限 + 主体
  let m = INF_PREFIX.exec(s);
  if (m) {
    const rest = m[1];
    const rk = norm(rest);
    if (!rk) return '无限';
    // 主体本身是已知词 → 直接组合
    if (PHRASES[rk] !== undefined) return '无限' + PHRASES[rk];
    if (VARIANTS[rk] !== undefined) return '无限' + VARIANTS[rk];
    if (EXACT[rk] !== undefined) return '无限' + EXACT[rk];
    // 主体里含连字符分段，逐段译
    const segs = rest.split(/[-\s]+/).filter(Boolean);
    if (segs.length > 1) {
      let all = true;
      const parts = segs.map((g) => {
        const gk = norm(g);
        if (PHRASES[gk] !== undefined) return PHRASES[gk];
        if (VARIANTS[gk] !== undefined) return VARIANTS[gk];
        if (EXACT[gk] !== undefined) return EXACT[gk];
        all = false;
        return g;
      });
      if (all) return '无限' + parts.join('');
    }
    // 单词级翻译主体
    const w = translateFragment(rest);
    if (w.hit) return '无限' + w.text;
    return null;
  }

  // No + 主体 → 无/不/禁用 + 主体
  m = NO_PREFIX.exec(s);
  if (m) {
    const rest = m[1];
    const rk = norm(rest);
    if (!rk) return '无';
    if (PHRASES[rk] !== undefined) return '无' + PHRASES[rk];
    if (VARIANTS[rk] !== undefined) return '无' + VARIANTS[rk];
    if (EXACT[rk] !== undefined) return '无' + EXACT[rk];
    const segs = rest.split(/[-\s]+/).filter(Boolean);
    if (segs.length > 1) {
      let all = true;
      const parts = segs.map((g) => {
        const gk = norm(g);
        if (PHRASES[gk] !== undefined) return PHRASES[gk];
        if (VARIANTS[gk] !== undefined) return VARIANTS[gk];
        if (EXACT[gk] !== undefined) return EXACT[gk];
        all = false;
        return g;
      });
      if (all) return '无' + parts.join('');
    }
    const w = translateFragment(rest);
    if (w.hit) return '无' + w.text;
    return null;
  }

  // Max + 主体 → 最大/满 + 主体
  // 金手指语境里，「Max 金钱/分数/经验」译作「满…」更符合中文习惯
  m = MAX_PREFIX.exec(s);
  if (m) {
    const rest = m[1];
    const rk = norm(rest);
    if (!rk) return '最大';
    const MAX_FULL = ['money', 'cash', 'coins', 'gold', 'score', 'exp', 'xp',
                      'skillpoints', 'skill points', 'resources', 'items',
                      'ammunition', 'ammo', 'level', 'points', 'lums', 'shards',
                      'scrap', 'scraps', 'materials', 'material'];
    const prefixWord = MAX_FULL.indexOf(rk) >= 0 ? '满' : '最大';
    if (PHRASES[rk] !== undefined) return prefixWord + PHRASES[rk];
    if (VARIANTS[rk] !== undefined) return prefixWord + VARIANTS[rk];
    if (EXACT[rk] !== undefined) return prefixWord + EXACT[rk];
    const segs = rest.split(/[-\s]+/).filter(Boolean);
    if (segs.length > 1) {
      let all = true;
      const parts = segs.map((g) => {
        const gk = norm(g);
        if (PHRASES[gk] !== undefined) return PHRASES[gk];
        if (VARIANTS[gk] !== undefined) return VARIANTS[gk];
        if (EXACT[gk] !== undefined) return EXACT[gk];
        all = false;
        return g;
      });
      if (all) return prefixWord + parts.join('');
    }
    const w = translateFragment(rest);
    if (w.hit) return prefixWord + w.text;
    return null;
  }

  return null;
}

/** 清理中英混排的多余空格 */
function tidy(s) {
  return String(s)
    .replace(/\s+/g, ' ')
    .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
    .replace(/\s+([，。、）】」》])/g, '$1')
    .replace(/([（【「《])\s+/g, '$1')
    .trim();
}

/**
 * 片段级翻译：保护数字/符号后做词组替换
 */
function translateFragment(seg) {
  const src = String(seg);
  const k = norm(src);
  if (!k) return { text: src, hit: false };

  // 去掉首尾括号内容单独判断，如 "(MC)" / "[ER]"
  const bracketOnly = /^\s*[\(\[][^\)\]]*[\)\]]\s*$/.test(src);
  if (bracketOnly) {
    const inner = src.trim().slice(1, -1).trim();
    const ik = norm(inner);
    if (PHRASES[ik] !== undefined) return { text: '(' + PHRASES[ik] + ')', hit: true };
    if (EXACT[ik] !== undefined) return { text: '(' + EXACT[ik] + ')', hit: true };
    if (VARIANTS[ik] !== undefined) return { text: '(' + VARIANTS[ik] + ')', hit: true };
    if (PINYIN[ik] !== undefined) return { text: '(' + PINYIN[ik] + ')', hit: true };
    return { text: src, hit: false };
  }

  // 「ML Budget」「BAL Infinite ...」这类：先剥离 2-4 字母前缀缩写再翻译主体
  const abbrM = /^([A-Za-z]{2,4})\s+(.+)$/.exec(src.trim());
  if (abbrM) {
    const head = abbrM[1].toUpperCase();
    const rest = abbrM[2];
    const rk = norm(rest);
    let base = null;
    if (PHRASES[rk] !== undefined) base = PHRASES[rk];
    else if (VARIANTS[rk] !== undefined) base = VARIANTS[rk];
    else if (EXACT[rk] !== undefined) base = EXACT[rk];
    if (base) return { text: head + ' ' + base, hit: true };
    const rp = applyPrefixRules(rest);
    if (rp) return { text: head + ' ' + rp, hit: true };
    // 主体后面跟数字时，剥掉数字再匹配：「Budget 999,999,900,000」→「Budget」
    const numStrip = /^(.*?)([\s]*[\d,.]+)\s*$/.exec(rest);
    if (numStrip) {
      const bare = norm(numStrip[1]);
      let b2 = null;
      if (PHRASES[bare] !== undefined) b2 = PHRASES[bare];
      else if (VARIANTS[bare] !== undefined) b2 = VARIANTS[bare];
      else if (EXACT[bare] !== undefined) b2 = EXACT[bare];
      if (b2) return { text: head + ' ' + b2 + ' ' + numStrip[2].trim(), hit: true };
    }
  }

  // 保护 token
  const tokens = [];
  let masked = src.replace(PROTECT, (m) => {
    tokens.push(m);
    return `${tokens.length - 1}`;
  });

  // 词组替换（长词优先）
  let hit = false;
  const wordKeys = Object.keys(WORDS)
    .filter((w) => w.length > 2)
    .sort((a, b) => b.length - a.length);

  let result = masked;
  // 先应用多词短语（PHRASES / VARIANTS），再应用单词级替换。
  // 否则 "Max Money" 会被拆成 max→最大 + money→金钱，得到「最大金钱」而不是「满金钱」。
  const phraseKeys = Object.keys(PHRASES)
    .concat(Object.keys(VARIANTS))
    .filter((k) => k.indexOf(' ') > 0)
    .sort((a, b) => b.length - a.length);

  for (const ph of phraseKeys) {
    const cn = PHRASES[ph] !== undefined ? PHRASES[ph] : VARIANTS[ph];
    if (!cn) continue;
    const re = new RegExp('(^|[^a-z])(' + ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')([^a-z]|$)', 'gi');
    result = result.replace(re, (m0, pre, word, post) => {
      hit = true;
      return pre + cn + post;
    });
  }

  for (const w of wordKeys) {
    const cn = WORDS[w];
    if (!cn) continue;
    const re = new RegExp('(^|[^a-z])(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')([^a-z]|$)', 'gi');
    result = result.replace(re, (m0, pre, word, post) => {
      hit = true;
      return pre + cn + post;
    });
  }

  // 恢复 token
  result = result.replace(/(\d+)/g, (m, i) => tokens[+i]);

  // 清理多余空格（中英/中文之间不留空）
  result = result.replace(/\s+/g, ' ').trim();
  result = result.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
  result = result.replace(/\s+([，。、）】」》])/g, '$1');
  result = result.replace(/([（【「《])\s+/g, '$1');
  result = result.replace(/([\u4e00-\u9fa5])\s+([a-zA-Z0-9])/g, '$1$2');
  result = result.replace(/([a-zA-Z0-9])\s+([\u4e00-\u9fa5])/g, '$1$2');

  if (!hit) return { text: src, hit: false };
  return { text: result, hit: true };
}

/**
 * 批量翻译
 */
function translateAll(names) {
  return names.map((n) => translate(n));
}

module.exports = { translate, translateAll, hasCJK, PHRASES, EXACT, VARIANTS, WORDS };
