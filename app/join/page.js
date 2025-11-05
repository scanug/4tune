'use client';

import { useState, useEffect } from 'react';
import { ref, get, update } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

export default function JoinPage() {
  const [inputCode, setInputCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // preload name from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('playerName');
      if (saved) setPlayerName(saved);
    } catch {}
  }, []);

  function handleNameChange(value) {
    setPlayerName(value);
    try { localStorage.setItem('playerName', value); } catch {}
  }

  async function joinRoom() {
    setLoading(true);
    setError('');

    const code = inputCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError('Il codice stanza deve essere di 4 caratteri');
      setLoading(false);
      return;
    }

    if (!playerName.trim()) {
      setError('Inserisci il tuo nome');
      setLoading(false);
      return;
    }

    try {
      const roomRef = ref(db, 'rooms/' + code);
      const snapshot = await get(roomRef);

      if (!snapshot.exists()) {
        setError('Stanza non trovata');
        setLoading(false);
        return;
      }

      const roomData = snapshot.val();
      const players = roomData.players || {};
      const maxPlayers = 4;

      if (roomData.status !== 'waiting') {
        setError('La partita è già iniziata o conclusa');
        setLoading(false);
        return;
      }

      if (Object.keys(players).length >= maxPlayers) {
        setError('La stanza è piena');
        setLoading(false);
        return;
      }

      let playerId = localStorage.getItem('playerId');
      if (!playerId) {
        playerId = uuidv4();
        localStorage.setItem('playerId', playerId);
      }

      const existing = players[playerId];
      const preservedScore = typeof existing?.score === 'number' ? existing.score : 0;

      await update(ref(db, `rooms/${code}/players`), {
        [playerId]: { joinedAt: Date.now(), name: playerName.trim(), score: preservedScore, avatar: localStorage.getItem('playerAvatar') || null }
      });

      setLoading(false);

      router.push(`/game/${code}`);
    } catch (err) {
      setError('Errore nella connessione a Firebase');
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Entra in una stanza</h1>
      <input
        type="text"
        value={playerName}
        onChange={e => handleNameChange(e.target.value)}
        placeholder="Il tuo nome"
        style={{ fontSize: '1.2rem', padding: '0.5rem', marginRight: 10 }}
      />
      <input
        type="text"
        maxLength={4}
        value={inputCode}
        onChange={e => setInputCode(e.target.value.toUpperCase())}
        placeholder="Inserisci codice stanza"
        style={{ textTransform: 'uppercase', fontSize: '1.5rem', padding: '0.5rem' }}
      />

      {/* Avatar selector */}
      <div style={{ marginTop: 12 }}>
        <p style={{ marginBottom: 6 }}>Scegli un avatar:</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 360 }}>
          {['😀','😎','🤖','🐶','🐱','🦊','🐼','🐵','🐸','🐙','👻','🎩'].map(av => (
            <button
              key={av}
              type="button"
              className="btn-3d"
              onClick={() => { try { localStorage.setItem('playerAvatar', av); } catch {}; }}
              style={{ padding: '0.4rem 0.7rem' }}
            >
              {av}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn-3d"
        onClick={joinRoom}
        disabled={loading || inputCode.length !== 4 || !playerName.trim()}
        style={{ marginLeft: 10, marginTop: 12 }}
      >
        {loading ? 'Caricamento...' : 'Entra'}
      </button>

      {error && <p style={{ color: 'red', marginTop: 10 }}>{error}</p>}
    </div>
  );
}
