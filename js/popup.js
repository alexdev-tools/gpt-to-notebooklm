// ===== GPT → NotebookLM — Popup Script =====

document.addEventListener('DOMContentLoaded', () => {
  const btnScan = document.getElementById('btnScan');
  const statusCard = document.getElementById('statusCard');
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const previewSection = document.getElementById('previewSection');
  const chatTitle = document.getElementById('chatTitle');
  const metaCount = document.getElementById('metaCount');
  const metaStrategy = document.getElementById('metaStrategy');
  const previewList = document.getElementById('previewList');
  const exportGroup = document.getElementById('exportGroup');
  const instructionsSection = document.getElementById('instructionsSection');

  let lastParseData = null;

  // ── Scan ──
  btnScan.addEventListener('click', () => {
    btnScan.classList.add('loading');
    btnScan.querySelector('.btn-emoji').textContent = '⟳';

    getActiveTab((tab) => {
      if (!tab || !(tab.url || '').match(/chat(gpt)?\.com|openai\.com/)) {
        setStatus('error', '❌', 'Откройте вкладку с ChatGPT');
        resetScanButton();
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'PARSE_CHAT' }, (response) => {
        resetScanButton();

        if (chrome.runtime.lastError) {
          setStatus('error', '❌', `Ошибка: ${chrome.runtime.lastError.message}. Попробуйте перезагрузить страницу ChatGPT.`);
          return;
        }

        if (!response || !response.ok) {
          setStatus('error', '❌', `Не удалось распарсить: ${response?.error || 'неизвестная ошибка'}`);
          return;
        }

        const data = response.data;
        lastParseData = data;

        if (data.messageCount === 0) {
          setStatus('error', '⚠️', 'Сообщения не найдены. Убедитесь, что диалог открыт.');
          return;
        }

        // Success
        setStatus('success', '✅', `Найдено ${data.messageCount} сообщений`);

        // Show preview
        chatTitle.textContent = data.title;
        metaCount.textContent = `${data.messageCount} сообщений`;
        metaStrategy.textContent = `парсер: ${data.strategy}`;

        previewList.innerHTML = (response.preview || []).map(p =>
          `<div class="preview-item">${escHtml(p)}</div>`
        ).join('') + (data.messageCount > 3
          ? `<div class="preview-item" style="color: var(--text-dim); text-align: center;">...и ещё ${data.messageCount - 3}</div>`
          : ''
        );

        previewSection.classList.remove('hidden');
        exportGroup.classList.remove('hidden');
      });
    });
  });

  // ── Export buttons ──
  document.querySelectorAll('.btn-export').forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      exportChat(format, btn);
    });
  });

  // Mark markdown as recommended
  document.getElementById('btnMd').classList.add('recommended');

  function exportChat(format, btn) {
    btn.classList.add('loading');
    const origEmoji = btn.querySelector('.btn-emoji').textContent;
    btn.querySelector('.btn-emoji').textContent = '⟳';

    getActiveTab((tab) => {
      if (!tab) {
        btn.classList.remove('loading');
        btn.querySelector('.btn-emoji').textContent = origEmoji;
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'EXPORT', format }, (response) => {
        btn.classList.remove('loading');
        btn.querySelector('.btn-emoji').textContent = origEmoji;

        if (chrome.runtime.lastError || !response?.ok) {
          setStatus('error', '❌', `Ошибка экспорта: ${response?.error || chrome.runtime.lastError?.message}`);
          return;
        }

        // Trigger download via background script
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_FILE',
          content: response.content,
          filename: response.filename,
          mimeType: response.mimeType,
        }, (dlResponse) => {
          if (dlResponse?.ok) {
            setStatus('success', '📥', `Скачан: ${response.filename}`);
            instructionsSection.classList.remove('hidden');
          } else {
            setStatus('error', '❌', `Ошибка скачивания: ${dlResponse?.error}`);
          }
        });
      });
    });
  }

  // ── Helpers ──

  function getActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      callback(tabs?.[0] || null);
    });
  }

  function setStatus(type, icon, text) {
    statusCard.className = `status-card ${type}`;
    statusIcon.textContent = icon;
    statusText.textContent = text;
  }

  function resetScanButton() {
    btnScan.classList.remove('loading');
    btnScan.querySelector('.btn-emoji').textContent = '🔍';
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
});
