// Import modul 'express' --> framework untuk membuat web server & routing di Node.js
import express from 'express';

// Import modul 'multer' --> middleware untuk menangani upload file (multipart/form-data)
import multer from 'multer';

// Import class 'GoogleGenAI' dari package Google GenAI --> SDK untuk mengakses model AI Google (Gemini)
// Menggunakan destructuring { } karena hanya mengambil satu export dari modul tersebut
import { GoogleGenAI } from "@google/genai";

// Import 'dotenv/config' --> otomatis membaca file .env dan memasukkan variabelnya ke process.env
import 'dotenv/config';

import cors from 'cors';

// Membuat instance GoogleGenAI dengan API key dari environment variable
// process.env.GEMINI_API_KEY --> mengambil nilai variabel GEMINI_API_KEY dari file .env
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Objek konstanta berisi daftar nama model AI yang tersedia
// Dipakai supaya tidak perlu menulis ulang string model secara manual
const MODELS = {
  flashLite31: "gemini-3.1-flash-lite-preview",
  flash3: "gemini-3-flash-preview",
  pro: "gemini-3.1-pro-preview",
  gemma3 : "gemma-3-27b-it"
};

// Menentukan port server: ambil dari env variable PORT, jika tidak ada gunakan default 3000
// Operator || --> logical OR, jika sisi kiri falsy maka pakai sisi kanan
const PORT = process.env.PORT || 3000;

// Persiapan
// - Inisialisasi Express dan Multer,
// - Inisialisasi CORS

// express() --> membuat instance aplikasi Express
const app = express();

// multer() --> membuat instance multer untuk handling upload file
const upload = multer();

// Inisialisasi Aplikasi

// app.use() --> mendaftarkan middleware yang berlaku untuk semua route
// express.json() --> middleware bawaan Express untuk mem-parse body request yang berformat JSON
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // untuk melayani file statis dari folder 'public'

// Mendefinisikan route POST pada endpoint '/generate'
// async (request, response) => { ... } --> arrow function async sebagai handler route
// 'request' = objek berisi data dari client, 'response' = objek untuk mengirim balasan ke client
app.post('/generate', async (request, response) => {
  // request.body --> mengambil body/payload dari request (sudah di-parse oleh express.json())
  const body = request.body;

  // guard clause -- satpam payload
  // Jika body.message kosong/undefined/null, kembalikan error 400 (Bad Request)
  // return --> menghentikan eksekusi fungsi agar kode di bawahnya tidak jalan
  // response.status(400) --> set HTTP status code 400
  // .json() --> kirim response dalam format JSON
  if (!body.message) {
    return response.status(400).json('belum ada pesan!');
  }

  // guard clause 2 -- satpam tipe data
  // typeof --> operator untuk mengecek tipe data sebuah variabel
  // !== --> strict inequality (tidak sama dan harus tipe data yang sama)
  if (typeof body.message !== 'string') {
    return response.status(400).json('pesannya harus teks ya!');
  }

  // try-catch --> menangkap error yang terjadi di dalam blok try
  // Jika ada error, eksekusi lompat ke blok catch
  try {
    // await --> menunggu Promise selesai sebelum lanjut ke baris berikutnya
    // ai.models.generateContent() --> memanggil API Gemini untuk menghasilkan konten AI
    // Parameter: model (model AI yang dipakai) dan contents (prompt/pesan dari user)
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flash3,
      contents: body.message
    });

    // Status 200 --> OK (berhasil)
    // aiResponse.text --> mengambil teks hasil generate dari AI
    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });
  } catch (error) {
    // console.log(error) --> mencetak error ke terminal untuk debugging
    console.log(error);

    // Status 500 --> Internal Server Error
    // error.message --> mengambil pesan error yang terjadi
    return response.status(500).json(error.message);
  }
});

app.post('/generate/text-from-image', upload.single('image'), async (request, response) => {
  const body = request.body;
 
  // guard clause -- satpam payload
  if (!body.message || !request.file) {
    return response.status(400).json('File dan pesan harus lengkap!');
  }
 
  // guard clause 2 -- satpam tipe data
  if (typeof body.message !== 'string') {
    return response.status(400).json('pesannya harus teks ya!');
  }
 
  // kita pecah request.body-nya di sini
  const text = body.message;
  const file = request.file;
  const base64Image = file.buffer.toString('base64');
  const fileType = file.mimetype;
 
  // try --> "markicob" (mari kita 'coba')
  try {
    // siapkan AI response
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flashLite31,
      contents: [
        { text, type: "text" },
        { inlineData: { data: base64Image, mimeType: fileType } }
      ]
    });
 
    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });
  } catch (error) {
    console.log(error);
 
    return response.status(500).json(error.message);
  }
});

app.post('/generate/text-from-doc', upload.single('doc'), async (request, response) => {
  const body = request.body;
 
  // guard clause -- satpam payload
  if (!body.message || !request.file) {
    return response.status(400).json('File dan pesan harus lengkap!');
  }
 
  // guard clause 2 -- satpam tipe data
  if (typeof body.message !== 'string') {
    return response.status(400).json('pesannya harus teks ya!');
  }
 
  // kita pecah request.body-nya di sini
  const text = body.message;
  const file = request.file;
  const base64Doc = file.buffer.toString('base64');
  const fileType = file.mimetype;
 
  // try --> "markicob" (mari kita 'coba')
  try {
    // siapkan AI response
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flashLite31,
      contents: [
        { text, type: "text" },
        { inlineData: { data: base64Doc, mimeType: fileType } }
      ]
    });
 
    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });
  } catch (error) {
    console.log(error);

    return response.status(500).json(error.message);
  }
});

app.post('/generate/text-from-audio', upload.single('audio'), async (request, response) => {
  const body = request.body;
 
  // guard clause -- satpam payload
  if (!body.message || !request.file) {
    return response.status(400).json('File dan pesan harus lengkap!');
  }
 
  // guard clause 2 -- satpam tipe data
  if (typeof body.message !== 'string') {
    return response.status(400).json('pesannya harus teks ya!');
  }
 
  // kita pecah request.body-nya di sini
  const text = body.message;
  const file = request.file;
  const base64Audio = file.buffer.toString('base64');
  const fileType = file.mimetype;
 
  // try --> "markicob" (mari kita 'coba')
  try {
    // siapkan AI response
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flashLite31,
      contents: [
        { text, type: "text" },
        { inlineData: { data: base64Audio, mimeType: fileType } }
      ]
    });
 
    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });
  } catch (error) {
    console.log(error.status);
    if (error.status === 400) {
      return response.status(400).json('Format audio tidak didukung!');
    }
    if (error.status === 401) {
      return response.status(401).json('Unauthorized, periksa API key Anda!');
    }
    if (error.status === 403) {
      return response.status(403).json('Anda tidak memiliki izin untuk mengakses layanan AI!');
    }
    if (error.status === 413) {
      return response.status(413).json('File audio terlalu besar!');
    }
    if (error.status === 415) {
      return response.status(415).json('Tipe file audio tidak didukung!');
    }
    if (error.status === 429) {
      return response.status(429).json('Terlalu banyak permintaan, coba lagi nanti!');
    }
    if (error.status === 500) {
      return response.status(500).json('Terjadi kesalahan pada server AI!');
    }
    if (error.status === 503) {
      return response.status(503).json('Layanan AI sedang tidak tersedia, coba lagi nanti!');
    }
    return response.status(500).json(error.message);
  }
});

// Route untuk upload dokumen (belum diimplementasi, masih di-comment)
// upload.single('docs') --> middleware multer untuk menerima 1 file dengan field name 'docs'
// app.post('/generate/doc', upload.single('docs'), async () => {});

// app.listen() --> menjalankan server dan mulai mendengarkan request pada port yang ditentukan
// Callback function dipanggil ketika server berhasil berjalan
app.listen(PORT, () => {
  console.log("I LOVE YOU", PORT);
});




// async function main() {
//   const response = await ai.models.generateContent({
//     model: "gemini-3-flash-preview",
//     contents: "Explain how AI works in a few words",
//   });
//   console.log(response.text);
// }

// main();