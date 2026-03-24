// ===== GPT → NotebookLM — Background Service Worker =====

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'DOWNLOAD_FILE') {
    // Create a blob URL and trigger download
    const blob = new Blob([msg.content], { type: msg.mimeType || 'text/plain' });
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      chrome.downloads.download({
        url: dataUrl,
        filename: msg.filename || 'chat-export.md',
        saveAs: true,
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      });
    };
    reader.readAsDataURL(blob);
    return true; // async
  }
});
