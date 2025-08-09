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

  // Funzione per iniziare la partita (esempio)
  async function startGame() {
    if (!roomCode) return;

    const currentIsHost = playerId && roomData?.hostId && playerId === roomData.hostId;
    if (!currentIsHost) return;

    try {
      await update(ref(db, 'rooms/' + roomCode), {
        status: 'playing',
        startedAt: Date.now()
      });
    } catch (err) {
      setError('Errore nell\'avviare la partita');
    }
  }

  if (loading) return <p>Caricamento stanza...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!roomData) return null;

  const isHost = playerId && roomData?.hostId && playerId === roomData.hostId;

  return (
    <div style={{ padding: 20 }}>
      <h1>Partita: {roomCode}</h1>
      <p>Stato: {roomData.status}</p>

      <h2>Giocatori ({Object.keys(roomData.players || {}).length}):</h2>
      <ul>
        {roomData.players && Object.entries(roomData.players).map(([id, player]) => (
          <li key={id}>{player.name || 'Guest'}</li>
        ))}
      </ul>

      {roomData.status === 'waiting' && isHost && (
        <button onClick={startGame}>Avvia Partita</button>
      )}

      {roomData.status === 'playing' && <p>La partita è in corso...</p>}
    </div>
  );
}
