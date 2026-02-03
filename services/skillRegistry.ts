
import { LogType, SkillDefinition, RuntimeCricket, DamageContext } from '../types';

// Helper to safely add log
const log = (ctx: { logs: { msg: string; type: LogType }[] }, msg: string, type: LogType = LogType.Effect) => {
    ctx.logs.push({ msg, type });
};

// Check probability helper
const check = (prob: number) => Math.random() * 100 < prob;

export const SKILL_REGISTRY: Record<string, SkillDefinition> = {
    // 1. Cinnabar (Red Evil)
    'cinnabar_evil': {
        id: 'cinnabar_evil',
        name: '赤煞',
        prob: 100,
        onBattleStart: (ctx) => {
            const dmgHp = Math.ceil(ctx.opponent.hp / 3);
            const dmgSp = Math.ceil(ctx.opponent.sp / 3);
            ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - dmgHp);
            ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - dmgSp);
            log(ctx, `${ctx.opponent.name} 受到赤煞侵蚀，损失大量体力与斗性！`);
        }
    },
    
    // 2. Armor (Black Armor)
    'black_armor': {
        id: 'black_armor',
        name: '玄甲',
        prob: 100,
        onRoundStart: (ctx) => {
            const dmg = ctx.state.round;
            ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - dmg);
            ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - dmg);
            log(ctx, `${ctx.opponent.name} 受到玄甲震慑，损失${dmg}点体力/斗性。`);
        }
    },

    // 3. Grass (Talent)
    'grass_talent': {
        id: 'grass_talent',
        name: '奇赋',
        prob: 50,
        onRoundStart: (ctx) => {
            const stats = ['bite', 'strength', 'vigor'] as const;
            const target = stats[Math.floor(Math.random() * 3)];
            ctx.owner.skillState.grassBuff = target; 
            log(ctx, `${ctx.owner.name} 的 ${target === 'bite' ? '牙钳' : target === 'strength' ? '角力' : '气势'} 翻倍了！`);
        },
        onStatCalculate: (ctx) => {
            if (ctx.owner.skillState.grassBuff === ctx.stat) {
                return Math.ceil(ctx.baseValue * 2);
            }
            return ctx.baseValue;
        }
    },

    // 4. Brocade (Intimidate)
    'brocade_intimidate': {
        id: 'brocade_intimidate',
        name: '威吓',
        prob: 33, // Base prob, logic handled inside
        onRoundStart: (ctx) => {
            // Calculate real prob based on stats
            const stats = ['bite', 'strength', 'vigor'] as const;
            let count = 0;
            // Need to access raw stats roughly, but we can't fully recurse calculateStat here easily without loop.
            // Simplified: use base values from data or current snapshot. 
            // For safety in this architecture, we use raw values from the object which are updated each turn or static.
            // But 'getStat' uses this hook. So we must be careful not to infinite loop.
            // We'll access the RAW properties on the object for comparison to avoid recursion.
            const getRaw = (c: RuntimeCricket, s: string) => (c as any)[s] || 0;
            
            stats.forEach(st => {
                if (getRaw(ctx.owner, st) > getRaw(ctx.opponent, st) + 20) count++;
            });
            
            if (count > 0 && check(count * 33)) {
                const targets = ['deadliness', 'defence', 'counter'] as const;
                const target = targets[Math.floor(Math.random() * 3)];
                ctx.opponent.skillState.brocadeDebuff = target;
                log(ctx, `${ctx.opponent.name} 被威吓！${target === 'deadliness' ? '暴击' : target === 'defence' ? '防御' : '反击'}降为0！`);
            } else {
                ctx.opponent.skillState.brocadeDebuff = null;
            }
        }
    },

    // 5. Three Prince (Red Lotus) - Reflect
    'red_lotus': {
        id: 'red_lotus',
        name: '红莲',
        prob: 50,
        onBeforeReceiveDamage: (ctx) => {
            if (ctx.isBlocked && !ctx.reflected && check(50)) {
                const reflectedAmt = Math.min(ctx.hpDmg, ctx.owner.damageReduce); 
                if (reflectedAmt > 0) {
                     log(ctx, `红莲：反弹${reflectedAmt}伤害！`);
                     // Reflected logic handled in Engine usually, but here we just log for now
                     return { } as any; 
                }
            }
        }
    },

    // 6. Sky Blue (Tian Guang) - Meta Skill
    // This is special. It has `canNegate: true`.
    'tian_guang': {
        id: 'tian_guang',
        name: '天光',
        prob: 66,
        // Logic handled in `triggerSkill`
    },

    // 7. Oil Paper Lamp (Hundred Battles)
    'hundred_battles': {
        id: 'hundred_battles',
        name: '百战',
        prob: 50,
        onBeforeReceiveDamage: (ctx) => {
            if ((ctx.isBlocked || ctx.isCrit) && !ctx.reflected && check(50)) {
                 return { counterAttack: true } as any; 
            }
        }
    },

    // 8. Spear (Death)
    'spear_death': {
        id: 'spear_death',
        name: '夺命',
        prob: 50,
        // Logic handled in `resolveStrike` inside combatLogic.ts
    },

    // 9. Iron Bullet (Iron Shell)
    'iron_shell': {
        id: 'iron_shell',
        name: '铁壳',
        prob: 33,
        onBeforeReceiveDamage: (ctx) => {
            if ((ctx.hpDmg > 0 || ctx.spDmg > 0) && check(33)) {
                log(ctx, `铁壳生效！伤害归零。`);
                return { hpDmg: 0, spDmg: 0 };
            }
        }
    },

    // 10. Monk (Immovable) - BALANCE CHANGE: 100% -> 50%
    'immovable': {
        id: 'immovable',
        name: '不动',
        prob: 50, 
        onBeforeReceiveDamage: (ctx) => {
            if (!check(50)) return; // Added check for probability

            let mod: Partial<DamageContext> = {};
            if (ctx.hpDmg > 0) {
                ctx.owner.currentSp = Math.min(ctx.owner.sp, ctx.owner.currentSp + ctx.hpDmg);
                log(ctx, `不动：受到${ctx.hpDmg}体力伤害，恢复了同等斗性。`);
                mod.hpDmg = 0;
            }
            if (ctx.spDmg > 0) {
                ctx.owner.currentHp = Math.min(ctx.owner.hp, ctx.owner.currentHp + ctx.spDmg);
                log(ctx, `不动：受到${ctx.spDmg}斗性伤害，恢复了同等体力。`);
                mod.spDmg = 0;
            }
            return mod;
        }
    },

    // 11. Red Beard (Sacrifice)
    'sacrifice': {
        id: 'sacrifice',
        name: '舍身',
        prob: 20, // Dynamic
        onAfterDealDamage: (ctx) => {
            if ((ctx.actualHpDmg || 0) > 0 || (ctx.actualSpDmg || 0) > 0) {
                const hpLossPct = (ctx.owner.hp - ctx.owner.currentHp) / ctx.owner.hp;
                const spLossPct = (ctx.owner.sp - ctx.owner.currentSp) / ctx.owner.sp;
                const total = hpLossPct + spLossPct;
                if (check(20 + total * 100)) {
                     const mod = 1.2 + (total / 10);
                     const exHp = Math.floor((ctx.actualHpDmg || 0) * (mod - 1));
                     const exSp = Math.floor((ctx.actualSpDmg || 0) * (mod - 1));
                     
                     // Deal extra
                     ctx.opponent.currentHp = Math.max(0, ctx.opponent.currentHp - exHp);
                     ctx.opponent.currentSp = Math.max(0, ctx.opponent.currentSp - exSp);
                     log(ctx, `舍身：额外造成${exHp}体力/${exSp}斗性伤害。`);

                     // Self dmg
                     const selfHp = Math.floor(ctx.owner.currentHp * 0.1);
                     const selfSp = Math.floor(ctx.owner.currentSp * 0.1);
                     ctx.owner.currentHp -= selfHp;
                     ctx.owner.currentSp -= selfSp;
                     log(ctx, `舍身：自损${selfHp}体力/${selfSp}斗性。`);
                }
            }
        }
    },

    // 12. Jade Tail (Break)
    'break_force': {
        id: 'break_force',
        name: '破势',
        prob: 100,
        onAfterDealDamage: (ctx) => {
            if (ctx.sourceType === 'bite' && (ctx.actualHpDmg || 0) > 0) {
                ctx.owner.skillState.jadeTailStack = (ctx.owner.skillState.jadeTailStack || 0) + 2;
                log(ctx, `破势：牙钳+2 (当前+${ctx.owner.skillState.jadeTailStack})`);
            }
        },
        onStatCalculate: (ctx) => {
            if(ctx.stat === 'bite') return ctx.baseValue + (ctx.owner.skillState.jadeTailStack || 0);
            return ctx.baseValue;
        }
    },

    // 13. Fan Sheng (Brave)
    'brave': {
        id: 'brave',
        name: '勇烈',
        prob: 100,
        onAfterDealDamage: (ctx) => {
             if (ctx.sourceType === 'strength' && (ctx.actualHpDmg || 0) > 0) {
                ctx.owner.skillState.fanShengStack = (ctx.owner.skillState.fanShengStack || 0) + 2;
                log(ctx, `勇烈：角力+2 (当前+${ctx.owner.skillState.fanShengStack})`);
            }
        },
        onStatCalculate: (ctx) => {
            if(ctx.stat === 'strength') return ctx.baseValue + (ctx.owner.skillState.fanShengStack || 0);
            return ctx.baseValue;
        }
    },

    // 14. Plum Wing (Spirit)
    'spirit_channel': {
        id: 'spirit_channel',
        name: '通灵',
        prob: 100,
        onAfterDealDamage: (ctx) => {
             if (ctx.sourceType === 'vigor' && (ctx.actualSpDmg || 0) > 0) {
                ctx.owner.skillState.plumWingStack = (ctx.owner.skillState.plumWingStack || 0) + 2;
                log(ctx, `通灵：气势+2 (当前+${ctx.owner.skillState.plumWingStack})`);
            }
        },
        onStatCalculate: (ctx) => {
            if(ctx.stat === 'vigor') return ctx.baseValue + (ctx.owner.skillState.plumWingStack || 0);
            return ctx.baseValue;
        }
    },

    // 15. Purple Yellow (Change)
    'change': {
        id: 'change',
        name: '变化',
        prob: 100,
        onAfterDealDamage: (ctx) => {
            if (ctx.isCrit) {
                 const healHp = Math.floor((ctx.actualHpDmg || 0) * 0.5);
                 const healSp = Math.floor((ctx.actualSpDmg || 0) * 0.5);
                 ctx.owner.currentHp = Math.min(ctx.owner.hp, ctx.owner.currentHp + healHp);
                 ctx.owner.currentSp = Math.min(ctx.owner.sp, ctx.owner.currentSp + healSp);
                 log(ctx, `变化：恢复${healHp}体力/${healSp}斗性。`);
            }
        }
    },

    // 16. Eight Failures (Reverse Fate)
    'reverse_fate': {
        id: 'reverse_fate',
        name: '逆命',
        prob: 66,
        onAfterReceiveDamage: (ctx) => {
            if (((ctx.actualHpDmg || 0) > 0 || (ctx.actualSpDmg || 0) > 0) && check(66)) {
                 if (!ctx.owner.skillState.eightFailuresStack) ctx.owner.skillState.eightFailuresStack = { bite: 0, strength: 0, vigor: 0};
                 
                 if (ctx.sourceType === 'bite') {
                     ctx.owner.skillState.eightFailuresStack.bite++;
                     log(ctx, `逆命：牙钳+1`);
                 } else if (ctx.sourceType === 'strength') {
                     ctx.owner.skillState.eightFailuresStack.strength++;
                     log(ctx, `逆命：角力+1`);
                 } else if (ctx.sourceType === 'vigor') {
                     ctx.owner.skillState.eightFailuresStack.vigor++;
                     log(ctx, `逆命：气势+1`);
                 }
            }
        },
        onStatCalculate: (ctx) => {
            const stacks = ctx.owner.skillState.eightFailuresStack || { bite: 0, strength: 0, vigor: 0};
            if (ctx.stat === 'bite') return ctx.baseValue + stacks.bite;
            if (ctx.stat === 'strength') return ctx.baseValue + stacks.strength;
            if (ctx.stat === 'vigor') return ctx.baseValue + stacks.vigor;
            return ctx.baseValue;
        }
    },
    
    // 17. Needle (Poison Cone)
    'poison_cone': {
        id: 'poison_cone',
        name: '毒锥',
        prob: 100,
        onBeforeAttack: (ctx) => {
             const c = ctx.owner;
             if (!c.skillState.needleTriggered) c.skillState.needleTriggered = { hp: false, sp: false };
             
             let trigger = false;
             if (!c.skillState.needleTriggered.hp && c.currentHp < c.hp * 0.5) {
                 c.skillState.needleTriggered.hp = true;
                 trigger = true;
             }
             else if (!c.skillState.needleTriggered.sp && c.currentSp < c.sp * 0.5) {
                 c.skillState.needleTriggered.sp = true;
                 trigger = true;
             }

             if (trigger) {
                 log(ctx, `毒锥：生命/斗性<50%，发动必定暴击！`);
                 return { forceCrit: true };
             }
        }
    },

    // 18. Yellow Horse (Run)
    'run_horse': {
        id: 'run_horse',
        name: '跑马',
        prob: 66,
        onBeforeAttack: (_ctx) => { // Unused context marked with _
            // As attacker: prevent block
             if (check(66)) {
                 return { avoidBlock: true };
             }
        },
        onBeforeReceiveDamage: (ctx) => {
            // As defender: prevent crit (incoming isCrit)
            if (ctx.isCrit && check(66)) {
                 return { isCrit: false };
            }
        }
    },
    
    // 19. Jade Hoe (Raise Sword)
    'raise_sword': {
        id: 'raise_sword',
        name: '养剑',
        prob: 33,
        onAfterDealDamage: (ctx) => {
            if (ctx.isCrit) {
                ctx.owner.skillState.jadeHoeStack = 0;
            } else if (check(33)) {
                ctx.owner.skillState.jadeHoeStack = (ctx.owner.skillState.jadeHoeStack || 0) + 10;
                log(ctx, `养剑：暴伤+10 (当前+${ctx.owner.skillState.jadeHoeStack})`);
            }
        },
        onStatCalculate: (ctx) => {
            if (ctx.stat === 'critDamage') { 
                return ctx.baseValue + (ctx.owner.skillState.jadeHoeStack || 0);
            }
            return ctx.baseValue;
        }
    },
    
    // 20. Bell (Soul Taking)
    'soul_taking': {
        id: 'soul_taking',
        name: '摄魂',
        prob: 100,
        // Logic handled in resolveStrike
    },
    
    // 21. True Colors (True Blood)
    'true_blood': {
        id: 'true_blood',
        name: '真血',
        prob: 100,
        onRoundStart: (ctx) => {
            const c = ctx.owner;
            if (!c.skillState.trueColorTriggered && 
               (c.currentHp < c.hp * 0.5 || c.currentSp < c.sp * 0.5 || c.currentDurability < c.maxDurability * 0.5)) {
                c.skillState.trueColorTriggered = true;
                log(ctx, `真血：属性大幅提升！`);
            }
        },
        onStatCalculate: (ctx) => {
            if (ctx.owner.skillState.trueColorTriggered) {
                return Math.ceil(ctx.baseValue * 1.5);
            }
            return ctx.baseValue;
        }
    }
};