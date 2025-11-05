"use client";
import { useState } from "react";
import { auth, db } from "../../lib/firebase";
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from "firebase/auth";
import { ref, set, get } from "firebase/database";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSignup() {
    setLoading(true); setMessage("");
    try {
      if (password !== confirm) { setMessage("Le password non coincidono"); setLoading(false); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      try { await sendEmailVerification(cred.user); } catch {}
      setMessage("Registrazione completata. Controlla la tua email per la verifica.");
      // Create user profile if not present
      const userRef = ref(db, `users/${cred.user.uid}`);
      const snap = await get(userRef);
      if (!snap.exists()) {
        await set(userRef, { id: cred.user.uid, uid: cred.user.uid, email: cred.user.email, name: cred.user.email?.split("@")[0] || "User", avatar: null, credits: 100, createdAt: Date.now() });
      }
    } catch (e) {
      setMessage(e.message || "Errore in registrazione");
    } finally { setLoading(false); }
  }

  async function handleLogin() {
    setLoading(true); setMessage("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        setMessage("Email non verificata. Controlla la casella di posta.");
      } else {
        // Ensure profile exists
        const userRef = ref(db, `users/${cred.user.uid}`);
        const snap = await get(userRef);
        if (!snap.exists()) {
          await set(userRef, { id: cred.user.uid, uid: cred.user.uid, email: cred.user.email, name: cred.user.email?.split("@")[0] || "User", avatar: null, credits: 100, createdAt: Date.now() });
        }
        router.push("/");
      }
    } catch (e) {
      setMessage(e.message || "Errore in login");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ padding: 24, width: 'min(520px, 92vw)', border: '2px solid rgba(99,102,241,0.4)', borderRadius: 16, background: 'rgba(255,255,255,0.04)', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', textAlign: 'center' }}>
        <h1>{mode === 'login' ? 'Login' : 'Registrazione'}</h1>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <input className="input-modern" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input-modern" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'signup' && (
            <input className="input-modern" type="password" placeholder="Conferma password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          )}
          {mode === 'login' ? (
            <button className="btn-3d" onClick={handleLogin} disabled={loading}>{loading ? '...' : 'Accedi'}</button>
          ) : (
            <button className="btn-3d" onClick={handleSignup} disabled={loading}>{loading ? '...' : 'Registrati'}</button>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          {mode === 'login' ? (
            <button className="btn-3d" onClick={() => setMode('signup')}>Vai a Registrazione</button>
          ) : (
            <button className="btn-3d" onClick={() => setMode('login')}>Vai a Login</button>
          )}
        </div>
        {message && <p style={{ marginTop: 12, color: '#f59e0b' }}>{message}</p>}
      </div>
    </div>
  );
}
