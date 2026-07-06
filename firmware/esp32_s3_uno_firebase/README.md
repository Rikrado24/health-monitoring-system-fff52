# Firmware ESP32-S3 UNO ke Firebase

Firmware ini membuat ESP32-S3 UNO mengirim data tinggi dan berat badan ke Firebase Realtime Database lewat internet. Web lokal dan web publish akan membaca data yang sama dari Firebase, jadi tidak bergantung ke IP alat.

## Library Arduino Yang Dibutuhkan

Install dari Arduino IDE Library Manager:

- `LiquidCrystal I2C`
- `HX711`

Library berikut biasanya sudah tersedia dari board ESP32:

- `WiFi`
- `HTTPClient`
- `WiFiClientSecure`

## Yang Perlu Diisi

Buka `esp32_s3_uno_firebase.ino`, lalu ubah bagian ini:

```cpp
const char* WIFI_SSID = "ISI_NAMA_WIFI_ATAU_HOTSPOT";
const char* WIFI_PASSWORD = "ISI_PASSWORD_WIFI";
const char* DEVICE_ID = "ESP32-S3-UNO-01";
const char* WRITE_KEY = "ISI_KUNCI_ALAT_DARI_WEB";
```

Ambil `DEVICE_ID` dan `WRITE_KEY` dari web. Di tampilan web namanya `Kunci Alat`, tetapi di firmware tetap ditulis ke variabel `WRITE_KEY` dan dikirim sebagai field JSON `writeKey`.

1. Login ke web.
2. Masuk menu `Pengukuran Manual` atau `Pengaturan`.
3. Klik `Connect Device`.
4. Isi `Device ID`, contoh `ESP32-S3-UNO-01`.
5. Klik `Tautkan Device ke Firebase`.
6. Masukkan `Kunci Alat` yang muncul di web ke firmware ESP32.

Catatan: `Kunci Alat` dibuat khusus untuk satu device. Kalau kamu menghubungkan ulang device yang sama, gunakan key yang sama. Kalau device-nya berbeda, buat key baru dari web.

## Cara Kerja Data

ESP32 mengirim HTTP POST ke:

```text
https://health-monitoring-system-fff52-default-rtdb.asia-southeast1.firebasedatabase.app/device_stream/ESP32-S3-UNO-01.json
```

Payload yang dikirim:

```json
{
  "deviceId": "ESP32-S3-UNO-01",
  "writeKey": "KUNCI_ALAT_DARI_WEB",
  "height": 170,
  "weight": 65,
  "heartRate": 0,
  "steps": 0,
  "bloodPressure": "0/0",
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

Web akan otomatis mengambil data dari `device_stream`, lalu menyimpannya ke:

```text
users/{uid}/pengukuran
```

Saat user klik `Connect Device`, web juga menulis nama user ke:

```text
device_display/ESP32-S3-UNO-01
```

ESP32 membaca path ini setiap 3 detik. Jika alat sedang standby atau belum diinjak, LCD menampilkan:

```text
User siap:
Nama User
```

Catatan: rules Firebase harus sudah di-deploy ulang agar ESP32 bisa membaca `device_display`.

## Uji Penggunaan Sensor

Firmware saat ini membaca data tinggi badan dari HC-SR04 dan berat badan dari HX711. Untuk pengujian tanpa perangkat fisik, disarankan membuat varian firmware uji terpisah dengan nilai input simulasi sebelum digunakan pada perangkat utama.

## Wiring Sensor

LCD I2C:

```text
LCD VCC -> 5V atau 3.3V
LCD GND -> GND
LCD SDA -> GPIO 8
LCD SCL -> GPIO 9
```

Sensor tinggi HC-SR04:

```text
HC-SR04 VCC  -> 5V
HC-SR04 GND  -> GND
HC-SR04 TRIG -> GPIO 4
HC-SR04 ECHO -> GPIO 5 lewat pembagi tegangan
```

Pin `ECHO` HC-SR04 keluar 5V, sedangkan ESP32 aman di 3.3V. Pakai pembagi tegangan:

```text
ECHO HC-SR04 -> resistor 1k -> titik tengah -> GPIO 5
titik tengah -> resistor 2k -> GND
```

Sensor berat load cell + HX711:

```text
HX711 VCC -> 3.3V
HX711 GND -> GND
HX711 DT  -> GPIO 6
HX711 SCK -> GPIO 7
```

Load cell ke HX711 biasanya:

```text
Merah -> E+
Hitam -> E-
Putih -> A-
Hijau -> A+
```

Semua `GND` harus disatukan.

## Kalibrasi Tinggi

Isi tinggi posisi sensor dari pijakan kaki:

```cpp
const float SENSOR_MOUNT_HEIGHT_CM = 195.0;
```

Rumus firmware:

```text
tinggi badan = SENSOR_MOUNT_HEIGHT_CM - jarak sensor ke kepala
```

Contoh: sensor dipasang 195 cm dari pijakan kaki, jarak sensor ke kepala terbaca 25 cm, maka tinggi badan = 170 cm.

Jika hasil tinggi selalu meleset beberapa cm tetapi stabil, koreksi lewat:

```cpp
const float HEIGHT_OFFSET_CM = 0.0;
```

## Kalibrasi Berat

Nilai ini wajib disesuaikan dengan load cell kamu:

```cpp
const float HX711_CALIBRATION_FACTOR = 22484.0;
```

Jika hasil berat terlalu besar, naikkan/turunkan angka ini sampai berat terbaca benar. Jika berat terbaca minus, coba:

```cpp
const float HX711_CALIBRATION_FACTOR = -22484.0;
```

atau tukar kabel `A+` dan `A-` pada HX711.

## Status LCD I2C

Saat alat hidup normal, LCD menampilkan pembacaan sensor secara terus-menerus:

```text
T:170.0cm
B:65.0kg
```

Saat proses koneksi atau kirim data, LCD akan menampilkan status seperti:

```text
WiFi OK
192.168.x.x
```

```text
Kirim Data
170.0cm 65.0kg
```

```text
Terkirim
Firebase OK
```

Jika berat di bawah 5 kg, firmware belum membaca tinggi dan belum mengirim data ke Firebase. Ini mencegah sensor tinggi membaca ruangan kosong saat tidak ada orang di alat.

Firmware juga menampilkan warning untuk masalah koneksi atau konfigurasi:

```text
WARN: Key ditola
Cek Kunci Alat
```

Jika warning `WiFi belum isi` atau `Key belum isi` muncul, berarti bagian `WIFI_SSID`, `WIFI_PASSWORD`, `DEVICE_ID`, atau `WRITE_KEY` masih memakai placeholder dan harus diganti sebelum upload.

Jika alamat LCD bukan `0x27`, ubah:

```cpp
const uint8_t LCD_ADDRESS = 0x27;
```

Alamat lain yang sering dipakai adalah `0x3F`.

## Jika Alat Hidup Tapi Tidak Muncul Di Web

Cek urutan ini:

1. Pastikan firmware yang di-upload sudah diisi, bukan masih placeholder:

```cpp
const char* WIFI_SSID = "NAMA_WIFI_KAMU";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_KAMU";
const char* WRITE_KEY = "KUNCI_ALAT_DARI_WEB";
```

2. Di web, login lalu klik `Connect Device`. Pastikan `Device ID` di web sama persis dengan firmware:

```cpp
const char* DEVICE_ID = "ESP32-S3-UNO-01";
```

3. Salin `Kunci Alat` dari panel web ke `WRITE_KEY` firmware. Jika berbeda satu karakter saja, Firebase akan menolak data dan LCD menampilkan:

```text
WARN: Key ditola
Cek Kunci Alat
```

4. Saat tes, injak alat sampai berat terbaca minimal 5 kg. Kalau belum, firmware belum mengirim data dan LCD menampilkan:

```text
WARN: Belum kir
Naik alat
```

5. Jika berat sudah terbaca tetapi tinggi tetap 0, cek kabel HC-SR04 dan pembagi tegangan ECHO. LCD akan menampilkan:

```text
WARN: Tinggi er
Cek HC-SR04
```

6. Buka Serial Monitor Arduino IDE pada `115200 baud`. Saat berhasil, harus ada log seperti:

```text
HTTP 200
```

atau kode HTTP lain. `HTTP 401` / `HTTP 403` berarti `WRITE_KEY` tidak cocok dengan yang ada di Firebase.

7. Jika nama user belum muncul di LCD setelah klik `Connect Device`, deploy rules Realtime Database:

```bash
npm run deploy:rules
```
