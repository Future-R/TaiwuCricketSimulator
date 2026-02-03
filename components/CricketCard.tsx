import React from 'react';
import { CricketData } from '../types';

interface Props {
  data: CricketData;
  isSelected: boolean;
  onClick: () => void;
}

export const CricketCard: React.FC<Props> = ({ data, isSelected, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        flex items-center gap-3 p-3 cursor-pointer border-b transition-colors
        ${isSelected 
          ? 'bg-amber-900/30 border-amber-600/50 text-amber-300' 
          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}
      `}
    >
      <div>
        <div className="font-bold text-sm">{data.name}</div>
        <div className="text-xs opacity-60">等级: {data.grade}</div>
      </div>
    </div>
  );
};