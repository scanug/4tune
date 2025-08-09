'use client';

import { useState } from 'react';
import { ref, get, set } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../lib/firebase';  // importa il db dalla tua configurazione

function generateRoomCode(length = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for(let i=0; i<length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function HostPage() {
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function createRoom() {
    setLoading(true);
    setError('');
    let code = generateRoomCode();

    try {
      const roomRef = ref(db, 'rooms/' + code);
      const snapshot = await get(roomRef);

      if(snapshot.exists()) {
        // Codice già usato, rigeneriamo
        setLoading(false);
        createRoom();
      } else {
        // Crea stanza nuova
        let playerId = localStorage.getItem('playerId');
        if (!playerId) {
          playerId = uuidv4();
          localStorage.setItem('playerId', playerId);
        }

        await set(roomRef, {
          createdAt: Date.now(),
          status: 'waiting',
          hostId: playerId,
          players: {}
        });
        setRoomCode(code);
        setLoading(false);
      }
    } catch (err) {
      setError('Errore nella creazione della stanza');
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Crea una stanza multiplayer</h1>
      {roomCode ? (
        <>
          <p>Stanza creata con codice:</p>
          <h2 style={{ fontSize: '2rem' }}>{roomCode}</h2>
          <p>Condividi questo codice con i tuoi amici per giocare insieme.</p>
        </>
      ) : (
        <>
          <button onClick={createRoom} disabled={loading}>
            {loading ? 'Creando...' : 'Genera stanza'}
          </button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </>
      )}
    </div>
  );
}
