import React from 'react';

export default function TimeToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '240px' }}>
      <label style={{ fontWeight: '600' }}>
        {/* Adds "minute" or "minutes" depending on the value */}
        Time Limit: <span style={{ color: '#2563eb' }}>{value} {value === 1 ? 'minute' : 'minutes'}</span>
      </label>
      <input
        type="range"
        min="1"
        max="5"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
        <span>1 min</span>
        <span>5 min</span>
      </div>
    </div>
  );
}