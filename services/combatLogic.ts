
import { BattleLog, CombatState, CricketData, DamageContext, LogType, Phase, RuntimeCricket, SkillDefinition, BattleContext } from '../types';
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
  
  // Implicit "Dumb" skill if grade is 0 (or Dumb const)
  if (data.grade === 0) {
      if (SKILL_REGISTRY['dumb_defeat']) activeSkills.push(SKILL_REGISTRY['dumb_defeat']);
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
  if (state.suppressLogs) return state; // Performance optimization for simulation

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

export const getStat = (c: RuntimeCricket, opp: RuntimeCricket, stat: 'vigor'|'strength'|'bite'|'deadliness'|'defence'|'counter'|'critDamage'): number => {
  let val = (c as any)[stat] || 0;
  
  // Apply injuries
  if (stat === 'vigor') val -= c.injuries.vigor;
  if (stat === 'strength') val -= c.injuries.strength;
  if (stat === 'bite') val -= c.injuries.bite;
  
  // Apply Hooks (onStatCalculate)
  c.activeSkills.forEach(skill => {
      if (skill.onStatCalculate) {
          // Pass skill to hook
          val = skill.onStatCalculate({ owner: c, opponent: opp, stat, baseValue: val }, skill);
      }
  });

  return Math.max(0, val);
};

// Wrapper for hooks to provide context helpers
const createHookContext = (
    state: CombatState, 
    owner: RuntimeCricket, 
    opponent: RuntimeCricket, 
    logs: { msg: string; type: LogType }[] | null
): BattleContext => ({
    state,
    owner,
    opponent,
    logs,
    getStat: (t: RuntimeCricket, s: any) => getStat(t, t === owner ? opponent : owner, s)
});

// --- GENERIC HOOK TRIGGER ---
// Triggers hooks on a cricket's active skills.
const triggerHooks = (
    owner: RuntimeCricket, 
    opponent: RuntimeCricket, 
    hookName: keyof SkillDefinition, 
    ctx: any,
    canBeNegated: boolean = true
) => {
    const tianGuangSkill = opponent.activeSkills.find(s => s.id === 'tian_guang');
    
    owner.activeSkills.forEach(skill => {
        if (skill[hookName]) {
            // Meta-Check: Suppression (Tian Guang)
            if (canBeNegated && tianGuangSkill && skill.id !== 'tian_guang') { 
                // Optimized: Use meta property instead of regex
                const prob = tianGuangSkill.meta?.tianGuangProb ?? 50;

                if (checkProb(prob)) {
                    if (ctx.logs) {
                        ctx.logs.push({ msg: `「${tianGuangSkill.shout}」`, type: LogType.Shout });
                        ctx.logs.push({ msg: `【天光】阻止了${owner.name}的【${skill.name}】！`, type: LogType.Skill });
                    }
                    return; // Skip this skill
                }
            }
            
            // Execute - Logic inside hook handles shouting now via `act` helper in registry
            const fn = skill[hookName] as Function;
            fn(ctx, skill);
        }
    });
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
      // Optimization: No logs if suppressed
      const logs: { msg: string; type: LogType }[] | null = state.suppressLogs ? null : [];
      const ctx1 = createHookContext(nextState, p1, p2, logs);
      triggerHooks(p1, p2, 'onBattleStart', ctx1);
      
      const ctx2 = createHookContext(nextState, p2, p1, logs);
      triggerHooks(p2, p1, 'onBattleStart', ctx2);

      if (logs) {
         for(const l of logs) nextState = addLog(nextState, l.msg, l.type);
      }
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
    const logs: { msg: string; type: LogType }[] | null = state.suppressLogs ? null : [];

    triggerHooks(s.p1, s.p2, 'onRoundStart', createHookContext(s, s.p1, s.p2, logs));
    triggerHooks(s.p2, s.p1, 'onRoundStart', createHookContext(s, s.p2, s.p1, logs));

    if (logs) {
        for(const l of logs) s = addLog(s, l.msg, l.type);
    }
    if (checkGameOver(s.p1, s.p2)) { s.winnerId = checkGameOver(s.p1, s.p2); s.phase = Phase.GameOver; }
    return s;
};

export const processVigorCheck = (state: CombatState): { state: CombatState; p1Initiative: boolean } => {
  let s = processRoundStart({ ...state });
  if (s.phase === Phase.GameOver) return { state: s, p1Initiative: false };

  const p1 = s.p1;
  const p2 = s.p2;
  const logs: { msg: string; type: LogType }[] | null = state.suppressLogs ? null : [];

  const p1Vigor = getStat(p1, p2, 'vigor');
  const p2Vigor = getStat(p2, p1, 'vigor');

  let p1Starts = false;
  s = addLog(s, `【第${s.round}轮】 ${p1.name}气势(${p1Vigor}) VS ${p2.name}气势(${p2Vigor})`, LogType.Info);

  if (p1Vigor > p2Vigor) {
    s = addLog(s, `${p1.name} 气势更高！`, LogType.Attack);
    handleDamage(p1, p2, 0, p1Vigor, 0, false, false, logs, s.skillsEnabled, 'vigor');
    p1Starts = checkProb(80);
  } else if (p2Vigor > p1Vigor) {
    s = addLog(s, `${p2.name} 气势更高！`, LogType.Attack);
    handleDamage(p2, p1, 0, p2Vigor, 0, false, false, logs, s.skillsEnabled, 'vigor');
    p1Starts = checkProb(20);
  } else {
    p1Starts = checkProb(50);
  }

  if (logs) {
      for(const l of logs) s = addLog(s, l.msg, l.type);
  }
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
    isBlocked: boolean,
    logs: { msg: string; type: LogType }[] | null,
    skillsEnabled: boolean,
    sourceType: 'vigor' | 'bite' | 'strength' | 'other',
    rawHpDmg: number = 0,
    isCounter: boolean = false
) => {
    // Context Construction
    const ctx: DamageContext = {
        state: null as any, // Not available here easily, purely damage context
        owner: defender, // The one receiving damage
        opponent: attacker,
        logs,
        hpDmg, spDmg, durDmg, isCrit, 
        isBlocked, 
        sourceType,
        rawHpDmg,
        isCounter,
        getStat: (t: RuntimeCricket, s: any) => getStat(t, t === defender ? attacker : defender, s)
    };

    if (skillsEnabled) {
        // Fix Tian Guang check here as well
        const tianGuangSkill = attacker.activeSkills.find(s => s.id === 'tian_guang');
        
        defender.activeSkills.forEach(skill => {
            if (skill.onBeforeReceiveDamage) {
                if (tianGuangSkill && skill.id !== 'tian_guang') {
                    // Optimized: Use meta
                    const prob = tianGuangSkill.meta?.tianGuangProb ?? 50;

                    if (checkProb(prob)) {
                        if (logs) {
                            logs.push({ msg: `「${tianGuangSkill.shout}」`, type: LogType.Shout });
                            logs.push({ msg: `【天光】阻止了${defender.name}的【${skill.name}】！`, type: LogType.Skill });
                        }
                        return;
                    }
                }
                // Pass skill
                const res = skill.onBeforeReceiveDamage(ctx, skill);
                if (res) {
                    if (res.hpDmg !== undefined) ctx.hpDmg = res.hpDmg;
                    if (res.spDmg !== undefined) ctx.spDmg = res.spDmg;
                    if (res.durDmg !== undefined) ctx.durDmg = res.durDmg;
                    if (res.isCrit !== undefined) ctx.isCrit = res.isCrit;
                }
            }
        });
    }

    // Apply
    applyDamage(defender, ctx.hpDmg, ctx.spDmg, ctx.durDmg);

    // Attacker Hooks (After Deal)
    const attackCtx: DamageContext = { ...ctx, owner: attacker, opponent: defender, actualHpDmg: ctx.hpDmg, actualSpDmg: ctx.spDmg, getStat: (t: RuntimeCricket, s: any) => getStat(t, t === attacker ? defender : attacker, s) } as any;
    
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
  forceCrit: boolean, 
  skillsEnabled: boolean,
  suppressLogs: boolean = false,
  isCounter: boolean = false
): { att: RuntimeCricket; def: RuntimeCricket; logs: { msg: string; type: LogType }[]; isCrit: boolean } => {
  
  // Optimization: Don't create array if suppressed, but return type requires it, so we return empty at end
  const logs: { msg: string; type: LogType }[] | null = suppressLogs ? null : [];
  
  // 0. Pre-Attack Modifiers (Flags)
  let avoidBlock = false;
  let avoidCrit = false;
  let forcedCrit = forceCrit;

  if (skillsEnabled) {
      // Attacker flags
      attacker.activeSkills.forEach(s => {
          if (s.onBeforeAttack) {
             const res = s.onBeforeAttack(createHookContext(null as any, attacker, defender, logs), s);
             if (res) {
                 if (res.avoidBlock) avoidBlock = true;
                 if (res.forceCrit) forcedCrit = true;
             }
          }
      });
  }

  // Stats
  let attDeadliness = getStat(attacker, defender, 'deadliness');
  let defDefence = getStat(defender, attacker, 'defence');
  const attVigor = getStat(attacker, defender, 'vigor');

  // --- Apply Brocade Intimidate Debuffs ---
  if (attacker.skillState.brocadeDebuff === 'deadliness') attDeadliness = 0;
  if (defender.skillState.brocadeDebuff === 'defence') defDefence = 0;
  // ----------------------------------------

  // 1. Roll Crit
  let isCrit = forcedCrit || (!avoidCrit && checkProb(attDeadliness));
  
  // 2. Roll Block
  const isBlocked = !avoidBlock && checkProb(defDefence);
  const defBlockRed = defender.damageReduce;
  let attCritDmg = (attacker as any).critDamage || 0;
  
  if (skillsEnabled) attCritDmg = getStat(attacker, defender, 'critDamage');

  let hpDamage = 0;
  let spDamage = 0;
  let durDamage = 0;
  let rawHpDmg = 0;
  const sourceType = (damageStatValue === getStat(attacker, defender, 'bite')) ? 'bite' : 'strength';

  // Apply "Blowing Bell" (Soul Taking) logic
  let extraSpDmg = 0;
  if (skillsEnabled && attacker.skillIds?.includes('soul_taking') && sourceType === 'bite') {
      // Trigger Shout if exists
      const bell = attacker.activeSkills.find(s => s.id === 'soul_taking');
      if (bell && bell.shout && logs && logs.filter(l => l.type === LogType.Shout).length === 0) {
          logs.push({ msg: `「${bell.shout}」`, type: LogType.Shout });
      }
      
      extraSpDmg += attVigor;
      if(logs) logs.push({ msg: `【摄魂】附加${attVigor}斗性伤害。`, type: LogType.Effect });
  }

  if (!isCrit) {
    rawHpDmg = damageStatValue;
    if (isBlocked) {
      hpDamage = Math.max(0, rawHpDmg - defBlockRed);
      if(logs) logs.push({ msg: `【格挡】${defender.name} 触发格挡!`, type: LogType.Block });
    } else {
      hpDamage = rawHpDmg;
      if(logs) logs.push({ msg: `【主动进攻】${attacker.name} 发起进攻，伤害${hpDamage}。`, type: LogType.Damage });
    }
    spDamage += extraSpDmg; 
  } else {
    if(logs) logs.push({ msg: `【暴击】${attacker.name} 触发暴击!`, type: LogType.Crit });
    rawHpDmg = damageStatValue + attCritDmg;
    let rawSpDmg = attVigor; 
    
    if (isBlocked) {
      hpDamage = Math.max(0, rawHpDmg - defBlockRed);
      spDamage = Math.max(0, rawSpDmg - defBlockRed);
      if(logs) logs.push({ msg: `【格挡】${defender.name} 触发格挡!`, type: LogType.Block });
    } else {
      hpDamage = rawHpDmg;
      spDamage = rawSpDmg;
      durDamage = 1; 
      if(logs) logs.push({ msg: `${defender.name} 受到重创！(耐久 -1)`, type: LogType.Damage });
    }
  }

  // Injury
  if (isCrit && !isBlocked && checkProb(attacker.injuryOdds)) {
      if (checkProb(35)) {
        const r = Math.random();
        if (r < 0.33) { defender.injuries.vigor++; if(logs) logs.push({ msg: `${defender.name} 气势受损！`, type: LogType.Effect }); }
        else if (r < 0.66) { defender.injuries.strength++; if(logs) logs.push({ msg: `${defender.name} 角力受损！`, type: LogType.Effect }); }
        else { defender.injuries.bite++; if(logs) logs.push({ msg: `${defender.name} 牙钳受损！`, type: LogType.Effect }); }
      } else {
        if (Math.random() < 0.5) { defender.injuries.hp += 5; hpDamage += 5; if(logs) logs.push({ msg: `耐力受损(+5伤)`, type: LogType.Effect }); }
        else { defender.injuries.sp += 5; spDamage += 5; if(logs) logs.push({ msg: `斗性受损(+5伤)`, type: LogType.Effect }); }
      }
  }

  // Construct Context and Delegate to `handleDamage` which runs Hooks
  handleDamage(attacker, defender, hpDamage, spDamage, durDamage, isCrit, isBlocked, logs, skillsEnabled, sourceType, rawHpDmg, isCounter);

  return { att: attacker, def: defender, logs: logs || [], isCrit };
};

export const runInstantBattle = (
    c1: CricketData, 
    c2: CricketData, 
    skillsEnabled: boolean,
    onLongBattle?: (s: CombatState) => void
): number => {
    let state: CombatState = {
        round: 0,
        phase: Phase.Setup,
        logs: [],
        p1: createRuntimeCricket(c1),
        p2: createRuntimeCricket(c2),
        winnerId: null,
        autoPlay: true,
        battleSpeed: 0,
        skillsEnabled,
        suppressLogs: true
    };

    // PreFight
    state = processPreFight(state);
    if (state.winnerId) return state.winnerId === state.p1.uniqueId ? 0 : 1;

    let loop = 0;
    while (!state.winnerId && loop < 100) {
        loop++;
        
        const vigorRes = processVigorCheck(state);
        state = vigorRes.state;
        if (state.winnerId) break;

        const p1Initiative = vigorRes.p1Initiative;

        // Exchange 1
        state = resolveExchange(state, p1Initiative);
        if (state.winnerId) break;

        // Exchange 2
        state = resolveExchange(state, !p1Initiative);
        if (state.winnerId) break;

        state.round++;
    }

    if (loop >= 100 && onLongBattle) {
        onLongBattle(state);
    }
    
    if (!state.winnerId) {
         // Draw resolution: Health %
         const p1Pct = state.p1.currentHp / state.p1.hp;
         const p2Pct = state.p2.currentHp / state.p2.hp;
         return p1Pct >= p2Pct ? 0 : 1;
    }

    return state.winnerId === state.p1.uniqueId ? 0 : 1;
};

const resolveExchange = (state: CombatState, initiatorIsP1: boolean): CombatState => {
    let currentAttackerIsP1 = initiatorIsP1;
    let counterCount = 0;
    let lastHitWasCrit = false;

    while (true) {
        if (state.winnerId) break;

        const attacker = currentAttackerIsP1 ? state.p1 : state.p2;
        const defender = currentAttackerIsP1 ? state.p2 : state.p1;

        // Counter Check
        if (counterCount > 0) {
            let counterChance = getStat(attacker, defender, 'counter');
            if (attacker.skillState.trueColorTriggered) counterChance = Math.ceil(counterChance * 1.5);
            if (attacker.skillState.brocadeDebuff === 'counter') counterChance = 0;
            
            const chance = counterChance - (counterCount - 1) * 5;
            if (!checkProb(chance)) break; 
        }

        const useBite = (currentAttackerIsP1 === initiatorIsP1);
        const statVal = useBite 
            ? getStat(attacker, defender, 'bite')
            : getStat(attacker, defender, 'strength');

        const isCounter = counterCount > 0;
        const res = resolveStrike(attacker, defender, statVal, lastHitWasCrit, false, state.skillsEnabled, state.suppressLogs, isCounter);
        lastHitWasCrit = res.isCrit;

        const w = checkGameOver(state.p1, state.p2);
        if (w) {
            state.winnerId = w;
            break;
        }

        counterCount++;
        currentAttackerIsP1 = !currentAttackerIsP1;
    }
    return state;
};
