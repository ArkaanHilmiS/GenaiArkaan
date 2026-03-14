// ============================================================
// IMPORTS
// ============================================================
import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';
import cors from 'cors';

// ============================================================
// INISIALISASI AI & KONFIGURASI
// ============================================================
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODELS = {
  flashLite31: "gemini-3.1-flash-lite-preview",
  flash3: "gemini-3-flash-preview",
  pro: "gemini-3.1-pro-preview",
  gemma3: "gemma-3-27b-it"
};

// ============================================================
// SYSTEM INSTRUCTION (Persona AI)
// Ubah teks di bawah ini untuk mengganti kepribadian AI
// ============================================================
const SYSTEM_INSTRUCTION = `
Kamu adalah Tomas, asisten AI yang cerdas, ramah, dan selalu siap membantu.

Kepribadianmu:
- Ramah dan hangat dalam berkomunikasi
- Menjawab dengan bahasa yang jelas dan mudah dipahami
- Jujur jika tidak tahu suatu hal
- Sedikit humoris tapi tetap profesional

Aturan:
- Selalu jawab dalam Bahasa Indonesia kecuali user minta bahasa lain
- Jangan pernah mengaku sebagai Google atau Gemini secara langsung
- Jika ditanya siapa kamu, jawab bahwa kamu adalah Tomas
- Berikan jawaban yang ringkas namun lengkap
- Gunakan emoji secukupnya agar terasa lebih hidup
- Gunakan format Markdown yang rapi saat cocok (judul #, subjudul ##, list bernomor/bullet, **bold**, dan blok kode)
`;

// ============================================================
// CHAT HISTORY STORAGE (In-Memory per Session)
// Key: sessionId (string), Value: array of messages
// ============================================================
const chatSessions = new Map();

// Batas maksimal history per sesi agar tidak membebani context window
const MAX_HISTORY_LENGTH = 20;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Mengambil atau membuat session baru berdasarkan sessionId
 * @param {string} sessionId
 * @returns {Array} array of conversation history
 */
function getSession(sessionId) {
  if (!chatSessions.has(sessionId)) {
    chatSessions.set(sessionId, []);
  }
  return chatSessions.get(sessionId);
}

/**
 * Menambahkan pesan ke history session
 * Jika melebihi MAX_HISTORY_LENGTH, hapus pesan paling lama (FIFO)
 * @param {string} sessionId
 * @param {string} role - 'user' atau 'model'
 * @param {string} text
 */
function addToHistory(sessionId, role, text) {
  const history = getSession(sessionId);
  history.push({ role, parts: [{ text }] });

  // Trim history jika terlalu panjang (jaga selalu berpasangan user-model)
  if (history.length > MAX_HISTORY_LENGTH) {
    history.splice(0, 2); // hapus 1 pasang pesan terlama
  }
}

/**
 * Memformat history ke format yang diterima Gemini API
 * @param {Array} history
 * @returns {Array}
 */
function formatHistoryForGemini(history) {
  return history.map(({ role, parts }) => ({ role, parts }));
}

// ============================================================
// EXPRESS APP
// ============================================================
const PORT = process.env.PORT || 3000;
const app = express();
const upload = multer();

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ============================================================
// ROUTE: POST /generate
// Chat biasa TANPA history (single-turn)
// ============================================================
app.post('/generate', async (request, response) => {
  const body = request.body;

  if (!body.message) {
    return response.status(400).json({ error: 'Belum ada pesan!' });
  }

  if (typeof body.message !== 'string') {
    return response.status(400).json({ error: 'Pesan harus berupa teks!' });
  }

  try {
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flash3,
      contents: body.message,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      }
    });

    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });

  } catch (error) {
    console.error('[/generate] Error:', error.message);
    return response.status(500).json({ error: error.message });
  }
});

// ============================================================
// ROUTE: POST /chat
// Chat DENGAN history (multi-turn conversation)
// Kirim { message: "...", sessionId: "..." }
// sessionId digunakan untuk membedakan user yang berbeda
// ============================================================
app.post('/chat', async (request, response) => {
  const body = request.body;

  // Validasi input
  if (!body.message) {
    return response.status(400).json({ error: 'Belum ada pesan!' });
  }

  if (typeof body.message !== 'string') {
    return response.status(400).json({ error: 'Pesan harus berupa teks!' });
  }

  // Gunakan sessionId dari client, atau buat default
  // Idealnya sessionId digenerate di frontend dan disimpan di localStorage
  const sessionId = body.sessionId || 'default-session';
  const userMessage = body.message.trim();

  // Ambil history sesi ini
  const history = getSession(sessionId);

  try {
    // Gabungkan history + pesan baru user
    const contents = [
      ...formatHistoryForGemini(history),
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const aiResponse = await ai.models.generateContent({
      model: MODELS.flash3,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      }
    });

    const replyText = aiResponse.text;

    // Simpan pesan user dan balasan AI ke history
    addToHistory(sessionId, 'user', userMessage);
    addToHistory(sessionId, 'model', replyText);

    return response.status(200).json({
      message: replyText,
      sessionId,
      historyLength: getSession(sessionId).length / 2, // jumlah pasang pesan
      metadata: aiResponse.usageMetadata
    });

  } catch (error) {
    console.error('[/chat] Error:', error.message);
    return response.status(500).json({ error: error.message });
  }
});

// ============================================================
// ROUTE: DELETE /chat/:sessionId
// Hapus history sesi tertentu (reset conversation)
// ============================================================
app.delete('/chat/:sessionId', (request, response) => {
  const { sessionId } = request.params;

  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    return response.status(200).json({ message: `Session ${sessionId} berhasil dihapus.` });
  }

  return response.status(404).json({ error: 'Session tidak ditemukan.' });
});

// ============================================================
// ROUTE: GET /chat/:sessionId/history
// Lihat history percakapan sesi tertentu
// ============================================================
app.get('/chat/:sessionId/history', (request, response) => {
  const { sessionId } = request.params;
  const history = getSession(sessionId);

  return response.status(200).json({
    sessionId,
    totalMessages: history.length,
    history: history.map(({ role, parts }) => ({
      role,
      text: parts[0].text
    }))
  });
});

// ============================================================
// ROUTE: POST /generate/text-from-image
// Generate teks dari gambar + prompt
// ============================================================
app.post('/generate/text-from-image', upload.single('image'), async (request, response) => {
  const body = request.body;

  if (!body.message || !request.file) {
    return response.status(400).json({ error: 'File dan pesan harus lengkap!' });
  }

  if (typeof body.message !== 'string') {
    return response.status(400).json({ error: 'Pesan harus berupa teks!' });
  }

  const text = body.message;
  const file = request.file;
  const base64Image = file.buffer.toString('base64');
  const fileType = file.mimetype;

  try {
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flashLite31,
      contents: [
        { text, type: "text" },
        { inlineData: { data: base64Image, mimeType: fileType } }
      ],
      config: { systemInstruction: SYSTEM_INSTRUCTION }
    });

    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });

  } catch (error) {
    console.error('[/generate/text-from-image] Error:', error.message);
    return response.status(500).json({ error: error.message });
  }
});

// ============================================================
// ROUTE: POST /generate/text-from-doc
// Generate teks dari dokumen + prompt
// ============================================================
app.post('/generate/text-from-doc', upload.single('doc'), async (request, response) => {
  const body = request.body;

  if (!body.message || !request.file) {
    return response.status(400).json({ error: 'File dan pesan harus lengkap!' });
  }

  if (typeof body.message !== 'string') {
    return response.status(400).json({ error: 'Pesan harus berupa teks!' });
  }

  const text = body.message;
  const file = request.file;
  const base64Doc = file.buffer.toString('base64');
  const fileType = file.mimetype;

  try {
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flashLite31,
      contents: [
        { text, type: "text" },
        { inlineData: { data: base64Doc, mimeType: fileType } }
      ],
      config: { systemInstruction: SYSTEM_INSTRUCTION }
    });

    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });

  } catch (error) {
    console.error('[/generate/text-from-doc] Error:', error.message);
    return response.status(500).json({ error: error.message });
  }
});

// ============================================================
// ROUTE: POST /generate/text-from-audio
// Generate teks dari audio + prompt
// ============================================================
app.post('/generate/text-from-audio', upload.single('audio'), async (request, response) => {
  const body = request.body;

  if (!body.message || !request.file) {
    return response.status(400).json({ error: 'File dan pesan harus lengkap!' });
  }

  if (typeof body.message !== 'string') {
    return response.status(400).json({ error: 'Pesan harus berupa teks!' });
  }

  const text = body.message;
  const file = request.file;
  const base64Audio = file.buffer.toString('base64');
  const fileType = file.mimetype;

  try {
    const aiResponse = await ai.models.generateContent({
      model: MODELS.flashLite31,
      contents: [
        { text, type: "text" },
        { inlineData: { data: base64Audio, mimeType: fileType } }
      ],
      config: { systemInstruction: SYSTEM_INSTRUCTION }
    });

    return response.status(200).json({
      message: aiResponse.text,
      metadata: aiResponse.usageMetadata
    });

  } catch (error) {
    console.error('[/generate/text-from-audio] Error:', error.status, error.message);

    const statusMap = {
      400: 'Format audio tidak didukung!',
      401: 'Unauthorized, periksa API key Anda!',
      403: 'Anda tidak memiliki izin untuk mengakses layanan AI!',
      413: 'File audio terlalu besar!',
      415: 'Tipe file audio tidak didukung!',
      429: 'Terlalu banyak permintaan, coba lagi nanti!',
      500: 'Terjadi kesalahan pada server AI!',
      503: 'Layanan AI sedang tidak tersedia, coba lagi nanti!',
    };

    const status = error.status || 500;
    const message = statusMap[status] || error.message;
    return response.status(status).json({ error: message });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🤖 AI Persona: Tomas (Gemini ${MODELS.flash3})`);
  console.log(`📝 Max history per session: ${MAX_HISTORY_LENGTH} messages`);
});