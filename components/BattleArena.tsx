
import React from 'react';
import { RuntimeCricket } from '../types';

interface Props {
  cricket: RuntimeCricket;
  isRed: boolean;
  showSkills?: boolean;
}

const StatLine = ({ label, value, max, color = "text-zinc-500" }: any) => (
  <div className={`flex justify-between items-center ${color} text-sm mb-1`}>
    <span>{label}:</span>
    <span className="font-mono font-bold text-zinc-200">{value}{max ? ` / ${max}` : ''}</span>
  </div>
);

const PercentLine = ({ label, value, color = "text-amber-500" }: any) => (
  <div className={`flex justify-between items-center ${color} text-sm mb-1`}>
    <span>{label}:</span>
    <span className="font-mono font-bold text-zinc-200">{value}%</span>
  </div>
);

export const CricketDetail: React.FC<Props> = ({ cricket, isRed, showSkills }) => {
  const nameColor = isRed ? 'text-red-400' : 'text-blue-400';
  const borderColor = isRed ? 'border-red-900/30' : 'border-blue-900/30';

  return (
    <div className={`flex flex-col items-center w-full max-w-sm mx-auto p-4 rounded-lg bg-zinc-900/50 border ${borderColor}`}>
       {/* Header */}
       <h2 className={`text-xl font-bold mb-2 ${nameColor}`}>{isRed ? '红方' : '蓝方'}</h2>

       <h3 className={`text-2xl font-bold mb-6 text-zinc-100 tracking-wide border-b border-zinc-700 pb-2 px-8`}>
           {cricket.name}
       </h3>

       {/* Stats Block */}
       <div className="w-full space-y-6 px-2">
          
          {/* Main Bars */}
          <div className="space-y-1">
             <StatLine label="耐久" value={cricket.currentDurability} max={cricket.maxDurability} color="text-zinc-500" />
             <StatLine label="耐力" value={cricket.currentHp} max={cricket.hp} color="text-orange-600" />
             <StatLine label="斗性" value={cricket.currentSp} max={cricket.sp} color="text-blue-600" />
          </div>

          {/* Combat Stats */}
          <div className="space-y-1 pt-4 border-t border-zinc-800">
             <StatLine label="气势" value={cricket.vigor - cricket.injuries.vigor} color="text-red-500" />
             <StatLine label="牙钳" value={cricket.bite - cricket.injuries.bite} color="text-red-500" />
             <StatLine label="角力" value={cricket.strength - cricket.injuries.strength} color="text-purple-500" />
          </div>

          {/* Percentages */}
          <div className="space-y-1 pt-4 border-t border-zinc-800">
             <PercentLine label="暴击概率" value={cricket.deadliness} color="text-zinc-400" />
             <PercentLine label="暴击增伤" value={cricket.critDamage} color="text-zinc-400" />
             <PercentLine label="格挡概率" value={cricket.defence} color="text-zinc-400" />
             <PercentLine label="格挡减伤" value={cricket.damageReduce} color="text-zinc-400" />
             <PercentLine label="反击概率" value={cricket.counter} color="text-zinc-400" />
             <PercentLine label="击伤概率" value={cricket.injuryOdds} color="text-zinc-400" />
          </div>

          {/* Active Skills */}
          {showSkills && cricket.activeSkills && cricket.activeSkills.length > 0 && (
             <div className="w-full pt-4 border-t border-zinc-800 mt-2">
                <h4 className="text-zinc-500 text-xs font-bold mb-2 uppercase tracking-wider">专属技能</h4>
                <div className="flex flex-wrap gap-2">
                    {cricket.activeSkills.map(skill => (
                        <div key={skill.id} className="px-3 py-1.5 bg-purple-900/30 border border-purple-700/50 rounded shadow-sm cursor-help hover:bg-purple-800/40 transition-colors" title={skill.dsl}>
                            <span className="text-purple-300 text-sm font-bold">{skill.name}</span>
                        </div>
                    ))}
                </div>
             </div>
          )}
       </div>
    </div>
  );
};
