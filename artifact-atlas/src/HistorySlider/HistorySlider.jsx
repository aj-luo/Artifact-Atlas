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
    <div style={{
      width: '100%',
      maxWidth: '900px',
      margin: '0 auto',
      padding: '20px',
      backgroundColor: 'transparent',
      borderRadius: '12px',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '12px',
        color: 'white',
        fontSize: '14px',
        fontWeight: 500,
      }}>
        <span>3000 BC</span>
        <span style={{ color: 'white', fontSize: '18px', fontWeight: 700 }}>{formatYear(value)}</span>
        <span>{currentYear} AD</span>
      </div>

        <input
            type="range"
            min="-3000"
            max={currentYear}
            step="1"
            value={value}
            onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              height: '12px',
              backgroundColor: '#e2e8f0',
              borderRadius: '999px',
              accentColor: '#334155',
              cursor: 'pointer',
            }}
        />

        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
          <span style={{ flex: 1, textAlign: 'left' }}>Ancient Era</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Year 0</span>
          <span style={{ flex: 1, textAlign: 'right' }}>Modern Era</span>
        </div>
        </div>
  );
};

export default HistorySlider