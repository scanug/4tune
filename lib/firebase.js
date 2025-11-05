import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBslali8yqg7w6HZW7oKhKsmhkqr6ui6YE',
  authDomain: 'giocodazzardo-f1125.firebaseapp.com',
  databaseURL: "https://giocodazzardo-f1125-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: 'giocodazzardo-f1125',
  storageBucket: "giocodazzardo-f1125.firebasestorage.app",
  messagingSenderId: '1057176706280',
  appId: '1:1057176706280:web:038301b174dc234f747d5d',
  measurementId: 'G-PEJ503PTS4',
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
