'use client';

import { useRef } from 'react';

export default function BattleRoyaleHelp() {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="br-help-trigger"
      aria-label="Battle Royale instructions"
      aria-haspopup="dialog"
      onClick={() => dialogRef.current?.showModal()}
    >
      ?
    </button>
    <dialog
      ref={dialogRef}
      className="br-help-dialog"
      aria-labelledby="br-help-title"
      onClose={() => triggerRef.current?.focus()}
    >
      <div className="br-help-header">
        <h2 id="br-help-title">How to play Battle Royale</h2>
        <button
          type="button"
          className="br-help-close"
          aria-label="Close instructions"
          onClick={() => dialogRef.current?.close()}
        >
          ×
        </button>
      </div>
      <div className="br-dialog-content">
      <p>Before the round timer ends, guess the artifact’s country of origin and a year.</p>
      <ul>
        <li><strong>Place:</strong> Start with 2,500 points. Lose one point for each rounded kilometer between the guessed and correct countries’ capitals.</li>
        <li><strong>Time:</strong> Start with 2,500 points. Lose 25 points for each year your guess falls outside the artifact’s date range.</li>
      </ul>
      <p>Each part stops at zero, for a maximum of 5,000 points per round.</p>
      <p>After each round, you lose HP equal to the difference between your score and the round’s best score. A missed guess scores zero. You’re eliminated when your HP reaches zero.</p>
      </div>
    </dialog>
  </>;
}
