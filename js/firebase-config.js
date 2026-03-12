// ============================================
// Firebase Configuration
// ============================================
// Sadece 2 adım gerekli:
// 1. https://console.firebase.google.com > Proje oluştur
// 2. Build > Realtime Database > Create Database > "Test mode" seç
// 3. Project Settings (dişli ikonu) > "Add app" > Web (</>) > Config değerlerini kopyala
//
// Authentication'a GEREK YOK. Kullanıcı ID'si tarayıcıda oluşturulur.

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
