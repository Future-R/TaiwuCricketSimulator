import { LogType, SkillDefinition } from '../types';

// 正则表达式定义
const REGEX = {
    // 触发器
    Trigger: {
        BattleStart: /^(战斗|决斗)开始时/,
        RoundStart: /^回合开始时/,
        BeforeAttack: /^攻击(前|时)/,
        BeforeDefend: /^防御时/,
        ReceiveDamage: /^(受到|被)(.+)?(损伤|伤害)(时|后)/,
        DealDamage: /^造成(.+)?(损伤|伤害)(时|后)/,
        StatCalc: /^(依据.+)?计算属性时/,
        Defeat: /战败时/,
        SkillActivate: /对手.+技能时/,
        BeHit: /被(进攻|反击|鸣叫)时/
    },
    // 条件
    Condition: {
        If: /^若/,
        Prob: /概率触发\((.+?)%?\)/,
        StatCompare: /(自身|对手)(.+?)([><]=?)(.+)/,
        AttackType: /本次攻击为(.+)/,
        StatType: /属性为(.+)/,
        NotBlocked: /未被格挡/
    },
    // 动作
    Action: {
        Heal: /恢复(.+)/,
        Damage: /造成(.+)(损伤|伤害)/,
        StackAdd: /(增加|减少)(.+)层数(\d+)/,
        StackClear: /清除(.+)层数/,
        StackAddSelf: /层数(增加|减少)(\d+)/, // 简写，默认当前技能
        Calc: /结果=(.+)/,
        Reflect: /反弹(.+)/,
        Nullify: /抵消(.+)伤害/,
        Avoid: /避免(.+)/
    }
};

// 辅助：概率检查
const check = (prob: number) => Math.random() * 100 < prob;

// 辅助：解析数值表达式
// 支持: "10", "50%", "基础值", "层数", "伤害量", "基础值+层数"
const parseExpression = (expr: string, ctx: any, skill: SkillDefinition): number => {
    if (!expr) return 0;
    
    // 预处理变量
    let evalStr = expr
        .replace(/基础值/g, String(ctx.baseValue || 0))
        .replace(/伤害量/g, String((ctx.actualHpDmg || 0) + (ctx.actualSpDmg || 0)))
        .replace(/回合数/g, String(ctx.state?.round || 0))
        .replace(/层数/g, String(ctx.owner.skillState[`${skill.id}_stack`] || 0));

    // 处理百分比 (仅支持简单的 50% -> 0.5，通常用于乘法)
    // 实际上 DSL 中通常是 "恢复50%伤害量" -> 解析为动作参数
    // 这里主要处理 "结果=" 后面的数学公式
    
    try {
        // 安全起见，仅允许数字和运算符
        // 简单的 parser，不支持复杂嵌套
        // 结果=基础值+层数 -> 10+5
        const tokens = evalStr.match(/(\d+(\.\d+)?|[\+\-\*\/])/g);
        if (!tokens) return 0;
        
        // 极简计算器 (左结合)
        let result = parseFloat(tokens[0]);
        for (let i = 1; i < tokens.length; i += 2) {
            const op = tokens[i];
            const val = parseFloat(tokens[i+1]);
            if (isNaN(val)) continue;
            if (op === '+') result += val;
            if (op === '-') result -= val;
            if (op === '*') result *= val;
            if (op === '/') result /= val;
        }
        return result;
    } catch (e) {
        console.warn("DSL Eval Error:", expr, e);
        return 0;
    }
};

// 辅助：解析动作中的数值参数 (支持 "50%伤害量", "10点")
const parseActionValue = (valStr: string, ctx: any): number => {
    let base = 0;
    let ratio = 1;

    if (valStr.includes('伤害量') || valStr.includes('损伤')) {
        base = (ctx.actualHpDmg || 0) + (ctx.actualSpDmg || 0);
    } else if (valStr.includes('牙钳')) {
        base = ctx.owner.bite;
    } else {
        // 纯数字
        const nums = valStr.match(/\d+/);
        if (nums) base = parseInt(nums[0]);
    }

    if (valStr.includes('%')) {
        const pct = valStr.match(/(\d+)%/);
        if (pct) ratio = parseInt(pct[1]) / 100;
    } else if (valStr.includes('一半')) {
        ratio = 0.5;
    }

    return Math.floor(base * ratio);
};

// --- 执行器 ---

export const executeDSL = (
    dsl: string | undefined,
    hookName: keyof SkillDefinition,
    ctx: any, 
    skill: SkillDefinition
): any => {
    if (!dsl) return;

    // 分割语句 (;)
    const sentences = dsl.split(/[;；]/);

    for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (!cleanSentence) continue;

        // 1. 匹配触发器
        let content = cleanSentence;
        let matchedTrigger = false;

        for (const [key, regex] of Object.entries(REGEX.Trigger)) {
            if (regex.test(cleanSentence)) {
                // 检查触发器是否对应当前 Hook
                if (
                    (key === 'BattleStart' && hookName === 'onBattleStart') ||
                    (key === 'RoundStart' && hookName === 'onRoundStart') ||
                    (key === 'BeforeAttack' && hookName === 'onBeforeAttack') ||
                    (key === 'BeforeDefend' && hookName === 'onBeforeReceiveDamage' && ctx.isBlocked) ||
                    (key === 'ReceiveDamage' && (hookName === 'onAfterReceiveDamage' || hookName === 'onBeforeReceiveDamage')) ||
                    (key === 'DealDamage' && hookName === 'onAfterDealDamage') ||
                    (key === 'StatCalc' && hookName === 'onStatCalculate') ||
                    (key === 'Defeat' && hookName === 'onDefeat') ||
                    (key === 'BeHit' && hookName === 'onAfterReceiveDamage')
                ) {
                    content = cleanSentence.replace(regex, '');
                    matchedTrigger = true;
                } else {
                    // 也就是这句 DSL 不属于当前 Hook，跳过
                    matchedTrigger = false;
                }
                break; // 找到一个关键词就停止匹配 Trigger
            }
        }
        
        // 如果没有 Trigger 关键词，假设它属于上下文 (例如多条语句中的后续语句)
        // 但为了严谨，我们尽量要求 Trigger。这里做个简单宽容处理：
        // 如果 sentence 不包含任何 Trigger 关键词，且之前已经匹配过（复杂，暂不支持），
        // 或者我们假定它就是 Actions 列表。
        // 目前策略：必须匹配 Trigger 或者是无 Trigger 的后续 Action (暂简化为必须匹配 Trigger 或者是 StatCalc 的简写)
        
        if (!matchedTrigger) {
             // 特殊处理：如果是计算属性的 "结果=..."，往往紧跟在 Trigger 后，或者是分开写的。
             // 暂且跳过不匹配的行
             continue;
        }

        // 2. 解析条件和动作 (逗号分隔)
        const parts = content.split(/[,，]/);
        let conditionMet = true;

        for (const part of parts) {
            const p = part.trim();
            if (!p) continue;

            // --- 条件检查 ---
            if (REGEX.Condition.If.test(p)) {
                const sub = p.replace(REGEX.Condition.If, '').trim();

                // 概率
                const probMatch = sub.match(REGEX.Condition.Prob);
                if (probMatch) {
                    if (!check(parseFloat(probMatch[1]))) { conditionMet = false; break; }
                    continue;
                }

                // 攻击类型
                const attMatch = sub.match(REGEX.Condition.AttackType);
                if (attMatch) {
                    const type = attMatch[1];
                    if (type.includes('暴击') && !type.includes('非') && !ctx.isCrit) { conditionMet = false; break; }
                    if (type.includes('非暴击') && ctx.isCrit) { conditionMet = false; break; }
                    if (type.includes('反击') && ctx.sourceType !== 'strength') { conditionMet = false; break; }
                    if (type.includes('牙钳') && ctx.sourceType !== 'bite') { conditionMet = false; break; }
                    if (type.includes('气势') && ctx.sourceType !== 'vigor') { conditionMet = false; break; }
                    continue;
                }

                // 属性类型 (StatCalc)
                const statMatch = sub.match(REGEX.Condition.StatType);
                if (statMatch) {
                    const sName = statMatch[1];
                    let field = '';
                    if (sName.includes('暴击伤害') || sName.includes('暴伤')) field = 'critDamage';
                    else if (sName.includes('牙钳')) field = 'bite';
                    else if (sName.includes('角力')) field = 'strength';
                    else if (sName.includes('气势')) field = 'vigor';
                    
                    if (ctx.stat !== field) { conditionMet = false; break; }
                    continue;
                }

                // 属性比较 (自身体力<50%)
                const cmpMatch = sub.match(REGEX.Condition.StatCompare);
                if (cmpMatch) {
                    const targetName = cmpMatch[1]; // 自身/对手
                    const statName = cmpMatch[2]; // 体力/斗性...
                    const op = cmpMatch[3]; // <, >
                    const valStr = cmpMatch[4]; // 50%, 100

                    const target = targetName === '自身' ? ctx.owner : ctx.opponent;
                    let curr = 0, max = 1;
                    
                    if (statName.includes('体力')) { curr = target.currentHp; max = target.hp; }
                    else if (statName.includes('斗性')) { curr = target.currentSp; max = target.sp; }
                    else if (statName.includes('耐久')) { curr = target.currentDurability; max = target.maxDurability; }
                    
                    let threshold = valStr.includes('%') ? max * (parseFloat(valStr)/100) : parseFloat(valStr);
                    
                    if (op === '<' && !(curr < threshold)) conditionMet = false;
                    if (op === '>' && !(curr > threshold)) conditionMet = false;
                    if (!conditionMet) break;
                    continue;
                }
            }

            if (!conditionMet) break;

            // --- 动作执行 ---
            
            // Log Shout (First action triggers shout)
            if (skill.shout && ctx.logs && !ctx.logs.find((l:any) => l.type === LogType.Shout && l.msg.includes(skill.shout))) {
                 ctx.logs.push({ msg: `「${skill.shout}」`, type: LogType.Shout });
                 ctx.logs.push({ msg: `【${skill.name}】发动！`, type: LogType.Skill });
            }

            // 恢复
            const healMatch = p.match(REGEX.Action.Heal);
            if (healMatch) {
                const val = parseActionValue(healMatch[1], ctx);
                if (p.includes('体力')) ctx.owner.currentHp = Math.min(ctx.owner.hp, ctx.owner.currentHp + val);
                if (p.includes('斗性')) ctx.owner.currentSp = Math.min(ctx.owner.sp, ctx.owner.currentSp + val);
                if (ctx.logs) ctx.logs.push({ msg: `恢复${val}点${p.includes('体力')?'体力':'斗性'}`, type: LogType.Effect });
                continue;
            }

            // 造成损伤
            const dmgMatch = p.match(REGEX.Action.Damage);
            if (dmgMatch) {
                const val = parseActionValue(dmgMatch[1], ctx);
                if (ctx.opponent) {
                    // 默认造成 HP 伤害，如果有"斗性"字眼则扣 SP
                    // 简化处理：通常 "造成X损伤" 作用于 HP
                    if (p.includes('体力')) ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - val);
                    if (p.includes('斗性')) ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - val);
                    if (!p.includes('体力') && !p.includes('斗性')) {
                        // 通用损伤 (HP)
                         ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - val);
                    }
                    if (ctx.logs) ctx.logs.push({ msg: `造成${val}点额外损伤`, type: LogType.Damage });
                }
                continue;
            }

            // 增加层数 (默认)
            const stackMatch = p.match(REGEX.Action.StackAddSelf);
            if (stackMatch) {
                const op = stackMatch[1]; // 增加/减少
                const val = parseInt(stackMatch[2]);
                const key = `${skill.id}_stack`;
                const current = ctx.owner.skillState[key] || 0;
                ctx.owner.skillState[key] = op === '增加' ? current + val : Math.max(0, current - val);
                if (ctx.logs) ctx.logs.push({ msg: `层数${op === '增加'?'+':'-'}${val} (当前:${ctx.owner.skillState[key]})`, type: LogType.Effect });
                continue;
            }

            // 清除层数
            if (REGEX.Action.StackClear.test(p)) {
                ctx.owner.skillState[`${skill.id}_stack`] = 0;
                if (ctx.logs) ctx.logs.push({ msg: `层数清零`, type: LogType.Effect });
                continue;
            }

            // 计算属性 (结果=)
            const calcMatch = p.match(REGEX.Action.Calc);
            if (calcMatch && hookName === 'onStatCalculate') {
                const expr = calcMatch[1];
                return parseExpression(expr, ctx, skill);
            }

            // 避免 (Avoid)
            const avoidMatch = p.match(REGEX.Action.Avoid);
            if (avoidMatch) {
                if (hookName === 'onBeforeAttack') return { avoidBlock: true }; // 简化，假设避免格挡
                if (hookName === 'onBeforeReceiveDamage') return { isCrit: false }; // 简化，假设避免暴击
            }

            // 反弹
            const reflectMatch = p.match(REGEX.Action.Reflect);
            if (reflectMatch && hookName === 'onBeforeReceiveDamage') {
                // 简化反弹逻辑
                const amt = Math.min(ctx.hpDmg, ctx.owner.damageReduce);
                ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - amt);
                if (ctx.logs) ctx.logs.push({ msg: `反弹${amt}点损伤`, type: LogType.Damage });
                continue;
            }
            
            // 抵消
             const nullMatch = p.match(REGEX.Action.Nullify);
             if (nullMatch && hookName === 'onBeforeReceiveDamage') {
                 if (ctx.logs) ctx.logs.push({ msg: `损伤被抵消`, type: LogType.Block });
                 return { hpDmg: 0, spDmg: 0 };
             }
        }
    }
};
