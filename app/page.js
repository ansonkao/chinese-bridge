'use client';

import { useEffect, useRef } from 'react';

export default function Home() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let recognition = null;
    let isListening = false;
    let interimTranslationTimer = null;
    let interimAbortController = null;
    let utteranceCount = 0;
    const conversationContext = [];
    let isGeneratingSuggestions = false;

    function initSpeechRecognition() {
      if (
        !('webkitSpeechRecognition' in window) &&
        !('SpeechRecognition' in window)
      ) {
        showToast('Speech recognition not supported. Please use Chrome.');
        return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SR();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListening = true;
        updateListeningUI(true);
      };
      recognition.onend = () => {
        if (isListening) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {}
          }, 100);
        } else {
          updateListeningUI(false);
        }
      };
      recognition.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'network') {
          // Terminal: Chrome's speech service is unreachable. Stop the
          // auto-restart loop so we don't spam the toast.
          isListening = false;
          try { recognition.stop(); } catch (_) {}
          showToast(
            'Speech recognition lost network. Check connection or try Chrome with Google sign-in.'
          );
          return;
        }
        showToast('Mic error: ' + e.error);
      };
      recognition.onresult = handleSpeechResult;
    }

    function handleSpeechResult(event) {
      let interimText = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) {
        // Cancel any in-flight interim translation so it can't overwrite
        // `live-english` after we've hidden it.
        clearTimeout(interimTranslationTimer);
        if (interimAbortController) interimAbortController.abort();
        const seedEnglish =
          document.getElementById('live-english').textContent || '';
        // Hide + commit in the same synchronous block so the browser only
        // paints once — no empty-gap flash between live and committed.
        hideLiveUtterance();
        commitUtterance(finalText.trim(), seedEnglish);
      } else if (interimText) {
        showLiveUtterance(interimText);
        scheduleInterimTranslation(interimText);
      }
    }

    function showLiveUtterance(chinese) {
      const el = document.getElementById('live-utterance');
      el.style.display = 'flex';
      document.getElementById('live-chinese').textContent = chinese;
      const empty = document.getElementById('empty-state');
      if (empty) empty.style.display = 'none';
      setWaveformActive(true);
      scrollToBottom();
    }

    function hideLiveUtterance() {
      document.getElementById('live-utterance').style.display = 'none';
      document.getElementById('live-english').textContent = '';
      setWaveformActive(false);
    }

    function setWaveformActive(active) {
      for (let i = 1; i <= 5; i++) {
        const bar = document.getElementById('wb' + i);
        if (!bar) continue;
        if (active) bar.classList.add('active');
        else {
          bar.classList.remove('active');
          bar.style.height = '4px';
        }
      }
    }

    function scheduleInterimTranslation(chinese) {
      // DeepL responses land in ~100–200ms, so we can fire on nearly every
      // interim. A small debounce coalesces bursts from rapid-fire interims.
      // Any in-flight request is aborted when a new one supersedes it.
      clearTimeout(interimTranslationTimer);
      interimTranslationTimer = setTimeout(() => {
        if (interimAbortController) interimAbortController.abort();
        interimAbortController = new AbortController();
        translate(
          chinese,
          'live-english',
          true,
          interimAbortController.signal
        );
      }, 80);
    }

    async function commitUtterance(chinese, seedEnglish = '') {
      if (!chinese || chinese.length < 2) return;
      utteranceCount++;
      const id = 'utt-' + utteranceCount;
      const container = document.getElementById('utterances-container');
      const block = document.createElement('div');
      block.className = 'utterance active';
      block.id = id;
      block.innerHTML = `
        <div class="chinese-text">${escapeHtml(chinese)}</div>
        <div class="english-text translating" id="${id}-en">${escapeHtml(seedEnglish)}</div>
      `;
      container.appendChild(block);
      scrollToBottom();
      setTimeout(() => block.classList.remove('active'), 3000);
      conversationContext.push({ role: 'speaker', chinese });
      await translate(chinese, id + '-en', false);
      generateFollowUpSuggestions();
    }

    async function translate(chinese, targetId, isInterim, signal) {
      const el = document.getElementById(targetId);
      if (!el) return;
      // Keep any existing text visible; the `.translating` cursor appears
      // at the end. We'll overwrite the text when the response arrives.
      el.classList.add('translating');

      const contextSummary = conversationContext
        .slice(-4)
        .map((u) =>
          u.english ? `${u.chinese} → ${u.english}` : u.chinese
        )
        .join('\n');

      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chinese, contextSummary }),
          signal,
        });
        if (!response.ok) {
          const errText = await response.text();
          showToast('API error: ' + errText.slice(0, 140));
          el.classList.remove('translating');
          return;
        }
        const data = await response.json();
        const english = data.english || '';
        el.textContent = english;
        el.classList.remove('translating');
        scrollToBottom();

        if (!isInterim && conversationContext.length > 0) {
          conversationContext[conversationContext.length - 1].english = english;
        }
      } catch (err) {
        if (err.name === 'AbortError') return; // superseded; leave text alone
        el.classList.remove('translating');
        el.textContent = '[Translation error]';
        showToast('Translation failed: ' + err.message);
      }
    }

    function addSuggestionChip(english, chinese) {
      const section = document.getElementById('suggestions-section');
      if (!section) return null;
      const emptyState = document.getElementById('suggestions-empty');
      if (emptyState) emptyState.remove();
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      chip.innerHTML = `${escapeHtml(english)}<span class="suggestion-cn">${escapeHtml(chinese)}</span>`;
      chip.addEventListener('click', () => speakChinese(chinese, chip));
      section.appendChild(chip);
      section.scrollTop = section.scrollHeight;
      return chip;
    }

    async function generateFollowUpSuggestions() {
      if (isGeneratingSuggestions || conversationContext.length === 0) return;
      isGeneratingSuggestions = true;

      const section = document.getElementById('suggestions-section');

      // First run only: drop the empty-state placeholder. Existing chips stay.
      const emptyState = document.getElementById('suggestions-empty');
      if (emptyState) emptyState.remove();

      const loader = document.createElement('div');
      loader.className = 'generating-row';
      loader.innerHTML = `
        <div class="gen-dots"><div class="gen-dot"></div><div class="gen-dot"></div><div class="gen-dot"></div></div>
        <span class="gen-label">Generating questions…</span>
      `;
      section.appendChild(loader);
      section.scrollTop = section.scrollHeight;

      try {
        const response = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: conversationContext }),
        });
        const data = await response.json();
        const questions = Array.isArray(data.questions) ? data.questions : [];

        loader.remove();

        questions.forEach((q) => addSuggestionChip(q.english, q.chinese));
      } catch (err) {
        loader.innerHTML =
          '<span class="gen-label" style="color:var(--muted)">Could not generate suggestions.</span>';
      }
      isGeneratingSuggestions = false;
    }

    function speakChinese(chineseText, chipEl) {
      if (!chineseText) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(chineseText);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const voiceSelect = document.getElementById('voice-select');
      const selectedURI = voiceSelect ? voiceSelect.value : '';
      const selected = selectedURI
        ? voices.find((v) => v.voiceURI === selectedURI)
        : null;
      if (selected) {
        utterance.voice = selected;
      } else {
        const cnVoice = voices.find(
          (v) =>
            v.lang.startsWith('zh') ||
            v.lang.includes('CN') ||
            v.lang.includes('TW')
        );
        if (cnVoice) utterance.voice = cnVoice;
      }
      if (chipEl) {
        chipEl.classList.add('speaking-chip');
        utterance.onend = () => chipEl.classList.remove('speaking-chip');
        utterance.onerror = () => chipEl.classList.remove('speaking-chip');
      }
      if (isListening) {
        try {
          recognition.stop();
        } catch (e) {}
        utterance.onend = () => {
          if (chipEl) chipEl.classList.remove('speaking-chip');
          if (isListening)
            setTimeout(() => {
              try {
                recognition.start();
              } catch (e) {}
            }, 300);
        };
      }
      window.speechSynthesis.speak(utterance);
    }

    async function handleSpeakTyped() {
      const input = document.getElementById('type-input');
      const english = input.value.trim();
      if (!english) return;
      const btn = document.getElementById('speak-typed-btn');
      btn.disabled = true;
      btn.textContent = 'Translating…';
      try {
        const response = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ english }),
        });
        const data = await response.json();
        const chinese = (data.chinese || '').trim();
        if (chinese) {
          const chip = addSuggestionChip(english, chinese);
          speakChinese(chinese, chip);
          conversationContext.push({ role: 'interviewer', chinese, english });
        }
        input.value = '';
        input.style.height = '40px';
      } catch (err) {
        showToast('Translation failed.');
      }
      btn.disabled = false;
      btn.textContent = 'Speak in 中文';
    }

    function updateListeningUI(active) {
      const btn = document.getElementById('record-btn');
      const dot = document.getElementById('listen-dot');
      const label = document.getElementById('listen-label');
      if (active) {
        btn.classList.add('active');
        dot.classList.add('listening');
        label.textContent = 'Listening';
      } else {
        btn.classList.remove('active');
        dot.classList.remove('listening');
        label.textContent = 'Standby';
      }
    }

    function scrollToBottom() {
      const scroll = document.getElementById('transcript-scroll');
      scroll.scrollTop = scroll.scrollHeight;
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    const recordBtn = document.getElementById('record-btn');
    recordBtn.addEventListener('click', () => {
      if (!recognition) {
        showToast('Recognition not initialized.');
        return;
      }
      if (isListening) {
        isListening = false;
        recognition.stop();
        hideLiveUtterance();
      } else {
        isListening = true;
        try {
          recognition.start();
        } catch (e) {}
      }
    });

    const speakBtn = document.getElementById('speak-typed-btn');
    speakBtn.addEventListener('click', handleSpeakTyped);

    const typeInput = document.getElementById('type-input');
    typeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSpeakTyped();
      }
    });
    typeInput.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    function populateVoiceSelect() {
      const voiceSelect = document.getElementById('voice-select');
      if (!voiceSelect) return;
      const voices = window.speechSynthesis.getVoices();
      const cnVoices = voices.filter((v) => {
        const l = v.lang.toLowerCase();
        return (
          l.startsWith('zh') ||
          l.startsWith('cmn') ||
          l.includes('cn') ||
          l.includes('tw') ||
          l.includes('hk')
        );
      });
      // Priority: lower number sorts earlier. Tingting is the preferred
      // macOS Chinese voice; other "better" indicators come next.
      const voicePriority = (v) => {
        const n = v.name;
        if (/ting[\s-]*ting/i.test(n)) return 0;
        if (/enhanced|premium|neural|natural|siri/i.test(n)) return 1;
        return 2;
      };
      cnVoices.sort((a, b) => {
        const diff = voicePriority(a) - voicePriority(b);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });

      const prevURI = voiceSelect.value;
      voiceSelect.innerHTML = '';

      if (cnVoices.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No Chinese voices available';
        opt.disabled = true;
        voiceSelect.appendChild(opt);
        return;
      }

      cnVoices.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} · ${v.lang}`;
        voiceSelect.appendChild(opt);
      });

      const saved = localStorage.getItem('cb-voice-uri');
      if (saved && cnVoices.some((v) => v.voiceURI === saved)) {
        voiceSelect.value = saved;
      } else if (prevURI && cnVoices.some((v) => v.voiceURI === prevURI)) {
        voiceSelect.value = prevURI;
      }
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
        populateVoiceSelect();
      };
      window.speechSynthesis.getVoices();
      populateVoiceSelect();
    }

    const voiceSelectEl = document.getElementById('voice-select');
    if (voiceSelectEl) {
      voiceSelectEl.addEventListener('change', () => {
        localStorage.setItem('cb-voice-uri', voiceSelectEl.value);
      });
    }

    initSpeechRecognition();
  }, []);

  return (
    <>
      <header>
        <div className="wordmark">
          <span className="wordmark-cn">对话</span>
          <div className="wordmark-divider"></div>
          <span className="wordmark-en">Interview Assistant</span>
        </div>
        <div className="header-status">
          <div className="voice-row">
            <label className="voice-label" htmlFor="voice-select">
              Voice
            </label>
            <select id="voice-select" className="voice-select"></select>
          </div>
          <button
            type="button"
            className="record-toggle"
            id="record-btn"
            aria-label="Toggle recording"
          >
            <span className="status-dot" id="listen-dot"></span>
            <span id="listen-label">Standby</span>
          </button>
        </div>
      </header>

      <main>
        <div className="transcript-panel">
          <div className="panel-label">Live Transcript · 实时转录</div>
          <div className="transcript-scroll" id="transcript-scroll">
            <div className="empty-state" id="empty-state">
              Press record and begin the conversation in Chinese.
              <br />
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: '0.1em',
                }}
              >
                Translation appears beneath each utterance.
              </span>
            </div>
            <div id="utterances-container"></div>
            <div
              className="utterance live"
              id="live-utterance"
              style={{ display: 'none' }}
            >
              <div className="chinese-text" id="live-chinese"></div>
              <div className="waveform" id="waveform">
                <div className="wave-bar" id="wb1"></div>
                <div className="wave-bar" id="wb2"></div>
                <div className="wave-bar" id="wb3"></div>
                <div className="wave-bar" id="wb4"></div>
                <div className="wave-bar" id="wb5"></div>
              </div>
              <div className="english-text translating" id="live-english"></div>
            </div>
          </div>
        </div>

        <div className="divider-v"></div>

        <div className="control-panel">
          <div
            className="control-section"
            style={{
              paddingBottom: 0,
              paddingTop: '28px',
              borderBottom: 'none',
              flexShrink: 0,
            }}
          >
            <div className="panel-label" style={{ marginBottom: '12px' }}>
              Follow-up Questions
            </div>
          </div>
          <div className="suggestions-section" id="suggestions-section">
            <div
              className="empty-state"
              id="suggestions-empty"
              style={{ padding: '20px 0' }}
            >
              Suggestions will appear after each response.
            </div>
          </div>

          <div className="type-section">
            <div className="panel-label" style={{ marginBottom: '10px' }}>
              Or type your question in English
            </div>
            <div className="type-row">
              <textarea
                className="type-input"
                id="type-input"
                placeholder="Ask something…"
                rows={1}
                defaultValue=""
              />
              <button className="speak-btn" id="speak-typed-btn">
                Speak in 中文
              </button>
            </div>
          </div>
        </div>
      </main>

      <div className="toast" id="toast"></div>
    </>
  );
}
