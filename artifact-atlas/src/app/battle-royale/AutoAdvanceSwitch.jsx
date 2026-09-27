'use client';

export default function AutoAdvanceSwitch({ checked, disabled = false, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Auto-advance rounds"
      className="br-auto-advance-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>Auto-advance rounds</span>
      <span className="br-switch-control" aria-hidden="true">
        <span>{checked ? 'On' : 'Off'}</span>
        <span className="br-switch-track"><span className="br-switch-thumb" /></span>
      </span>
    </button>
  );
}
