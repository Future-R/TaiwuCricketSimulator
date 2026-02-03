
import React, { useState, useMemo, useRef } from 'react';
import { CRICKET_TEMPLATES } from './constants';
import { createRuntimeCricket } from './services/combatLogic';
import { SKILL_REGISTRY } from './services/skillRegistry';
import { CricketCard } from './components/CricketCard';
import { CricketDetail } from './components/BattleArena';
import { BattleLogViewer } from './components/BattleLog';
import { useBattleEngine } from './hooks/useBattleEngine';
import { Search, Zap, ZapOff, Loader2, List, Swords, ScrollText, Upload, Download, FileJson, Settings2 } from 'lucide-react';
import { CricketData, SkillDefinition } from './types';

const App: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customCrickets, setCustomCrickets] = useState<CricketData[]>([]);
  // We use a dummy state to force re-renders when skills are updated, as SKILL_REGISTRY is mutable
  const [skillRegistryVersion, setSkillRegistryVersion] = useState(0); 
  const [simCount, setSimCount] = useState<number>(10000);
  
  // Combine defaults with imported
  const allCrickets = useMemo(() => [...CRICKET_TEMPLATES, ...customCrickets], [customCrickets]);

  // Update Default Selection
  const [p1Data, setP1Data] = useState(CRICKET_TEMPLATES.find(c => c.id === 'three_prince') || CRICKET_TEMPLATES[0]);
  const [p2Data, setP2Data] = useState(CRICKET_TEMPLATES.find(c => c.id === 'sky_blue') || CRICKET_TEMPLATES[1]);
  
  const [selectionTarget, setSelectionTarget] = useState<'p1' | 'p2'>('p1'); 
  const [mobileTab, setMobileTab] = useState<'list' | 'arena' | 'logs'>('arena');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  const { 
      combatState, startBattle, simulateBattles, calculateWinRates, calculateMatrixWinRates,
      simulationResults, matrixData, isPlaying, isCalculating, progress, resetBattle,
      skillsEnabled, setSkillsEnabled
  } = useBattleEngine();

  const filteredCrickets = allCrickets.filter(c => c.name.includes(searchTerm));

  const handleSelect = (data: any) => {
      if (isPlaying || isCalculating) return;
      if (selectionTarget === 'p1') setP1Data(data);
      else setP2Data(data);
      resetBattle();
  };

  const handleStartVisualBattle = () => { startBattle(p1Data, p2Data); setMobileTab('logs'); };
  const handleSimulateScore = () => { simulateBattles(p1Data, p2Data, simCount); setMobileTab('logs'); };
  const handleCalculateWinRates = async () => { await calculateWinRates(p1Data, simCount); setMobileTab('logs'); };
  const handleMatrixWinRates = async () => { await calculateMatrixWinRates(simCount); };

  const handleSimCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = parseInt(e.target.value);
      if (isNaN(val)) val = 300;
      setSimCount(val);
  };

  const handleSimCountBlur = () => {
      let val = simCount;
      if (val < 300) val = 300;
      if (val > 72900) val = 72900;
      setSimCount(val);
  }

  const previewP1 = useMemo(() => createRuntimeCricket(p1Data), [p1Data, skillRegistryVersion]);
  const previewP2 = useMemo(() => createRuntimeCricket(p2Data), [p2Data, skillRegistryVersion]);
  const displayP1 = combatState ? combatState.p1 : previewP1;
  const displayP2 = combatState ? combatState.p2 : previewP2;
  const showMatrix = simulationResults?.type === 'matrix' && matrixData;

  // Import Logic
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (Array.isArray(json)) {
                  setCustomCrickets(prev => [...prev, ...json]);
                  alert(`成功导入 ${json.length} 只促织配置！`);
              }
          } catch (err) {
              alert('导入失败，JSON格式错误');
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(allCrickets, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "促织属性配置.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Skill Import/Export Logic
  const handleImportSkills = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (Array.isArray(json)) {
                  let updatedCount = 0;
                  // Update existing registry values. 
                  json.forEach((s: Partial<SkillDefinition>) => {
                      if (s.id && SKILL_REGISTRY[s.id]) {
                          if (s.name) SKILL_REGISTRY[s.id].name = s.name;
                          if (s.prob !== undefined) SKILL_REGISTRY[s.id].prob = s.prob;
                          if (s.dsl) SKILL_REGISTRY[s.id].dsl = s.dsl; // Allow DSL import
                          if (s.shout) SKILL_REGISTRY[s.id].shout = s.shout;
                          updatedCount++;
                      }
                  });
                  setSkillRegistryVersion(v => v + 1); // Trigger re-render of previews
                  alert(`成功更新 ${updatedCount} 个技能配置！`);
              }
          } catch (err) {
              alert('技能导入失败，JSON格式错误');
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleExportSkills = () => {
      // Export serializable parts (ID, Name, Prob, Shout, DSL)
      const exportableSkills = Object.values(SKILL_REGISTRY).map(s => ({
          id: s.id,
          name: s.name,
          prob: s.prob,
          shout: s.shout,
          dsl: s.dsl
      }));
      const dataStr = JSON.stringify(exportableSkills, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = "技能概率配置.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      
      {/* MAIN LAYOUT CONTAINER */}
      <div className="flex-1 flex overflow-hidden relative">

          {/* 1. LEFT SIDEBAR */}
          <div className={`
              flex-col border-r border-zinc-800 bg-zinc-900 flex-shrink-0
              lg:flex lg:w-64 lg:static
              ${mobileTab === 'list' ? 'flex absolute inset-0 z-20 w-full' : 'hidden'}
          `}>
            <div className="p-4 border-b border-zinc-800 bg-zinc-900 space-y-2">
               
               {/* Config Buttons: Cricket Data */}
               <div className="flex gap-2">
                   <button 
                       onClick={() => fileInputRef.current?.click()}
                       className="flex-1 py-1.5 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-400"
                       title="导入促织数据"
                   >
                       <Download size={14} /> 导入配置
                   </button>
                   <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
                   
                   <button 
                       onClick={handleExport}
                       className="flex-1 py-1.5 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-400"
                       title="导出促织数据"
                   >
                       <Upload size={14} /> 导出配置
                   </button>
               </div>

               {/* Config Buttons: Skill Data */}
               <div className="flex gap-2">
                   <button 
                       onClick={() => skillFileInputRef.current?.click()}
                       className="flex-1 py-1.5 flex items-center justify-center gap-2 bg-zinc-800/50 hover:bg-zinc-700 border border-zinc-700/50 rounded text-xs text-purple-400/70"
                       title="导入技能配置(概率/名称)"
                   >
                       <FileJson size={14} /> 导入技能
                   </button>
                   <input type="file" accept=".json" className="hidden" ref={skillFileInputRef} onChange={handleImportSkills} />
                   
                   <button 
                       onClick={handleExportSkills}
                       className="flex-1 py-1.5 flex items-center justify-center gap-2 bg-zinc-800/50 hover:bg-zinc-700 border border-zinc-700/50 rounded text-xs text-purple-400/70"
                       title="导出技能配置(概率/名称)"
                   >
                       <FileJson size={14} /> 导出技能
                   </button>
               </div>

               <div className="h-2"></div>

               {/* Search Bar - Moved to Bottom */}
               <div className="relative">
                 <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
                 <input 
                   type="text" placeholder="查找促织" 
                   className="w-full pl-9 pr-3 py-2 border border-zinc-700 bg-zinc-800 text-zinc-200 rounded text-sm focus:outline-none focus:border-amber-600 placeholder-zinc-500"
                   value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                 />
               </div>
            </div>
            
            <div className="flex text-xs font-bold border-b border-zinc-800">
                <button 
                    onClick={() => setSelectionTarget('p1')}
                    className={`flex-1 py-3 transition-colors ${selectionTarget === 'p1' ? 'bg-red-900/20 text-red-400 border-b-2 border-red-600' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'}`}
                >
                    选择红方
                </button>
                <button 
                    onClick={() => setSelectionTarget('p2')}
                    className={`flex-1 py-3 transition-colors ${selectionTarget === 'p2' ? 'bg-blue-900/20 text-blue-400 border-b-2 border-blue-600' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'}`}
                >
                    选择蓝方
                </button>
            </div>

            <div className={`flex-1 overflow-y-auto custom-scrollbar ${(isPlaying || isCalculating) ? 'opacity-50 pointer-events-none' : ''}`}>
              {filteredCrickets.map((c, idx) => (
                <CricketCard 
                  key={`${c.id}-${idx}`} 
                  data={c} 
                  isSelected={(selectionTarget === 'p1' ? p1Data.id : p2Data.id) === c.id} 
                  onClick={() => handleSelect(c)} 
                />
              ))}
            </div>
          </div>

          {/* 2. MAIN CONTENT (Arena / Matrix) */}
          {showMatrix ? (
            <div className="absolute inset-0 z-30 bg-zinc-950 flex flex-col flex-1 overflow-auto p-4 lg:p-6 lg:static">
                <h2 className="text-xl lg:text-2xl font-bold text-amber-500 mb-4 flex justify-between items-center sticky top-0 bg-zinc-950 z-20 py-2">
                    <span className="text-sm lg:text-xl">全员对战胜率表 (各{simCount}场)</span>
                    <button onClick={resetBattle} className="px-4 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700">关闭</button>
                </h2>
                <div className="overflow-x-auto border border-zinc-800 rounded flex-1">
                    <table className="min-w-full text-xs text-center border-collapse">
                        <thead>
                            <tr>
                                <th className="p-2 bg-zinc-900 border-b border-zinc-800 border-r border-zinc-800 sticky left-0 z-20 text-amber-400 font-bold min-w-[80px] shadow-lg">促织</th>
                                <th className="p-2 bg-zinc-900 border-b border-zinc-800 border-r border-zinc-800 sticky top-0 z-10 text-emerald-400 font-bold">平均%</th>
                                {matrixData.names.map((name, i) => <th key={i} className="p-2 bg-zinc-900 border-b border-zinc-800 border-r border-zinc-800 text-zinc-400 writing-vertical-lr sticky top-0">{name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {matrixData.names.map((rowName, rIndex) => (
                                <tr key={rIndex} className="hover:bg-zinc-900/30">
                                    <td className="p-2 bg-zinc-900 border-r border-b border-zinc-800 sticky left-0 z-10 font-bold text-zinc-300 shadow-md whitespace-nowrap">{rowName}</td>
                                    <td className="p-2 bg-emerald-900/20 border-r border-b border-zinc-800 font-bold text-emerald-400">{matrixData.averages[rIndex]}%</td>
                                    {matrixData.grid[rIndex].map((rate, cIndex) => {
                                        const isSelf = rate === -1;
                                        let cellColor = 'text-zinc-700';
                                        if (!isSelf) {
                                            if (rate >= 80) cellColor = 'text-red-400 font-bold bg-red-900/10';
                                            else if (rate >= 60) cellColor = 'text-orange-300';
                                            else if (rate >= 40) cellColor = 'text-zinc-300';
                                            else if (rate >= 20) cellColor = 'text-blue-300';
                                            else cellColor = 'text-blue-500 bg-blue-900/10';
                                        }
                                        return <td key={cIndex} className={`p-1 border-r border-b border-zinc-800 ${cellColor}`}>{isSelf ? '-' : rate}</td>
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          ) : (
            <div className={`flex-col flex-1 min-w-0 bg-zinc-950 lg:flex lg:flex-row ${mobileTab === 'arena' ? 'flex w-full' : 'hidden'}`}>
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden h-full">
                    <div className="flex-1 flex flex-row lg:contents min-h-0 order-1 overflow-y-auto lg:overflow-visible">
                        <div className="flex-1 p-2 lg:p-4 lg:overflow-y-auto lg:border-r border-zinc-800 lg:order-1 border-r lg:border-r-0 border-zinc-800 min-w-0">
                            <CricketDetail cricket={displayP1} isRed={true} />
                        </div>
                        <div className="flex-1 p-2 lg:p-4 lg:overflow-y-auto lg:order-3 min-w-0">
                            <CricketDetail cricket={displayP2} isRed={false} />
                        </div>
                    </div>
                    <div className="w-full lg:w-48 flex flex-col items-center p-4 border-t lg:border-t-0 lg:border-r border-zinc-800 bg-zinc-900 z-10 shadow-lg order-2 lg:order-2 shrink-0">
                        <div className="space-y-3 w-full">
                            <button
                                onClick={() => setSkillsEnabled(!skillsEnabled)} disabled={isPlaying || isCalculating}
                                className={`w-full py-2 flex items-center justify-center gap-2 rounded text-xs font-bold border transition-colors ${skillsEnabled ? 'bg-purple-900/30 border-purple-600 text-purple-300' : 'bg-zinc-800 border-zinc-600 text-zinc-500'}`}
                            >
                                {skillsEnabled ? <Zap size={14} /> : <ZapOff size={14} />} {skillsEnabled ? '技能已开启' : '技能已关闭'}
                            </button>
                            <div className="h-px bg-zinc-800 w-full my-2"></div>
                            <button onClick={handleStartVisualBattle} disabled={isPlaying || isCalculating} className={`w-full py-2 rounded text-sm font-bold shadow transition-all ${isPlaying ? 'bg-zinc-700 text-zinc-500' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}>{isPlaying ? '决斗中...' : '模拟决斗'}</button>
                            
                            <div className="w-full pt-2">
                                <div className="flex items-center gap-2 mb-1 text-xs text-zinc-500">
                                    <Settings2 size={12} />
                                    <span>模拟场次 (300-72900)</span>
                                </div>
                                <input 
                                    type="number" 
                                    min={300} 
                                    max={72900} 
                                    value={simCount} 
                                    onChange={handleSimCountChange}
                                    onBlur={handleSimCountBlur}
                                    disabled={isPlaying || isCalculating}
                                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-amber-600 text-center"
                                />
                            </div>

                            <button onClick={handleSimulateScore} disabled={isPlaying || isCalculating} className="w-full py-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 rounded text-xs">模拟{simCount}场</button>
                            <div className="flex gap-1 mt-2">
                                <button onClick={handleCalculateWinRates} disabled={isPlaying || isCalculating} className="flex-1 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-900 text-red-300 rounded text-xs font-bold">单体全胜率</button>
                            </div>
                            <button onClick={handleMatrixWinRates} disabled={isPlaying || isCalculating} className="w-full py-2 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-900 text-blue-300 rounded text-xs font-bold">全员胜率表</button>
                            
                            {isCalculating && (
                              <div className="w-full mt-2">
                                 <div className="flex items-center justify-between text-xs text-zinc-400 mb-1"><span>计算中...</span><span>{progress}%</span></div>
                                 <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%`}}/></div>
                              </div>
                            )}

                            <button onClick={resetBattle} className="w-full py-2 bg-zinc-950 hover:bg-black text-zinc-500 rounded text-xs mt-4 border border-zinc-800">还原促织状态</button>
                        </div>
                        <div className="mt-6 flex flex-col items-center justify-center">
                            {isCalculating ? (<div className="flex flex-col items-center gap-3"><Loader2 className="animate-spin text-amber-500" size={32} /><div className="text-zinc-500 text-xs font-mono">正在模拟战斗...</div></div>) : simulationResults?.type === 'score' ? (<div className="text-4xl font-mono font-bold text-amber-500 tracking-wider drop-shadow-md">{simulationResults.message}</div>) : (<div className="text-4xl font-mono font-bold text-zinc-700 tracking-wider">VS</div>)}
                        </div>
                    </div>
                    <div className="h-16 lg:hidden shrink-0 order-3"></div>
                </div>
            </div>
          )}

          {/* 3. RIGHT SIDEBAR (Logs) */}
          <div className={`flex-col bg-zinc-900 lg:w-96 lg:flex-shrink-0 border-l border-zinc-800 lg:flex lg:static ${mobileTab === 'logs' ? 'flex absolute inset-0 z-20 w-full' : 'hidden'}`}>
             <div className="p-3 border-b border-zinc-800 bg-zinc-900 font-bold text-zinc-400 text-sm">{simulationResults?.type === 'winrate' ? `胜率分析 (${simCount}场)` : '战斗过程记录'}</div>
             <div className="flex-1 overflow-hidden relative bg-zinc-900">
                 {simulationResults?.type === 'winrate' ? (<div className="p-4 h-full overflow-y-auto whitespace-pre-line font-mono text-sm leading-6 text-zinc-300">{simulationResults.message}</div>) : (<BattleLogViewer logs={combatState?.logs || []} />)}
             </div>
          </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      {!showMatrix && (
          <div className="lg:hidden flex border-t border-zinc-800 bg-zinc-900 pb-4 pt-1 px-1 z-30">
              <button onClick={() => setMobileTab('list')} className={`flex-1 py-2 flex flex-col items-center justify-center gap-1 rounded-md ${mobileTab === 'list' ? 'text-amber-500 bg-zinc-800' : 'text-zinc-500'}`}><List size={20} /><span className="text-[10px] font-bold">列表</span></button>
              <button onClick={() => setMobileTab('arena')} className={`flex-1 py-2 flex flex-col items-center justify-center gap-1 rounded-md ${mobileTab === 'arena' ? 'text-amber-500 bg-zinc-800' : 'text-zinc-500'}`}><Swords size={20} /><span className="text-[10px] font-bold">对战</span></button>
              <button onClick={() => setMobileTab('logs')} className={`flex-1 py-2 flex flex-col items-center justify-center gap-1 rounded-md ${mobileTab === 'logs' ? 'text-amber-500 bg-zinc-800' : 'text-zinc-500'}`}><ScrollText size={20} /><span className="text-[10px] font-bold">记录</span></button>
          </div>
      )}
    </div>
  );
};

export default App;
