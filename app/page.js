"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ref, get, set, onValue, off, update, runTransaction } from "firebase/database";
import { db, auth, storage } from "../lib/firebase";
import { v4 as uuidv4 } from "uuid";
import { onAuthStateChanged, signOut, updateProfile, signInAnonymously } from "firebase/auth";
import { ref as stRef, uploadBytes, getDownloadURL } from "firebase/storage";
import Wheel from "../components/Wheel";
import { ensurePlayerMissions, resetMissionsIfNeeded, updateMissionProgress, subscribeToPlayerMissions, MISSION_DEFS } from "../lib/missions";

export default function Home() {
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [credits, setCredits] = useState(null);
  const [uid, setUid] = useState(null);
  const [userKey, setUserKey] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [lastSpin, setLastSpin] = useState(null);
  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelSegments] = useState([10,20,30,40,50,60,80,100]);
  const [wheelTargetIndex, setWheelTargetIndex] = useState(0);
  const [wheelWinMsg, setWheelWinMsg] = useState("");
  const onWheelDoneRef = useRef(null);
  const [missionsState, setMissionsState] = useState({ missions: null, credits: 0, lastMissionReset: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try { await signInAnonymously(auth); } catch {}
      } else {
        setUid(u.uid);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return; // attendi uid da auth anonima o login
    async function boot() {
      const key = uid;
      setUserKey(key);
      const userRef = ref(db, `users/${key}`);
      const snap = await get(userRef);
      if (!snap.exists()) {
        const storedName = localStorage.getItem("playerName") || "Guest";
        const storedAvatar = localStorage.getItem("playerAvatar") || null;
        await set(userRef, {
          id: key,
          uid: uid || null,
          email: auth.currentUser?.email || null,
          name: storedName,
          avatar: storedAvatar,
          credits: 100,
          winsWeek: 0,
          winsMonth: 0,
          lastWinAt: null,
          lastSpin: null,
          createdAt: Date.now(),
        });
      }
      // Missions bootstrap on users/{key}
      try { await ensurePlayerMissions(key); } catch {}
      try { await resetMissionsIfNeeded(key); } catch {}
      setReady(true);
    }
    boot();
  }, [uid]);

  useEffect(() => {
    if (!userKey) return;
    const userRef = ref(db, `users/${userKey}`);
    const handler = (snap) => {
      const val = snap.val() || {};
      if (typeof val.name === 'string') setUserName(val.name);
      if (typeof val.avatar === 'string') setUserAvatar(val.avatar);
      if (typeof val.credits === 'number') setCredits(val.credits);
      if (typeof val.lastSpin === 'number') setLastSpin(val.lastSpin);
    };
    onValue(userRef, handler);
    return () => off(userRef, 'value', handler);
  }, [userKey]);

  // Subscribe to players/{playerId} missions
  useEffect(() => {
    const subKey = userKey;
    if (!subKey) return;
    const offFn = subscribeToPlayerMissions(subKey, setMissionsState);
    return () => { if (typeof offFn === 'function') offFn(); };
  }, [userKey]);

  const canSpin = lastSpin == null ? true : (Date.now() - Number(lastSpin) >= 24 * 60 * 60 * 1000);

  async function spinWheel() {
    if (!userKey) return;
    try { console.log('[HOME] spinWheel:start', { userKey, lastSpin }); } catch {}
    const now = Date.now();
    const userRef = ref(db, `users/${userKey}`);
    try {
      const result = await runTransaction(userRef, (current) => {
        const cur = current || {};
        const last = Number(cur.lastSpin || 0);
        if (now - last < 24 * 60 * 60 * 1000) {
          return; // abort
        }
        return { ...cur, lastSpin: now };
      });
      try { console.log('[HOME] spinWheel:tx', { committed: result?.committed, now }); } catch {}
      if (!result.committed) { setWheelWinMsg('Torna domani'); return; }
      // Mission progress: spin_wheel
      try { if (userKey) await updateMissionProgress(userKey, 'spin_wheel'); } catch {}
      // refresh local lastSpin immediately
      setLastSpin(now);
      const idx = Math.floor(Math.random() * wheelSegments.length);
      setWheelTargetIndex(idx);
      try { console.log('[HOME] spinWheel:target', { idx, reward: wheelSegments[idx] }); } catch {}
      setWheelWinMsg("");
      setWheelVisible(true);
      setWheelSpinning(true);
      const reward = Number(wheelSegments[idx]);
      onWheelDoneRef.current = async () => {
        try {
          const snap = await get(userRef);
          const current = Number(snap.val()?.credits || 0);
          await update(userRef, { credits: current + reward });
          try { console.log('[HOME] spinWheel:onDone', { current, reward, newCredits: current + reward }); } catch {}
          setWheelWinMsg(`Hai vinto ${reward} crediti!`);
        } catch {}
        finally {
          setWheelSpinning(false);
          setTimeout(() => setWheelVisible(false), 1200);
        }
      };
    } catch (e) {
      try { console.error('[HOME] spinWheel:error', e); } catch {}
    }
  }

  return (
    <main className="p-6" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Floating credits pill + profile icon */}
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(99,102,241,0.35)', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', fontWeight: 700 }}>
          {credits != null ? `${credits} 💰` : '— 💰'}
        </div>
        {uid ? (
          <button
            onClick={() => setShowProfile(true)}
            className="btn-3d"
            aria-label="Profilo utente"
            title="Profilo utente"
            style={{ padding: '0.5rem 0.7rem' }}
          >
            👤
          </button>
        ) : (
          <Link href="/auth" className="btn-3d" aria-label="Login / Registrati" title="Login / Registrati" style={{ padding: '0.5rem 0.7rem', textDecoration: 'none' }}>👤</Link>
        )}
      </div>

      <div style={{ textAlign: 'center', background: '#fff', border: '2px solid rgba(99,102,241,0.5)', borderRadius: 16, padding: 24, width: 'min(760px, 92vw)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
        <h1 className="text-2xl font-bold" style={{ marginBottom: 12, color: '#111827' }}>4Tune - Your Lucky Numbers</h1>
        {ready && (
          <p style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', color: '#111827' }}>
            <span>Benvenuto/a {userName}</span>
            {userAvatar && (
              <Image src={userAvatar} alt="avatar" width={32} height={32} unoptimized style={{ borderRadius: 8, objectFit: 'cover' }} />
            )}
            {credits != null && <span style={{ marginLeft: 8, opacity: 0.8 }}>Crediti: {credits}</span>}
          </p>
        )}
        <div style={{ marginBottom: 12 }}>
          <button
            className="btn-3d"
            disabled={!canSpin || wheelSpinning}
            onClick={spinWheel}
            title={canSpin ? 'Gira la ruota' : 'Torna domani'}
          >
            {canSpin ? '🎡 Gira la ruota' : '🎡 Torna domani'}
          </button>
          {wheelWinMsg && <div className="fade-up" style={{ marginTop: 6, fontWeight: 700, color: '#111827' }}>{wheelWinMsg}</div>}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <Link href="/hub" className="btn-3d" style={{ textDecoration: 'none', minWidth: 120, textAlign: 'center' }}>Hub Giochi</Link>
          <Link href="/host" className="btn-3d" style={{ textDecoration: 'none', minWidth: 120, textAlign: 'center' }}>Crea Stanza</Link>
          <Link href="/join" className="btn-3d" style={{ textDecoration: 'none', minWidth: 120, textAlign: 'center' }}>Entra in Stanza</Link>
          <Link href="/leaderboard" className="btn-3d" style={{ textDecoration: 'none', minWidth: 120, textAlign: 'center' }}>Leaderboard</Link>
        </div>
      {/* Missions UI */}
      <div style={{ marginTop: 12, textAlign: 'left', color: '#111827' }}>
        <h3 style={{ margin: '8px 0', color: '#111827' }}>Missioni giornaliere</h3>
        {missionsState.missions ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {Object.entries(missionsState.missions).map(([key, m]) => (
              <li key={key} className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 6, columnGap: 8, border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '10px 10px', background: 'rgba(255,255,255,0.5)', color: '#111827' }}>
                <div style={{ minWidth: 160, flex: '1 1 220px' }}>
                  <div style={{ fontWeight: 700 }}>{MISSION_DEFS[key]?.title || key}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Progresso: {Number(m?.progress||0)}/{Number(m?.goal||0)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
                  <span className="bubble">Premio: {Number(m?.reward||0)}</span>
                  <span className={`bubble ${m?.completed ? 'success' : 'wait'}`}>{m?.completed ? 'Completata' : 'In corso'}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ opacity: 0.8 }}>Caricamento missioni...</p>
        )}
      </div>
        <div style={{ marginTop: 12 }}>
          {uid ? (
            <button className="btn-3d" onClick={() => signOut(auth)}>Logout</button>
          ) : (
            <Link href="/auth" className="btn-3d" style={{ textDecoration: 'none' }}>Login / Registrati</Link>
          )}
        </div>
      </div>

      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} uid={uid} />)
      }
      <Wheel
        visible={wheelVisible}
        segments={wheelSegments}
        targetIndex={wheelTargetIndex}
        spinning={wheelSpinning}
        onDone={() => { if (onWheelDoneRef.current) onWheelDoneRef.current(); }}
      />
    </main>
  );
}

function ProfileModal({ onClose, uid }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [missions, setMissions] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const r = ref(db, `users/${uid}`);
    const handler = (snap) => {
      const v = snap.val() || {};
      setName(v.name || "");
      setAvatar(v.avatar || "");
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
  }, [uid]);

  // Subscribe to missions stored under players/{playerId}
  useEffect(() => {
    const pid = (typeof window !== 'undefined') ? localStorage.getItem('playerId') : null;
    if (!pid) return;
    const offFn = subscribeToPlayerMissions(pid, (state) => {
      setMissions(state.missions || null);
    });
    return () => { if (typeof offFn === 'function') offFn(); };
  }, [uid]);

  async function handleUpload(file) {
    if (!file || !uid) return;
    const maxSize = 1024 * 1024;
    if (file.size > maxSize) { setMsg("Immagine troppo grande (max 1MB)"); return; }
    const path = `avatars/${uid}/${Date.now()}_${file.name}`;
    const sref = stRef(storage, path);
    await uploadBytes(sref, file);
    const url = await getDownloadURL(sref);
    setAvatar(url);
  }

  async function saveProfile() {
    if (!uid) return;
    setSaving(true); setMsg("");
    try {
      const safeName = name.trim().slice(0, 24) || `User${uid.slice(0,6)}`;
      await update(ref(db, `users/${uid}`), { name: safeName, avatar: avatar || null });
      try { await updateProfile(auth.currentUser, { displayName: safeName, photoURL: avatar || null }); } catch (e) { console.error("Errore updateProfile:", e); }
      try { localStorage.setItem('playerName', safeName); if (avatar) localStorage.setItem('playerAvatar', avatar); } catch {}
      setMsg("Profilo aggiornato");
      onClose();
    } catch (e) {
      console.error("Errore Firebase:", e);
      setMsg("Errore salvataggio profilo");
    } finally { setSaving(false); }
  }

  return (
    <div className="overlay-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="overlay-content" style={{ width: 'min(520px, 92vw)', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Profilo utente</h2>
          <button className="btn-3d" onClick={onClose} aria-label="Chiudi" title="Chiudi">✕</button>
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div>
            <label>Nickname</label>
            <input className="input-modern" type="text" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label>Avatar</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {["/file.svg","/globe.svg","/next.svg","/vercel.svg","/window.svg"].map((src) => (
                <button key={src} type="button" className="btn-3d" onClick={() => setAvatar(src)} style={{ padding: '6px 10px' }}>{src.endsWith('.svg') ? 'SVG' : 'IMG'}</button>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </div>
            {avatar && (
              <div style={{ marginTop: 8 }}>
                <Image src={avatar} alt="avatar" width={64} height={64} unoptimized style={{ borderRadius: 12, objectFit: 'cover' }} />
              </div>
            )}
          </div>
          <button className="btn-3d" onClick={saveProfile} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          {msg && <p style={{ color: '#10b981' }}>{msg}</p>}
          <div style={{ marginTop: 8 }}>
            <h3 style={{ margin: 0 }}>Missioni completate</h3>
            {missions ? (
              (() => {
                const completed = Object.entries(missions).filter(([_, m]) => m && m.completed);
                if (completed.length === 0) return <p style={{ marginTop: 6, opacity: 0.8 }}>Nessuna missione completata</p>;
                return (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0', display: 'grid', gap: 6 }}>
                    {completed.map(([key, m]) => (
                      <li key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.6)' }}>
                        <span style={{ fontWeight: 700 }}>{MISSION_DEFS[key]?.title || key}</span>
                        <span className="bubble">+{Number(m?.reward||0)} 💰</span>
                      </li>
                    ))}
                  </ul>
                );
              })()
            ) : (
              <p style={{ marginTop: 6, opacity: 0.8 }}>Caricamento...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
