"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ref, query, orderByChild, limitToLast, onValue, off } from "firebase/database";
import { db, auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function LeaderboardPage() {
  const [mode, setMode] = useState("week"); // "week" | "month"
  const [rows, setRows] = useState([]);
  const [uid, setUid] = useState(null);
  const [playerId, setPlayerId] = useState(null);

  useEffect(() => { try { const id = localStorage.getItem('playerId'); if (id) setPlayerId(id); } catch {} }, []);
  useEffect(() => { const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid || null)); return () => unsub(); }, []);

  useEffect(() => {
    const field = mode === 'week' ? 'winsWeek' : 'winsMonth';
    const q = query(ref(db, 'users'), orderByChild(field), limitToLast(20));
    const handler = (snap) => {
      const arr = [];
      snap.forEach((child) => { const v = child.val(); v.__id = child.key; arr.push(v); });
      arr.sort((a,b) => (b[field]||0) - (a[field]||0));
      setRows(arr);
    };
    onValue(q, handler);
    return () => off(q);
  }, [mode]);

  const currentId = uid || playerId;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ padding: 24, width: 'min(760px, 92vw)', border: '2px solid rgba(99,102,241,0.5)', borderRadius: 16, background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
        <h1 style={{ textAlign: 'center', margin: 0, marginBottom: 12, color: '#111827' }}>Leaderboard</h1>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
          <button className="btn-3d" onClick={() => setMode('week')} disabled={mode==='week'}>Settimanale</button>
          <button className="btn-3d" onClick={() => setMode('month')} disabled={mode==='month'}>Mensile</button>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {rows.length === 0 && (
            <li style={{ color: '#111827', textAlign: 'center', padding: '8px 0' }}>Nessun giocatore trovato</li>
          )}
          {rows.map((u, idx) => {
            const score = mode === 'week' ? (u.winsWeek || 0) : (u.winsMonth || 0);
            const isMe = currentId && (u.uid === uid || u.id === playerId || u.__id === currentId);
            return (
              <li key={u.__id || u.uid || u.id} className="fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.25)', background: isMe ? 'rgba(129,140,248,0.12)' : 'transparent', color: '#111827' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#111827' }}>
                  <span style={{ width: 28, textAlign: 'center', fontWeight: 800 }}>{idx+1}</span>
                  {u.avatar && (
                    <Image src={u.avatar} alt="avatar" width={28} height={28} unoptimized style={{ borderRadius: 8, objectFit: 'cover' }} />
                  )}
                  <span style={{ fontWeight: 700, color: '#111827' }}>{u.name || 'Giocatore'}</span>
                </div>
                <div style={{ fontWeight: 700, color: '#111827' }}>{score}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
