// LEDGR Guide Bot (Powered by Gemini)

let conversationHistory = [];

function openBot() {
  const panel = document.getElementById('botPanel');
  if (panel) panel.classList.add('open');
  const overlay = document.getElementById('botOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeBot() {
  const panel = document.getElementById('botPanel');
  if (panel) panel.classList.remove('open');
  const overlay = document.getElementById('botOverlay');
  if (overlay) overlay.classList.remove('open');
}

function addBotMessage(text, role = 'bot') {
  const container = document.getElementById('botMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `bot-msg ${role}`;
  if (role === 'bot') {
    let html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
    div.innerHTML = html;
  } else {
    div.textContent = text;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('botMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `bot-msg bot typing-indicator`;
  div.id = 'botTyping';
  div.innerHTML = '<span>.</span><span>.</span><span>.</span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('botTyping');
  if (el) el.remove();
}

async function sendBotMsg(customText = null) {
  const input = document.getElementById('botInput');
  const text = customText !== null ? customText : (input ? input.value.trim() : '');
  if (!text) return;

  if (customText === null && input) {
    addBotMessage(text, 'user');
    input.value = '';
  }

  conversationHistory.push({ role: 'user', text: text });

  const optionsContainer = document.getElementById('botOptions');
  if (optionsContainer) optionsContainer.innerHTML = '';

  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory })
    });
    const data = await res.json();
    hideTyping();
    if (data.response) {
      addBotMessage(data.response, 'bot');
      conversationHistory.push({ role: 'bot', text: data.response });
    } else {
      addBotMessage("Sorry, I encountered an error connecting to the server.", 'bot');
    }
  } catch (err) {
    console.error('Chat error:', err);
    hideTyping();
    addBotMessage("Sorry, I couldn't reach the server. Please try again later.", 'bot');
  }
}

function startDemo() {
  openBot();
  conversationHistory = [];
  const container = document.getElementById('botMessages');
  if (container) {
    container.innerHTML = `<div class="bot-msg bot">👋 Welcome to <strong>LEDGR</strong>! I'm your guide. I'll walk you through what this platform can do for your business.</div>`;
  }
  sendBotMsg("I'd like to take a tour of LEDGR. Please explain the 3 most important features briefly and ask what I want to learn more about.");
}

function startTour() {
  // startTour mirrors startDemo but reserved for AI-driven tour
  startDemo();
}

// Attach reliable event handlers after DOM loads so inline handlers won't be required
document.addEventListener('DOMContentLoaded', () => {
  try {
    const input = document.getElementById('botInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendBotMsg();
        }
      });
    }

    const sendBtn = document.querySelector('.bot-input-row button');
    if (sendBtn) {
      // remove any inline onclick to avoid duplicate/erroneous calls
      try { sendBtn.removeAttribute('onclick'); } catch (e) {}
      sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sendBotMsg();
      });
    }
  } catch (err) {
    console.error('Failed to attach bot input handlers', err);
  }
});

// Expose main functions for inline use if needed
window.openBot = openBot;
window.closeBot = closeBot;
window.sendBotMsg = sendBotMsg;
window.startDemo = startDemo;
window.startTour = startTour;
