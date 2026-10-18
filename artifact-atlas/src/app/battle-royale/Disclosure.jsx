'use client';

import { useId, useState } from 'react';

export default function Disclosure({ label, className = '', children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={`br-disclosure ${className}${open ? ' is-open' : ''}`}>
    <button type="button" className="br-disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">{open ? '▾' : '▸'}</span> {label}
    </button>
    <div id={id} className="br-list-scroll br-reveal-players" role="region" aria-label={label} tabIndex={open ? 0 : undefined} hidden={!open}>{children}</div>
  </div>;
}
