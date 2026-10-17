import React from 'react';

export default function RangeToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <label style={{ fontWeight: '600' }}>
        Players: <span style={{ color: '#ffffff' }}>{value}</span>
      </label>
      <input
        type="range"
        min="3"
        max="10"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ cursor: 'pointer', accentColor: '#ffffff' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)' }}>
        <span>3</span>
        <span>10</span>
      </div>
    </div>
  );
}
