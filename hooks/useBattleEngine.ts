import { useState, useEffect, useRef, useCallback } from 'react';
import { CombatState, Phase, RuntimeCricket, LogType, CricketData } from '../types';
import { createRuntimeCricket, processPreFight, processVigorCheck, resolveStrike, checkProb, checkGameOver, runInstantBattle } from '../services/combatLogic';
import { CRICKET_TEMPLATES } from '../constants';

const DELAY = 800; // ms between steps

export const useBattleEngine = () => {
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [skillsEnabled, setSkillsEnabled] = useState(false);
  
  const [p1Initiative, setP1Initiative] = useState(false);
  const [lastHitWasCrit, setLastHitWasCrit] = useState(false);
  const [counterCount, setCounterCount] = useState(0);
  const [currentAttackerIsP1, setCurrentAttackerIsP1] = useState(false);
  const [simulationResults, setSimulationResults] = useState<{message: string, type: 'score' | 'winrate' | 'matrix'} | null>(null);
  const [matrixData, setMatrixData] = useState<{names: string[], grid: number[][], averages: number[]} | null>(null);

  // Initialize Visual Battle
  const startBattle = (c1: CricketData, c2: CricketData) => {
    setCombatState({
      round: 0,
      phase: Phase.Setup,
      logs: [],
      p1: createRuntimeCricket(c1),
      p2: createRuntimeCricket(c2),
      winnerId: null,
      autoPlay: true,
      battleSpeed: DELAY,
      skillsEnabled: skillsEnabled
    });
    setIsPlaying(true);
    setCounterCount(0);
    setLastHitWasCrit(false);
    setSimulationResults(null);
    setMatrixData(null);
  };

  const resetBattle = () => {
      setCombatState(null);
      setIsPlaying(false);
      setSimulationResults(null);
      setMatrixData(null);
      setIsCalculating(false);
  };

  // Mass Simulation
  const simulateBattles = (c1: CricketData, c2: CricketData, count: number) => {
    setIsPlaying(false);
    setCombatState(null);
    setMatrixData(null);
    
    let p1Wins = 0;
    for(let i = 0; i < count; i++) {
        const winnerId = runInstantBattle(c1, c2, skillsEnabled);
        if(winnerId === c1.id) p1Wins++;
    }
    const p2Wins = count - p1Wins;
    setSimulationResults({
        message: `${p1Wins} : ${p2Wins}`,
        type: 'score'
    });
  };

  // Find Win Rate vs All
  const calculateWinRates = async (c1: CricketData) => {
      setIsPlaying(false);
      setCombatState(null);
      setMatrixData(null);
      setIsCalculating(true);
      setProgress(0);
      
      const results: string[] = [];
      const opponents = CRICKET_TEMPLATES.filter(c => c.id !== c1.id);
      
      // Async loop
      for(let i=0; i<opponents.length; i++) {
          const opp = opponents[i];
          let wins = 0;
          const BATTLES = 1000;
          for(let k=0; k<BATTLES; k++) {
              const wid = runInstantBattle(c1, opp, skillsEnabled);
              if(wid === c1.id) wins++;
          }
          const rate = ((wins / BATTLES) * 100).toFixed(1);
          results.push(`${opp.name}: ${rate}%`);

          // Update progress
          setProgress(Math.round(((i + 1) / opponents.length) * 100));
          await new Promise(r => setTimeout(r, 0));
      }

      setSimulationResults({
          message: results.join('\n'),
          type: 'winrate'
      });
      setIsCalculating(false);
  };

  // Calculate Matrix of All vs All (10000 rounds)
  const calculateMatrixWinRates = async () => {
      setIsPlaying(false);
      setCombatState(null);
      setIsCalculating(true);
      setProgress(0);
      
      const crickets = [...CRICKET_TEMPLATES]; 
      const count = crickets.length;
      const tempData: { name: string, rates: number[], average: number }[] = [];
      const BATTLES = 10000;

      for(let i = 0; i < count; i++) {
          const row: number[] = [];
          let totalWinRate = 0;
          let opponentsCount = 0;

          // Process one row fully then yield
          for(let j = 0; j < count; j++) {
              if (crickets[i].id === crickets[j].id) {
                  row.push(-1); 
              } else {
                  let wins = 0;
                  // Inner loop: run battles
                  for(let k = 0; k < BATTLES; k++) {
                      const wid = runInstantBattle(crickets[i], crickets[j], skillsEnabled);
                      if (wid === crickets[i].id) wins++;
                  }
                  const rate = Math.round((wins / BATTLES) * 100);
                  row.push(rate);
                  totalWinRate += rate;
                  opponentsCount++;
              }
          }
          const avg = opponentsCount > 0 ? totalWinRate / opponentsCount : 0;
          tempData.push({
              name: crickets[i].name,
              rates: row,
              average: parseFloat(avg.toFixed(1))
          });

          // Yield to UI and update progress
          setProgress(Math.round(((i + 1) / count) * 100));
          await new Promise(r => setTimeout(r, 0));
      }

      // Sort by Average Win Rate Descending
      tempData.sort((a, b) => b.average - a.average);

      // Re-map the grid based on sorted names
      const newNames = tempData.map(d => d.name);
      const nameToNewIndex = new Map<string, number>();
      newNames.forEach((n, idx) => nameToNewIndex.set(n, idx));

      const finalGrid: number[][] = [];
      for(let i = 0; i < count; i++) {
          const rowData = tempData[i]; // Row for i-th strongest
          const oldRates = rowData.rates;
          const newRowRates: number[] = new Array(count).fill(0);
          
          for(let oldColIdx = 0; oldColIdx < count; oldColIdx++) {
              const opponentName = crickets[oldColIdx].name;
              const value = oldRates[oldColIdx];
              const newColIdx = nameToNewIndex.get(opponentName)!;
              newRowRates[newColIdx] = value;
          }
          finalGrid.push(newRowRates);
      }

      setMatrixData({
          names: newNames,
          grid: finalGrid,
          averages: tempData.map(d => d.average)
      });

      setSimulationResults({
          message: "Full Win Rate Matrix",
          type: 'matrix'
      });
      setIsCalculating(false);
  };

  const stepRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLogs = (logs: { msg: string; type: LogType }[]) => {
    setCombatState(prev => {
        if (!prev) return null;
        const newLogs = logs.map(l => ({
            id: Math.random().toString(36).substr(2, 9),
            turn: prev.round,
            message: l.msg,
            type: l.type
        }));
        return { ...prev, logs: [...prev.logs, ...newLogs] };
    });
  };

  const nextStep = useCallback(() => {
    setCombatState((prev) => {
      if (!prev || prev.winnerId) return prev;

      let newState = { ...prev };
      newState.skillsEnabled = skillsEnabled;

      switch (newState.phase) {
        case Phase.Setup:
          newState.phase = Phase.PreFight;
          return newState;

        case Phase.PreFight:
          return processPreFight(newState);

        case Phase.VigorCheck: // Start of Round
          const result = processVigorCheck(newState);
          setP1Initiative(result.p1Initiative);
          // Determine who attacks first in First Half
          setCurrentAttackerIsP1(result.p1Initiative);
          return { ...result.state, phase: Phase.FirstHalf };

        case Phase.FirstHalf:
        case Phase.SecondHalf:
          const isFirstHalf = newState.phase === Phase.FirstHalf;
          // const isInitiatorP1 = isFirstHalf ? p1Initiative : !p1Initiative; // Removed unused variable
          
          const attacker = currentAttackerIsP1 ? newState.p1 : newState.p2;
          const defender = currentAttackerIsP1 ? newState.p2 : newState.p1;
          const isInitialAttack = counterCount === 0;
          
          // Manual calculation to match `getStat`
          const getStatLocal = (c: RuntimeCricket, stat: 'bite'|'strength') => {
             let val = c[stat];
             if(stat === 'bite') val -= c.injuries.bite;
             if(stat === 'strength') val -= c.injuries.strength;
             
             if(stat === 'strength') val += c.skillState.fanShengStack;
             if(stat === 'bite') val += c.skillState.jadeTailStack;
             
             if(stat === 'bite') val += c.skillState.eightFailuresStack.bite;
             if(stat === 'strength') val += c.skillState.eightFailuresStack.strength;
             
             if(c.skillState.grassBuff?.stat === stat) val = Math.ceil(val * 2);
             if(c.skillState.trueColorTriggered) val = Math.ceil(val * 1.5);
             
             return Math.max(0, val);
          };
          
          let counterChance = attacker.counter;
          if (attacker.skillState.trueColorTriggered) counterChance = Math.ceil(counterChance * 1.5);
          if (attacker.skillState.brocadeDebuff?.stat === 'counter') counterChance = 0;

          if (!isInitialAttack) {
              const chance = counterChance - (counterCount - 1) * 5;
              if (!checkProb(chance)) {
                  addLogs([{ msg: `【反击失败】${attacker.name} 未能反击，攻势结束。`, type: LogType.Info }]);
                  
                  setCounterCount(0);
                  setLastHitWasCrit(false);

                  if (isFirstHalf) {
                       addLogs([{ msg: "--- 攻守互换 ---", type: LogType.Info }]);
                       setCurrentAttackerIsP1(!p1Initiative); 
                       return { ...newState, phase: Phase.SecondHalf };
                  } else {
                       return { ...newState, phase: Phase.RoundEnd };
                  }
              } else {
                  addLogs([{ msg: `【反击】${attacker.name} 发动反击! (概率: ${chance}%)`, type: LogType.Counter }]);
              }
          }

          const useBite = currentAttackerIsP1 === (isFirstHalf ? p1Initiative : !p1Initiative);
          const statVal = useBite 
            ? getStatLocal(attacker, 'bite')
            : getStatLocal(attacker, 'strength');

          const strikeRes = resolveStrike(attacker, defender, statVal, lastHitWasCrit, false, skillsEnabled);
          
          if (currentAttackerIsP1) {
              newState.p1 = strikeRes.att;
              newState.p2 = strikeRes.def;
          } else {
              newState.p2 = strikeRes.att;
              newState.p1 = strikeRes.def;
          }
          
          const newLogObjs = strikeRes.logs.map(l => ({
            id: Math.random().toString(), turn: newState.round, message: l.msg, type: l.type
          }));
          newState.logs = [...newState.logs, ...newLogObjs];

          if (checkGameOver(newState.p1, newState.p2)) {
              const winnerId = checkGameOver(newState.p1, newState.p2)!;
              setIsPlaying(false);
              
              const winner = winnerId === newState.p1.id ? newState.p1 : newState.p2;
              const msg = `战斗结束！胜者：${winner.name} (耐久: ${winner.currentDurability}/${winner.maxDurability}, 耐力: ${winner.currentHp}/${winner.hp}, 斗性: ${winner.currentSp}/${winner.sp})`;
              
              const finalLog = {
                id: Math.random().toString(), turn: newState.round, message: msg, type: LogType.Win
              };
              newState.logs = [...newState.logs, finalLog];
              
              return { ...newState, winnerId: winnerId, phase: Phase.GameOver, logs: newState.logs };
          }

          setLastHitWasCrit(strikeRes.isCrit);
          setCounterCount(c => c + 1);
          setCurrentAttackerIsP1(!currentAttackerIsP1);
          
          return newState;

        case Phase.RoundEnd:
          newState.round += 1;
          newState.phase = Phase.VigorCheck;
          return newState;
          
        case Phase.GameOver:
          setIsPlaying(false);
          return newState;

        default:
          return newState;
      }
    });
  }, [p1Initiative, counterCount, currentAttackerIsP1, lastHitWasCrit, skillsEnabled]);

  useEffect(() => {
    if (combatState?.winnerId) {
        setIsPlaying(false);
        if (stepRef.current) clearTimeout(stepRef.current);
        return;
    }

    if (isPlaying) {
      stepRef.current = setTimeout(nextStep, DELAY); 
    }
    return () => {
      if (stepRef.current) clearTimeout(stepRef.current);
    };
  }, [isPlaying, combatState, nextStep]);

  return {
    combatState,
    startBattle,
    simulateBattles,
    calculateWinRates,
    calculateMatrixWinRates,
    simulationResults,
    setSimulationResults,
    matrixData,
    isPlaying,
    setIsPlaying,
    isCalculating,
    progress,
    resetBattle,
    skillsEnabled,
    setSkillsEnabled
  };
};