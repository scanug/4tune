"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "../../lib/firebase";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { ref as dbRef, onValue, off, update } from "firebase/database";
import { ref as stRef, uploadBytes, getDownloadURL } from "firebase/storage";

const PRESET_AVATARS = [
  "/file.svg", "/globe.svg", "/next.svg", "/vercel.svg", "/window.svg"
];

export default function ProfilePage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/auth");
      } else {
        setUid(u.uid);
        const r = dbRef(db, `users/${u.uid}`);
        onValue(r, (snap) => {
          const val = snap.val();
          setProfile(val);
          setName(val?.name || "");
          setAvatar(val?.avatar || "");
        });
      }
    });
    return () => unsub();
  }, [router]);

  async function handleUpload(file) {
    if (!file || !uid) return;
    const maxSize = 1024 * 1024; // 1MB
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
      await update(dbRef(db, `users/${uid}`), { name: safeName, avatar: avatar || null });
      try { await updateProfile(auth.currentUser, { displayName: safeName, photoURL: avatar || null }); } catch {}
      setMsg("Profilo aggiornato");
    } catch (e) {
      setMsg("Errore salvataggio profilo");
    } finally { setSaving(false); }
  }

  if (!uid || !profile) return <p style={{ padding: 20 }}>Caricamento profilo...</p>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ padding: 24, width: 'min(520px, 92vw)', border: '2px solid rgba(99,102,241,0.4)', borderRadius: 16, background: 'rgba(255,255,255,0.04)', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
        <h1 style={{ textAlign: 'center' }}>Profilo utente</h1>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div>
            <label>Nickname</label>
            <input className="input-modern" type="text" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label>Avatar</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {PRESET_AVATARS.map((src) => (
                <button key={src} type="button" className="btn-3d" onClick={() => setAvatar(src)} style={{ padding: '6px 10px' }}>{src.endsWith('.svg') ? 'SVG' : 'IMG'}</button>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </div>
            {avatar && (
              <div style={{ marginTop: 8 }}>
                <img src={avatar} alt="avatar" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
              </div>
            )}
          </div>
          <button className="btn-3d" onClick={saveProfile} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          {msg && <p style={{ color: '#10b981' }}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}
