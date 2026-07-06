# Struktur Database SehatAI

## Authentication

Firebase Authentication menyimpan akun user.

Lokasi di console:

```text
Authentication > Users
```

## Firestore

Firestore dipakai untuk data profil utama dan login username.

```text
users/{uid}
usernames/{username_lower}
users/{uid}/health_predictions/{predictionId}
```

Contoh `users/{uid}`:

```json
{
  "nama": "Marselina Erlinda Taru",
  "email": "erlindataru@gmail.com",
  "username": "erlinda_01",
  "username_lower": "erlinda_01",
  "umur": 30,
  "jenis_kelamin": "Wanita",
  "tanggal_lahir": "1996-01-01",
  "golongan_darah": "O",
  "no_telepon": "+6281234567890",
  "lokasi": "Jakarta, Indonesia",
  "tinggi_badan": 170,
  "berat_badan": 65,
  "createdAt": "2026-06-07T00:00:00.000Z",
  "updatedAt": "2026-06-07T00:00:00.000Z"
}
```

## Realtime Database

Realtime Database dipakai untuk data yang sering berubah atau ingin mudah dilihat realtime.

```text
users/{uid}/profile
users/{uid}/pengukuran
users/{uid}/activities
users/{uid}/reminders
users/{uid}/history_events
users/{uid}/doctor_chat
device_links/{deviceId}
```

Contoh `users/{uid}/pengukuran/{entryId}`:

```json
{
  "tinggi_badan": 170,
  "berat_badan": 65,
  "detak_jantung": 78,
  "sistolik": 120,
  "diastolik": 80,
  "langkah_kaki": 0,
  "pola_makan": "-",
  "tanggal_pengukuran": "2026-06-07T00:00:00.000Z",
  "sumber_data": "esp32_s3",
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

## Sumber Data

```text
web_manual
web_sync
esp32_s3
app_mobile
```

Untuk alat fisik sekarang gunakan:

```text
esp32_s3
```

## Prediksi Machine Learning

Hasil klasifikasi status kesehatan disimpan sebagai subcollection Firestore:

```text
users/{uid}/health_predictions/{predictionId}
```

Setiap dokumen menyimpan fitur input, label prediksi, nama model, akurasi model, confidence, dan waktu prediksi.
