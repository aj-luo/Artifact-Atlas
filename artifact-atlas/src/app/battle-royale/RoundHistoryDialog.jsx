'use client';

import { useEffect, useRef } from 'react';
import RoundResultCard from './RoundResultCard';

export default function RoundHistoryDialog({ rounds, playerId, onClose }) {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    triggerRef.current ??= document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { if (!dialog.isConnected) triggerRef.current?.focus(); };
  }, []);

  return <dialog ref={dialogRef} className="br-help-dialog br-round-history-dialog" aria-labelledby="br-round-history-title" onClose={onClose}>
    <div className="br-help-header">
      <h2 id="br-round-history-title">Round History</h2>
      <button className="br-help-close" aria-label="Close round history" onClick={onClose}>×</button>
    </div>
    <div className="br-dialog-content br-history-list">
      {[...rounds].reverse().map(round => <RoundResultCard key={round.round} round={round} playerId={playerId} history />)}
      {!rounds.length && <p>No completed rounds yet.</p>}
    </div>
  </dialog>;
}
