// Firebase initialization (modular SDK via ESM)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCoNNaQ30xVM3tjC1vBiUp6y8Hkl8sy2V8',
  authDomain: 'maynilatekdo.firebaseapp.com',
  databaseURL: 'https://maynilatekdo-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'maynilatekdo',
  storageBucket: 'maynilatekdo.firebasestorage.app',
  messagingSenderId: '835673306092',
  appId: '1:835673306092:web:f0541edb14edc7741b46c9',
  measurementId: 'G-B1S4DB0T5G'
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Expose for non-module libs to access if needed
window.__APP__ = { app, db, storage };

// Small helpers for date/ids
export const nowTs = () => new Date();
export const uid = (p='id') => `${p}_${Math.random().toString(36).slice(2,8)}_${Date.now().toString(36)}`;

// Put current year in footer
const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();
// Storage helpers moved to `js/storage.js` (uploadFile)
