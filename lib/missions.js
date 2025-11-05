'use client';

import { ref, get, set, update, runTransaction, onValue, off } from 'firebase/database';
import { db } from './firebase';

export const MISSION_DEFS = {
  win_3_games: { title: 'Vinci 3 partite', goal: 3, reward: 50 },
  spin_wheel: { title: 'Fai uno spin della ruota', goal: 1, reward: 20 },
};

function isValidKey(k) {
  return typeof k === 'string' && k.length > 0 && !/[.#$\[\]/]/.test(k);
}

export function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildDefaultMissionsState() {
  return {
    win_3_games: { progress: 0, goal: MISSION_DEFS.win_3_games.goal, reward: MISSION_DEFS.win_3_games.reward, completed: false },
    spin_wheel: { progress: 0, goal: MISSION_DEFS.spin_wheel.goal, reward: MISSION_DEFS.spin_wheel.reward, completed: false },
  };
}

export async function ensurePlayerMissions(userKey) {
  if (!isValidKey(userKey)) return;
  const userRef = ref(db, `users/${userKey}`);
  const snap = await get(userRef);
  if (!snap.exists()) {
    // user doc non presente: non creiamo qui, ma non possiamo assicurare le missioni
    return;
  }
  const v = snap.val() || {};
  const updates = {};
  if (!v.missions) updates['missions'] = buildDefaultMissionsState();
  if (!v.lastMissionReset) updates['lastMissionReset'] = getTodayDateString();
  if (Object.keys(updates).length > 0) {
    try { console.log('[MISSIONS] ensure:apply', { userKey, updates }); } catch {}
    await update(userRef, updates);
  }
}

export async function resetMissionsIfNeeded(userKey) {
  if (!isValidKey(userKey)) return;
  const userRef = ref(db, `users/${userKey}`);
  const snap = await get(userRef);
  const v = snap.val() || {};
  const today = getTodayDateString();
  if (v.lastMissionReset !== today) {
    try { console.log('[MISSIONS] reset:apply', { userKey, from: v.lastMissionReset, to: today }); } catch {}
    await update(userRef, {
      missions: buildDefaultMissionsState(),
      lastMissionReset: today,
    });
  }
}

export async function updateMissionProgress(userKey, missionKey) {
  if (!isValidKey(userKey) || !MISSION_DEFS[missionKey]) return;
  const userRef = ref(db, `users/${userKey}`);
  try { console.log('[MISSIONS] progress:start', { userKey, missionKey }); } catch {}
  await runTransaction(userRef, (current) => {
    const user = current || {};
    const missions = user.missions || buildDefaultMissionsState();
    const mission = missions[missionKey] || { progress: 0, goal: MISSION_DEFS[missionKey].goal, reward: MISSION_DEFS[missionKey].reward, completed: false };
    if (!mission.completed) {
      mission.progress = Number(mission.progress || 0) + 1;
      if (mission.progress >= Number(mission.goal || 0) && mission.completed !== true) {
        mission.completed = true;
        const reward = Number(mission.reward || 0);
        const currentCredits = Number(user.credits || 0);
        user.credits = currentCredits + reward;
      }
    }
    missions[missionKey] = mission;
    user.missions = missions;
    if (!user.lastMissionReset) {
      user.lastMissionReset = getTodayDateString();
    }
    try { console.log('[MISSIONS] progress:apply', { mission: missionKey, progress: mission.progress, completed: mission.completed }); } catch {}
    return user;
  });
}

export function subscribeToPlayerMissions(userKey, setState) {
  // Lightweight helper to subscribe to missions changes
  if (!isValidKey(userKey)) return () => {};
  const r = ref(db, `users/${userKey}`);
  const handler = (snap) => {
    const v = snap.val() || {};
    setState({ missions: v.missions || buildDefaultMissionsState(), credits: v.credits || 0, lastMissionReset: v.lastMissionReset || getTodayDateString() });
    try { console.log('[MISSIONS] subscribe:update', { userKey, hasMissions: !!v.missions }); } catch {}
  };
  onValue(r, handler);
  return () => off(r, 'value', handler);
}


