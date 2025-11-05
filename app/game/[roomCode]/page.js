'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ref, onValue, off, update, get, runTransaction } from 'firebase/database';
import { db, auth } from '../../../lib/firebase';
import { updateMissionProgress } from '../../../lib/missions';
import { onAuthStateChanged } from 'firebase/auth';
import Wheel from '../../../components/Wheel';

export default function GamePage() {
  const { roomCode } = useParams(); // prende il parametro dalla route
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [playerId, setPlayerId] = useState(null);
  const [betValue, setBetValue] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [lastCountdownBeep, setLastCountdownBeep] = useState(null);
  const [showWinning, setShowWinning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [dbConnected, setDbConnected] = useState(true);
  const [pingMs, setPingMs] = useState(null);
  const [didPlayVictory, setDidPlayVictory] = useState(false);
  const [userCredits, setUserCredits] = useState(null);
  const [betNum, setBetNum] = useState('');
  const [betAmt, setBetAmt] = useState('');
  const [showSecondBet, setShowSecondBet] = useState(false);
  const [betNum2, setBetNum2] = useState('');
  const [betAmt2, setBetAmt2] = useState('');
  const ROUND_LIMIT = 10;
  const [authUid, setAuthUid] = useState(null);
  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelSegments, setWheelSegments] = useState([10,20,30,40,50,60,80,100]);
  const [wheelTargetIndex, setWheelTargetIndex] = useState(0);
  const [wheelWinMsg, setWheelWinMsg] = useState('');
  const onWheelDoneRef = useRef(null);
  // no background music

  useEffect(() => {
    const storedId = localStorage.getItem('playerId');
    if (storedId) setPlayerId(storedId);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUid(u?.uid || null));
    return () => unsub();
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

  useEffect(() => {
    if (!roomData) return;

    // Countdown sync from server timestamp
    if (roomData.status === 'betting') {
      const endsAt = roomData.bettingEndsAt || 0;
      const tick = () => {
        const msLeft = endsAt - Date.now();
        const s = Math.max(0, Math.ceil(msLeft / 1000));
        setSecondsLeft(s);
      };
      tick();
      const id = setInterval(tick, 250);
      return () => clearInterval(id);
    } else {
      setSecondsLeft(null);
    }
  }, [roomData]);

  // Simple web audio beep for countdown last 3 seconds
  useEffect(() => {
    if (secondsLeft == null) return;
    if (secondsLeft > 3) return;
    if (secondsLeft === lastCountdownBeep) return;
    setLastCountdownBeep(secondsLeft);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = secondsLeft === 0 ? 880 : 660;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      o.stop(ctx.currentTime + 0.16);
    } catch {}
  }, [secondsLeft, lastCountdownBeep]);

  // Auto-close on host when countdown hits zero
  useEffect(() => {
    if (!roomData) return;
    const isCurrentHost = playerId && roomData?.hostId && playerId === roomData.hostId;
    if (!isCurrentHost) return;
    if (roomData.status !== 'betting') return;
    if (!roomData.bettingEndsAt) return;
    if (secondsLeft == null) return;
    if (secondsLeft > 0) return;
    closeBetsAndReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData, playerId, secondsLeft]);

  // Play result sound (win/lose) when results are revealed
  useEffect(() => {
    if (!roomData) return;
    if (roomData.status !== 'results') return;
    const winning = roomData.winningNumber;
    if (winning == null) return;
    const myEntry = roomData.bets?.[playerId];
    const won = !!(myEntry && typeof myEntry === 'object' && myEntry[winning] != null);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = won ? 'square' : 'sine';
      o.frequency.value = won ? 1040 : 300;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(won ? 0.28 : 0.2, ctx.currentTime + 0.01);
      o.start();
      if (won) {
        // small arpeggio
        setTimeout(() => { try { o.frequency.value = 1240; } catch {} }, 120);
        setTimeout(() => { try { o.frequency.value = 1480; } catch {} }, 240);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (won ? 0.45 : 0.25));
      o.stop(ctx.currentTime + (won ? 0.47 : 0.27));
    } catch {}
  }, [roomData, playerId]);

  // Results phase: short suspense then show; no auto-advance
  useEffect(() => {
    if (!roomData) return;
    if (roomData.status !== 'results') {
      setShowWinning(false);
      return;
    }
    setShowWinning(false);
    const revealId = setTimeout(() => setShowWinning(true), 800);
    return () => clearTimeout(revealId);
  }, [roomData]);

  // Funzione per iniziare la partita: set betting phase round 1
  async function startGame() {
    if (!roomCode) return;

    const currentIsHost = playerId && roomData?.hostId && playerId === roomData.hostId;
    if (!currentIsHost) return;

    const totalRounds = roomData?.totalRounds || 4;

    try {
      const betSeconds = roomData?.betSeconds || 15;
      await update(ref(db, 'rooms/' + roomCode), {
        status: 'betting',
        round: 1,
        currentRange: { min: 1, max: 10 },
        winningNumber: null,
        totalRounds,
        startedAt: Date.now(),
        bets: null,
        bettingEndsAt: Date.now() + betSeconds * 1000 // Set betting ends at
      });
    } catch (err) {
      setError('Errore nell\'avviare la partita');
    }
  }

  // Reactions listener (last 6)
  useEffect(() => {
    if (!roomCode) return;
    const reactionsRef = ref(db, `rooms/${roomCode}/reactions`);
    const handler = (snap) => {
      const val = snap.val() || {};
      const items = Object.values(val).slice(-6);
      setReactions(items);
    };
    onValue(reactionsRef, handler);
    return () => off(reactionsRef);
  }, [roomCode]);

  // Clear chat and reactions at game end (host only)
  useEffect(() => {
    if (!roomData || !playerId) return;
    const isCurrentHost = roomData.hostId && playerId === roomData.hostId;
    if (!isCurrentHost) return;
    if (roomData.status !== 'finished') return;
    update(ref(db, `rooms/${roomCode}`), { chat: null, reactions: null });
  }, [roomData, playerId, roomCode]);

  // Connectivity indicators
  useEffect(() => {
    const handle = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handle);
    window.addEventListener('offline', handle);
    return () => { window.removeEventListener('online', handle); window.removeEventListener('offline', handle); };
  }, []);

  // Ping Firebase connection
  useEffect(() => {
    let intervalId;
    const ping = async () => {
      const start = performance.now();
      try {
        await update(ref(db, `rooms/${roomCode}/__ping`), Date.now());
        setDbConnected(true);
      } catch {
        setDbConnected(false);
      } finally {
        setPingMs(Math.round(performance.now() - start));
      }
    };
    ping();
    intervalId = setInterval(ping, 5000);
    return () => clearInterval(intervalId);
  }, [roomCode]);

  // Chat listener (last 30)
  useEffect(() => {
    if (!roomCode) return;
    const chatRef = ref(db, `rooms/${roomCode}/chat`);
    const handler = (snap) => {
      const val = snap.val() || {};
      const items = Object.values(val).sort((a,b) => a.at - b.at).slice(-30);
      setChatMessages(items);
    };
    onValue(chatRef, handler);
    return () => off(chatRef);
  }, [roomCode]);

  // Victory sound for first place (everyone hears)
  useEffect(() => {
    if (!roomData) return;
    if (roomData.status !== 'finished') return;
    if (didPlayVictory) return;
    const entries = Object.entries(roomData.players || {});
    if (entries.length === 0) return;
    const [first] = entries.sort((a,b) => (b[1].score||0) - (a[1].score||0));
    if (!first) return;
    setDidPlayVictory(true);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      // small fanfare: three notes
      const notes = [784, 988, 1175];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        const t0 = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        o.start(t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.stop(t0 + 0.18);
      });
    } catch {}
  }, [roomData, didPlayVictory]);

  useEffect(() => {
    const key = authUid || playerId;
    if (!key) return;
    const userRef = ref(db, `users/${key}`);
    const handler = (snap) => setUserCredits(snap.val()?.credits ?? null);
    onValue(userRef, handler);
    return () => off(userRef);
  }, [authUid, playerId]);

  // background music removed per request

  if (loading) return <p>Caricamento stanza...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!roomData) return null;

  const isHost = (authUid || playerId) && roomData?.hostId && (authUid || playerId) === roomData.hostId;
  const players = roomData.players || {};
  const bets = roomData.bets || {};
  const myBets = (bets[playerId] && typeof bets[playerId] === 'object') ? bets[playerId] : {};
  const totalMyBet = Object.values(myBets).reduce((sum, v) => sum + Number(v || 0), 0);
  const totalPlayers = Object.keys(players).length;
  const betCount = Object.keys(bets).length;
  const currentRange = roomData.currentRange || { min: null, max: null };
  const myPlayer = players[playerId] || {};
  const lastSpin = myPlayer.lastSpin == null ? null : Number(myPlayer.lastSpin);
  const canSpin = lastSpin == null ? true : (Date.now() - lastSpin >= 24 * 60 * 60 * 1000);

  async function spinWheel() {
    if (!playerId || !roomCode) return;
    const now = Date.now();
    try {
      try { console.log('[GAME] spinWheel:start', { roomCode, playerId, authUid, now }); } catch {}
      // Enforce daily spin on users/{key} (avoid room rule issues)
      const creditKey = authUid || playerId;
      const userRef = ref(db, `users/${creditKey}`);
      const result = await runTransaction(userRef, (current) => {
        const cur = current || {};
        const last = Number(cur.lastSpin || 0);
        if (now - last < 24 * 60 * 60 * 1000) {
          return; // abort, too soon
        }
        return { ...cur, lastSpin: now };
      });
      try { console.log('[GAME] spinWheel:tx', { committed: result?.committed, lastToNow: now }); } catch {}
      if (!result.committed) {
        setError('Puoi girare la ruota una sola volta al giorno.');
        return;
      }
      // Decide reward and animate
      const segments = wheelSegments;
      const idx = Math.floor(Math.random() * segments.length);
      const reward = Number(segments[idx]);
      setWheelWinMsg('');
      setWheelTargetIndex(idx);
      try { console.log('[GAME] spinWheel:target', { idx, reward }); } catch {}
      setWheelVisible(true);
      setWheelSpinning(true);
      // After animation completes, credit the user
      const creditKey2 = authUid || playerId;
      const userRef2 = ref(db, `users/${creditKey2}`);
      // Delay aligned to wheel duration (onDone callback)
      const onFinish = async () => {
        try {
          const snap = await get(userRef2);
          const current = Number(snap.val()?.credits || 0);
          await update(userRef2, { credits: current + reward });
          // Mirror in room player credits
          const playerCreditsRef = ref(db, `rooms/${roomCode}/players/${playerId}/credits`);
          await runTransaction(playerCreditsRef, (c) => Number(c || 0) + reward);
          // Mission progress: spin_wheel (users/{authUid||playerId})
          try { await updateMissionProgress(authUid || playerId, 'spin_wheel'); } catch {}
          try { console.log('[GAME] spinWheel:onDone', { current, reward, newCredits: current + reward }); } catch {}
          setWheelWinMsg(`Hai vinto ${reward} crediti!`);
        } catch {
          setError('Errore aggiornamento crediti dopo la ruota');
        } finally {
          setWheelSpinning(false);
          setTimeout(() => setWheelVisible(false), 1200);
        }
      };
      // store handler in ref for JSX callback
      onWheelDoneRef.current = onFinish;
    } catch (e) {
      setError('Errore giro ruota');
      try { console.error('[GAME] spinWheel:error', e); } catch {}
    }
  }

  async function submitBet() {
    if (!playerId || roomData.status !== 'betting') return;
    const n = Number(betNum);
    const a = Number(betAmt);
    const n2 = showSecondBet ? Number(betNum2) : null;
    const a2 = showSecondBet ? Number(betAmt2) : 0;

    if (!Number.isInteger(n)) return;
    if (n < Number(currentRange.min) || n > Number(currentRange.max)) return;
    if (!Number.isFinite(a) || a <= 0) return;
    if (showSecondBet) {
      if (!Number.isInteger(n2)) return;
      if (n2 < Number(currentRange.min) || n2 > Number(currentRange.max)) return;
      if (!Number.isFinite(a2) || a2 <= 0) return;
      if (a2 < a * 2) { setError('La seconda puntata deve essere almeno il doppio della prima'); return; }
    }

    const totalNew = a + (showSecondBet ? a2 : 0);
    if (userCredits != null && totalNew > userCredits) {
      setError('Crediti insufficienti');
      return;
    }
    try {
      const updatesBets = { [`bets/${playerId}/${n}`]: (myBets[n] || 0) + a };
      if (showSecondBet) {
        updatesBets[`bets/${playerId}/${n2}`] = (myBets[n2] || 0) + a2;
      }
      await update(ref(db, `rooms/${roomCode}`), updatesBets);
      // addebita crediti totali (usa uid se autenticato)
      const creditKey = authUid || playerId;
      await update(ref(db, `users/${creditKey}`), { credits: (userCredits || 0) - totalNew });
      setBetNum('');
      setBetAmt('');
      setBetNum2('');
      setBetAmt2('');
    } catch (err) {
      setError('Errore nell\'invio della scommessa');
    }
  }

  async function closeBetsAndReveal() {
    if (!isHost || roomData.status !== 'betting') return;
    try {
      try { console.log('[GAME] closeBetsAndReveal:start', { roomCode, round: roomData?.round, range: currentRange }); } catch {}
      // Step 1: entra in results e mostra rullo per 2s
      await update(ref(db, `rooms/${roomCode}`), { status: 'results', bettingEndsAt: null, winningNumber: null });

      setTimeout(async () => {
        try {
          const min = Number(currentRange.min);
          const max = Number(currentRange.max);
          const winning = Math.floor(Math.random() * (max - min + 1)) + min;
          const multiplier = Math.max(1, Number(roomData.round || 1));
          const updates = { winningNumber: winning };
          updates[`history/${roomData.round}`] = winning;
          try { console.log('[GAME] closeBetsAndReveal:winning', { winning, multiplier }); } catch {}

          // Score and credits payout
          await Promise.all(Object.entries(bets).map(async ([pid, entry]) => {
            if (entry && typeof entry === 'object' && entry[winning] != null) {
              const amount = Number(entry[winning]) || 0;
              const payout = amount * multiplier;
              const prevScore = players[pid]?.score || 0;
              updates[`players/${pid}/score`] = prevScore + 1;
              const creditKey = (pid === playerId && authUid) ? authUid : pid;
              const userRef = ref(db, `users/${creditKey}`);
              const snap = await get(userRef);
              const userVal = snap.val() || {};
              const current = userVal.credits || 0;
              const now = Date.now();
              // naive week/month boundaries: reset on client if new week/month
              let winsWeek = userVal.winsWeek || 0;
              let winsMonth = userVal.winsMonth || 0;
              const last = userVal.lastWinAt || 0;
              const lastD = new Date(last); const nowD = new Date(now);
              const weekChanged = lastD.getFullYear() !== nowD.getFullYear() || getWeek(lastD) !== getWeek(nowD);
              const monthChanged = lastD.getFullYear() !== nowD.getFullYear() || lastD.getMonth() !== nowD.getMonth();
              if (weekChanged) winsWeek = 0;
              if (monthChanged) winsMonth = 0;
              await update(userRef, { credits: current + payout, winsWeek: winsWeek + 1, winsMonth: winsMonth + 1, lastWinAt: now });
              // Mission progress: win_3_games (users/{authUid||pid})
              try { await updateMissionProgress(pid, 'win_3_games'); } catch {}
            }
          }));

          // Side bets payout
          await Promise.all(Object.entries(roomData.sideBets || {}).map(async ([pid, sideBets]) => {
            await Promise.all(Object.entries(sideBets).map(async ([sideId, amt]) => {
              if (amt > 0) {
                const multiplier = sideId.includes('majority') ? 2 : 1;
                const payout = amt * multiplier;
                const prevScore = players[pid]?.score || 0;
                updates[`players/${pid}/score`] = prevScore + 1;
                const creditKey = (pid === playerId && authUid) ? authUid : pid;
                const userRef = ref(db, `users/${creditKey}`);
                const snap = await get(userRef);
                const current = snap.val()?.credits || 0;
                await update(userRef, { credits: current + payout });
              }
            }));
          }));

          await update(ref(db, `rooms/${roomCode}`), updates);
          try { console.log('[GAME] closeBetsAndReveal:done'); } catch {}
        } catch (e) {
          setError('Errore nella rivelazione del numero');
          try { console.error('[GAME] closeBetsAndReveal:error', e); } catch {}
        }
      }, 2000);
    } catch (err) {
      setError('Errore nella chiusura delle scommesse');
      try { console.error('[GAME] closeBetsAndReveal:caught', err); } catch {}
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
    const totalRounds = roomData.totalRounds || 4;
    if (nextRound > totalRounds) {
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
      const betSeconds = roomData?.betSeconds || 15;
      setBetValue('');
      await update(ref(db, `rooms/${roomCode}`), {
        round: nextRound,
        currentRange: nextRange,
        winningNumber: null,
        bets: null,
        status: 'betting',
        bettingEndsAt: Date.now() + betSeconds * 1000
      });
    } catch (err) {
      setError('Errore nell\'avvio del prossimo round');
    }
  }

  const hasBet = playerId && bets[playerId] != null;

  async function sendReaction(emoji) {
    if (!roomCode) return;
    const key = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const payload = { emoji, by: playerId, at: Date.now() };
    await update(ref(db, `rooms/${roomCode}/reactions/${key}`), payload);
  }

  async function sendChatMessage() {
    const text = (chatInput || '').trim();
    if (!text) return;
    if (text.length > 120) return;
    const key = Date.now() + '-' + Math.random().toString(36).slice(2,6);
    const payload = { by: playerId, name: players[playerId]?.name || 'Anon', avatar: players[playerId]?.avatar || null, text, at: Date.now() };
    await update(ref(db, `rooms/${roomCode}/chat/${key}`), payload);
    setChatInput('');
  }

  async function placeSideBet(sideId, amt) {
    if (!playerId || roomData.status !== 'waiting') return;
    if (userCredits != null && amt > userCredits) { setError('Crediti insufficienti'); return; }
    try {
      const betKey = playerId || authUid;
      await update(ref(db, `rooms/${roomCode}/sideBets/${betKey}`), { [sideId]: ((roomData?.sideBets?.[betKey]?.[sideId]) || 0) + amt });
      const creditKey = authUid || playerId;
      await update(ref(db, `users/${creditKey}`), { credits: (userCredits || 0) - amt });
      // coin sound
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = 880;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        o.start();
        setTimeout(()=>{ try { o.frequency.value = 1320; } catch{} }, 90);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
        o.stop(ctx.currentTime + 0.24);
      } catch {}
    } catch (e) {
      setError('Errore side bet');
    }
  }


  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ padding: 24, width: 'min(680px, 92vw)', border: '2px solid rgba(99,102,241,0.4)', borderRadius: 16, background: 'rgba(255,255,255,0.04)', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', textAlign: 'center', position: 'relative' }}>
        <div className="multiplier-badge">{Math.max(1, Number(roomData.round||1))}x</div>
        {/* Credits pill + profile placeholder in alto a destra */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(99,102,241,0.35)', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', fontWeight: 700 }}>
            {userCredits != null ? `${userCredits} 💰` : '— 💰'}
          </div>
          <Link href="/" aria-label="Profilo" className="btn-3d" style={{ padding: '6px 10px' }}>👤</Link>
        </div>
      <h1>Partita: {roomCode}</h1>
      <p>Stato: {roomData.status}</p>
        {/* Bottone Gira la ruota */}
        <div style={{ marginTop: 8 }}>
          <button
            className="btn-3d"
            disabled={!canSpin || wheelSpinning}
            onClick={spinWheel}
            aria-disabled={!canSpin || wheelSpinning}
            title={canSpin ? 'Gira la ruota' : 'Torna domani'}
          >
            {canSpin ? '🎡 Gira la ruota' : '🎡 Torna domani'}
          </button>
          {wheelWinMsg && <div className="fade-up" style={{ marginTop: 6, fontWeight: 700, color: '#111827' }}>{wheelWinMsg}</div>}
        </div>

      <h2>Giocatori ({Object.keys(players).length}):</h2>
      <ul>
        {Object.entries(players).map(([id, player]) => (
          <li key={id}>{player.avatar ? `${player.avatar} ` : ''}{player.name || 'Guest'}{typeof player.score === 'number' ? ` — ${player.score} pt` : ''}</li>
        ))}
      </ul>

      {roomData.status === 'waiting' && (
        <div style={{ marginTop: 8 }}>
          {isHost && (
            <div style={{ marginBottom: 8 }}>
              <button className="btn-3d" onClick={startGame}>Avvia Partita</button>
            </div>
          )}
          <div style={{ textAlign: 'left', marginTop: 8 }}>
            <h3>Side bets pre-partita (payout 2x)</h3>
            <SideBetCard
              colorFrom="#34d399" colorTo="#059669"
              title="Odd ≥ 50%" desc="Almeno metà dei numeri finali dispari"
              onPlace={async (amt) => { await placeSideBet('odd_majority', amt); }}
            />
            <SideBetCard
              colorFrom="#60a5fa" colorTo="#2563eb"
              title="Even ≥ 50%" desc="Almeno metà dei numeri finali pari"
              onPlace={async (amt) => { await placeSideBet('even_majority', amt); }}
            />
            <SideBetCard
              colorFrom="#fbbf24" colorTo="#d97706"
              title="Any prime" desc="Almeno un numero primo estratto"
              onPlace={async (amt) => { await placeSideBet('any_prime', amt); }}
            />
            <SideBetCard
              colorFrom="#f472b6" colorTo="#db2777"
              title="Any ×10" desc="Almeno un multiplo di 10 estratto"
              onPlace={async (amt) => { await placeSideBet('any_mul10', amt); }}
            />
          </div>
        </div>
      )}

      {roomData.status === 'betting' && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, textAlign: 'left' }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: 8 }}>Giocatori</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {Object.entries(players).map(([id, p]) => {
                const didBet = bets[id] != null;
                return (
                  <li key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px' }}>
                    <span>{p.avatar ? `${p.avatar} ` : ''}{p.name || 'Guest'}</span>
                    <span className={`bubble ${didBet ? 'success' : 'wait'}`}>{didBet ? '✔ puntato' : 'in attesa'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p className="pulse" style={{ margin: 0 }}>Tempo rimasto: {secondsLeft ?? 0}s</p>
            <p style={{ marginTop: 6 }}>Round {roomData.round}/{roomData.totalRounds || 4} — Scegli un numero tra {currentRange.min} e {currentRange.max}</p>

            {!hasBet ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input-modern"
                    type="text"
                    inputMode="numeric"
                    pattern="^[0-9]+$"
                    value={betNum}
                    onChange={(e) => setBetNum(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder={`Numero (${currentRange.min}–${currentRange.max})`}
                    style={{ width: 180, fontSize: '1.1rem' }}
                  />
                  <input
                    className="input-modern"
                    type="text"
                    inputMode="numeric"
                    pattern="^[0-9]+$"
                    value={betAmt}
                    onChange={(e) => setBetAmt(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder={`Crediti (max ${ROUND_LIMIT - totalMyBet})`}
                    style={{ width: 180, fontSize: '1.1rem' }}
                  />
                  <button type="button" className="btn-3d" onClick={() => setShowSecondBet((s)=>!s)} aria-label="Aggiungi seconda puntata">+</button>
                </div>
                {showSecondBet && (
                  <div className="fade-up" style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input-modern"
                      type="text"
                      inputMode="numeric"
                      pattern="^[0-9]+$"
                      value={betNum2}
                      onChange={(e) => setBetNum2(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={`Secondo numero (${currentRange.min}–${currentRange.max})`}
                      style={{ width: 180, fontSize: '1.1rem' }}
                    />
                    <input
                      className="input-modern"
                      type="text"
                      inputMode="numeric"
                      pattern="^[0-9]+$"
                      value={betAmt2}
                      onChange={(e) => setBetAmt2(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={`Secondi crediti (≥ ${Number(betAmt||0)*2})`}
                      style={{ width: 180, fontSize: '1.1rem' }}
                    />
                  </div>
                )}
                <button
                  className="btn-3d"
                  onClick={async () => { await submitBet(); setShowConfirm(true); setTimeout(() => setShowConfirm(false), 900); }}
                  disabled={
                    !betNum || !betAmt ||
                    Number(betNum) < Number(currentRange.min) ||
                    Number(betNum) > Number(currentRange.max) ||
                    Number(betAmt) <= 0 ||
                    (showSecondBet && (!betNum2 || !betAmt2 || Number(betNum2) < Number(currentRange.min) || Number(betNum2) > Number(currentRange.max) || Number(betAmt2) < Number(betAmt)*2))
                  }
                >
                  Conferma puntate
                </button>
                <div style={{ fontSize: 14, opacity: 0.9 }}>Crediti disponibili: {userCredits != null ? userCredits : '—'}</div>
                <div style={{ fontSize: 14, opacity: 0.9 }}>
                  Puntate correnti: {Object.keys(myBets).length > 0 ? Object.entries(myBets).map(([k,v]) => `${k}:${v}`).join(', ') : 'nessuna'}
                </div>
              </div>
            ) : (
              <div>
                <p style={{ marginTop: 8 }}>Le tue puntate: {Object.entries(myBets).map(([k,v]) => `${k}:${v}`).join(', ')}</p>
                <div style={{ fontSize: 14, opacity: 0.9 }}>Totale round: {totalMyBet}/{ROUND_LIMIT}</div>
              </div>
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
        </div>
      )}

      {roomData.status === 'results' && (
        <div style={{ marginTop: 16 }}>
          <p className="fade-up" style={{ fontSize: '1.2rem' }}>Recap puntate:</p>
          <p className="fade-up delay-100" style={{ fontSize: '1.25rem' }}>
            {Object.entries(bets).map(([pid, entry]) => {
              const name = players[pid]?.name || 'Giocatore';
              const av = players[pid]?.avatar ? `${players[pid].avatar} ` : '';
              if (entry && typeof entry === 'object') {
                const parts = Object.entries(entry).map(([num, amt]) => `${num}:${amt}`).join(' ');
                return `${av}${name} ha puntato ${parts}`;
              }
              return `${av}${name} ha puntato -`;
            }).join(' ; ')}
          </p>
          {/* Side bets payout is evaluated at fine partita (finished) */}
          <p className={`fade-up delay-200 ${roomData.winningNumber != null ? 'reveal-pop winner-flash' : ''}`} style={{ fontSize: '1.6rem', fontWeight: 800 }}>
            Il numero estratto è...
          </p>
          {roomData.winningNumber == null ? (
            <div className="reel-box fade-up delay-200">···</div>
          ) : (
            <div className="reel-box fade-up delay-200">{roomData.winningNumber}</div>
          )}

          <h3 className="fade-up delay-300" style={{ fontSize: '1.3rem' }}>Punteggi</h3>
          <ul>
            {Object.entries(players).map(([id, player]) => (
              <li key={id}>{player.avatar ? `${player.avatar} ` : ''}{player.name || 'Guest'} — {player.score || 0} pt</li>
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
            const top = sorted.slice(0, 3);
            return (
              <div className="podium">
                {top[1] && (
                  <div className="podium-item podium-2" style={{ height: 120 }}>
                    <div className="name">{top[1][1].avatar ? `${top[1][1].avatar} ` : ''}{top[1][1].name}</div>
                    <div className="score">{top[1][1].score || 0} pt</div>
                    <div>2°</div>
                  </div>
                )}
                {top[0] && (
                  <div className="podium-item podium-1" style={{ height: 160 }}>
                    <span className="trophy">🏆</span>
                    <div className="name">{top[0][1].avatar ? `${top[0][1].avatar} ` : ''}{top[0][1].name}</div>
                    <div className="score">{top[0][1].score || 0} pt</div>
                    <div>1°</div>
                  </div>
                )}
                {top[2] && (
                  <div className="podium-item podium-3" style={{ height: 100 }}>
                    <div className="name">{top[2][1].avatar ? `${top[2][1].avatar} ` : ''}{top[2][1].name}</div>
                    <div className="score">{top[2][1].score || 0} pt</div>
                    <div>3°</div>
                  </div>
                )}
              </div>
            );
          })()}
          {/* Esito side bets */}
          {(() => {
            const history = roomData.history || {};
            const values = Object.values(history).map(Number);
            if (values.length === 0) return null;
            const total = values.length || 1;
            const oddCount = values.filter(v => v % 2 !== 0).length;
            const evenCount = values.filter(v => v % 2 === 0).length;
            const anyPrime = values.some(v => isPrime(v));
            const anyMul10 = values.some(v => v % 10 === 0);
            const results = {
              odd_majority: oddCount / total >= 0.5,
              even_majority: evenCount / total >= 0.5,
              any_prime: anyPrime,
              any_mul10: anyMul10,
            };
            const labels = {
              odd_majority: 'Odd ≥ 50%',
              even_majority: 'Even ≥ 50%',
              any_prime: 'Any prime',
              any_mul10: 'Any ×10',
            };
            const sideBets = roomData.sideBets || {};
            const listItem = (key) => {
              const winners = Object.entries(sideBets)
                .filter(([pid, sb]) => sb && sb[key])
                .map(([pid]) => players[pid]?.name || 'Giocatore');
              const outcome = results[key] ? 'Vinta' : 'Persa';
              return (
                <li key={key} className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{labels[key]}: <strong>{outcome}</strong></span>
                  <span style={{ opacity: 0.85 }}>Giocatori: {winners.length ? winners.join(', ') : '—'}</span>
                </li>
              );
            };
            return (
              <div style={{ marginTop: 12, textAlign: 'left' }}>
                <h4>Esito Side Bets</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  {listItem('odd_majority')}
                  {listItem('even_majority')}
                  {listItem('any_prime')}
                  {listItem('any_mul10')}
                </ul>
              </div>
            );
          })()}
          <div style={{ marginTop: 12 }}>
            <Link href="/" className="btn-3d" style={{ textDecoration: 'none' }}>Torna alla Home</Link>
          </div>
        </div>
      )}
      {showConfirm && (
        <div className="overlay-backdrop">
          <div className="overlay-content">
            <span className="check-emoji">✅</span>
            <div>Puntata inviata!</div>
          </div>
        </div>
      )}
      {roomData.status !== 'finished' && (
        <div style={{ position: 'relative', marginTop: 16 }}>
          {/* Wheel overlay */}
          <Wheel
            visible={wheelVisible}
            segments={wheelSegments}
            targetIndex={wheelTargetIndex}
            spinning={wheelSpinning}
            onDone={() => { if (onWheelDoneRef.current) { onWheelDoneRef.current(); } }}
          />
          <div className="reactions-bar">
            {['👏','🔥','😂','😮','😡','❤️'].map(r => (
              <button key={r} className="reaction-btn" onClick={() => sendReaction(r)}>{r}</button>
            ))}
          </div>
          {reactions.map((r, i) => (
            <div key={i} className="reaction-float">{r.emoji}</div>
          ))}

          {/* Chat */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <input
              className="input-modern"
              type="text"
              maxLength={120}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Scrivi un messaggio (max 120)"
            />
            <button className="btn-3d" onClick={sendChatMessage}>Invia</button>
          </div>
          <div style={{ marginTop: 8, maxHeight: 140, overflowY: 'auto', textAlign: 'left' }}>
            {chatMessages.map((m, idx) => (
              <div key={idx} className="fade-up" style={{ fontSize: 14, opacity: 0.95, padding: '4px 2px' }}>
                <span style={{ fontWeight: 700 }}>{m.avatar ? `${m.avatar} ` : ''}{m.name}:</span> {m.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connection indicators */}
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        <span className="bubble" style={{ marginRight: 8 }}>{isOnline ? 'Online' : 'Offline'}</span>
        <span className="bubble" style={{ marginRight: 8 }}>{dbConnected ? 'DB ok' : 'DB down'}</span>
        {pingMs != null && <span className="bubble">Ping: {pingMs} ms</span>}
      </div>
      </div>
    </div>
  );
}

function SideBetCard({ colorFrom, colorTo, title, desc, onPlace }) {
  const [amount, setAmount] = useState('');
  return (
    <div className="fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 10, borderRadius: 12, border: '1px solid rgba(99,102,241,0.25)', marginTop: 8 }}>
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="input-modern" type="text" inputMode="numeric" pattern="^[0-9]+$" value={amount} onChange={(e)=>setAmount(e.target.value.replace(/[^0-9]/g,''))} placeholder="Crediti" style={{ width: 120 }} />
        <button
          className="btn-3d"
          style={{ background: `linear-gradient(180deg, ${colorFrom}, ${colorTo})` }}
          onClick={async ()=>{ const v = Number(amount); if (!Number.isFinite(v) || v<=0) return; await onPlace(v); setAmount(''); }}
        >Punta</button>
      </div>
    </div>
  );
}

function isPrime(n){
  n = Number(n);
  if (n<=1) return false;
  if (n<=3) return true;
  if (n%2===0 || n%3===0) return false;
  for (let i=5;i*i<=n;i+=6){ if(n%i===0 || n%(i+2)===0) return false; }
  return true;
}
function getWeek(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}
