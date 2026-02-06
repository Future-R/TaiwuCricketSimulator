
import { LogType, SkillDefinition, CompiledDSL } from '../types';

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
    try {
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
        // console.warn("DSL Eval Error:", expr, e); // Suppress warning for perf
        return 0;
    }
};

// 辅助：解析动作中的数值参数 (支持 "50%伤害量", "10点", "200%回合数")
const parseActionValue = (valStr: string, ctx: any): number => {
    let base = 0;
    let ratio = 1;

    // 先确定基数
    if (valStr.includes('伤害量') || valStr.includes('损伤')) {
        base = (ctx.actualHpDmg || 0) + (ctx.actualSpDmg || 0);
    } else if (valStr.includes('牙钳')) {
        base = ctx.owner.bite;
    } else if (valStr.includes('回合数')) {
        base = ctx.state?.round || 0;
    } else {
        // 纯数字作为基数
        const nums = valStr.match(/\d+/);
        if (nums && !valStr.includes('%')) base = parseInt(nums[0]);
    }
    
    // 再确定倍率
    if (valStr.includes('%')) {
        const pct = valStr.match(/(\d+)%/);
        if (pct) ratio = parseInt(pct[1]) / 100;
    } else if (valStr.includes('一半')) {
        ratio = 0.5;
    }

    // 向上取整
    return Math.ceil(base * ratio);
};

// --- COMPILATION LAYER ---

type InstructionType = 'Condition' | 'Action';
interface CompiledInstruction {
    type: InstructionType;
    kind: string; // e.g., 'Prob', 'Heal'
    args: any[];
}

export const clearDSLCache = (skillId?: string) => {
    // Legacy support, now compilation happens on registry init
};

export const compileSkill = (skill: SkillDefinition) => {
    if (!skill.dsl) return;

    const compiled: CompiledDSL = { hooks: new Map() };
    const meta: any = {};
    const sentences = skill.dsl.split(/[;；]/);

    for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (!cleanSentence) continue;
        
        // 1. Identify Hook & Strip Trigger
        let hookKeys: string[] = [];
        let content = cleanSentence;

        for (const [key, regex] of Object.entries(REGEX.Trigger)) {
            if (regex.test(cleanSentence)) {
                content = cleanSentence.replace(regex, ''); // Strip
                if (key === 'BattleStart') hookKeys.push('onBattleStart');
                else if (key === 'RoundStart') hookKeys.push('onRoundStart');
                else if (key === 'BeforeAttack') hookKeys.push('onBeforeAttack');
                else if (key === 'BeforeDefend') hookKeys.push('onBeforeReceiveDamage');
                else if (key === 'ReceiveDamage') { hookKeys.push('onAfterReceiveDamage'); hookKeys.push('onBeforeReceiveDamage'); }
                else if (key === 'DealDamage') hookKeys.push('onAfterDealDamage');
                else if (key === 'StatCalc') hookKeys.push('onStatCalculate');
                else if (key === 'Defeat') hookKeys.push('onDefeat');
                else if (key === 'BeHit') hookKeys.push('onAfterReceiveDamage');
                // Tian Guang optimization
                else if (key === 'SkillActivate') {
                    // Extract prob immediately
                    const probMatch = content.match(/概率触发\((\d+)/);
                    if (probMatch) meta.tianGuangProb = parseInt(probMatch[1]);
                }
                break;
            }
        }

        if (hookKeys.length === 0) continue;

        // 2. Parse Content into Instructions
        const instructions: CompiledInstruction[] = [];
        const parts = content.split(/[,，]/);

        for (const part of parts) {
            const p = part.trim();
            if (!p) continue;

            // --- CONDITIONS ---
            if (REGEX.Condition.If.test(p)) {
                const sub = p.replace(REGEX.Condition.If, '').trim();
                
                // Prob
                const probMatch = sub.match(REGEX.Condition.Prob);
                if (probMatch) {
                    instructions.push({ type: 'Condition', kind: 'Prob', args: [parseFloat(probMatch[1])] });
                    continue;
                }
                // AttackType
                const attMatch = sub.match(REGEX.Condition.AttackType);
                if (attMatch) {
                    instructions.push({ type: 'Condition', kind: 'AttackType', args: [attMatch[1]] });
                    continue;
                }
                // StatType
                const statMatch = sub.match(REGEX.Condition.StatType);
                if (statMatch) {
                    instructions.push({ type: 'Condition', kind: 'StatType', args: [statMatch[1]] });
                    continue;
                }
                // Compare
                const cmpMatch = sub.match(REGEX.Condition.StatCompare);
                if (cmpMatch) {
                    instructions.push({ type: 'Condition', kind: 'StatCompare', args: [cmpMatch[1], cmpMatch[2], cmpMatch[3], cmpMatch[4]] });
                    continue;
                }
                // NotBlocked
                if (REGEX.Condition.NotBlocked.test(sub)) {
                    instructions.push({ type: 'Condition', kind: 'NotBlocked', args: [] });
                    continue;
                }
            } 
            // --- ACTIONS ---
            else {
                 // Heal
                const healMatch = p.match(REGEX.Action.Heal);
                if (healMatch) {
                    instructions.push({ type: 'Action', kind: 'Heal', args: [healMatch[1], p] });
                    continue;
                }
                // Damage
                const dmgMatch = p.match(REGEX.Action.Damage);
                if (dmgMatch) {
                    instructions.push({ type: 'Action', kind: 'Damage', args: [dmgMatch[1], p] });
                    continue;
                }
                // StackSelf
                const stackMatch = p.match(REGEX.Action.StackAddSelf);
                if (stackMatch) {
                    instructions.push({ type: 'Action', kind: 'StackAddSelf', args: [stackMatch[1], parseInt(stackMatch[2])] });
                    continue;
                }
                // StackClear
                if (REGEX.Action.StackClear.test(p)) {
                    instructions.push({ type: 'Action', kind: 'StackClear', args: [] });
                    continue;
                }
                // Calc
                const calcMatch = p.match(REGEX.Action.Calc);
                if (calcMatch) {
                    instructions.push({ type: 'Action', kind: 'Calc', args: [calcMatch[1]] });
                    continue;
                }
                // Avoid
                const avoidMatch = p.match(REGEX.Action.Avoid);
                if (avoidMatch) {
                    instructions.push({ type: 'Action', kind: 'Avoid', args: [] });
                    continue;
                }
                // Reflect
                const reflectMatch = p.match(REGEX.Action.Reflect);
                if (reflectMatch) {
                    instructions.push({ type: 'Action', kind: 'Reflect', args: [] });
                    continue;
                }
                // Nullify
                const nullMatch = p.match(REGEX.Action.Nullify);
                if (nullMatch) {
                    instructions.push({ type: 'Action', kind: 'Nullify', args: [] });
                    continue;
                }
            }
        }

        if (instructions.length > 0) {
            hookKeys.forEach(h => {
                if (!compiled.hooks.has(h)) compiled.hooks.set(h, []);
                compiled.hooks.get(h)!.push(instructions);
            });
        }
    }

    skill.compiled = compiled;
    skill.meta = { ...skill.meta, ...meta };
};

// --- EXECUTION LAYER ---

export const executeDSL = (
    _dsl: string | undefined, // Unused in optimized path
    hookName: keyof SkillDefinition,
    ctx: any, 
    skill: SkillDefinition
): any => {
    // 1. Use Compiled Logic
    if (!skill.compiled) {
        return; // Should be compiled on init
    }
    
    const sentenceBatches = skill.compiled.hooks.get(hookName);
    if (!sentenceBatches) return;

    for (const instructions of sentenceBatches) {
        let conditionMet = true;

        for (const instr of instructions) {
            // CONDITIONS
            if (instr.type === 'Condition') {
                if (instr.kind === 'Prob') {
                    if (!check(instr.args[0])) { conditionMet = false; break; }
                } 
                else if (instr.kind === 'AttackType') {
                    const type = instr.args[0];
                    if (type.includes('暴击') && !type.includes('非') && !ctx.isCrit) { conditionMet = false; break; }
                    if (type.includes('非暴击') && ctx.isCrit) { conditionMet = false; break; }
                    if (type.includes('反击') && ctx.sourceType !== 'strength') { conditionMet = false; break; }
                    if (type.includes('牙钳') && ctx.sourceType !== 'bite') { conditionMet = false; break; }
                    if (type.includes('气势') && ctx.sourceType !== 'vigor') { conditionMet = false; break; }
                }
                else if (instr.kind === 'StatType') {
                    const sName = instr.args[0];
                    let field = '';
                    if (sName.includes('暴击伤害') || sName.includes('暴伤')) field = 'critDamage';
                    else if (sName.includes('牙钳')) field = 'bite';
                    else if (sName.includes('角力')) field = 'strength';
                    else if (sName.includes('气势')) field = 'vigor';
                    if (ctx.stat !== field) { conditionMet = false; break; }
                }
                else if (instr.kind === 'StatCompare') {
                    const [targetName, statName, op, valStr] = instr.args;
                    const target = targetName === '自身' ? ctx.owner : ctx.opponent;
                    let curr = 0, max = 1;
                    if (statName.includes('体力')) { curr = target.currentHp; max = target.hp; }
                    else if (statName.includes('斗性')) { curr = target.currentSp; max = target.sp; }
                    else if (statName.includes('耐久')) { curr = target.currentDurability; max = target.maxDurability; }
                    let threshold = valStr.includes('%') ? max * (parseFloat(valStr)/100) : parseFloat(valStr);
                    if (op === '<' && !(curr < threshold)) conditionMet = false;
                    if (op === '>' && !(curr > threshold)) conditionMet = false;
                    if (!conditionMet) break;
                }
                else if (instr.kind === 'NotBlocked') {
                    if (ctx.isBlocked) { conditionMet = false; break; }
                }
                continue;
            }

            // ACTIONS
            if (!conditionMet) break;

            // Log Shout (Optimized check)
            if (skill.shout && ctx.logs) {
                 // Manual loop for perf instead of find/includes
                 let shouted = false;
                 for(let i=ctx.logs.length-1; i>=0; i--) {
                     if(ctx.logs[i].type === LogType.Shout && ctx.logs[i].message.includes(skill.shout)) {
                         shouted = true; break;
                     }
                 }
                 if (!shouted) {
                     ctx.logs.push({ msg: `「${skill.shout}」`, type: LogType.Shout });
                     ctx.logs.push({ msg: `【${skill.name}】发动！`, type: LogType.Skill });
                 }
            }

            if (instr.kind === 'Heal') {
                const val = parseActionValue(instr.args[0], ctx);
                const p = instr.args[1];
                if (p.includes('体力')) ctx.owner.currentHp = Math.min(ctx.owner.hp, ctx.owner.currentHp + val);
                if (p.includes('斗性')) ctx.owner.currentSp = Math.min(ctx.owner.sp, ctx.owner.currentSp + val);
                if (ctx.logs) ctx.logs.push({ msg: `恢复${val}点${p.includes('体力')?'体力':'斗性'}`, type: LogType.Effect });
            }
            else if (instr.kind === 'Damage') {
                const val = parseActionValue(instr.args[0], ctx);
                const p = instr.args[1];
                if (ctx.opponent) {
                    if (p.includes('体力')) ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - val);
                    if (p.includes('斗性')) ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - val);
                    if (!p.includes('体力') && !p.includes('斗性')) {
                         ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - val);
                    }
                    if (ctx.logs) ctx.logs.push({ msg: `造成${val}点额外损伤`, type: LogType.Damage });
                }
            }
            else if (instr.kind === 'StackAddSelf') {
                const [op, val] = instr.args;
                const key = `${skill.id}_stack`;
                const current = ctx.owner.skillState[key] || 0;
                ctx.owner.skillState[key] = op === '增加' ? current + val : Math.max(0, current - val);
                if (ctx.logs) ctx.logs.push({ msg: `层数${op === '增加'?'+':'-'}${val} (当前:${ctx.owner.skillState[key]})`, type: LogType.Effect });
            }
            else if (instr.kind === 'StackClear') {
                ctx.owner.skillState[`${skill.id}_stack`] = 0;
                if (ctx.logs) ctx.logs.push({ msg: `层数清零`, type: LogType.Effect });
            }
            else if (instr.kind === 'Calc' && hookName === 'onStatCalculate') {
                return parseExpression(instr.args[0], ctx, skill);
            }
            else if (instr.kind === 'Avoid') {
                if (hookName === 'onBeforeAttack') return { avoidBlock: true };
                if (hookName === 'onBeforeReceiveDamage') return { isCrit: false };
            }
            else if (instr.kind === 'Reflect' && hookName === 'onBeforeReceiveDamage') {
                const amt = Math.min(ctx.hpDmg, ctx.owner.damageReduce);
                ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - amt);
                if (ctx.logs) ctx.logs.push({ msg: `反弹${amt}点损伤`, type: LogType.Damage });
            }
            else if (instr.kind === 'Nullify' && hookName === 'onBeforeReceiveDamage') {
                 if (ctx.logs) ctx.logs.push({ msg: `损伤被抵消`, type: LogType.Block });
                 return { hpDmg: 0, spDmg: 0 };
            }
        }
    }
};
