import React from 'react';

export default function RangeToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '240px' }}>
      <label style={{ fontWeight: '600' }}>
        Players: <span style={{ color: '#2563eb' }}>{value}</span>
      </label>
      <input
        type="range"
        min="3"
        max="10"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
        <span>3</span>
        <span>10</span>
      </div>
    </div>
  );
}