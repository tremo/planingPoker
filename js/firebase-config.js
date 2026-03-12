// ============================================
// Firebase Configuration
// ============================================
// Bu değerleri kendi Firebase projenizden alın:
// 1. https://console.firebase.google.com adresine gidin
// 2. Yeni proje oluşturun (veya mevcut projeyi seçin)
// 3. "Web app" ekleyin (</>  ikonu)
// 4. Realtime Database'i etkinleştirin (Build > Realtime Database > Create Database)
// 5. Authentication > Sign-in method > Anonymous'u etkinleştirin
// 6. Aşağıdaki config değerlerini kendi projenizin değerleriyle değiştirin
//
// Realtime Database kuralları (güvenlik için):
// {
//   "rules": {
//     "rooms": {
//       "$roomId": {
//         ".read": true,
//         ".write": true
//       }
//     }
//   }
// }

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
const auth = firebase.auth();
