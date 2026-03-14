const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const tokenText = document.getElementById('token-text');

let totalTokens = 0;

// Konfigurasi parser markdown sekali saat startup (jika library tersedia)
if (window.marked && typeof window.marked.setOptions === 'function') {
  window.marked.setOptions({
    gfm: true,
    breaks: true,
    mangle: false,
    headerIds: false
  });
}

// ============================================================
// SESSION ID
// Dibuat sekali saat halaman dibuka, disimpan di sessionStorage
// Agar history tetap ada selama tab tidak ditutup
// ============================================================
let sessionId = sessionStorage.getItem('chatSessionId');
if (!sessionId) {
  sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  sessionStorage.setItem('chatSessionId', sessionId);
}

// ============================================================
// AUTO RESIZE TEXTAREA
// ============================================================
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

// ============================================================
// ENTER TO SEND (Shift+Enter = new line)
// ============================================================
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  }
});

// ============================================================
// SUGGESTION CHIPS
// ============================================================
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.prompt;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    form.dispatchEvent(new Event('submit'));
  });
});

// ============================================================
// CLEAR CHAT
// Reset history di frontend + hapus session di backend
// ============================================================
clearBtn.addEventListener('click', async () => {
  // Hapus session di backend
  try {
    await fetch(`/chat/${sessionId}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('Gagal hapus session di backend:', err);
  }

  // Buat sessionId baru
  sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  sessionStorage.setItem('chatSessionId', sessionId);

  // Reset UI
  chatBox.innerHTML = '';
  totalTokens = 0;
  tokenText.textContent = '0 tokens used';

  // Tampilkan welcome state lagi
  const welcome = document.createElement('div');
  welcome.className = 'welcome-state';
  welcome.id = 'welcome-state';
  welcome.innerHTML = `
    <div class="welcome-icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </div>
    <h2 class="welcome-title">Chat baru dimulai!</h2>
    <p class="welcome-desc">Riwayat percakapan sudah dihapus. Tanya apa saja ke Aria!</p>
  `;
  chatBox.appendChild(welcome);
});

// ============================================================
// MAIN FORM SUBMIT
// Kirim pesan ke endpoint /chat (multi-turn dengan history)
// ============================================================
form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  // Sembunyikan welcome state
  const welcomeEl = document.getElementById('welcome-state');
  if (welcomeEl) welcomeEl.remove();

  // Tampilkan pesan user
  appendMessage('user', userMessage);

  // Reset input
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  // Tampilkan indikator thinking
  const thinkingRow = appendThinking();

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        sessionId: sessionId   // kirim sessionId agar backend tahu ini sesi siapa
      }),
    });

    const data = await response.json();

    // Hapus thinking
    thinkingRow.remove();

    if (!response.ok) {
      appendMessage('bot', `⚠️ Error: ${data.error || 'Terjadi kesalahan pada server.'}`);
      return;
    }

    if (data && data.message) {
      appendMessage('bot', data.message);

      // Update token counter
      if (data.metadata && data.metadata.totalTokenCount) {
        totalTokens += data.metadata.totalTokenCount;
        tokenText.textContent = `${totalTokens.toLocaleString()} tokens used`;
      }
    } else {
      appendMessage('bot', 'Maaf, saya tidak mendapat respons. Coba lagi ya!');
    }

  } catch (error) {
    console.error('Fetch error:', error);
    thinkingRow.remove();
    appendMessage('bot', 'Gagal terhubung ke server. Pastikan server sudah berjalan.');
  } finally {
    sendBtn.disabled = false;
    input.focus();
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

// ============================================================
// APPEND MESSAGE (user / bot)
// ============================================================
function appendMessage(sender, text) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const row = document.createElement('div');
  row.classList.add('message-row', sender);

  const avatarHTML = sender === 'user'
    ? `<div class="avatar user-avatar">U</div>`
    : `<div class="avatar bot-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>`;

  row.innerHTML = `
    ${avatarHTML}
    <div>
      <div class="message-bubble">${sender === 'bot' ? renderBotMessage(text) : escapeHTML(text)}</div>
      <div class="message-time">${timeStr}</div>
    </div>
  `;

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
  return row;
}

// ============================================================
// APPEND THINKING INDICATOR
// ============================================================
function appendThinking() {
  const row = document.createElement('div');
  row.classList.add('message-row', 'bot');

  row.innerHTML = `
    <div class="avatar bot-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>
    <div>
      <div class="message-bubble thinking">
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
  return row;
}

// ============================================================
// ESCAPE HTML (mencegah XSS)
// ============================================================
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderBotMessage(text) {
  const safeText = String(text || '');

  if (window.marked && typeof window.marked.parse === 'function') {
    const rawHtml = window.marked.parse(safeText);
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(rawHtml);
    }
    return rawHtml;
  }

  return fallbackMarkdownToHtml(safeText);
}

function fallbackMarkdownToHtml(text) {
  const lines = escapeHTML(text).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      continue;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      if (!inOl) {
        closeLists();
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${applyInlineMarkdown(orderedMatch[2])}</li>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      if (!inUl) {
        closeLists();
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${applyInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    closeLists();

    if (line.startsWith('### ')) {
      html.push(`<h3>${applyInlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      html.push(`<h2>${applyInlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      html.push(`<h1>${applyInlineMarkdown(line.slice(2))}</h1>`);
      continue;
    }

    html.push(`<p>${applyInlineMarkdown(line)}</p>`);
  }

  closeLists();
  return html.join('');
}

function applyInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}