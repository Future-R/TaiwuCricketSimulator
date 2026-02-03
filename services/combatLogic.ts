
import { BattleLog, CombatState, CricketData, DamageContext, LogType, Phase, RuntimeCricket, SkillDefinition } from '../types';
import { SKILL_REGISTRY } from './skillRegistry';

// Helper to check probability
export const checkProb = (percentage: number): boolean => {
  return Math.random() * 100 < percentage;
};

// Generate initial RuntimeCricket from Data
export const createRuntimeCricket = (data: CricketData): RuntimeCricket => {
  const levelValue = data.grade; 
  
  const baseDurability = levelValue + 1 + data.hp / 20;
  const minDur = Math.floor(baseDurability * 0.65);
  const maxDur = Math.floor(baseDurability * 1.35);
  const durability = Math.floor(Math.random() * (maxDur - minDur + 1)) + minDur;

  // Resolve Skills
  const activeSkills: SkillDefinition[] = [];
  if (data.skillIds) {
      data.skillIds.forEach(id => {
          if (SKILL_REGISTRY[id]) {
              activeSkills.push(SKILL_REGISTRY[id]);
          }
      });
  }

  return {
    ...data,
    uniqueId: `${data.id}_${Math.random().toString(36).substr(2, 9)}`, // Generate unique instance ID
    currentHp: data.hp,
    currentSp: data.sp,
    currentDurability: durability,
    maxDurability: durability,
    injuries: { vigor: 0, strength: 0, bite: 0, hp: 0, sp: 0 },
    isDead: false,
    isLost: false,
    skillState: {}, // Empty state, skills will populate if needed
    activeSkills
  };
};

const addLog = (state: CombatState, message: string, type: LogType = LogType.Info): CombatState => {
  const newLog: BattleLog = {
    id: Math.random().toString(36).substr(2, 9),
    turn: state.round,
    message,
    type,
  };
  return { ...state, logs: [...state.logs, newLog] };
};

// Returns the uniqueId of the winner, or null
export const checkGameOver = (p1: RuntimeCricket, p2: RuntimeCricket): string | null => {
  if (p1.isDead || p1.isLost) return p2.uniqueId;
  if (p2.isDead || p2.isLost) return p1.uniqueId;
  if (p1.currentHp <= 0 || p1.currentSp <= 0 || p1.currentDurability <= 0) return p2.uniqueId;
  if (p2.currentHp <= 0 || p2.currentSp <= 0 || p2.currentDurability <= 0) return p1.uniqueId;
  return null;
};

const applyDamage = (victim: RuntimeCricket, hpDmg: number, spDmg: number, durDmg: number) => {
  victim.currentHp = Math.max(0, victim.currentHp - hpDmg);
  victim.currentSp = Math.max(0, victim.currentSp - spDmg);
  victim.currentDurability = Math.max(0, victim.currentDurability - durDmg);
  if (victim.currentHp === 0 || victim.currentDurability === 0) victim.isDead = true;
  if (victim.currentSp === 0) victim.isLost = true;
};

// --- GENERIC HOOK TRIGGER ---
// Triggers hooks on a cricket's active skills.
// "Tian Guang" (Sky Blue) logic: If Opponent has 'tian_guang', 66% chance to suppress skill.
const triggerHooks = (
    owner: RuntimeCricket, 
    opponent: RuntimeCricket, 
    hookName: keyof SkillDefinition, 
    ctx: any,
    canBeNegated: boolean = true
) => {
    // Check suppression
    const oppHasTianGuang = opponent.activeSkills.some(s => s.id === 'tian_guang');
    
    owner.activeSkills.forEach(skill => {
        if (skill[hookName]) {
            // Meta-Check: Suppression
            if (canBeNegated && oppHasTianGuang && skill.id !== 'tian_guang') { // Cannot suppress itself (implied)
                if (Math.random() * 100 < 66) {
                    if (ctx.logs) ctx.logs.push({ msg: `【天光】天蓝青发动技能，阻止了${owner.name}的【${skill.name}】！`, type: LogType.Skill });
                    return; // Skip this skill
                }
            }
            
            // Execute
            if (ctx.logs) ctx.logs.push({ msg: `【${skill.name}】${owner.name}发动技能！`, type: LogType.Skill });
            const fn = skill[hookName] as Function;
            fn(ctx);
        }
    });
};

export const getStat = (c: RuntimeCricket, opp: RuntimeCricket, stat: 'vigor'|'strength'|'bite'|'deadliness'|'defence'|'counter'|'critDamage'): number => {
  let val = (c as any)[stat] || 0;
  
  // Apply injuries
  if (stat === 'vigor') val -= c.injuries.vigor;
  if (stat === 'strength') val -= c.injuries.strength;
  if (stat === 'bite') val -= c.injuries.bite;
  
  // Apply Hooks (onStatCalculate)
  c.activeSkills.forEach(skill => {
      if (skill.onStatCalculate) {
          // Stat calc skills typically internal buffers, not usually negated by Tian Guang in real time, 
          // or we assume they are already active state. 
          // For simplicity, we DO NOT apply Tian Guang check on simple stat lookups to avoid log spam and recursion.
          val = skill.onStatCalculate({ owner: c, opponent: opp, stat, baseValue: val });
      }
  });

  return Math.max(0, val);
};

// --------------------------------------------------------------------------------
// LOGIC STEPS
// --------------------------------------------------------------------------------

export const processPreFight = (state: CombatState): CombatState => {
  let nextState = addLog(state, "芡草打牙...", LogType.Info);
  const p1 = nextState.p1;
  const p2 = nextState.p2;

  // Dumb check
  if (p1.grade === 0 && p2.grade !== 0) return { ...nextState, winnerId: p2.uniqueId, phase: Phase.GameOver };
  if (p2.grade === 0 && p1.grade !== 0) return { ...nextState, winnerId: p1.uniqueId, phase: Phase.GameOver };
  if (p1.grade === 0 && p2.grade === 0) {
    const winner = Math.random() > 0.5 ? p1 : p2;
    return { ...nextState, winnerId: winner.uniqueId, phase: Phase.GameOver };
  }

  if (state.skillsEnabled) {
      const logs: { msg: string; type: LogType }[] = [];
      const ctx1 = { state: nextState, owner: p1, opponent: p2, logs };
      triggerHooks(p1, p2, 'onBattleStart', ctx1);
      
      const ctx2 = { state: nextState, owner: p2, opponent: p1, logs };
      triggerHooks(p2, p1, 'onBattleStart', ctx2);

      for(const l of logs) nextState = addLog(nextState, l.msg, l.type);
  }

  // Grade Gap
  const gradeDiff = Math.abs(p1.grade - p2.grade);
  if (gradeDiff >= 6 && checkProb(gradeDiff * 10)) {
      const winner = p1.grade > p2.grade ? p1 : p2;
      nextState = addLog(nextState, `等级压制！${winner.name} 气势逼人，对手不战而逃！`, LogType.Win);
      return { ...nextState, winnerId: winner.uniqueId, phase: Phase.GameOver };
  }

  return { ...nextState, phase: Phase.VigorCheck, round: 1 };
};

export const processRoundStart = (state: CombatState): CombatState => {
    let s = { ...state };
    if (!s.skillsEnabled) return s;
    const logs: { msg: string; type: LogType }[] = [];

    triggerHooks(s.p1, s.p2, 'onRoundStart', { state: s, owner: s.p1, opponent: s.p2, logs });
    triggerHooks(s.p2, s.p1, 'onRoundStart', { state: s, owner: s.p2, opponent: s.p1, logs });

    for(const l of logs) s = addLog(s, l.msg, l.type);
    if (checkGameOver(s.p1, s.p2)) { s.winnerId = checkGameOver(s.p1, s.p2); s.phase = Phase.GameOver; }
    return s;
};

export const processVigorCheck = (state: CombatState): { state: CombatState; p1Initiative: boolean } => {
  let s = processRoundStart({ ...state });
  if (s.phase === Phase.GameOver) return { state: s, p1Initiative: false };

  const p1 = s.p1;
  const p2 = s.p2;
  const logs: { msg: string; type: LogType }[] = [];

  const p1Vigor = getStat(p1, p2, 'vigor');
  const p2Vigor = getStat(p2, p1, 'vigor');

  let p1Starts = false;
  s = addLog(s, `【第${s.round}轮】 ${p1.name}气势(${p1Vigor}) VS ${p2.name}气势(${p2Vigor})`, LogType.Info);

  if (p1Vigor > p2Vigor) {
    s = addLog(s, `${p1.name} 气势更高！`, LogType.Attack);
    handleDamage(p1, p2, 0, p1Vigor, 0, false, logs, s.skillsEnabled, 'vigor');
    p1Starts = checkProb(80);
  } else if (p2Vigor > p1Vigor) {
    s = addLog(s, `${p2.name} 气势更高！`, LogType.Attack);
    handleDamage(p2, p1, 0, p2Vigor, 0, false, logs, s.skillsEnabled, 'vigor');
    p1Starts = checkProb(20);
  } else {
    p1Starts = checkProb(50);
  }

  for(const l of logs) s = addLog(s, l.msg, l.type);
  if (checkGameOver(s.p1, s.p2)) { s.winnerId = checkGameOver(s.p1, s.p2); s.phase = Phase.GameOver; }
  return { state: s, p1Initiative: p1Starts };
};

const handleDamage = (
    attacker: RuntimeCricket,
    defender: RuntimeCricket,
    hpDmg: number,
    spDmg: number,
    durDmg: number,
    isCrit: boolean,
    logs: { msg: string; type: LogType }[],
    skillsEnabled: boolean,
    sourceType: 'vigor' | 'bite' | 'strength' | 'other'
) => {
    // Context Construction
    const ctx: DamageContext = {
        state: null as any, // Not available here easily, purely damage context
        owner: defender, // The one receiving damage
        opponent: attacker,
        logs,
        hpDmg, spDmg, durDmg, isCrit, 
        isBlocked: false, // Default, overwritten if coming from resolveStrike
        sourceType
    };

    if (skillsEnabled) {
        const oppHasTianGuang = attacker.activeSkills.some(s => s.id === 'tian_guang');
        
        defender.activeSkills.forEach(skill => {
            if (skill.onBeforeReceiveDamage) {
                if (oppHasTianGuang && skill.id !== 'tian_guang' && checkProb(66)) {
                    logs.push({ msg: `【天光】天蓝青阻止了${defender.name}的【${skill.name}】！`, type: LogType.Skill });
                    return;
                }
                const res = skill.onBeforeReceiveDamage(ctx);
                if (res) {
                    if (res.hpDmg !== undefined) ctx.hpDmg = res.hpDmg;
                    if (res.spDmg !== undefined) ctx.spDmg = res.spDmg;
                    if (res.durDmg !== undefined) ctx.durDmg = res.durDmg;
                    if (res.isCrit !== undefined) ctx.isCrit = res.isCrit;
                    // Handle extras (Counter/Reflect)
                    if ((res as any).counterAttack) { /* Logic complex, skipped for now */ }
                }
            }
        });
    }

    // Apply
    applyDamage(defender, ctx.hpDmg, ctx.spDmg, ctx.durDmg);

    // Attacker Hooks (After Deal)
    const attackCtx: DamageContext = { ...ctx, owner: attacker, opponent: defender, actualHpDmg: ctx.hpDmg, actualSpDmg: ctx.spDmg } as any;
    
    if (skillsEnabled) {
         triggerHooks(attacker, defender, 'onAfterDealDamage', attackCtx);
    }
    
    // Defender Hooks (After Receive)
    const receiveCtx: DamageContext = { ...ctx, actualHpDmg: ctx.hpDmg, actualSpDmg: ctx.spDmg } as any;
    if (skillsEnabled) {
         triggerHooks(defender, attacker, 'onAfterReceiveDamage', receiveCtx);
    }
};

export const resolveStrike = (
  attacker: RuntimeCricket,
  defender: RuntimeCricket,
  damageStatValue: number, 
  _isCritCycle: boolean, 
  forceCrit: boolean = false, 
  skillsEnabled: boolean = true 
): { att: RuntimeCricket; def: RuntimeCricket; logs: { msg: string; type: LogType }[]; isCrit: boolean } => {
  
  const logs: { msg: string; type: LogType }[] = [];
  
  // 0. Pre-Attack Modifiers (Flags)
  let avoidBlock = false;
  let avoidCrit = false;
  let forcedCrit = forceCrit;

  if (skillsEnabled) {
      // Attacker flags
      attacker.activeSkills.forEach(s => {
          if (s.onBeforeAttack) {
             const res = s.onBeforeAttack({ state: null as any, owner: attacker, opponent: defender, logs });
             if (res) {
                 if (res.avoidBlock) avoidBlock = true;
                 if (res.forceCrit) forcedCrit = true;
             }
          }
      });
  }

  // Stats
  const attDeadliness = getStat(attacker, defender, 'deadliness');
  const defDefence = getStat(defender, attacker, 'defence');
  const attVigor = getStat(attacker, defender, 'vigor');

  // 1. Roll Crit
  let isCrit = forcedCrit || (!avoidCrit && checkProb(attDeadliness));
  
  // 2. Roll Block
  const isBlocked = !avoidBlock && checkProb(defDefence);
  const defBlockRed = defender.damageReduce;
  let attCritDmg = (attacker as any).critDamage || 0;
  
  // Apply Stat Skill (Jade Hoe) - Manual check because getStat is pure
  if (skillsEnabled) attCritDmg = getStat(attacker, defender, 'critDamage');

  let hpDamage = 0;
  let spDamage = 0;
  let durDamage = 0;
  const sourceType = (damageStatValue === getStat(attacker, defender, 'bite')) ? 'bite' : 'strength';

  // Apply "Blowing Bell" (Soul Taking) logic
  let extraSpDmg = 0;
  if (skillsEnabled && attacker.skillIds?.includes('soul_taking') && sourceType === 'bite') {
      extraSpDmg += attVigor;
      logs.push({ msg: `摄魂：附加${attVigor}斗性伤害。`, type: LogType.Effect });
  }

  if (!isCrit) {
    if (isBlocked) {
      hpDamage = Math.max(0, damageStatValue - defBlockRed);
      logs.push({ msg: `【格挡】${defender.name} 触发格挡!`, type: LogType.Block });
    } else {
      hpDamage = damageStatValue;
      logs.push({ msg: `【主动进攻】${attacker.name} 发起进攻，伤害${hpDamage}。`, type: LogType.Damage });
    }
    spDamage += extraSpDmg; 
  } else {
    logs.push({ msg: `【暴击】${attacker.name} 触发暴击!`, type: LogType.Crit });
    let rawHpDmg = damageStatValue + attCritDmg;
    let rawSpDmg = attVigor; 
    
    if (isBlocked) {
      hpDamage = Math.max(0, rawHpDmg - defBlockRed);
      spDamage = Math.max(0, rawSpDmg - defBlockRed);
      logs.push({ msg: `【格挡】${defender.name} 触发格挡!`, type: LogType.Block });
    } else {
      hpDamage = rawHpDmg;
      spDamage = rawSpDmg;
      durDamage = 1; 
      logs.push({ msg: `${defender.name} 受到重创！(耐久 -1)`, type: LogType.Damage });
    }
  }

  // Spear Death Logic
  if (skillsEnabled && attacker.skillIds?.includes('spear_death') && sourceType === 'strength') {
      if (checkProb(50)) {
           hpDamage *= 2;
           spDamage *= 2;
           logs.push({ msg: `夺命：伤害翻倍！`, type: LogType.Effect });
      }
  }

  // Injury
  if (isCrit && !isBlocked && checkProb(attacker.injuryOdds)) {
      if (checkProb(35)) {
        const r = Math.random();
        if (r < 0.33) { defender.injuries.vigor++; logs.push({ msg: `${defender.name} 气势受损！`, type: LogType.Effect }); }
        else if (r < 0.66) { defender.injuries.strength++; logs.push({ msg: `${defender.name} 角力受损！`, type: LogType.Effect }); }
        else { defender.injuries.bite++; logs.push({ msg: `${defender.name} 牙钳受损！`, type: LogType.Effect }); }
      } else {
        if (Math.random() < 0.5) { defender.injuries.hp += 5; hpDamage += 5; logs.push({ msg: `耐力受损(+5伤)`, type: LogType.Effect }); }
        else { defender.injuries.sp += 5; spDamage += 5; logs.push({ msg: `斗性受损(+5伤)`, type: LogType.Effect }); }
      }
  }

  // Construct Context and Delegate to `handleDamage` which runs Hooks
  handleDamage(attacker, defender, hpDamage, spDamage, durDamage, isCrit, logs, skillsEnabled, sourceType);

  return { att: attacker, def: defender, logs, isCrit };
};

// Returns 0 if P1 wins, 1 if P2 wins
export const runInstantBattle = (c1: CricketData, c2: CricketData, skillsEnabled: boolean = false): number => {
    let state: CombatState = {
      round: 0, phase: Phase.Setup, logs: [],
      p1: createRuntimeCricket(c1), p2: createRuntimeCricket(c2),
      winnerId: null, autoPlay: true, battleSpeed: 0, skillsEnabled
    };
    
    // Store original UUIDs to identify winner
    const p1Uid = state.p1.uniqueId;
    // const p2Uid = state.p2.uniqueId; 

    let loops = 0;
    const MAX = 200;
    let p1Initiative = false;
    let attackerIsP1 = false;
    let counterCount = 0;
    let lastCrit = false;

    while (!state.winnerId && loops < MAX) {
        loops++;
        if (state.phase === Phase.Setup) state.phase = Phase.PreFight;
        else if (state.phase === Phase.PreFight) state = processPreFight(state);
        else if (state.phase === Phase.VigorCheck) {
            const res = processVigorCheck(state);
            state = res.state;
            p1Initiative = res.p1Initiative;
            attackerIsP1 = p1Initiative;
            state.phase = Phase.FirstHalf;
            counterCount = 0;
            lastCrit = false;
        }
        else if (state.phase === Phase.FirstHalf || state.phase === Phase.SecondHalf) {
            const isFirst = state.phase === Phase.FirstHalf;
            const attacker = attackerIsP1 ? state.p1 : state.p2;
            const defender = attackerIsP1 ? state.p2 : state.p1;
            
            let canAttack = true;
            if (counterCount > 0) {
                 const chance = getStat(attacker, defender, 'counter') - (counterCount - 1) * 5;
                 if (!checkProb(chance)) {
                     canAttack = false;
                     counterCount = 0;
                     lastCrit = false;
                     state.phase = isFirst ? Phase.SecondHalf : Phase.RoundEnd;
                     if (isFirst) attackerIsP1 = !p1Initiative;
                 }
            }

            if (canAttack) {
                 const roundInit = isFirst ? p1Initiative : !p1Initiative;
                 const useBite = attackerIsP1 === roundInit;
                 const val = useBite ? getStat(attacker, defender, 'bite') : getStat(attacker, defender, 'strength');
                 const res = resolveStrike(attacker, defender, val, lastCrit, false, skillsEnabled);
                 if (checkGameOver(state.p1, state.p2)) { state.winnerId = checkGameOver(state.p1, state.p2); break; }
                 lastCrit = res.isCrit;
                 counterCount++;
                 attackerIsP1 = !attackerIsP1;
            }
        }
        else if (state.phase === Phase.RoundEnd) { state.round++; state.phase = Phase.VigorCheck; }
        else if (state.phase === Phase.GameOver) break;
    }
    
    // Check Winner by Unique ID, not Template ID
    if (state.winnerId) {
        return state.winnerId === p1Uid ? 0 : 1;
    }
    
    // Tie breaker
    const s1 = state.p1.currentHp + state.p1.currentSp + state.p1.currentDurability;
    const s2 = state.p2.currentHp + state.p2.currentSp + state.p2.currentDurability;
    return s1 >= s2 ? 0 : 1;
};