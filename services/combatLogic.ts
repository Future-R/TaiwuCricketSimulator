import { BattleLog, CombatState, CricketData, CricketGrade, LogType, Phase, RuntimeCricket } from '../types';

// Helper to check probability
export const checkProb = (percentage: number): boolean => {
  return Math.random() * 100 < percentage;
};

// Generate initial RuntimeCricket from Data
export const createRuntimeCricket = (data: CricketData): RuntimeCricket => {
  // Logic: Higher grade number = Better quality (0 is Dumb, 8 is King)
  // Wiki Formula: (Level + 1 + HP / 20)
  // We treat data.grade as the Level directly.
  const levelValue = data.grade; 
  
  const baseDurability = levelValue + 1 + data.hp / 20;
  const minDur = Math.floor(baseDurability * 0.65);
  const maxDur = Math.floor(baseDurability * 1.35);
  const durability = Math.floor(Math.random() * (maxDur - minDur + 1)) + minDur;

  return {
    ...data,
    currentHp: data.hp,
    currentSp: data.sp,
    currentDurability: durability,
    maxDurability: durability,
    injuries: {
      vigor: 0,
      strength: 0,
      bite: 0,
      hp: 0,
      sp: 0,
    },
    isDead: false,
    isLost: false,
    skillState: {
      needleTriggered: { hp: false, sp: false, dur: false },
      jadeHoeStack: 0,
      trueColorTriggered: false,
      grassBuff: null,
      brocadeDebuff: null,
      fanShengStack: 0,
      jadeTailStack: 0,
      plumWingStack: 0,
      eightFailuresStack: { bite: 0, strength: 0, vigor: 0 }
    }
  };
};

const addLog = (state: CombatState, message: string, type: LogType = LogType.Info): CombatState => {
  const newLog: BattleLog = {
    id: Math.random().toString(36).substr(2, 9),
    turn: state.round,
    message,
    type,
  };
  return {
    ...state,
    logs: [...state.logs, newLog],
  };
};

// Check if anyone lost
export const checkGameOver = (p1: RuntimeCricket, p2: RuntimeCricket): string | null => {
  if (p1.isDead || p1.isLost) return p2.id;
  if (p2.isDead || p2.isLost) return p1.id;
  
  if (p1.currentHp <= 0 || p1.currentSp <= 0 || p1.currentDurability <= 0) return p2.id;
  if (p2.currentHp <= 0 || p2.currentSp <= 0 || p2.currentDurability <= 0) return p1.id;
  
  return null;
};

// Apply damage and handle death/loss state
// MUTATES victim to ensure state is persisted across simulation steps
const applyDamage = (
  victim: RuntimeCricket, 
  hpDmg: number, 
  spDmg: number, 
  durDmg: number
): { actualHpDmg: number, actualSpDmg: number } => {
  const finalHpDmg = Math.min(victim.currentHp, hpDmg);
  const finalSpDmg = Math.min(victim.currentSp, spDmg);

  victim.currentHp = Math.max(0, victim.currentHp - hpDmg);
  victim.currentSp = Math.max(0, victim.currentSp - spDmg);
  victim.currentDurability = Math.max(0, victim.currentDurability - durDmg);

  if (victim.currentHp === 0 || victim.currentDurability === 0) victim.isDead = true;
  if (victim.currentSp === 0) victim.isLost = true;

  return { actualHpDmg: finalHpDmg, actualSpDmg: finalSpDmg };
};

// --- SKILL LOGIC ---

// Helper to check if a skill is successfully activated (handles Sky Blue counter)
// Returns TRUE if skill proceeds, FALSE if negated
const tryActivateSkill = (
  user: RuntimeCricket, 
  opponent: RuntimeCricket, 
  skillName: string, 
  prob: number,
  logs: { msg: string; type: LogType }[]
): boolean => {
  // 1. Probability Check
  if (prob < 100 && !checkProb(prob)) return false;

  // 2. Sky Blue Check (Tian Lan Qing)
  // Logic: If Opponent is Sky Blue, 66% chance to negate
  if (opponent.id === 'sky_blue') {
    if (checkProb(66)) {
      logs.push({ msg: `【天光】天蓝青发动技能，阻止了${user.name}的【${skillName}】！`, type: LogType.Skill });
      return false;
    }
  }

  // 3. Success
  logs.push({ msg: `【${skillName}】${user.name}发动技能！`, type: LogType.Skill });
  return true;
};

const getStat = (c: RuntimeCricket, stat: 'vigor'|'strength'|'bite'|'deadliness'|'defence'|'counter'): number => {
  let val = c[stat];
  // Apply injuries
  if (stat === 'vigor') val -= c.injuries.vigor;
  if (stat === 'strength') val -= c.injuries.strength;
  if (stat === 'bite') val -= c.injuries.bite;

  // Apply Skill Stacks
  if (stat === 'strength') val += c.skillState.fanShengStack;
  if (stat === 'bite') val += c.skillState.jadeTailStack;
  if (stat === 'vigor') val += c.skillState.plumWingStack;
  
  if (stat === 'bite') val += c.skillState.eightFailuresStack.bite;
  if (stat === 'strength') val += c.skillState.eightFailuresStack.strength;
  if (stat === 'vigor') val += c.skillState.eightFailuresStack.vigor;

  // Apply Buffs (Grass)
  if (c.skillState.grassBuff && c.skillState.grassBuff.stat === stat) {
    val *= 2;
    val = Math.ceil(val);
  }

  // Apply Debuffs (Brocade)
  if (c.skillState.brocadeDebuff && c.skillState.brocadeDebuff.stat === stat) {
    val = 0;
  }

  return Math.max(0, val);
};

// --------------------------------------------------------------------------------
// LOGIC STEPS
// --------------------------------------------------------------------------------

export const processPreFight = (state: CombatState): CombatState => {
  let nextState = addLog(state, "芡草打牙...", LogType.Info);
  const p1 = nextState.p1;
  const p2 = nextState.p2;

  // 1. Dumb check (Grade 0 is Dumb)
  const p1Dumb = p1.grade === 0;
  const p2Dumb = p2.grade === 0;

  if (p1Dumb && !p2Dumb) {
    nextState = addLog(nextState, `${p1.name} 是呆物！${p2.name} 不战而胜！`, LogType.Win);
    return { ...nextState, winnerId: p2.id, phase: Phase.GameOver };
  }
  if (!p1Dumb && p2Dumb) {
    nextState = addLog(nextState, `${p2.name} 是呆物！${p1.name} 不战而胜！`, LogType.Win);
    return { ...nextState, winnerId: p1.id, phase: Phase.GameOver };
  }
  if (p1Dumb && p2Dumb) {
    // 50/50
    const p1Wins = Math.random() > 0.5;
    nextState = addLog(nextState, `双方都是呆物！${p1Wins ? p1.name : p2.name} 不战而胜。`, LogType.Win);
    return { ...nextState, winnerId: p1Wins ? p1.id : p2.id, phase: Phase.GameOver };
  }

  // Skill: Cinnabar (Red Evil) - Battle Start
  if (state.skillsEnabled) {
     const logs: { msg: string; type: LogType }[] = [];
     if (p1.id === 'cinnabar' && tryActivateSkill(p1, p2, '赤煞', 100, logs)) {
         p2.currentHp = Math.max(0, p2.currentHp - Math.ceil(p2.hp / 3));
         p2.currentSp = Math.max(0, p2.currentSp - Math.ceil(p2.sp / 3));
         logs.push({ msg: `${p2.name} 损失了大量体力与斗性！`, type: LogType.Effect });
     }
     if (p2.id === 'cinnabar' && tryActivateSkill(p2, p1, '赤煞', 100, logs)) {
         p1.currentHp = Math.max(0, p1.currentHp - Math.ceil(p1.hp / 3));
         p1.currentSp = Math.max(0, p1.currentSp - Math.ceil(p1.sp / 3));
         logs.push({ msg: `${p1.name} 损失了大量体力与斗性！`, type: LogType.Effect });
     }
     // Add logs
     for(const l of logs) nextState = addLog(nextState, l.msg, l.type);
  }

  // 2. Grade Gap >= 6
  // Higher number is better.
  const gradeDiff = Math.abs(p1.grade - p2.grade);
  if (gradeDiff >= 6) {
    const chance = gradeDiff / 10.0; // e.g. 0.6 for diff 6
    if (checkProb(chance * 100)) {
      // The one with the HIGHER grade wins
      const winner = p1.grade > p2.grade ? p1 : p2; 
      nextState = addLog(nextState, `等级压制！${winner.name} 气势逼人，对手不战而逃！`, LogType.Win);
      return { ...nextState, winnerId: winner.id, phase: Phase.GameOver };
    }
  }

  nextState = addLog(nextState, "提闸开战！", LogType.Info);
  return { ...nextState, phase: Phase.VigorCheck, round: 1 };
};

export const processRoundStart = (state: CombatState): CombatState => {
    let s = { ...state };
    if (!s.skillsEnabled) return s;

    const logs: { msg: string; type: LogType }[] = [];
    
    [s.p1, s.p2].forEach((c, idx) => {
        const opp = idx === 0 ? s.p2 : s.p1;
        
        // Clear previous buffs
        c.skillState.grassBuff = null;
        c.skillState.brocadeDebuff = null;

        // Armor (Black Armor)
        if (c.id === 'armor' && tryActivateSkill(c, opp, '玄甲', 100, logs)) {
            const dmg = s.round;
            applyDamage(opp, dmg, dmg, 0); // Mutates opp directly
            logs.push({ msg: `${opp.name} 受到玄甲震慑，损失${dmg}点体力/斗性。`, type: LogType.Effect });
        }

        // Grass (Talent)
        if (c.id === 'grass' && tryActivateSkill(c, opp, '奇赋', 50, logs)) {
            const stats = ['bite', 'strength', 'vigor'] as const;
            const target = stats[Math.floor(Math.random() * 3)];
            c.skillState.grassBuff = { stat: target, value: 0 }; // Value calc handled in getStat
            logs.push({ msg: `${c.name} 的 ${target === 'bite' ? '牙钳' : target === 'strength' ? '角力' : '气势'} 翻倍了！`, type: LogType.Effect });
        }

        // Brocade (Intimidate)
        if (c.id === 'brocade') {
            const stats = ['bite', 'strength', 'vigor'] as const;
            let count = 0;
            stats.forEach(st => {
                if (getStat(c, st) > getStat(opp, st) + 20) count++;
            });
            const prob = count * 33; 
            
            if (count > 0 && tryActivateSkill(c, opp, '威吓', prob, logs)) {
                 const targets = ['deadliness', 'defence', 'counter'] as const;
                 const target = targets[Math.floor(Math.random() * 3)];
                 opp.skillState.brocadeDebuff = { stat: target, value: 0 };
                 logs.push({ msg: `${opp.name} 被威吓！${target === 'deadliness' ? '暴击' : target === 'defence' ? '防御' : '反击'}降为0！`, type: LogType.Effect });
            }
        }
    });

    for(const l of logs) s = addLog(s, l.msg, l.type);

    // Check game over from start of round effects
    const winner = checkGameOver(s.p1, s.p2);
    if (winner) {
        s.winnerId = winner;
        s.phase = Phase.GameOver;
    }

    return s;
};


export const processVigorCheck = (state: CombatState): { state: CombatState; p1Initiative: boolean } => {
  let s = { ...state };
  
  // Apply Round Start Skills
  s = processRoundStart(s);
  if (s.phase === Phase.GameOver) return { state: s, p1Initiative: false };

  const p1 = s.p1;
  const p2 = s.p2;
  const logs: { msg: string; type: LogType }[] = [];

  const p1Vigor = getStat(p1, 'vigor');
  const p2Vigor = getStat(p2, 'vigor');

  let p1Starts = false;

  s = addLog(s, `【第${s.round}轮】 ${p1.name} 发动气势攻击 (${p1Vigor})，${p2.name} 斗性${p2.currentSp}(-${p1Vigor > p2Vigor ? p1Vigor : 0})`, LogType.Info);

  if (p1Vigor > p2Vigor) {
    s = addLog(s, `${p1.name} 气势更高！造成 ${p1Vigor} 点斗性伤害。`, LogType.Attack);
    // Vigor Damage Logic with Skills
    handleDamage(p1, p2, 0, p1Vigor, 0, false, logs, s.skillsEnabled, 'vigor');
    p1Starts = checkProb(80);
    if (p1Starts) s = addLog(s, `${p1.name} 获得先手 (80% 概率)。`, LogType.Info);
    else s = addLog(s, `${p2.name} 获得先手 (20% 概率)。`, LogType.Info);
  } else if (p2Vigor > p1Vigor) {
    s = addLog(s, `${p2.name} 气势更高！造成 ${p2Vigor} 点斗性伤害。`, LogType.Attack);
    handleDamage(p2, p1, 0, p2Vigor, 0, false, logs, s.skillsEnabled, 'vigor');
    p1Starts = checkProb(20);
    if (p1Starts) s = addLog(s, `${p1.name} 获得先手 (20% 概率)。`, LogType.Info);
    else s = addLog(s, `${p2.name} 获得先手 (80% 概率)。`, LogType.Info);
  } else {
    s = addLog(s, `气势相当。无斗性伤害。`, LogType.Info);
    p1Starts = checkProb(50);
    if (p1Starts) s = addLog(s, `${p1.name} 获得先手。`, LogType.Info);
    else s = addLog(s, `${p2.name} 获得先手。`, LogType.Info);
  }

  for(const l of logs) s = addLog(s, l.msg, l.type);

  // Check loss after Vigor hit
  const winner = checkGameOver(s.p1, s.p2);
  if (winner) {
    s.winnerId = winner;
    s.phase = Phase.GameOver;
  }

  return { state: s, p1Initiative: p1Starts };
};

// Centralized Damage Handler to support skills (Monk, Iron Bullet, Red Beard, etc.)
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
    if (!skillsEnabled) {
        applyDamage(defender, hpDmg, spDmg, durDmg);
        return;
    }

    // 1. Defensive Skills (Reduce/Redirect Incoming)
    
    // Iron Bullet (Iron Shell)
    if (defender.id === 'iron_bullet' && (hpDmg > 0 || spDmg > 0)) {
        if (tryActivateSkill(defender, attacker, '铁壳', 33, logs)) {
            hpDmg = 0;
            spDmg = 0;
            logs.push({ msg: `铁壳生效！伤害归零。`, type: LogType.Effect });
        }
    }

    // Monk (Immovable) - Conversion
    if (defender.id === 'monk' && (hpDmg > 0 || spDmg > 0)) {
        if (tryActivateSkill(defender, attacker, '不动', 100, logs)) {
            // Convert damage to healing for the other type
            // HP Dmg -> SP Heal
            if (hpDmg > 0) {
                defender.currentSp = Math.min(defender.sp, defender.currentSp + hpDmg);
                logs.push({ msg: `不动：受到${hpDmg}体力伤害，恢复了同等斗性。`, type: LogType.Effect });
                hpDmg = 0; 
            }
            // SP Dmg -> HP Heal
            if (spDmg > 0) {
                defender.currentHp = Math.min(defender.hp, defender.currentHp + spDmg);
                logs.push({ msg: `不动：受到${spDmg}斗性伤害，恢复了同等体力。`, type: LogType.Effect });
                spDmg = 0;
            }
        }
    }

    // 2. Apply Damage (Mutates defender directly)
    const res = applyDamage(defender, hpDmg, spDmg, durDmg);
    const takenHp = res.actualHpDmg;
    const takenSp = res.actualSpDmg;

    // 3. Post-Damage Triggers (Attacker)

    // Red Beard (Sacrifice)
    if (attacker.id === 'red_beard' && (takenHp > 0 || takenSp > 0)) {
        const hpLossPct = (attacker.hp - attacker.currentHp) / attacker.hp;
        const spLossPct = (attacker.sp - attacker.currentSp) / attacker.sp;
        const totalLossPct = hpLossPct + spLossPct; // Simple sum or avg? "Own lost hp/sp percentage". Let's assume avg.
        const prob = 20 + (totalLossPct * 100); 

        if (tryActivateSkill(attacker, defender, '舍身', prob, logs)) {
            const mod = 1.2 + (totalLossPct / 10);
            const extraHp = Math.floor(takenHp * (mod - 1));
            const extraSp = Math.floor(takenSp * (mod - 1));
            applyDamage(defender, extraHp, extraSp, 0);
            logs.push({ msg: `舍身：额外造成${extraHp}体力/${extraSp}斗性伤害。`, type: LogType.Effect });

            // Self Harm
            const selfHpCost = Math.floor(attacker.currentHp * 0.1);
            const selfSpCost = Math.floor(attacker.currentSp * 0.1);
            applyDamage(attacker, selfHpCost, selfSpCost, 0);
            logs.push({ msg: `舍身：自损${selfHpCost}体力/${selfSpCost}斗性。`, type: LogType.Effect });
        }
    }

    // Fan Sheng (Brave) - Strength Dmg -> Str +2
    if (attacker.id === 'fan_sheng' && sourceType === 'strength' && takenHp > 0) {
        if (tryActivateSkill(attacker, defender, '勇烈', 100, logs)) {
            attacker.skillState.fanShengStack += 2;
            logs.push({ msg: `勇烈：角力+2 (当前+${attacker.skillState.fanShengStack})`, type: LogType.Effect });
        }
    }

    // Jade Tail (Break) - Bite Dmg -> Bite +2
    if (attacker.id === 'jade_tail' && sourceType === 'bite' && takenHp > 0) {
        if (tryActivateSkill(attacker, defender, '破势', 100, logs)) {
            attacker.skillState.jadeTailStack += 2;
            logs.push({ msg: `破势：牙钳+2 (当前+${attacker.skillState.jadeTailStack})`, type: LogType.Effect });
        }
    }

    // Plum Wing (Spirit) - Vigor Dmg -> Vigor +2
    if (attacker.id === 'plum_wing' && sourceType === 'vigor' && takenSp > 0) {
        if (tryActivateSkill(attacker, defender, '通灵', 100, logs)) {
            attacker.skillState.plumWingStack += 2;
            logs.push({ msg: `通灵：气势+2 (当前+${attacker.skillState.plumWingStack})`, type: LogType.Effect });
        }
    }

    // True Purple Yellow (Change) - Crit -> Heal
    if (attacker.id === 'purple_yellow' && isCrit) {
         if (tryActivateSkill(attacker, defender, '变化', 100, logs)) {
             const healHp = Math.floor(takenHp * 0.5);
             const healSp = Math.floor(takenSp * 0.5);
             attacker.currentHp = Math.min(attacker.hp, attacker.currentHp + healHp);
             attacker.currentSp = Math.min(attacker.sp, attacker.currentSp + healSp);
             logs.push({ msg: `变化：恢复${healHp}体力/${healSp}斗性。`, type: LogType.Effect });
         }
    }

    // 4. Post-Damage Triggers (Defender)
    
    // Eight Failures (Reverse Fate) - Hit/Counter/VigorHit -> Stat +1
    // "Attacked (Bite+1), Countered (Strength+1), Sing/Vigor (Vigor+1)"
    if (defender.id === 'eight_failures' && (takenHp > 0 || takenSp > 0)) {
        if (tryActivateSkill(defender, attacker, '逆命', 66, logs)) {
            if (sourceType === 'bite') {
                defender.skillState.eightFailuresStack.bite += 1;
                logs.push({ msg: `逆命：牙钳+1`, type: LogType.Effect });
            } else if (sourceType === 'strength') {
                defender.skillState.eightFailuresStack.strength += 1;
                logs.push({ msg: `逆命：角力+1`, type: LogType.Effect });
            } else if (sourceType === 'vigor') {
                defender.skillState.eightFailuresStack.vigor += 1;
                logs.push({ msg: `逆命：气势+1`, type: LogType.Effect });
            }
        }
    }

    // 5. HP Threshold Triggers
    
    // Needle (Poison Cone) - <50% HP/SP/Dur
    const checkNeedle = (c: RuntimeCricket, opp: RuntimeCricket) => {
        if (c.id !== 'needle') return;
        
        if (!c.skillState.needleTriggered.hp && c.currentHp < c.hp * 0.5) {
            c.skillState.needleTriggered.hp = true;
            if (tryActivateSkill(c, opp, '毒锥', 100, logs)) {
                 // Extra Crit
                 resolveStrike(c, opp, getStat(c, 'bite'), false, true, skillsEnabled); // Force crit logic helper
                 logs.push({ msg: `毒锥：HP<50%，发动额外暴击！`, type: LogType.Effect });
            }
        }
        if (!c.skillState.needleTriggered.sp && c.currentSp < c.sp * 0.5) {
            c.skillState.needleTriggered.sp = true;
            if (tryActivateSkill(c, opp, '毒锥', 100, logs)) {
                 resolveStrike(c, opp, getStat(c, 'bite'), false, true, skillsEnabled);
                 logs.push({ msg: `毒锥：SP<50%，发动额外暴击！`, type: LogType.Effect });
            }
        }
    }
    checkNeedle(attacker, defender);
    checkNeedle(defender, attacker);

    // True Three Colors (True Blood)
    const checkTrueColor = (c: RuntimeCricket) => {
        if (c.id !== 'tricolor' || c.skillState.trueColorTriggered) return;
        if (c.currentHp < c.hp * 0.5 || c.currentSp < c.sp * 0.5 || c.currentDurability < c.maxDurability * 0.5) {
            c.skillState.trueColorTriggered = true;
            // All stats * 1.5
            c.vigor = Math.ceil(c.vigor * 1.5);
            c.strength = Math.ceil(c.strength * 1.5);
            c.bite = Math.ceil(c.bite * 1.5);
            c.defence = Math.ceil(c.defence * 1.5);
            c.counter = Math.ceil(c.counter * 1.5);
            c.deadliness = Math.ceil(c.deadliness * 1.5);
            // ... apply others if needed
            logs.push({ msg: `真血：属性大幅提升！`, type: LogType.Effect });
        }
    }
    checkTrueColor(attacker);
    checkTrueColor(defender);
}


// Consolidated function to perform a single strike logic
export const resolveStrike = (
  attacker: RuntimeCricket,
  defender: RuntimeCricket,
  damageStatValue: number, // Bite or Strength depending on context
  isCritCycle: boolean, // Was the *previous* hit a crit? (Relevant for counter damage)
  forceCrit: boolean = false, // For skills
  skillsEnabled: boolean = true // Default true to support implicit logic, but caller should override
): { att: RuntimeCricket; def: RuntimeCricket; logs: { msg: string; type: LogType }[]; isCrit: boolean } => {
  
  const logs: { msg: string; type: LogType }[] = [];
  
  // STATS
  const attDeadliness = getStat(attacker, 'deadliness');
  const defDefence = getStat(defender, 'defence');
  let attVigor = getStat(attacker, 'vigor');

  // SKILL: Running Horse (Run) - Avoid Crit/Block
  let avoidCrit = false;
  let avoidBlock = false;
  
  if (skillsEnabled) {
      if (defender.id === 'yellow_horse') {
           if (tryActivateSkill(defender, attacker, '跑马', 66, logs)) {
                avoidCrit = true; 
           }
      }
      if (attacker.id === 'yellow_horse') {
           if (tryActivateSkill(attacker, defender, '跑马', 66, logs)) {
                avoidBlock = true;
           }
      }
  }

  // 1. Roll Crit
  let isCrit = forceCrit || (!avoidCrit && checkProb(attDeadliness));
  
  // 2. Roll Block
  const isBlocked = !avoidBlock && checkProb(defDefence);

  const defBlockRed = defender.damageReduce;
  let attCritDmg = attacker.critDamage;

  // SKILL: Jade Hoe (Raise Sword)
  if (skillsEnabled && attacker.id === 'jade_hoe') {
      if (isCrit) {
          // Reset
          attacker.skillState.jadeHoeStack = 0;
      } else {
          // Stack
          if (tryActivateSkill(attacker, defender, '养剑', 33, logs)) {
              attacker.skillState.jadeHoeStack += 10;
              logs.push({ msg: `养剑：暴伤+10 (当前+${attacker.skillState.jadeHoeStack})`, type: LogType.Effect });
          }
      }
      attCritDmg += attacker.skillState.jadeHoeStack;
  }

  // SKILL: Blowing Bell (Soul Taking) - Active attack deals Vigor damage as SP even if no crit
  let bellEffect = false;
  if (skillsEnabled && attacker.id === 'bell') {
       bellEffect = true; 
  }


  let hpDamage = 0;
  let spDamage = 0;
  let durDamage = 0;
  let durabilityLost = false;

  const sourceType = (damageStatValue === getStat(attacker, 'bite')) ? 'bite' : 'strength';

  // "If Attack is Non-Crit:"
  if (!isCrit) {
    if (isBlocked) {
      hpDamage = Math.max(0, damageStatValue - defBlockRed);
      
      // SKILL: Three Prince (Red Lotus) - Reflect reduced dmg
      if (skillsEnabled && defender.id === 'three_prince' && tryActivateSkill(defender, attacker, '红莲', 50, logs)) {
          const reflected = Math.min(damageStatValue, defBlockRed);
          if (reflected > 0) {
              handleDamage(defender, attacker, reflected, 0, 0, false, logs, true, 'other'); // Reflect
              logs.push({ msg: `红莲：反弹${reflected}伤害！`, type: LogType.Effect });
          }
      }

      // SKILL: Oil Paper Lamp (Hundred Battles)
      if (skillsEnabled && defender.id === 'lamp' && tryActivateSkill(defender, attacker, '百战', 50, logs)) {
           const lampBite = getStat(defender, 'bite');
           const lampVigor = getStat(defender, 'vigor');
           handleDamage(defender, attacker, lampBite, lampVigor, 0, false, logs, true, 'other');
           logs.push({ msg: `百战：反击${lampBite}体力/${lampVigor}斗性！`, type: LogType.Effect });
      }

      logs.push({ msg: `【格挡】${defender.name} 触发格挡! 对当前伤害${damageStatValue}(-${defBlockRed})。`, type: LogType.Block });
    } else {
      hpDamage = damageStatValue;
      logs.push({ msg: `【主动进攻】${attacker.name} 发起进攻，伤害${hpDamage}。`, type: LogType.Damage });
    }

    // Bell Effect (Non-Crit Active Attack)
    if (bellEffect && sourceType === 'bite') {
        spDamage += attVigor;
        logs.push({ msg: `摄魂：附加${attVigor}斗性伤害。`, type: LogType.Effect });
    }

  } 
  // "If Attack is Crit:"
  else {
    logs.push({ msg: `【暴击】${attacker.name} 触发暴击!`, type: LogType.Crit });
    
    // Base HP Damage
    let rawHpDmg = damageStatValue + attCritDmg;
    let rawSpDmg = attVigor; // Crit deals Vigor as SP damage

    if (isBlocked) {
      hpDamage = Math.max(0, rawHpDmg - defBlockRed);
      spDamage = Math.max(0, rawSpDmg - defBlockRed);
      
      // Three Prince & Lamp trigger on Blocked Crit too
      if (skillsEnabled && defender.id === 'three_prince' && tryActivateSkill(defender, attacker, '红莲', 50, logs)) {
          const reflected = Math.min(rawHpDmg, defBlockRed);
          handleDamage(defender, attacker, reflected, 0, 0, false, logs, true, 'other');
      }
      if (skillsEnabled && defender.id === 'lamp' && tryActivateSkill(defender, attacker, '百战', 50, logs)) {
           const lampBite = getStat(defender, 'bite');
           const lampVigor = getStat(defender, 'vigor');
           handleDamage(defender, attacker, lampBite, lampVigor, 0, false, logs, true, 'other');
      }

      logs.push({ msg: `【格挡】${defender.name} 触发格挡!`, type: LogType.Block });
    } else {
      hpDamage = rawHpDmg;
      spDamage = rawSpDmg;
      durDamage = 1; // Unblocked crit reduces durability by 1
      durabilityLost = true;
      logs.push({ msg: `${defender.name} 受到重创！(耐久 -1)`, type: LogType.Damage });
    }
  }

  // Spear (Death) - Counter Dmg x2
  if (skillsEnabled && attacker.id === 'spear' && sourceType === 'strength') {
      if (tryActivateSkill(attacker, defender, '夺命', 50, logs)) {
          hpDamage *= 2;
          spDamage *= 2; // Assuming crit sp damage also doubles? usually physical skill implies HP, but "Damage Double" usually means final.
          logs.push({ msg: `夺命：伤害翻倍！`, type: LogType.Effect });
      }
  }

  // Apply Injury Logic (Unblocked Crit)
  if (isCrit && !isBlocked) {
    const injuryChance = attacker.injuryOdds; 
    if (checkProb(injuryChance)) {
      if (checkProb(35)) {
        // Apply stat injury
        const r = Math.random();
        if (r < 0.33) {
            defender.injuries.vigor += 1;
            logs.push({ msg: `${defender.name} 气势受损！(气势 -1)`, type: LogType.Effect });
        } else if (r < 0.66) {
            defender.injuries.strength += 1;
            logs.push({ msg: `${defender.name} 角力受损！(角力 -1)`, type: LogType.Effect });
        } else {
            defender.injuries.bite += 1;
            logs.push({ msg: `${defender.name} 牙钳受损！(牙钳 -1)`, type: LogType.Effect });
        }
      } else {
        const r = Math.random();
        if (r < 0.5) {
            defender.injuries.hp += 5;
            hpDamage += 5; // Immediate effect
            logs.push({ msg: `${defender.name} 耐力受损！(受到额外5点伤害)`, type: LogType.Effect });
        } else {
            defender.injuries.sp += 5;
            spDamage += 5;
            logs.push({ msg: `${defender.name} 斗性受损！(受到额外5点斗性伤害)`, type: LogType.Effect });
        }
      }
    }
  }

  // Apply calculated damage via Handler
  handleDamage(attacker, defender, hpDamage, spDamage, durDamage, isCrit, logs, skillsEnabled, sourceType);
  
  return { att: attacker, def: defender, logs, isCrit };
};

// ==========================================
// INSTANT SIMULATION FOR MASS BATTLES
// ==========================================

export const runInstantBattle = (c1: CricketData, c2: CricketData, skillsEnabled: boolean = false): string => {
    
    let state: CombatState = {
      round: 0,
      phase: Phase.Setup,
      logs: [],
      p1: createRuntimeCricket(c1),
      p2: createRuntimeCricket(c2),
      winnerId: null,
      autoPlay: true,
      battleSpeed: 0,
      skillsEnabled: skillsEnabled
    };

    let loops = 0;
    const MAX_LOOPS = 200; // Increased safety limit slightly, but prevents infinite loop freeze

    let p1Initiative = false;
    let currentAttackerIsP1 = false;
    let counterCount = 0;
    let lastHitWasCrit = false;

    while (!state.winnerId && loops < MAX_LOOPS) {
        loops++;

        if (state.phase === Phase.Setup) state.phase = Phase.PreFight;
        
        else if (state.phase === Phase.PreFight) {
            state = processPreFight(state);
        }
        else if (state.phase === Phase.VigorCheck) {
            const res = processVigorCheck(state);
            state = res.state;
            p1Initiative = res.p1Initiative;
            currentAttackerIsP1 = p1Initiative;
            state.phase = Phase.FirstHalf;
            counterCount = 0;
            lastHitWasCrit = false;
        }
        else if (state.phase === Phase.FirstHalf || state.phase === Phase.SecondHalf) {
            const isFirstHalf = state.phase === Phase.FirstHalf;
            
            const attacker = currentAttackerIsP1 ? state.p1 : state.p2;
            const defender = currentAttackerIsP1 ? state.p2 : state.p1;
            const isInitialAttack = counterCount === 0;

            let canAttack = true;
            if (!isInitialAttack) {
                 const baseChance = getStat(attacker, 'counter');
                 const chance = baseChance - (counterCount - 1) * 5;
                 if (!checkProb(chance)) {
                     canAttack = false;
                     counterCount = 0;
                     lastHitWasCrit = false;
                     if (isFirstHalf) {
                         state.phase = Phase.SecondHalf;
                         currentAttackerIsP1 = !p1Initiative; 
                     } else {
                         state.phase = Phase.RoundEnd;
                     }
                 }
            }

            if (canAttack) {
                 const roundInitiatorIsP1 = isFirstHalf ? p1Initiative : !p1Initiative;
                 const useBite = currentAttackerIsP1 === roundInitiatorIsP1;
                 const statVal = useBite 
                    ? getStat(attacker, 'bite')
                    : getStat(attacker, 'strength');

                 const strikeRes = resolveStrike(attacker, defender, statVal, lastHitWasCrit, false, skillsEnabled);
                 
                 // Note: Logic inside loop to prevent memory growth
                 // We DO NOT accumulate logs here for performance.
                 
                 if (checkGameOver(state.p1, state.p2)) {
                    state.winnerId = checkGameOver(state.p1, state.p2);
                    state.phase = Phase.GameOver;
                    break;
                 }

                 lastHitWasCrit = strikeRes.isCrit;
                 counterCount++;
                 currentAttackerIsP1 = !currentAttackerIsP1;
            }
        }
        else if (state.phase === Phase.RoundEnd) {
            state.round += 1;
            state.phase = Phase.VigorCheck;
        }
        else if (state.phase === Phase.GameOver) {
            break;
        }
    }

    if (state.winnerId) return state.winnerId;

    // Timeout Winner Decision (HP + SP + Durability Ratio)
    const score1 = (state.p1.currentHp / state.p1.hp) + (state.p1.currentSp / state.p1.sp) + (state.p1.currentDurability / state.p1.maxDurability);
    const score2 = (state.p2.currentHp / state.p2.hp) + (state.p2.currentSp / state.p2.sp) + (state.p2.currentDurability / state.p2.maxDurability);
    
    return score1 >= score2 ? state.p1.id : state.p2.id;
};