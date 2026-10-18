'use client'
import Disclosure from './Disclosure';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
countries.registerLocale(enLocale);
const formatYear = y => y == null ? '?' : y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
const isoToCountryName = (iso3) => {
  if (!iso3) return '?';
  const alpha2 = countries.alpha3ToAlpha2(iso3);
  return countries.getName(alpha2, 'en') ?? iso3;
};

const formatAnswerDate = (round) => (
  round.artifactEndYear !== round.artifactBeginYear
    ? `${formatYear(round.artifactBeginYear)} – ${formatYear(round.artifactEndYear)}`
    : formatYear(round.artifactBeginYear)
);

export default function RoundResultCard({ round, playerId, history = false }) {
  const players = [...round.guesses].sort((a, b) => b.totalScore - a.totalScore);
  const metUrl = round.artifactObjectId
    ? `https://www.metmuseum.org/art/collection/search/${encodeURIComponent(round.artifactObjectId)}`
    : round.artifactTitle
      ? `https://www.metmuseum.org/art/collection/search?q=${encodeURIComponent(round.artifactTitle)}`
      : 'https://www.metmuseum.org/art/collection';
  const me = players.find(guess => guess.playerId === playerId);
  const renderGuess = guess => (
    <div key={guess.playerId} className={`br-reveal-player ${guess.playerId === playerId ? 'is-you' : ''}`}>
      <span className="br-reveal-player-name">
        {guess.playerName}
        {guess.playerId === playerId && <span className="br-you-tag">you</span>}
        {guess.isEliminated && <span className="br-result-out-tag">out</span>}
      </span>
      <span className="br-reveal-player-guess">
        {guess.countryGuessed ? `${isoToCountryName(guess.countryGuessed)} · ${formatYear(guess.yearGuessed)}` : 'No guess'}
      </span>
      <span className="br-reveal-player-score">{guess.totalScore.toLocaleString()} pts</span>
      <span className={`br-reveal-player-dmg ${guess.hpLost === 0 ? 'best' : ''}`}>
        {typeof guess.hpLost !== 'number' ? 'HP loss unavailable' : guess.hpLost === 0 ? 'No HP lost' : `-${guess.hpLost.toLocaleString()} HP`}
      </span>
    </div>
  );
  return (
    <section className={`br-result-card ${history ? 'br-history-round-card' : ''}`}>
      <h3 className="br-reveal-heading">Round {round.round} Results</h3>
      <div className={`br-result-content${round.artifactImageUrl ? ' has-image' : ''}`}>
        {round.artifactImageUrl && (
          <img
            src={round.artifactImageUrl}
            alt={round.artifactTitle ?? 'Revealed artifact'}
            className="br-reveal-artifact-image"
          />
        )}
        <div className="br-result-details">
          <div className="br-reveal-answer">
            <div className="br-reveal-artifact-name">{round.artifactTitle ?? 'Unknown artifact'}</div>
            <a className="br-met-link" href={metUrl} target="_blank" rel="noreferrer">
              View on The Met ↗
            </a>
            <div className="br-reveal-answer-row">
              <span className="br-reveal-label">Country</span>
              <span className="br-reveal-value">{isoToCountryName(round.artifactIso3)}</span>
            </div>
            <div className="br-reveal-answer-row">
              <span className="br-reveal-label">Date</span>
              <span className="br-reveal-value">{formatAnswerDate(round)}</span>
            </div>
          </div>
          {me && <div className="br-your-result" aria-label="Your round result">{renderGuess(me)}</div>}
          <Disclosure className="br-result-comparison" key={round.round} label={`All results (${players.length})`}>
            {players.length ? players.map(renderGuess) : <p>No results available.</p>}
          </Disclosure>
        </div>
      </div>
    </section>
  );
}

