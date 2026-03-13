catatan arkaan sendiri =
1. untuk index.js copy paste lewat sini https://ai.google.dev/gemini-api/docs/quickstart#javascript
2. untuk .env ambil GEMINI_API_KEY lewat https://aistudio.google.com/api-keys
3. buat .gitignore
4. install npm init -y
5. install npm install @google/genai dotenv
6. tambahkan import 'dotenv/config'; dalam index.js
7. tambahkan "type": "module" di package.json
8. penjelasan restful api ada di https://restfulapi.net/ yang berfungsi untuk perantara (server) antara api gemini dan request aplikasi (user)
9. cara run node index.js
10. cek ListModels https://generativelanguage.googleapis.com/v1beta/models?key=GEMINI_API_KEY atau https://ai.google.dev/api/models#models_list-SHELL
11. 

dari mas eas =
1. dapetin API key: https://ai.google.dev/gemini-api/docs 
2. setup Node.js: https://nodejs.org/en/download 
3. setup repository local:  git init 
4. setup project local:  npm init -y 
5. Install package:  npm install @google/genai dotenv 
6. set  "type": "module"  di  package.json 
7. copas: https://ai.google.dev/gemini-api/docs

catatan dari ai =
1. buka terminal, buat folder project lalu masuk ke foldernya
2. jalankan `npm init -y` --> buat file package.json (konfigurasi project Node.js)
3. tambahkan `"type": "module"` di package.json supaya bisa pakai syntax import/export
4. install package yang dibutuhkan: `npm install @google/genai dotenv express multer`
   - @google/genai --> SDK untuk akses API Gemini
   - dotenv --> baca file .env supaya API key tidak hardcode
   - express --> framework web server untuk bikin REST API
   - multer --> middleware untuk handle upload file (gambar, dokumen, audio)
5. buat file `.env`, isi dengan: `GEMINI_API_KEY=api_key_kamu_disini`
   - API key didapat dari https://aistudio.google.com/api-keys
6. buat file `.gitignore`, isi minimal: `node_modules` dan `.env` (supaya tidak ke-push ke git)
7. buat file `index.js`, lalu isi step by step:

   STEP A - Import & Setup Awal:
   a. import semua modul (express, multer, GoogleGenAI, dotenv/config)
   b. inisialisasi GoogleGenAI dengan API key dari process.env
   c. buat konstanta MODELS berisi nama-nama model Gemini yang mau dipakai:
      - flashLite31: "gemini-3.1-flash-lite-preview"
      - flash3: "gemini-3-flash-preview"
      - pro: "gemini-3.1-pro-preview"
      - gemma3: "gemma-3-27b-it"
   d. tentukan PORT (dari env atau default 3000)
   e. buat instance express --> `const app = express()`
   f. buat instance multer --> `const upload = multer()`
   g. pasang middleware `express.json()` supaya bisa terima body JSON

   STEP B - Route POST /generate (teks ke teks):
   a. buat route `app.post('/generate', async (request, response) => {})`
   b. ambil body.message dari request
   c. validasi: cek apakah message ada dan bertipe string (guard clause)
   d. panggil `ai.models.generateContent()` dengan model MODELS.flash3 dan isi pesan
   e. kembalikan hasil AI (aiResponse.text) dan metadata (aiResponse.usageMetadata) ke client
   f. bungkus dalam try-catch untuk tangani error

   STEP C - Route POST /generate/text-from-image (gambar + teks ke teks):
   a. buat route `app.post('/generate/text-from-image', upload.single('image'), async (req, res) => {})`
   b. upload.single('image') --> middleware multer untuk terima 1 file dengan field name 'image'
   c. validasi: cek body.message dan request.file harus ada
   d. konversi file gambar ke base64: `file.buffer.toString('base64')`
   e. ambil tipe file: `file.mimetype`
   f. kirim ke AI dengan format contents array:
      - { text, type: "text" } --> prompt teks
      - { inlineData: { data: base64Image, mimeType: fileType } } --> data gambar
   g. pakai model MODELS.flashLite31

   STEP D - Route POST /generate/text-from-doc (dokumen + teks ke teks):
   a. buat route `app.post('/generate/text-from-doc', upload.single('doc'), async (req, res) => {})`
   b. sama seperti image, tapi field name-nya 'doc'
   c. konversi dokumen ke base64 lalu kirim ke AI
   d. pakai model MODELS.flashLite31

   STEP E - Route POST /generate/text-from-audio (audio + teks ke teks):
   a. buat route `app.post('/generate/text-from-audio', upload.single('audio'), async (req, res) => {})`
   b. sama seperti image/doc, tapi field name-nya 'audio'
   c. konversi audio ke base64 lalu kirim ke AI
   d. error handling lebih lengkap:
      - 400 --> format audio tidak didukung
      - 413 --> file audio terlalu besar
      - 415 --> tipe file audio tidak didukung
      - 429 --> terlalu banyak request (rate limit)
      - 500 --> error server AI
      - 503 --> layanan AI tidak tersedia

   STEP F - Jalankan Server:
   a. `app.listen(PORT)` --> server mulai jalan di port yang ditentukan

8. jalankan aplikasi: `node index.js`
9. test API pakai Postman / Thunder Client / curl:

   Endpoint 1 - Teks biasa:
   - method: POST
   - url: http://localhost:3000/generate
   - body (JSON): `{ "message": "apa itu AI?" }`

   Endpoint 2 - Gambar + teks:
   - method: POST
   - url: http://localhost:3000/generate/text-from-image
   - body (form-data):
     - key 'message' (text): "jelaskan gambar ini"
     - key 'image' (file): pilih file gambar

   Endpoint 3 - Dokumen + teks:
   - method: POST
   - url: http://localhost:3000/generate/text-from-doc
   - body (form-data):
     - key 'message' (text): "rangkum dokumen ini"
     - key 'doc' (file): pilih file dokumen

   Endpoint 4 - Audio + teks:
   - method: POST
   - url: http://localhost:3000/generate/text-from-audio
   - body (form-data):
     - key 'message' (text): "transkrip audio ini"
     - key 'audio' (file): pilih file audio
