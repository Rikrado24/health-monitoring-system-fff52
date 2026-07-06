# Firebase Integration Guide

Project ini memakai Firebase untuk aplikasi web monitoring kesehatan.

## Layanan Aktif

- Authentication untuk daftar/login user.
- Firestore untuk profil user dan mapping username.
- Firestore untuk hasil prediksi Machine Learning per user.
- Realtime Database untuk data realtime seperti pengukuran, aktivitas, pengingat, riwayat, chat edukasi, dan link alat.
- Hosting untuk publish aplikasi web.

## Struktur Utama

### Firestore

```text
users/{uid}
usernames/{username_lower}
```

`users/{uid}` menyimpan profil lengkap dari form daftar dan edit profil.

`usernames/{username_lower}` menyimpan mapping username ke email agar user bisa login pakai username.

### Realtime Database

```text
users/{uid}/profile
users/{uid}/pengukuran
users/{uid}/activities
users/{uid}/reminders
users/{uid}/history_events
users/{uid}/doctor_chat
device_links/{deviceId}
```

`users/{uid}/profile` adalah salinan profil agar mudah dilihat di Realtime Database.

`users/{uid}/pengukuran` menyimpan data pengukuran gabungan.

`users/{uid}/health_predictions/{predictionId}` menyimpan hasil prediksi status kesehatan dari model Decision Tree.

`device_links/{deviceId}` menghubungkan `deviceId` ESP32-S3 UNO ke user yang sedang login.

## Alur Alat ESP32-S3 UNO

Alat otomatis hanya mengirim:

- tinggi badan
- berat badan

Data manual tetap diinput dari web:

- tekanan darah
- detak jantung

Saat user menautkan device di web, aplikasi menyimpan link:

```text
device_links/{deviceId}
```

Setelah alat terhubung, data pengukuran disimpan ke:

```text
users/{uid}/pengukuran
```

`sumber_data` untuk alat adalah:

```text
esp32_s3
```

## Deploy

```powershell
npm run build
npx firebase deploy
```
