
import React, { useEffect, useRef } from 'react';
import { BattleLog, LogType } from '../types';

interface Props {
  logs: BattleLog[];
}

export const BattleLogViewer: React.FC<Props> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogStyle = (type: LogType) => {
    switch (type) {
      case LogType.Attack: return 'text-zinc-300';
      case LogType.Crit: return 'text-red-400 font-bold';
      case LogType.Block: return 'text-zinc-500';
      case LogType.Damage: return 'text-orange-400';
      case LogType.Counter: return 'text-purple-400';
      case LogType.Win: return 'text-amber-400 font-black text-lg py-3 border-t border-zinc-700 mt-2 text-center';
      case LogType.Effect: return 'text-rose-400';
      case LogType.Info: return 'text-blue-400 font-bold mt-3 mb-1';
      case LogType.Shout: return 'text-white font-serif text-base py-1 px-4 my-1 border-l-2 border-amber-500 bg-amber-900/20';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="h-full overflow-y-auto font-sans text-sm leading-6 bg-zinc-900 border-l border-zinc-800">
      <div className="flex flex-col gap-1 p-4">
        {logs.length === 0 && <div className="text-zinc-600 text-center mt-10">准备战斗...</div>}
        {logs.map((log) => (
          <div key={log.id} className={`${getLogStyle(log.type)}`}>
            {log.message}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
