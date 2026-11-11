import React from 'react';

export default function ScoreGauge({ score = 0, size = 120 }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  let color = '#EF4444'; // Red
  let label = 'Low Win Chance';
  let badgeBg = 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';

  if (safeScore >= 80) {
    color = '#10B981'; // Green
    label = 'Strong Case';
    badgeBg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
  } else if (safeScore >= 50) {
    color = '#F59E0B'; // Amber
    label = 'Moderate Case';
    badgeBg = 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300';
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-800"
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {safeScore}
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
            / 100
          </span>
        </div>
      </div>
      <div className={`mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeBg}`}>
        {label}
      </div>
    </div>
  );
}

