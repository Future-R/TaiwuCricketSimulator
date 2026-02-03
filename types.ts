
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
}

export interface SkillState {
  needleTriggered: { hp: boolean, sp: boolean, dur: boolean };
  jadeHoeStack: number;
  trueColorTriggered: boolean;
  grassBuff: { stat: 'bite' | 'strength' | 'vigor', value: number } | null;
  brocadeDebuff: { stat: 'deadliness' | 'defence' | 'counter', value: number } | null;
  fanShengStack: number; // Strength added
  jadeTailStack: number; // Bite added
  plumWingStack: number; // Vigor added
  eightFailuresStack: { bite: number, strength: number, vigor: number };
}

export interface RuntimeCricket extends CricketData {
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
}
