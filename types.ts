
export enum CricketGrade {
  Dumb = 9, // "Dumb" object (lowest)
  High = 1, // Highest grade
}

export interface CricketData {
  id: string;
  name: string;
  grade: number; // 1-9 (1 is best, 9 is dumb)
  hp: number; // 耐力 (Constitution/Max HP)
  sp: number; // 斗性 (Stamina/Max SP)
  vigor: number; // 气势
  strength: number; // 角力
  bite: number; // 牙钳
  deadliness: number; // 暴击 (Critical Chance)
  critDamage: number; // 增伤 (Critical Damage)
  injuryOdds: number; // 击伤/伤残 (Injury Chance)
  defence: number; // 防御 (Block Chance)
  damageReduce: number; // 减伤 (Block Reduction)
  counter: number; // 反击 (Counter Chance)
  skillIds?: string[]; // New: List of skills this cricket has
}

export interface SkillState {
  // Generic state storage for skills (counters, stacks, flags)
  [key: string]: any; 
}

export interface RuntimeCricket extends CricketData {
  uniqueId: string; // Unique instance ID for battle logic
  currentHp: number;
  currentSp: number;
  currentDurability: number;
  maxDurability: number;
  injuries: {
    vigor: number;
    strength: number;
    bite: number;
    hp: number;
    sp: number;
  };
  isDead: boolean;
  isLost: boolean; // Lost due to SP 0
  skillState: SkillState;
  activeSkills: SkillDefinition[]; // Resolved skills
}

export enum LogType {
  Info = 'info',
  Attack = 'attack',
  Crit = 'crit',
  Block = 'block',
  Counter = 'counter',
  Damage = 'damage',
  Effect = 'effect',
  Win = 'win',
  Lose = 'lose',
  Skill = 'skill',
  Shout = 'shout', // New: Skill Shout
}

export interface BattleLog {
  id: string;
  turn: number;
  message: string;
  type: LogType;
}

export enum Phase {
  Setup = 'SETUP',
  PreFight = 'PRE_FIGHT',
  RoundStart = 'ROUND_START',
  VigorCheck = 'VIGOR_CHECK',
  FirstHalf = 'FIRST_HALF',
  SecondHalf = 'SECOND_HALF',
  RoundEnd = 'ROUND_END',
  GameOver = 'GAME_OVER',
}

export interface CombatState {
  round: number;
  phase: Phase;
  logs: BattleLog[];
  p1: RuntimeCricket;
  p2: RuntimeCricket;
  winnerId: string | null;
  autoPlay: boolean;
  battleSpeed: number; // ms delay
  skillsEnabled: boolean;
  suppressLogs?: boolean; // Optimization for simulations
}

// --- Hook Contexts ---

export interface BattleContext {
  state: CombatState;
  owner: RuntimeCricket;
  opponent: RuntimeCricket;
  logs: { msg: string; type: LogType }[] | null; // Nullable for optimization
  getStat?: (target: RuntimeCricket, stat: 'vigor'|'strength'|'bite'|'deadliness'|'defence'|'counter'|'critDamage') => number;
}

export interface DamageContext extends BattleContext {
  hpDmg: number;
  spDmg: number;
  durDmg: number;
  isCrit: boolean;
  isBlocked: boolean;
  isCounter?: boolean;
  sourceType: 'vigor' | 'bite' | 'strength' | 'other';
  reflected?: boolean; // If true, this is a reflected attack
  actualHpDmg?: number;
  actualSpDmg?: number;
  rawHpDmg?: number;
}

export interface StatContext {
  owner: RuntimeCricket;
  opponent: RuntimeCricket;
  stat: 'vigor'|'strength'|'bite'|'deadliness'|'defence'|'counter'|'critDamage';
  baseValue: number;
}

// --- Skill Definition ---

export interface CompiledDSL {
  hooks: Map<string, any[]>; // HookName -> Instructions
}

export interface SkillDefinition {
  id: string;
  name: string;
  prob?: number; // Activation probability (0-100), optional now
  shout?: string; // Battle cry
  dsl?: string; // Natural Language DSL Configuration
  
  // Optimization Fields
  compiled?: CompiledDSL;
  meta?: {
    tianGuangProb?: number; // Pre-parsed probability for Tian Guang
    [key: string]: any;
  };

  // Hooks now receive the skill definition itself as the second argument
  onBattleStart?: (ctx: BattleContext, skill: SkillDefinition) => void;
  onRoundStart?: (ctx: BattleContext, skill: SkillDefinition) => void;
  onDefeat?: (ctx: BattleContext, skill: SkillDefinition) => void; // New: Trigger when defeated
  
  // Return modified stat value
  onStatCalculate?: (ctx: StatContext, skill: SkillDefinition) => number; 
  
  // Intercept incoming damage (Defender skills)
  // Returns modified DamageContext components (hp, sp, etc) or null if no change
  onBeforeReceiveDamage?: (ctx: DamageContext, skill: SkillDefinition) => Partial<DamageContext> | void;
  
  // Trigger after dealing damage (Attacker skills)
  onAfterDealDamage?: (ctx: DamageContext, skill: SkillDefinition) => void;
  
  // Trigger after receiving damage (Defender skills)
  onAfterReceiveDamage?: (ctx: DamageContext, skill: SkillDefinition) => void;

  // Trigger before performing an attack (Attacker skills) - e.g. prevent block/crit
  onBeforeAttack?: (ctx: BattleContext, skill: SkillDefinition) => { avoidBlock?: boolean, avoidCrit?: boolean, forceCrit?: boolean } | void;
}
