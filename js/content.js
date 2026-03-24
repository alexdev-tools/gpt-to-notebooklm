// ===== GPT → NotebookLM — Content Script =====
// Parses ChatGPT conversation from the DOM

(function () {
  'use strict';

  // ChatGPT DOM selectors — multiple strategies for resilience
  // ChatGPT updates their DOM frequently, so we try several approaches
  const STRATEGIES = {
    // Strategy 1: data-message-author-role attributes (most reliable when present)
    byDataAttr: {
      messages: '[data-message-author-role]',
      getRole: (el) => el.getAttribute('data-message-author-role'),
      getContent: (el) => {
        const markdown = el.querySelector('.markdown, .prose');
        return markdown ? markdown.innerHTML : el.textContent;
      },
      getText: (el) => {
        const markdown = el.querySelector('.markdown, .prose');
        return markdown ? markdown.innerText : el.textContent;
      },
    },
    // Strategy 2: conversation turn containers
    byTurns: {
      messages: '[data-testid^="conversation-turn-"]',
      getRole: (el) => {
        // User messages typically don't have the assistant icon/avatar
        const hasAssistantAvatar = el.querySelector('img[alt*="GPT"], img[alt*="gpt"], .gizmo-bot-avatar, [data-testid="bot-avatar"]');
        const hasUserAvatar = el.querySelector('[data-testid="user-avatar"]');
        if (hasAssistantAvatar) return 'assistant';
        if (hasUserAvatar) return 'user';
        // Fallback: even turns are user, odd are assistant
        const turnMatch = (el.getAttribute('data-testid') || '').match(/turn-(\d+)/);
        if (turnMatch) {
          return parseInt(turnMatch[1]) % 2 === 0 ? 'user' : 'assistant';
        }
        return 'unknown';
      },
      getContent: (el) => {
        const markdown = el.querySelector('.markdown, .prose, [data-message-author-role] .markdown');
        if (markdown) return markdown.innerHTML;
        // Get the main text content area
        const textArea = el.querySelector('.whitespace-pre-wrap, .text-message');
        return textArea ? textArea.innerHTML : el.querySelector('.relative')?.innerHTML || el.innerHTML;
      },
      getText: (el) => {
        const markdown = el.querySelector('.markdown, .prose, [data-message-author-role] .markdown');
        if (markdown) return markdown.innerText;
        const textArea = el.querySelector('.whitespace-pre-wrap, .text-message');
        return textArea ? textArea.innerText : el.innerText;
      },
    },
    // Strategy 3: article-based grouping
    byArticle: {
      messages: 'article[data-testid]',
      getRole: (el) => {
        const testId = el.getAttribute('data-testid') || '';
        if (testId.includes('user')) return 'user';
        if (testId.includes('assistant') || testId.includes('bot')) return 'assistant';
        return 'unknown';
      },
      getContent: (el) => {
        const markdown = el.querySelector('.markdown, .prose');
        return markdown ? markdown.innerHTML : el.innerHTML;
      },
      getText: (el) => {
        const markdown = el.querySelector('.markdown, .prose');
        return markdown ? markdown.innerText : el.innerText;
      },
    },
    // Strategy 4: generic — look for alternating message blocks
    byGeneric: {
      messages: '.group\\/conversation-turn, [class*="ConversationItem"], [class*="message"]',
      getRole: (el, index) => {
        const text = el.textContent || '';
        // Check for typical GPT markers
        if (el.querySelector('.markdown, .prose, .math')) return 'assistant';
        if (el.querySelector('[data-message-author-role="user"]')) return 'user';
        if (el.querySelector('[data-message-author-role="assistant"]')) return 'assistant';
        return index % 2 === 0 ? 'user' : 'assistant';
      },
      getContent: (el) => {
        const markdown = el.querySelector('.markdown, .prose');
        return markdown ? markdown.innerHTML : el.innerHTML;
      },
      getText: (el) => {
        const markdown = el.querySelector('.markdown, .prose');
        return markdown ? markdown.innerText : el.innerText;
      },
    },
  };

  // ── Parse the conversation ──
  function parseConversation() {
    // Try each strategy, pick the one that finds the most messages
    let bestResult = [];
    let bestStrategy = null;

    for (const [name, strategy] of Object.entries(STRATEGIES)) {
      const elements = document.querySelectorAll(strategy.messages);
      if (elements.length > bestResult.length) {
        const messages = [];
        elements.forEach((el, index) => {
          const role = strategy.getRole(el, index);
          const html = strategy.getContent(el);
          const text = strategy.getText(el);

          // Skip empty messages
          const cleanText = text.trim();
          if (!cleanText || cleanText.length < 2) return;

          messages.push({
            role,
            text: cleanText,
            html: html.trim(),
            index: messages.length,
          });
        });

        if (messages.length > bestResult.length) {
          bestResult = messages;
          bestStrategy = name;
        }
      }
    }

    return {
      messages: bestResult,
      strategy: bestStrategy,
      title: getConversationTitle(),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      messageCount: bestResult.length,
    };
  }

  // ── Get conversation title ──
  function getConversationTitle() {
    // From the page title
    const pageTitle = document.title || '';
    if (pageTitle && !pageTitle.includes('ChatGPT') && pageTitle.length > 3) {
      return pageTitle.trim();
    }

    // From nav active item
    const activeNav = document.querySelector('nav a.bg-token-sidebar-surface-secondary, nav [class*="active"] span');
    if (activeNav) {
      return activeNav.textContent.trim();
    }

    // From first heading
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim().length > 3) {
      return h1.textContent.trim();
    }

    return `ChatGPT Диалог ${new Date().toLocaleDateString('ru-RU')}`;
  }

  // ── Format as Markdown (best for NotebookLM) ──
  function formatMarkdown(data) {
    const lines = [];

    lines.push(`# ${data.title}`);
    lines.push('');
    lines.push(`> Экспорт из ChatGPT | ${new Date(data.timestamp).toLocaleString('ru-RU')} | ${data.messageCount} сообщений`);
    lines.push(`> URL: ${data.url}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    data.messages.forEach((msg, i) => {
      const roleLabel = msg.role === 'user' ? '👤 Пользователь' : '🤖 ChatGPT';
      lines.push(`## ${roleLabel}`);
      lines.push('');
      lines.push(msg.text);
      lines.push('');
      if (i < data.messages.length - 1) {
        lines.push('---');
        lines.push('');
      }
    });

    return lines.join('\n');
  }

  // ── Format as plain text ──
  function formatPlainText(data) {
    const lines = [];

    lines.push(`═══ ${data.title} ═══`);
    lines.push(`Экспорт: ${new Date(data.timestamp).toLocaleString('ru-RU')}`);
    lines.push(`Сообщений: ${data.messageCount}`);
    lines.push(`URL: ${data.url}`);
    lines.push('');
    lines.push('═'.repeat(60));
    lines.push('');

    data.messages.forEach((msg, i) => {
      const roleLabel = msg.role === 'user' ? '[ПОЛЬЗОВАТЕЛЬ]' : '[CHATGPT]';
      lines.push(roleLabel);
      lines.push('');
      lines.push(msg.text);
      lines.push('');
      lines.push('─'.repeat(40));
      lines.push('');
    });

    return lines.join('\n');
  }

  // ── Format as structured JSON ──
  function formatJSON(data) {
    return JSON.stringify({
      title: data.title,
      url: data.url,
      exported_at: data.timestamp,
      message_count: data.messageCount,
      messages: data.messages.map(m => ({
        role: m.role,
        content: m.text,
      })),
    }, null, 2);
  }

  // ── Message handler from popup / background ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'PARSE_CHAT') {
      try {
        const data = parseConversation();
        sendResponse({
          ok: true,
          data,
          preview: data.messages.slice(0, 3).map(m =>
            `${m.role === 'user' ? '👤' : '🤖'} ${m.text.substring(0, 80)}${m.text.length > 80 ? '...' : ''}`
          ),
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    }

    if (msg.action === 'EXPORT') {
      try {
        const data = parseConversation();
        let content, filename, mimeType;

        const format = msg.format || 'markdown';
        const safeTitle = (data.title || 'chat').replace(/[^a-zA-Zа-яА-Я0-9_\- ]/g, '_').substring(0, 60);

        if (format === 'markdown') {
          content = formatMarkdown(data);
          filename = `${safeTitle}.md`;
          mimeType = 'text/markdown';
        } else if (format === 'txt') {
          content = formatPlainText(data);
          filename = `${safeTitle}.txt`;
          mimeType = 'text/plain';
        } else if (format === 'json') {
          content = formatJSON(data);
          filename = `${safeTitle}.json`;
          mimeType = 'application/json';
        }

        sendResponse({
          ok: true,
          content,
          filename,
          mimeType,
          messageCount: data.messageCount,
          strategy: data.strategy,
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    }

    return true; // async
  });

  console.log('[GPT→NLM] Content script loaded.');
})();
