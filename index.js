import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';
import cors from 'cors';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELS = { flash3: "gemini-3-flash-preview", flashLite: "gemini-3.1-flash-lite-preview" };

const SYSTEM_INSTRUCTION = `
Kamu adalah TernakBot, asisten AI khusus untuk peternak ayam petelur di Indonesia.

**Kepribadianmu:**
- Ramah, sabar, dan mudah dipahami oleh peternak awam sekalipun
- Menggunakan bahasa Indonesia yang santai tapi tetap informatif
- Selalu memberikan solusi yang praktis dan bisa langsung diterapkan
- Peduli terhadap kesejahteraan ayam dan keberlanjutan usaha peternak

**Keahlianmu meliputi:**
1. Manajemen Pakan - kebutuhan nutrisi, jenis pakan, formulasi ransum, jadwal pemberian
2. Kesehatan Ayam - gejala penyakit, pencegahan, vaksinasi, pengobatan
3. Manajemen Kandang - desain, ventilasi, sanitasi, biosekuriti
4. Produksi Telur - target produksi, faktor yang mempengaruhi, peningkatan produktivitas
5. Manajemen Bibit (DOC) - pemilihan bibit, brooding, pertumbuhan
6. Analisa Usaha - FCR, HPP, BEP, keuntungan, modal
7. Pascapanen - penanganan telur, penyimpanan, grading, pemasaran
8. Cuaca dan Musim - adaptasi kandang terhadap cuaca panas/hujan

**Panduan menjawab:**
- Jika ditanya tentang dosis obat atau vaksin, selalu sarankan konsultasi dengan dokter hewan
- Berikan jawaban yang terstruktur dengan poin-poin yang jelas
- Gunakan satuan yang familiar di Indonesia (kg, ekor, butir, dll)
- Jika ada perhitungan, tampilkan langkah-langkahnya dengan jelas
- Selalu tawarkan pertanyaan lanjutan jika topiknya kompleks
- Gunakan emoji yang relevan secukupnya

**Yang TIDAK boleh dilakukan:**
- Memberikan rekomendasi obat keras tanpa saran konsultasi dokter hewan
- Membuat janji pasti soal hasil produksi
- Menjawab topik yang tidak berkaitan dengan peternakan ayam petelur

Jika user bertanya di luar topik peternakan, arahkan kembali ke topik peternakan dengan ramah.
`;

const chatSessions = new Map();
const MAX_HISTORY = 30;

function getSession(sessionId) {
  if (!chatSessions.has(sessionId)) chatSessions.set(sessionId, []);
  return chatSessions.get(sessionId);
}

function addToHistory(sessionId, role, text) {
  const history = getSession(sessionId);
  history.push({ role, parts: [{ text }] });
  if (history.length > MAX_HISTORY) history.splice(0, 2);
}

const PORT = process.env.PORT || 3000;
const app = express();
const upload = multer();

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ============================================================
// POST /chat — Chat utama dengan memory
// ============================================================
app.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'Pesan tidak boleh kosong!' });
  if (typeof message !== 'string') return res.status(400).json({ error: 'Pesan harus berupa teks!' });

  const history = getSession(sessionId);

  try {
    const contents = [...history, { role: 'user', parts: [{ text: message.trim() }] }];
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flash3,
      contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7, topK: 40, topP: 0.95 }
    });

    const reply = aiResponse.text;
    addToHistory(sessionId, 'user', message.trim());
    addToHistory(sessionId, 'model', reply);

    return res.status(200).json({
      message: reply,
      sessionId,
      historyLength: Math.floor(getSession(sessionId).length / 2),
      metadata: aiResponse.usageMetadata
    });
  } catch (error) {
    console.error('[/chat]', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================
// POST /chat/image — Analisa foto ayam/kandang/pakan
// ============================================================
app.post('/chat/image', upload.single('image'), async (req, res) => {
  const { message = 'Analisa gambar ini dari perspektif peternak ayam petelur. Jelaskan apa yang kamu lihat dan berikan rekomendasi jika ada.', sessionId = 'default' } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Gambar harus diunggah!' });

  try {
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flash3,
      contents: [
        { text: message },
        { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } }
      ],
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.5 }
    });

    const reply = aiResponse.text;
    addToHistory(sessionId, 'user', `[Mengirim gambar] ${message}`);
    addToHistory(sessionId, 'model', reply);

    return res.status(200).json({ message: reply, metadata: aiResponse.usageMetadata });
  } catch (error) {
    console.error('[/chat/image]', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================
// POST /hitung/fcr — Kalkulator FCR
// FCR = Total Pakan (kg) / Total Bobot Telur (kg)
// ============================================================
app.post('/hitung/fcr', async (req, res) => {
  const { totalPakan, totalTelurKg, jumlahAyam, periode } = req.body;
  if (!totalPakan || !totalTelurKg) return res.status(400).json({ error: 'totalPakan dan totalTelurKg wajib diisi!' });

  const fcr = parseFloat(totalPakan) / parseFloat(totalTelurKg);
  const pakanPerEkor = jumlahAyam ? (parseFloat(totalPakan) / parseInt(jumlahAyam)).toFixed(2) : null;

  let status = '';
  if (fcr < 2.0) status = '🟢 Sangat Baik';
  else if (fcr < 2.5) status = '🟡 Baik';
  else if (fcr < 3.0) status = '🟠 Cukup — perlu evaluasi pakan';
  else status = '🔴 Buruk — segera evaluasi manajemen pakan';

  try {
    const prompt = `Peternak memiliki FCR ${fcr.toFixed(2)} dalam periode ${periode || '?'} hari, ${jumlahAyam || '?'} ekor ayam. Berikan analisis singkat dan rekomendasi praktis.`;
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flash3, contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.5 }
    });
    return res.status(200).json({ fcr: parseFloat(fcr.toFixed(2)), status, pakanPerEkorKg: pakanPerEkor, analisis: aiResponse.text });
  } catch {
    return res.status(200).json({ fcr: parseFloat(fcr.toFixed(2)), status, pakanPerEkorKg: pakanPerEkor });
  }
});

// ============================================================
// POST /hitung/produksi — Kalkulator HDP & Laba Harian
// HDP = (Jumlah Telur / Jumlah Ayam) x 100%
// ============================================================
app.post('/hitung/produksi', async (req, res) => {
  const { jumlahTelur, jumlahAyam, hargaJual, biayaPakan, biayaOperasional } = req.body;
  if (!jumlahTelur || !jumlahAyam) return res.status(400).json({ error: 'jumlahTelur dan jumlahAyam wajib diisi!' });

  const hdp = (parseInt(jumlahTelur) / parseInt(jumlahAyam)) * 100;
  let statusHdp = hdp >= 80 ? '🟢 Sangat Baik' : hdp >= 70 ? '🟡 Baik' : hdp >= 60 ? '🟠 Sedang' : '🔴 Rendah — perlu investigasi';

  let keuangan = null;
  if (hargaJual && biayaPakan) {
    const pendapatan = parseInt(jumlahTelur) * parseFloat(hargaJual);
    const totalBiaya = parseFloat(biayaPakan) + (parseFloat(biayaOperasional) || 0);
    const laba = pendapatan - totalBiaya;
    keuangan = {
      pendapatan: pendapatan.toLocaleString('id-ID'),
      totalBiaya: totalBiaya.toLocaleString('id-ID'),
      laba: laba.toLocaleString('id-ID'),
      statusLaba: laba >= 0 ? '✅ Untung' : '❌ Rugi'
    };
  }

  return res.status(200).json({ hdp: parseFloat(hdp.toFixed(1)), statusHdp, jumlahTelur: parseInt(jumlahTelur), jumlahAyam: parseInt(jumlahAyam), keuangan });
});

// ============================================================
// DELETE /chat/:sessionId — Reset session
// ============================================================
app.delete('/chat/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    return res.status(200).json({ message: 'Session berhasil direset.' });
  }
  return res.status(404).json({ error: 'Session tidak ditemukan.' });
});

app.listen(PORT, () => {
  console.log(`🐔 TernakBot berjalan di http://localhost:${PORT}`);
});