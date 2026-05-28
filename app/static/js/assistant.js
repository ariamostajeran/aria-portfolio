/* Portfolio Assistant — floating chat widget */

const STORAGE_KEY = 'ap_history';
const WELCOME     = "Hi! I'm Aria's portfolio assistant. Ask me anything about his projects, skills, or experience.";

let markedReady = false;
let isWaiting   = false;

/* ── DOM refs ───────────────────────────────────────────────── */
const toggle   = document.getElementById('assistant-toggle');
const panel    = document.getElementById('assistant-panel');
const messages = document.getElementById('ap-messages');
const input    = document.getElementById('ap-input');
const sendBtn  = document.getElementById('ap-send');
const newBtn   = document.getElementById('ap-new');
const closeBtn = document.getElementById('ap-close');

/* ── Open / close ───────────────────────────────────────────── */
toggle.addEventListener('click', () => {
  const isOpen = panel.classList.toggle('open');
  toggle.innerHTML = isOpen
    ? '<i class="fas fa-xmark"></i>'
    : '<i class="fas fa-robot"></i>';
  if (isOpen) {
    loadMarked();
    if (messages.children.length === 0) initSession();
    input.focus();
  }
});

closeBtn.addEventListener('click', () => {
  panel.classList.remove('open');
  toggle.innerHTML = '<i class="fas fa-robot"></i>';
});

/* ── New conversation ────────────────────────────────────────── */
newBtn.addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY);
  messages.innerHTML = '';
  initSession();
  input.focus();
});

/* ── Session init ────────────────────────────────────────────── */
function initSession() {
  const saved = loadHistory();
  if (saved.length > 0) {
    saved.forEach(m => appendBubble(m.role === 'user' ? 'user' : 'bot', m.content, false));
  } else {
    appendBubble('bot', WELCOME, false);
  }
  scrollBottom();
}

/* ── Send message ────────────────────────────────────────────── */
async function sendMessage() {
  const text = input.value.trim();
  if (!text || isWaiting) return;

  input.value = '';
  appendBubble('user', text, true);

  const history = loadHistory();
  history.push({ role: 'user', content: text });
  saveHistory(history);

  setWaiting(true);
  const typingEl = showTyping();

  let retries = 0;
  let data;

  while (retries < 3) {
    try {
      const resp = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      });
      data = await resp.json();

      if (data.offline && retries < 2) {
        retries++;
        typingEl.querySelector('p') && (typingEl.querySelector('p').textContent = `Warming up… retry ${retries}/3`);
        await sleep(8000);
        continue;
      }
      break;
    } catch {
      retries++;
      if (retries >= 3) { data = { response: 'Could not reach the assistant. Please try again later.' }; break; }
      await sleep(5000);
    }
  }

  removeTyping(typingEl);
  const reply = data.response || 'No response received.';
  appendBubble('bot', reply, true);

  history.push({ role: 'assistant', content: reply });
  saveHistory(history);
  setWaiting(false);
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

/* ── Bubble rendering ────────────────────────────────────────── */
function appendBubble(role, content, save) {
  const wrap   = document.createElement('div');
  wrap.className = `ap-msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'ap-bubble';

  if (role === 'bot') {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }

  wrap.appendChild(bubble);
  messages.appendChild(wrap);
  scrollBottom();
}

function renderMarkdown(text) {
  if (markedReady && window.marked) {
    return window.marked.parse(text);
  }
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

/* ── Typing indicator ────────────────────────────────────────── */
function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'ap-msg bot';
  wrap.innerHTML = '<div class="ap-bubble ap-typing"><span></span><span></span><span></span></div>';
  messages.appendChild(wrap);
  scrollBottom();
  return wrap;
}

function removeTyping(el) {
  el && el.remove();
}

/* ── State helpers ───────────────────────────────────────────── */
function setWaiting(val) {
  isWaiting     = val;
  sendBtn.disabled = val;
  input.disabled   = val;
}

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── sessionStorage ──────────────────────────────────────────── */
function loadHistory() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveHistory(h) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-40))); }
  catch {}
}

/* ── Lazy-load marked.js ─────────────────────────────────────── */
function loadMarked() {
  if (markedReady || document.getElementById('marked-script')) return;
  const s = document.createElement('script');
  s.id  = 'marked-script';
  s.src = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
  s.onload = () => {
    markedReady = true;
    window.marked.setOptions({ breaks: true, gfm: true });
  };
  document.head.appendChild(s);
}
