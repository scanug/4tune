'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ref, onValue, off, update } from 'firebase/database';
import { db } from '../../../lib/firebase';

export default function GamePage() {
  const { roomCode } = useParams(); // prende il parametro dalla route
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [playerId, setPlayerId] = useState(null);
  const [betValue, setBetValue] = useState(null);

  useEffect(() => {
    const storedId = localStorage.getItem('playerId');
    if (storedId) setPlayerId(storedId);
  }, []);

  useEffect(() => {
    if (!roomCode) return;

    const roomRef = ref(db, 'rooms/' + roomCode);

    // Listener realtime per aggiornamenti stanza
    const handleValue = (snapshot) => {
      if (!snapshot.exists()) {
        setError('Stanza non trovata o eliminata');
        setLoading(false);
        setRoomData(null);
        return;
      }
      setRoomData(snapshot.val());
      setLoading(false);
      setError('');
    };

    onValue(roomRef, handleValue);

    return () => {
      off(roomRef);
    }; // pulizia listener su dismount
  }, [roomCode]);

  // Funzione per iniziare la partita: set betting phase round 1
  async function startGame() {
    if (!roomCode) return;

    const currentIsHost = playerId && roomData?.hostId && playerId === roomData.hostId;
    if (!currentIsHost) return;

    try {
      await update(ref(db, 'rooms/' + roomCode), {
        status: 'betting',
        round: 1,
        currentRange: { min: 1, max: 10 },
        winningNumber: null,
        startedAt: Date.now(),
        bets: null
      });
    } catch (err) {
      setError('Errore nell\'avviare la partita');
    }
  }

  if (loading) return <p>Caricamento stanza...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!roomData) return null;

  const isHost = playerId && roomData?.hostId && playerId === roomData.hostId;
  const players = roomData.players || {};
  const bets = roomData.bets || {};
  const totalPlayers = Object.keys(players).length;
  const betCount = Object.keys(bets).length;
  const currentRange = roomData.currentRange || { min: null, max: null };

  async function submitBet() {
    if (!playerId || roomData.status !== 'betting' || betValue == null) return;
    try {
      await update(ref(db, `rooms/${roomCode}`), {
        [`bets/${playerId}`]: Number(betValue)
      });
    } catch (err) {
      setError('Errore nell\'invio della scommessa');
    }
  }

  async function closeBetsAndReveal() {
    if (!isHost || roomData.status !== 'betting') return;

    const min = Number(currentRange.min);
    const max = Number(currentRange.max);
    const winning = Math.floor(Math.random() * (max - min + 1)) + min;

    // Trova eventuali vincitori (chi ha esattamente il numero)
    const winners = Object.entries(bets).filter(([, n]) => Number(n) === winning).map(([pid]) => pid);

    const updates = {
      winningNumber: winning,
      status: 'results'
    };

    // Aggiorna punteggi vincitori
    winners.forEach((pid) => {
      const prev = players[pid]?.score || 0;
      updates[`players/${pid}/score`] = prev + 1;
    });

    try {
      await update(ref(db, `rooms/${roomCode}`), updates);
    } catch (err) {
      setError('Errore nella chiusura delle scommesse');
    }
  }

  function nextRangeForRound(r) {
    if (r === 1) return { min: 1, max: 10 };
    if (r === 2) return { min: 11, max: 25 };
    if (r === 3) return { min: 26, max: 50 };
    if (r === 4) return { min: 51, max: 100 };
    return { min: 1, max: 10 };
  }

  async function startNextRound() {
    if (!isHost || roomData.status !== 'results') return;

    const nextRound = (roomData.round || 1) + 1;
    if (nextRound > 4) {
      try {
        await update(ref(db, `rooms/${roomCode}`), {
          status: 'finished'
        });
      } catch (err) {
        setError('Errore nell\'avanzare di round');
      }
      return;
    }

    const nextRange = nextRangeForRound(nextRound);
    try {
      await update(ref(db, `rooms/${roomCode}`), {
        round: nextRound,
        currentRange: nextRange,
        winningNumber: null,
        bets: null,
        status: 'betting'
      });
    } catch (err) {
      setError('Errore nell\'avvio del prossimo round');
    }
  }

  const hasBet = playerId && bets[playerId] != null;

  return (
    <div style={{ padding: 20 }}>
      <h1>Partita: {roomCode}</h1>
      <p>Stato: {roomData.status}</p>

      <h2>Giocatori ({Object.keys(players).length}):</h2>
      <ul>
        {Object.entries(players).map(([id, player]) => (
          <li key={id}>{player.name || 'Guest'}{typeof player.score === 'number' ? ` — ${player.score} pt` : ''}</li>
        ))}
      </ul>

      {roomData.status === 'waiting' && isHost && (
        <button className="btn-3d" onClick={startGame}>Avvia Partita</button>
      )}

      {roomData.status === 'betting' && (
        <div style={{ marginTop: 16 }}>
          <p>Round {roomData.round} — Scegli un numero tra {currentRange.min} e {currentRange.max}</p>

          {!hasBet ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                min={currentRange.min}
                max={currentRange.max}
                value={betValue ?? ''}
                onChange={(e) => setBetValue(e.target.value)}
                style={{ padding: '0.5rem', width: 120 }}
              />
              <button className="btn-3d" onClick={submitBet} disabled={betValue == null}>
                Punta
              </button>
            </div>
          ) : (
            <p>Hai puntato: {bets[playerId]}</p>
          )}

          {isHost && (
            <div style={{ marginTop: 12 }}>
              <p>Giocatori che hanno puntato: {betCount}/{totalPlayers}</p>
              <button className="btn-3d" onClick={closeBetsAndReveal} disabled={betCount === 0}>
                Chiudi scommesse
              </button>
            </div>
          )}
        </div>
      )}

      {roomData.status === 'results' && (
        <div style={{ marginTop: 16 }}>
          <p>Numero estratto: {roomData.winningNumber}</p>
          <h3>Punteggi</h3>
          <ul>
            {Object.entries(players).map(([id, player]) => (
              <li key={id}>{player.name || 'Guest'} — {player.score || 0} pt</li>
            ))}
          </ul>
          {isHost && (
            <button className="btn-3d" onClick={startNextRound}>Prossimo round</button>
          )}
        </div>
      )}

      {roomData.status === 'finished' && (
        <div style={{ marginTop: 16 }}>
          <h3>Partita terminata</h3>
          {(() => {
            const entries = Object.entries(players);
            if (entries.length === 0) return <p>Nessun giocatore</p>;
            const sorted = entries.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
            const [winnerId, winner] = sorted[0];
            return <p>Vincitore: {winner.name} con {winner.score || 0} punti</p>;
          })()}
        </div>
      )}
    </div>
  );
}
