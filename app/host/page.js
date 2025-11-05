'use client';

import { useState } from 'react';
import { ref, get, set } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db, auth } from '../../lib/firebase';  // importa il db dalla tua configurazione
import Link from 'next/link';

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
  const [totalRounds, setTotalRounds] = useState(4);
  const [betSeconds, setBetSeconds] = useState(15);

  async function createRoom() {
    setLoading(true);
    setError('');
    let code = generateRoomCode();

    try {
      const roomRef = ref(db, 'rooms/' + code);
      const snapshot = await get(roomRef);

      if(snapshot.exists()) {
        setLoading(false);
        createRoom();
      } else {
        let playerId = auth?.currentUser?.uid || localStorage.getItem('playerId');
        if (!playerId) { playerId = uuidv4(); localStorage.setItem('playerId', playerId); }

        await set(roomRef, {
          createdAt: Date.now(),
          status: 'waiting',
          round: 0,
          currentRange: { min: null, max: null },
          winningNumber: null,
          totalRounds: Number(totalRounds) || 4,
          betSeconds: Math.min(60, Math.max(10, Number(betSeconds) || 15)),
          hostId: auth?.currentUser?.uid || playerId,
          players: {},
          bets: {}
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(720px, 94vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Link href="/" className="btn-3d" style={{ textDecoration: 'none' }}>Torna alla Home</Link>
          <h1 style={{ margin: 0, letterSpacing: 1, textTransform: 'uppercase' }}>Crea una Stanza</h1>
        </div>

        <div style={{
          border: '2px solid #111827',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.94))',
          padding: 16,
          borderRadius: 12,
          boxShadow: '0 12px 0 #111827, 0 12px 24px rgba(0,0,0,0.2)',
          imageRendering: 'pixelated'
        }}>
          {roomCode ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ marginTop: 0, marginBottom: 6, fontWeight: 700, color: '#111827' }}>Stanza creata con codice</p>
              <div style={{
                display: 'inline-block',
                padding: '8px 14px',
                border: '2px solid #111827',
                borderRadius: 10,
                background: '#fff',
                fontSize: '2rem',
                letterSpacing: 4,
                boxShadow: '0 6px 0 #111827'
              }}>
                {roomCode}
              </div>
              <p style={{ marginTop: 10, color: '#111827' }}>Condividi questo codice con i tuoi amici per giocare insieme.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 6, color: '#111827' }}>Numero di round</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input-modern"
                    type="number"
                    min={1}
                    max={10}
                    value={totalRounds}
                    onChange={e => setTotalRounds(Number(e.target.value))}
                    style={{ width: 160 }}
                  />
                  <span className="bubble">1–10</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, color: '#111827' }}>Più round = più suspense. Valore predefinito: 4</div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 6, color: '#111827' }}>Secondi per puntare</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input-modern"
                    type="number"
                    min={10}
                    max={60}
                    value={betSeconds}
                    onChange={e => setBetSeconds(Number(e.target.value))}
                    style={{ width: 160 }}
                  />
                  <span className="bubble">10–60</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, color: '#111827' }}>Tempo disponibile per inserire le puntate. Default: 15s</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: 12 }}>
                <div style={{ color: '#111827', fontSize: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Riepilogo</div>
                  <div>• Round: <strong>{totalRounds}</strong></div>
                  <div>• Puntate per round: <strong>{betSeconds}s</strong></div>
                </div>
                <button className="btn-3d" onClick={createRoom} disabled={loading} aria-busy={loading}>
                  {loading ? 'Creando...' : 'Genera stanza'}
                </button>
              </div>

              {error && <p style={{ color: '#ef4444', fontWeight: 700 }}>{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
