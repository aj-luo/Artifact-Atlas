import React, { useState } from 'react';

const HistorySlider = ({ value, onYearChange }) => {

  const currentYear = new Date().getFullYear();

  // Helper to turn -3000 into "3000 BC" and 2026 into "2026 AD"
  const formatYear = (year) => {
    if (year < 0) {
      return `${Math.abs(year)} BC`;
    } else if (year === 0) {
      return "1 AD"; // History technically skips Year 0
    } else {
      return `${year} AD`;
    }
  };

  return (
    <div className="w-full max-w-4xl p-8 bg-slate-50 rounded-xl shadow-sm">
        <div className="flex justify-between mb-4 text-sm font-medium text-slate-500">
            <span>3000 BC</span>
            {/* 1. Changed text-blue-600 to text-slate-800 or amber-700 */}
            <span className="text-slate-800 text-lg font-bold">{formatYear(value)}</span>
            <span>{currentYear} AD</span>
        </div>

        <input
            type="range"
            min="-3000"
            max={currentYear}
            step="1"
            value={value}
            onChange={(e) => onYearChange(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#414750' }} 
        />

        <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>Ancient Era</span>
            <span>Middle Ages</span>
            <span>Modern Era</span>
        </div>
        </div>
  );
};

export default HistorySlider