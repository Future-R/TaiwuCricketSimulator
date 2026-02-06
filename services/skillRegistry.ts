
import { LogType, SkillDefinition, RuntimeCricket } from '../types';
import { executeDSL, compileSkill } from './dslInterpreter';

// Helper to safely add log and shout
const act = (ctx: { logs: { msg: string; type: LogType }[] | null }, skill: SkillDefinition, msg: string) => {
    if (!ctx.logs) return;
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
        shout: '便是让你一手，你也胜不了！',
        dsl: '战败时，无效果',
        onDefeat: (ctx, skill) => { act(ctx, skill, '（呆物虽然战败，但气势不减...）'); }
    },

    'poison_cone': {
        id: 'poison_cone',
        name: '毒锥',
        shout: '可恨！吃我一锥，纳命来罢！',
        dsl: '体力、斗性、耐久分别首次降至50%以下时100%发动，立即进行一次额外的暴击',
        onRoundStart: (ctx, skill) => {
             const c = ctx.owner;
             if (!c.skillState.poisonCone) c.skillState.poisonCone = { hp: false, sp: false, dur: false };
             const triggers: string[] = [];
             
             // Check if below 50% and NOT YET TRIGGERED
             if (!c.skillState.poisonCone.hp && c.currentHp < c.hp * 0.5) { 
                 c.skillState.poisonCone.hp = true; triggers.push('体力'); 
             }
             if (!c.skillState.poisonCone.sp && c.currentSp < c.sp * 0.5) { 
                 c.skillState.poisonCone.sp = true; triggers.push('斗性'); 
             }
             if (!c.skillState.poisonCone.dur && c.currentDurability < c.maxDurability * 0.5) { 
                 c.skillState.poisonCone.dur = true; triggers.push('耐久'); 
             }

             if (triggers.length > 0) {
                 act(ctx, skill, `${triggers.join('/')}过低，发动反扑！`);
                 const damage = (c.bite + c.critDamage) * triggers.length; 
                 const spDamage = c.vigor * triggers.length;
                 ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - damage);
                 ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - spDamage);
                 ctx.opponent.currentDurability = Math.max(0, ctx.opponent.currentDurability - 1);
                 if (ctx.logs) ctx.logs.push({ msg: `${ctx.opponent.name} 受到毒锥重创！(耐久-1, 体力-${damage}, 斗性-${spDamage})`, type: LogType.Crit });
             }
        }
    },

    'iron_shell': {
        id: 'iron_shell',
        name: '招架',
        shout: '运阴阳之力，抵乾坤之变！',
        dsl: '受到体力损伤时，若概率触发(33%)，抵消全部伤害；受到斗性损伤时，若概率触发(33%)，抵消全部伤害',
        onBeforeReceiveDamage: (ctx, skill) => {
            let modified = false;
            let msg = "";
            
            // Check HP Damage
            if (ctx.hpDmg > 0 && check(33)) {
                ctx.hpDmg = 0;
                msg += "抵消体力损伤 ";
                modified = true;
            }

            // Check SP Damage independently
            if (ctx.spDmg > 0 && check(33)) {
                ctx.spDmg = 0;
                msg += "抵消斗性损伤";
                modified = true;
            }

            if (modified) {
                act(ctx, skill, msg.trim());
                return { hpDmg: ctx.hpDmg, spDmg: ctx.spDmg };
            }
        }
    },

    'soul_taking': {
        id: 'soul_taking',
        name: '摄魂',
        shout: '此音摄魂，可敢聆听？',
        dsl: '攻击时100%发动，主动攻击时即使未暴击也能造成相当于气势的斗性损伤',
        onBeforeAttack: () => { }
    },

    'run_horse': {
        id: 'run_horse',
        name: '跑马',
        shout: '你岂能追得上我？',
        dsl: '被对手暴击、被对手防御时66%发动，避免被对手暴击、防御',
        onBeforeAttack: (ctx, skill) => { 
             // Avoid block (Trigger: Opponent defends/Block check)
             if (check(66)) {
                 if (ctx.logs) ctx.logs.push({ msg: `【${skill.name}】身形如电，难以捉摸！(避免被格挡)`, type: LogType.Skill });
                 return { avoidBlock: true };
             }
        },
        onBeforeReceiveDamage: (ctx, skill) => { 
             // Avoid crit (Trigger: Opponent Crits)
             if (ctx.isCrit && check(66)) {
                 if (ctx.logs) ctx.logs.push({ msg: `【${skill.name}】避实击虚！(避免被暴击)`, type: LogType.Skill });
                 return { isCrit: false };
             }
        }
    },
    
    'raise_sword': {
        id: 'raise_sword',
        name: '养剑',
        shout: '勤修苦炼，只为一剑！',
        dsl: '造成伤害后，若本次攻击为非暴击，若概率触发(50%)，增加10暴击伤害，可叠加',
        onAfterDealDamage: (ctx, skill) => { 
             if (!ctx.isCrit && check(50)) {
                 const key = `${skill.id}_stack`;
                 ctx.owner.skillState[key] = (ctx.owner.skillState[key] || 0) + 10;
                 act(ctx, skill, `剑意滋长！暴击伤害+10 (当前+${ctx.owner.skillState[key]})`);
             }
        },
        onStatCalculate: (ctx) => {
             // Direct modifier, not "Calculate Attribute" replacement
             if (ctx.stat === 'critDamage') {
                 return ctx.baseValue + (ctx.owner.skillState['raise_sword_stack'] || 0);
             }
             return ctx.baseValue;
        }
    },
    
    'black_armor': {
        id: 'black_armor',
        name: '玄甲',
        shout: '碾压……过去……',
        dsl: '回合开始时，造成150%回合数的体力损伤，造成150%回合数的斗性损伤（向上取整）',
        onRoundStart: (ctx, skill) => { executeDSL(skill.dsl, 'onRoundStart', ctx, skill); }
    },
    
    'brave': {
        id: 'brave',
        name: '勇烈',
        shout: '性烈如火，睚眦必报！',
        dsl: '造成伤害后，若本次攻击为反击，若概率触发(50%)，反击时的损伤加倍',
        onAfterDealDamage: (ctx, skill) => { 
            if (ctx.isCounter && check(50)) { 
                 // Extra damage equal to original damage = Double
                 const hp = ctx.actualHpDmg || 0;
                 const sp = ctx.actualSpDmg || 0;
                 if (hp > 0 || sp > 0) {
                     ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - hp);
                     ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - sp);
                     act(ctx, skill, `怒火攻心！造成额外${hp}体力/${sp}斗性损伤！`);
                 }
            }
        }
    },

    'cinnabar_evil': {
        id: 'cinnabar_evil',
        name: '赤煞',
        shout: '与我一战，死亦不休！',
        dsl: '战斗开始时，对手立即损失最大体力1/3的体力值与最大斗性1/3的斗性值（向上取整）',
        onBattleStart: (ctx, skill) => {
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
        shout: '诸相非相，我自心清意明！',
        dsl: '受到体力、斗性损伤时66%发动，减少的斗性的50%会恢复为体力、减少的体力的50%会恢复为斗性（向下取整）',
        onAfterReceiveDamage: (ctx, skill) => {
            if (!check(66)) return;
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
        shout: '坚如金铁，牢不可破！',
        dsl: '依据角力造成体力损伤时100%发动，反击后角力+6，可叠加持续到战斗结束',
        onAfterDealDamage: (ctx, skill) => {
             // Assuming Counter uses Strength (角力) in this sim unless it's a Bite Counter (rare/not implemented for p2 usually)
             // Check context source
             if (ctx.sourceType === 'strength') {
                 const key = `${skill.id}_stack`;
                 ctx.owner.skillState[key] = (ctx.owner.skillState[key] || 0) + 6;
                 act(ctx, skill, `愈战愈勇！角力+6 (当前+${ctx.owner.skillState[key]})`);
             }
        },
        onStatCalculate: (ctx, skill) => {
             if (ctx.stat === 'strength') {
                 return ctx.baseValue + (ctx.owner.skillState[`${skill.id}_stack`] || 0);
             }
             return ctx.baseValue;
        }
    },

    'sacrifice': {
        id: 'sacrifice',
        name: '舍身',
        shout: '宁为玉碎，不为瓦全！',
        dsl: '造成伤害后，若概率触发(已损百分比)，造成额外损伤(1.2+已损百分比/40)，自己损失10%（向下取整）',
        onAfterDealDamage: (ctx, skill) => {
            const actualHp = ctx.actualHpDmg || 0;
            const actualSp = ctx.actualSpDmg || 0;
            
            if (actualHp > 0 || actualSp > 0) {
                const hpLossPct = ((ctx.owner.hp - ctx.owner.currentHp) / ctx.owner.hp) * 100;
                const spLossPct = ((ctx.owner.sp - ctx.owner.currentSp) / ctx.owner.sp) * 100;
                
                let exHp = 0;
                let exSp = 0;
                let triggered = false;

                // HP Logic
                if (actualHp > 0 && check(hpLossPct)) {
                     const factor = 1.2 + (hpLossPct / 40);
                     exHp = Math.floor(actualHp * (factor - 1));
                     triggered = true;
                }

                // SP Logic
                if (actualSp > 0 && check(spLossPct)) {
                     const factor = 1.2 + (spLossPct / 40);
                     exSp = Math.floor(actualSp * (factor - 1));
                     triggered = true;
                }
                
                if (triggered) { 
                     ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - exHp);
                     ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - exSp);
                     
                     const selfHp = Math.floor(ctx.owner.currentHp * 0.1);
                     const selfSp = Math.floor(ctx.owner.currentSp * 0.1);
                     ctx.owner.currentHp = Math.max(0, ctx.owner.currentHp - selfHp);
                     ctx.owner.currentSp = Math.max(0, ctx.owner.currentSp - selfSp);
                     
                     act(ctx, skill, `舍身一击！额外造成${exHp}体力/${exSp}斗性，自损${selfHp}体力/${selfSp}斗性。`);
                }
            }
        }
    },

    'break_force': {
        id: 'break_force',
        name: '破势',
        shout: '得心应手，势如破竹！',
        dsl: '依据牙钳造成体力损伤时100%发动，攻击后牙钳+6，可叠加持续到战斗结束',
        onAfterDealDamage: (ctx, skill) => { 
             if (ctx.sourceType === 'bite') {
                 const key = `${skill.id}_stack`;
                 ctx.owner.skillState[key] = (ctx.owner.skillState[key] || 0) + 6;
                 act(ctx, skill, `锐不可当！牙钳+6 (当前+${ctx.owner.skillState[key]})`);
             }
        },
        onStatCalculate: (ctx, skill) => {
             if (ctx.stat === 'bite') {
                 return ctx.baseValue + (ctx.owner.skillState[`${skill.id}_stack`] || 0);
             }
             return ctx.baseValue;
        }
    },

    'hundred_battles': {
        id: 'hundred_battles',
        name: '百战',
        shout: '无胆匪类！焉敢伤我！',
        dsl: '防御时50%发动，防御减伤时，对对手造成牙钳的体力损伤和气势的斗性损伤',
        onBeforeReceiveDamage: (ctx, skill) => {
            // "Defending" usually means Blocked in this context (triggering reduce damage)
            if (ctx.isBlocked && check(50)) {
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
        shout: '三色真血，促织王种，岂会惧你！',
        dsl: '体力、斗性、耐久任一项降至50%以下时100%发动（最多发动1次），除体力、斗性外全部属性*1.5（向上取整）',
        onRoundStart: (ctx, skill) => {
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
        shout: '哎呀，看来得认真点了……',
        dsl: '回合开始时66%发动，牙钳、角力、气势中的某项随机*2（向上取整），持续1回合',
        onRoundStart: (ctx, skill) => {
            if (!check(66)) return;
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
        shout: '蛇蝎汲血，蜈蜂幻形……',
        dsl: '暴击时100%发动，根据暴击时对对手造成的体力、斗性伤害，恢复自己的体力、斗性',
        onAfterDealDamage: (ctx, skill) => {
            if (ctx.isCrit) {
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
        shout: '与我一战，你岂有胜算……',
        dsl: '依据气势造成斗性损伤时100%发动，造成斗性损伤后气势+6，可叠加持续到战斗结束',
        onAfterDealDamage: (ctx, skill) => {
             // Spirit damage is usually caused by Vigor attacks or Skills. 
             // "On deal Vigor Damage"
             if (ctx.sourceType === 'vigor' || ctx.actualSpDmg && ctx.actualSpDmg > 0) {
                 // Check if it was purely a "Bite/Strength" hit without vigor component? 
                 // The prompt says "Based on Vigor dealing SP damage". Vigor check damage is sourceType='vigor'.
                 if (ctx.sourceType === 'vigor') {
                    const key = `${skill.id}_stack`;
                    ctx.owner.skillState[key] = (ctx.owner.skillState[key] || 0) + 6;
                    act(ctx, skill, `灵能汇聚！气势+6 (当前+${ctx.owner.skillState[key]})`);
                 }
             }
        },
        onStatCalculate: (ctx, skill) => {
            if (ctx.stat === 'vigor') {
                return ctx.baseValue + (ctx.owner.skillState[`${skill.id}_stack`] || 0);
            }
            return ctx.baseValue;
        }
    },

    'tian_guang': {
        id: 'tian_guang',
        name: '天光',
        shout: '天光已现，妖怪亡形！',
        dsl: '对手促织发动技能时50%发动，阻止对手的技能生效',
    },

    'brocade_intimidate': {
        id: 'brocade_intimidate',
        name: '威吓',
        shout: '天下谁人不识我？',
        dsl: '回合开始时（牙钳、角力、气势每有一项>对手）%发动，将对手暴击、防御、反击中的随机一项降为0，持续1回合',
        onRoundStart: (ctx, skill) => {
            const stats = ['bite', 'strength', 'vigor'] as const;
            let count = 0;
            
            const getVal = (c: RuntimeCricket, s: any) => 
                ctx.getStat ? ctx.getStat(c, s) : ((c as any)[s] || 0);

            stats.forEach(st => {
                if (getVal(ctx.owner, st) > getVal(ctx.opponent, st)) count++;
            });
            
            if (count > 0 && check(count * 20)) {
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
        shout: '红莲业火，焚妖荡魔！',
        dsl: '防御时66%发动，将减免的体力损伤反弹给对手',
        onBeforeReceiveDamage: (ctx, skill) => {
            if (ctx.isBlocked && check(66)) {
                 const raw = ctx.rawHpDmg || 0;
                 const reflected = Math.min(raw, ctx.owner.damageReduce); 
                 
                 if (reflected > 0) {
                     ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - reflected);
                     act(ctx, skill, `业火反噬！反弹${reflected}点损伤！`);
                 }
            }
        }
    },

    'reverse_fate': {
        id: 'reverse_fate',
        name: '逆命',
        shout: '吾虽形残……逆命不绝！',
        dsl: '被进攻、被反击、被鸣叫时，有66%的发动，被进攻牙钳+1，被反击角力+1，被鸣叫气势+1，可叠加',
        onAfterReceiveDamage: (ctx, skill) => {
            if (check(66)) {
                 if (!ctx.owner.skillState.eightFailuresStack) ctx.owner.skillState.eightFailuresStack = { bite: 0, strength: 0, vigor: 0};
                 let type = "";
                 
                 
                 if (ctx.isCounter) {
                     ctx.owner.skillState.eightFailuresStack.strength++;
                     type = "角力+1";
                 } else if (ctx.sourceType === 'vigor') {
                     ctx.owner.skillState.eightFailuresStack.vigor++;
                     type = "气势+1";
                 } else {
                     ctx.owner.skillState.eightFailuresStack.bite++;
                     type = "牙钳+1";
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

// INIT COMPILE
Object.values(SKILL_REGISTRY).forEach(s => compileSkill(s));
