# SehatAI

Sistem monitoring data kesehatan real-time berbasis IoT dengan ESP32-S3, Firebase, dan dashboard web React.

## Fitur Utama

- Monitoring tinggi badan, berat badan, BMI, detak jantung, tekanan darah, dan langkah harian.
- Sinkronisasi data perangkat ke Firebase Realtime Database.
- Autentikasi user dengan Firebase Authentication.
- Riwayat pengukuran, aktivitas, pengingat, dan percakapan edukasi.
- Edukasi kesehatan berbasis Gemini.
- Modul Machine Learning untuk klasifikasi status kesehatan.

## Struktur Machine Learning

Modul ML berada di folder `ml/` dan memakai dataset sintetis untuk klasifikasi status kesehatan:

- `0 = Sehat`
- `1 = Perlu Perhatian`
- `2 = Risiko Tinggi`

### Dataset

File dataset:

- `ml/dataset/health_classification_dataset.csv`

Kolom fitur:

- `age`
- `gender`
- `height_cm`
- `weight_kg`
- `bmi`
- `heart_rate`
- `systolic_bp`
- `diastolic_bp`
- `steps`
- `health_status`

Keterangan gender:

- `0 = perempuan`
- `1 = laki-laki`

Catatan penting:

- Dataset ini bersifat sintetis untuk kebutuhan skripsi dan uji coba implementasi.
- Hasil model digunakan untuk klasifikasi status kesehatan, bukan diagnosis medis.

### Algoritma

Model utama:

- `DecisionTreeClassifier`

Model pembanding:

- `KNeighborsClassifier`

### Training

Jalankan training:

```bash
python ml/train_model.py
```

Jika `python` belum dikenali di Windows, pakai path interpreter yang terpasang atau aktifkan Python di PATH terlebih dahulu.

Script ini akan:

- membuat dataset sintetis
- melatih model
- menguji model dengan split 80/20
- menghitung accuracy, precision, recall, f1-score
- menjalankan 5-fold cross-validation
- menyimpan confusion matrix
- mengekspor tree model untuk dipakai frontend

### Prediksi

Jalankan prediksi manual:

```bash
python ml/predict.py --age 30 --gender 1 --height-cm 170 --weight-kg 68 --bmi 23.5 --heart-rate 78 --systolic-bp 118 --diastolic-bp 76 --steps 7200
```

Atau pakai JSON:

```bash
python ml/predict.py --input-json "{\"age\":30,\"gender\":1,\"height_cm\":170,\"weight_kg\":68,\"bmi\":23.5,\"heart_rate\":78,\"systolic_bp\":118,\"diastolic_bp\":76,\"steps\":7200}"
```

### File Hasil Training

- Model: `ml/model/health_status_model.joblib`
- Label mapping: `ml/model/label_mapping.json`
- Metadata model: `ml/model/model_metadata.json`
- Tree export untuk frontend: `ml/model/health_status_tree.json`
- Evaluasi: `ml/reports/evaluation_report.txt`
- Confusion matrix: `ml/reports/confusion_matrix.csv`
- Dataset mentah: `ml/dataset/health_classification_dataset.csv`

## Menjalankan Web App

```bash
npm install
npm run dev
```

## Build Android APK via Cloud

Project ini sudah disiapkan untuk build Android di GitHub Actions.

1. Push project ini ke GitHub.
2. Buka tab `Actions`.
3. Jalankan workflow `Build Signed Android APK`.
4. Ambil artifact `health-monitoring-system-fff52`.

Workflow ada di [.github/workflows/android-release-apk.yml](/c:/Users/USER/projek%20baru/.github/workflows/android-release-apk.yml).

Sebelum dijalankan, tambahkan GitHub Secrets berikut:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

`ANDROID_KEYSTORE_BASE64` adalah isi file keystore yang sudah diubah ke base64. Di Windows, kamu bisa membuatnya nanti dari file `.jks` atau `.keystore`.

Hasil file APK akan bernama `health-monitoring-system-fff52.apk`.

Jika mau build lokal lagi di perangkat lain, jalankan:

```bash
npm install
npm run android:sync
```

Lalu buka folder `android/` di Android Studio.

## Catatan Teknis

- Firebase Realtime Database tetap dipakai untuk data alat dan riwayat pengukuran.
- Firebase AI Gemini tetap dipakai untuk chat edukasi.
- Prediksi Machine Learning tersimpan ke Firestore pada `users/{uid}/health_predictions/{predictionId}`.
