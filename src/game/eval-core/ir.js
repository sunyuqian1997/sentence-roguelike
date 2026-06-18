// ============================================================
// IR (Intermediate Representation) — 语言无关的「事实」契约
// ============================================================
//
// 这是整个多语言架构的「图纸」。三段式:
//   句子(卡序列) ──语言包.parse()──▶ IR ──core.settle()──▶ effects(伤害/护甲/...)
//
// 语言包(zh/en)是**唯一**懂"我/你/敌/对仗/押韵/alliteration"的地方;它把句子翻译成这份
// 语言无关的 IR。core 的 settle() 只读 IR 做数值结算,**永远不认识任何具体中英文字**。
//
// 这样:加语言=再写一个产出 IR 的 parser;加规则=往语言包的规则数组加一条;加 LLM 评分=
// 往 scoreHooks 加一个钩子。core/IR 都不用动。
//
// 设计约束(冻结,改动需同步 settle.js + 两个语言包 + golden master):
//   - IR 必须自包含:settle 不回头读原始卡牌的语言字段。
//   - clauses 用抽象 role(self/enemy/coactor/none),不用具体词。
//   - notes 已是「目标语言文本」(语言包负责本地化),core 原样透传给 UI。

/**
 * @typedef {Object} Clause  分句级"谁对谁做什么"(Storyteller 式事实)
 * @property {'self'|'enemy'|'coactor'|'none'} agent    施动方
 * @property {'attack'|'defend'|'heal'|'copula'|'buff'|'none'} action  动作类别
 * @property {'self'|'enemy'|'none'} patient            受动方
 * @property {{name:string, verbType:'attack'|'defense'|'heal'}|null} coActor  独立个体(影子/猫…)
 */

/**
 * @typedef {Object} EvalIR
 * @property {{ok:boolean, reason?:string}} wellFormed  成句判定(语言包给,秒判,不接 LLM)
 * @property {Clause[]} clauses                          分句事实
 * @property {Object} base    卡牌贡献的基础数值 {damage,block,heal,draw,...}(语言包按卡算好,未乘倍率)
 * @property {Object} mults   各维度倍率 {grammar,poetic,punct,excAttack,excDefense,excHeal,excPosScale}
 * @property {Object} flags   {crit,doubleExecute,selfHarm,ignoreBlock,aoe,...} 布尔/标量开关
 * @property {Array}  riders  已结算成「语言中性」的特殊效果(motif/pun/identity/对牌/imperative/coActors…)
 * @property {Object} notes   {grammar:[],poetic:[],punct:[],exc:[]} 玩家可读提示(已本地化)
 * @property {number} poeticScore  诗意总分(= mults.poetic,给 LLM 钩子 + 暴击判定用)
 * @property {Object} debug   {text, lang, cards} 日志/调试用
 *
 * 注:为了在重构期保住 golden master 数值一致,本版 IR 直接携带一个 `effectsSeed`
 * (= 语言包算好的、尚未乘总倍率的 effects 对象)和 `ctxSeed`(settle 仍需的少量结算上下文,
 * 如 hasQuestion/hasMultiTarget/multiTargetIndices/_coActors/_predicates 等)。这些是
 * **语言无关的数值/结构数据**(不是"哪个字是敌我"那种语言语义),由语言包在 parse 阶段算出。
 * 待英文版稳定后可进一步纯化,但当前以「golden 零回归」为最高优先级。
 */

export function createIR() {
  return {
    wellFormed: { ok: true },
    clauses: [],
    base: { damage: 0, block: 0, heal: 0, draw: 0 },
    mults: { grammar: 1, poetic: 1, punct: 1, excAttack: 1, excDefense: 1, excHeal: 1, excPosScale: 1 },
    flags: {},
    riders: [],
    notes: { grammar: [], poetic: [], punct: [], exc: [] },
    poeticScore: 1,
    debug: { text: '', lang: 'zh', cards: [] },
    // 重构期载荷(见上 typedef 注):settle 消费这些做与旧 finalize 一致的数值结算。
    effectsSeed: null,
    ctxSeed: null,
  };
}

/**
 * LanguagePack 接口(每语言 index.js 导出):
 * @typedef {Object} LanguagePack
 * @property {(rawCards:any[]) => {ok:boolean,reason?:string}} isWellFormed  成句判定(秒判)
 * @property {(rawCards:any[]) => EvalIR} parse                              句子→IR
 * @property {Array<(ir:EvalIR, cards:any[]) => {multiplier:number,note?:string}|null>} scoreHooks
 *           诗意评分钩子链(同步)。**LLM 评委以后作为一个 async 钩子加入此数组**,返回 poetic 倍率。
 *           本版各语言留空数组 [] —— 接口预留,不实现。
 * @property {Object} cards   该语言卡库(WORD_DEFS 形态)
 * @property {Object} ui      UI_STRINGS
 */
