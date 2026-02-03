
import { LogType, SkillDefinition, RuntimeCricket } from '../types';
import { executeDSL } from './dslInterpreter';

// Helper to safely add log and shout
const act = (ctx: { logs: { msg: string; type: LogType }[] }, skill: SkillDefinition, msg: string) => {
    if (skill.shout) {
        ctx.logs.push({ msg: `「${skill.shout}」`, type: LogType.Shout });
    }
    ctx.logs.push({ msg: `【${skill.name}】${msg}`, type: LogType.Skill });
};

const check = (prob: number) => Math.random() * 100 < prob;

export const SKILL_REGISTRY: Record<string, SkillDefinition> = {
    'dumb_defeat': {
        id: 'dumb_defeat',
        name: '让手',
        prob: 100,
        shout: '便是让你一手，你也胜不了！',
        dsl: '战败时，无效果',
        onDefeat: (ctx, skill) => { act(ctx, skill, '（呆物虽然战败，但气势不减...）'); }
    },

    'poison_cone': {
        id: 'poison_cone',
        name: '毒锥',
        prob: 100,
        shout: '可恨！吃我一锥，纳命来罢！',
        dsl: '回合开始时，若自身体力<50% 或 若自身斗性<50% 或 若自身耐久<50%，立即进行一次额外的暴击',
        onRoundStart: (ctx, skill) => {
             const c = ctx.owner;
             if (!c.skillState.poisonCone) c.skillState.poisonCone = { hp: false, sp: false, dur: false };
             const triggers: string[] = [];
             if (!c.skillState.poisonCone.hp && c.currentHp < c.hp * 0.5) { c.skillState.poisonCone.hp = true; triggers.push('体力'); }
             if (!c.skillState.poisonCone.sp && c.currentSp < c.sp * 0.5) { c.skillState.poisonCone.sp = true; triggers.push('斗性'); }
             if (!c.skillState.poisonCone.dur && c.currentDurability < c.maxDurability * 0.5) { c.skillState.poisonCone.dur = true; triggers.push('耐久'); }

             if (triggers.length > 0) {
                 act(ctx, skill, `${triggers.join('/')}过低，发动反扑！`);
                 const damage = (c.bite + c.critDamage) * triggers.length; 
                 const spDamage = c.vigor * triggers.length;
                 ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - damage);
                 ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - spDamage);
                 ctx.opponent.currentDurability = Math.max(0, ctx.opponent.currentDurability - 1);
                 ctx.logs.push({ msg: `${ctx.opponent.name} 受到毒锥重创！(耐久-1, 体力-${damage}, 斗性-${spDamage})`, type: LogType.Crit });
             }
        }
    },

    'iron_shell': {
        id: 'iron_shell',
        name: '招架',
        prob: 50,
        shout: '运阴阳之力，抵乾坤之变！',
        dsl: '受到体力损伤时，若概率触发(50%)，抵消全部伤害；受到斗性损伤时，若概率触发(50%)，抵消全部伤害',
        onBeforeReceiveDamage: (ctx, skill) => {
            const res = executeDSL(skill.dsl, 'onBeforeReceiveDamage', ctx, skill);
            if (res) return res;
        }
    },

    'soul_taking': {
        id: 'soul_taking',
        name: '摄魂',
        prob: 100,
        shout: '此音摄魂，可敢聆听？',
        dsl: '攻击时，主动攻击时即使未暴击也能造成相当于气势的斗性损伤',
        onBeforeAttack: () => { }
    },

    'run_horse': {
        id: 'run_horse',
        name: '跑马',
        prob: 66,
        shout: '你岂能追得上我？',
        dsl: '攻击前，若概率触发(66%)，避免被对手格挡；防御时，若本次攻击为暴击，若概率触发(66%)，避免被暴击',
        onBeforeAttack: (ctx, skill) => { return executeDSL(skill.dsl, 'onBeforeAttack', ctx, skill); },
        onBeforeReceiveDamage: (ctx, skill) => { return executeDSL(skill.dsl, 'onBeforeReceiveDamage', ctx, skill); }
    },
    
    'raise_sword': {
        id: 'raise_sword',
        name: '养剑',
        prob: 33,
        shout: '勤修苦炼，只为一剑！',
        dsl: '造成伤害后，若本次攻击为非暴击，若概率触发(33%)，层数增加10；计算属性时，若属性为暴击伤害，结果=基础值+层数',
        onAfterDealDamage: (ctx, skill) => { executeDSL(skill.dsl, 'onAfterDealDamage', ctx, skill); },
        onStatCalculate: (ctx, skill) => {
            const val = executeDSL(skill.dsl, 'onStatCalculate', ctx, skill);
            return typeof val === 'number' ? val : ctx.baseValue;
        }
    },
    
    'black_armor': {
        id: 'black_armor',
        name: '玄甲',
        prob: 100,
        shout: '碾压……过去……',
        dsl: '回合开始时，造成200%回合数的体力损伤，造成200%回合数的斗性损伤',
        onRoundStart: (ctx, skill) => { executeDSL(skill.dsl, 'onRoundStart', ctx, skill); }
    },
    
    'brave': {
        id: 'brave',
        name: '勇烈',
        prob: 50,
        shout: '性烈如火，睚眦必报！',
        dsl: '造成伤害后，若本次攻击为反击，若概率触发(50%)，造成100%伤害量的额外损伤',
        onAfterDealDamage: (ctx, skill) => { executeDSL(skill.dsl, 'onAfterDealDamage', ctx, skill); }
    },

    'cinnabar_evil': {
        id: 'cinnabar_evil',
        name: '赤煞',
        prob: 100,
        shout: '与我一战，死亦不休！',
        dsl: '战斗开始时，对手立即损失33%体力，对手立即损失33%斗性',
        onBattleStart: (ctx, skill) => {
            // Complex logic kept in hardcode for exact rounding/max hp math
            if (!check(skill.prob)) return;
            const dmgHp = Math.ceil(ctx.opponent.hp / 3);
            const dmgSp = Math.ceil(ctx.opponent.sp / 3);
            ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - dmgHp);
            ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - dmgSp);
            act(ctx, skill, `侵蚀对手，造成${dmgHp}体力/${dmgSp}斗性损伤！`);
        }
    },
    
    'immovable': {
        id: 'immovable',
        name: '不动',
        prob: 100, 
        shout: '诸相非相，我自心清意明！',
        dsl: '受到伤害后，减少的斗性的50%会恢复为体力，减少的体力的50%会恢复为斗性',
        onAfterReceiveDamage: (ctx, skill) => {
            if (!check(skill.prob)) return;
            let recovered = false;
            let msg = "";
            const spLoss = ctx.actualSpDmg || 0;
            const hpLoss = ctx.actualHpDmg || 0;
            if (spLoss > 0) {
                const recHp = Math.floor(spLoss * 0.5);
                if (recHp > 0) {
                    ctx.owner.currentHp = Math.min(ctx.owner.hp, ctx.owner.currentHp + recHp);
                    msg += `斗性转化->恢复${recHp}体力 `;
                    recovered = true;
                }
            }
            if (hpLoss > 0) {
                const recSp = Math.floor(hpLoss * 0.5);
                if (recSp > 0) {
                    ctx.owner.currentSp = Math.min(ctx.owner.sp, ctx.owner.currentSp + recSp);
                    msg += `体力转化->恢复${recSp}斗性`;
                    recovered = true;
                }
            }
            if (recovered) act(ctx, skill, msg);
        }
    },
    
    'spear_death': {
        id: 'spear_death',
        name: '反戈',
        prob: 100,
        shout: '坚如金铁，牢不可破！',
        dsl: '造成伤害后，若本次攻击为反击，层数增加6；计算属性时，若属性为角力，结果=基础值+层数',
        onAfterDealDamage: (ctx, skill) => { executeDSL(skill.dsl, 'onAfterDealDamage', ctx, skill); },
        onStatCalculate: (ctx, skill) => {
            const val = executeDSL(skill.dsl, 'onStatCalculate', ctx, skill);
            return typeof val === 'number' ? val : ctx.baseValue;
        }
    },

    'sacrifice': {
        id: 'sacrifice',
        name: '舍身',
        prob: 20,
        shout: '宁为玉碎，不为瓦全！',
        dsl: '造成伤害后，若概率触发(20+已损百分比)，造成额外损伤(1.2+已损百分比/10)，自己损失10%',
        onAfterDealDamage: (ctx, skill) => {
            if ((ctx.actualHpDmg || 0) > 0 || (ctx.actualSpDmg || 0) > 0) {
                const hpLossPct = ((ctx.owner.hp - ctx.owner.currentHp) / ctx.owner.hp) * 100;
                const spLossPct = ((ctx.owner.sp - ctx.owner.currentSp) / ctx.owner.sp) * 100;
                const totalLoss = hpLossPct + spLossPct;
                
                if (check(skill.prob + totalLoss)) { 
                     const factor = 1.2 + (totalLoss / 10); 
                     const exHp = Math.floor((ctx.actualHpDmg || 0) * (factor - 1));
                     const exSp = Math.floor((ctx.actualSpDmg || 0) * (factor - 1));
                     
                     if (exHp > 0 || exSp > 0) {
                        ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - exHp);
                        ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - exSp);
                        const selfHp = Math.floor(ctx.owner.currentHp * 0.1);
                        const selfSp = Math.floor(ctx.owner.currentSp * 0.1);
                        ctx.owner.currentHp -= selfHp;
                        ctx.owner.currentSp -= selfSp;
                        act(ctx, skill, `损伤倍率${factor.toFixed(1)}！额外造成${exHp}体力/${exSp}斗性，自损${selfHp}体力/${selfSp}斗性。`);
                     }
                }
            }
        }
    },

    'break_force': {
        id: 'break_force',
        name: '破势',
        prob: 100,
        shout: '得心应手，势如破竹！',
        dsl: '造成伤害后，若本次攻击为牙钳，层数增加6；计算属性时，若属性为牙钳，结果=基础值+层数',
        onAfterDealDamage: (ctx, skill) => { executeDSL(skill.dsl, 'onAfterDealDamage', ctx, skill); },
        onStatCalculate: (ctx, skill) => {
            const val = executeDSL(skill.dsl, 'onStatCalculate', ctx, skill);
            return typeof val === 'number' ? val : ctx.baseValue;
        }
    },

    'hundred_battles': {
        id: 'hundred_battles',
        name: '百战',
        prob: 50,
        shout: '无胆匪类！焉敢伤我！',
        dsl: '防御时，若概率触发(50%)，造成等同于牙钳的体力损伤，造成等同于气势的斗性损伤',
        onBeforeReceiveDamage: (ctx, skill) => {
            if (ctx.isBlocked && check(skill.prob)) {
                 const biteDmg = ctx.owner.bite;
                 const vigorDmg = ctx.owner.vigor;
                 ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - biteDmg);
                 ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - vigorDmg);
                 act(ctx, skill, `反击！造成${biteDmg}体力/${vigorDmg}斗性损伤。`);
            }
        }
    },
    
    'true_blood': {
        id: 'true_blood',
        name: '真血',
        prob: 100,
        shout: '三色真血，促织王种，岂会惧你！',
        dsl: '体力、斗性、耐久任一项降至50%以下时，除体力、斗性外全部属性*1.5',
        onRoundStart: (ctx, skill) => {
            if (!check(skill.prob)) return;
            const c = ctx.owner;
            if (!c.skillState.trueColorTriggered && 
               (c.currentHp < c.hp * 0.5 || c.currentSp < c.sp * 0.5 || c.currentDurability < c.maxDurability * 0.5)) {
                c.skillState.trueColorTriggered = true;
                act(ctx, skill, `王者觉醒！全属性大幅提升！`);
            }
        },
        onStatCalculate: (ctx) => {
            if (ctx.owner.skillState.trueColorTriggered) {
                return Math.ceil(ctx.baseValue * 1.5);
            }
            return ctx.baseValue;
        }
    },

    'grass_talent': {
        id: 'grass_talent',
        name: '奇赋',
        prob: 50,
        shout: '哎呀，看来得认真点了……',
        dsl: '回合开始时，若概率触发(50%)，牙钳、角力、气势中的某项随机翻倍',
        onRoundStart: (ctx, skill) => {
            if (!check(skill.prob)) return;
            const stats = ['bite', 'strength', 'vigor'] as const;
            const target = stats[Math.floor(Math.random() * 3)];
            ctx.owner.skillState.grassBuff = target; 
            const statName = target === 'bite' ? '牙钳' : target === 'strength' ? '角力' : '气势';
            act(ctx, skill, `${statName}翻倍！`);
        },
        onStatCalculate: (ctx) => {
            if (ctx.owner.skillState.grassBuff === ctx.stat) {
                return Math.ceil(ctx.baseValue * 2);
            }
            return ctx.baseValue;
        }
    },

    'change': {
        id: 'change',
        name: '变化',
        prob: 100,
        shout: '蛇蝎汲血，蜈蜂幻形……',
        dsl: '造成伤害后，若本次攻击为暴击，恢复100%伤害量的体力，恢复100%伤害量的斗性',
        onAfterDealDamage: (ctx, skill) => {
            if (ctx.isCrit && check(skill.prob)) {
                 const healHp = ctx.actualHpDmg || 0;
                 const healSp = ctx.actualSpDmg || 0;
                 if (healHp > 0 || healSp > 0) {
                     ctx.owner.currentHp = Math.min(ctx.owner.hp, ctx.owner.currentHp + healHp);
                     ctx.owner.currentSp = Math.min(ctx.owner.sp, ctx.owner.currentSp + healSp);
                     act(ctx, skill, `汲取力量！恢复${healHp}体力/${healSp}斗性。`);
                 }
            }
        }
    },

    'spirit_channel': {
        id: 'spirit_channel',
        name: '通灵',
        prob: 100,
        shout: '与我一战，你岂有胜算……',
        dsl: '造成伤害后，若属性为气势，层数增加6；计算属性时，若属性为气势，结果=基础值+层数',
        onAfterDealDamage: (ctx, skill) => { executeDSL(skill.dsl, 'onAfterDealDamage', ctx, skill); },
        onStatCalculate: (ctx, skill) => {
            const val = executeDSL(skill.dsl, 'onStatCalculate', ctx, skill);
            return typeof val === 'number' ? val : ctx.baseValue;
        }
    },

    'tian_guang': {
        id: 'tian_guang',
        name: '天光',
        prob: 66,
        shout: '天光已现，妖怪亡形！',
        dsl: '对手促织发动技能时，若概率触发(66%)，阻止对手的技能生效',
    },

    'brocade_intimidate': {
        id: 'brocade_intimidate',
        name: '威吓',
        prob: 1, 
        shout: '天下谁人不识我？',
        dsl: '回合开始时，将对手暴击、防御、反击中的随机一项降为0',
        onRoundStart: (ctx, skill) => {
            const stats = ['bite', 'strength', 'vigor'] as const;
            let count = 0;
            const getRaw = (c: RuntimeCricket, s: string) => (c as any)[s] || 0;
            
            stats.forEach(st => {
                if (getRaw(ctx.owner, st) > getRaw(ctx.opponent, st) + 20) count++;
            });
            
            if (count > 0 && check(count * 33)) {
                const targets = ['deadliness', 'defence', 'counter'] as const;
                const target = targets[Math.floor(Math.random() * 3)];
                ctx.opponent.skillState.brocadeDebuff = target;
                const tName = target === 'deadliness' ? '暴击' : target === 'defence' ? '防御' : '反击';
                act(ctx, skill, `${tName}降为0！`);
            } else {
                ctx.opponent.skillState.brocadeDebuff = null;
            }
        }
    },

    'red_lotus': {
        id: 'red_lotus',
        name: '红莲',
        prob: 50,
        shout: '红莲业火，焚妖荡魔！',
        dsl: '防御时，若概率触发(50%)，反弹100%伤害',
        onBeforeReceiveDamage: (ctx, skill) => {
            const res = executeDSL(skill.dsl, 'onBeforeReceiveDamage', ctx, skill);
            if (res) return res;
        }
    },

    'reverse_fate': {
        id: 'reverse_fate',
        name: '逆命',
        prob: 66,
        shout: '吾虽形残……逆命不绝！',
        dsl: '被进攻时，层数增加1；计算属性时，若属性为牙钳，结果=基础值+层数',
        onAfterReceiveDamage: (ctx, skill) => {
            if (check(skill.prob)) {
                 if (!ctx.owner.skillState.eightFailuresStack) ctx.owner.skillState.eightFailuresStack = { bite: 0, strength: 0, vigor: 0};
                 let type = "";
                 if (ctx.sourceType === 'bite') {
                     ctx.owner.skillState.eightFailuresStack.bite++;
                     type = "牙钳+1";
                 } else if (ctx.sourceType === 'strength') {
                     ctx.owner.skillState.eightFailuresStack.strength++;
                     type = "角力+1";
                 } else if (ctx.sourceType === 'vigor') {
                     ctx.owner.skillState.eightFailuresStack.vigor++;
                     type = "气势+1";
                 }
                 if (type) act(ctx, skill, type);
            }
        },
        onStatCalculate: (ctx) => {
            const stacks = ctx.owner.skillState.eightFailuresStack || { bite: 0, strength: 0, vigor: 0};
            if (ctx.stat === 'bite') return ctx.baseValue + stacks.bite;
            if (ctx.stat === 'strength') return ctx.baseValue + stacks.strength;
            if (ctx.stat === 'vigor') return ctx.baseValue + stacks.vigor;
            return ctx.baseValue;
        }
    }
};
