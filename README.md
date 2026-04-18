# chinese-bridge

对话 · Interview Assistant — real-time Chinese-to-English translation for conducting interviews in Chinese, with English visibility and AI-suggested follow-up questions.

Runs on Next.js (App Router). The Anthropic API key stays server-side; browser speech recognition (`webkitSpeechRecognition`) and speech synthesis run client-side and require Chrome.

## API keys

Translation uses **DeepL** (fast, accurate Chinese→English MT). Follow-up question generation and typed-English→Chinese TTS use **Anthropic Claude**.

- DeepL: sign up at https://www.deepl.com/pro-api — the free tier grants 500k chars/month.
- Anthropic: https://console.anthropic.com/settings/keys

## Local development

```bash
npm install
cp .env.example .env.local   # then paste your keys
npm run dev
```

Open http://localhost:3000 in Chrome. Click the record button and grant microphone access.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the repo at https://vercel.com/new.
3. In **Environment Variables** add `ANTHROPIC_API_KEY` and `DEEPL_API_KEY`.
4. Deploy.

Optional: set `ANTHROPIC_MODEL` to override the default Claude model ID.

## Structure

- `app/page.js` — client component rendering the UI and driving mic/TTS
- `app/api/translate/route.js` — proxies Chinese→English translations to DeepL
- `app/api/suggestions/route.js` — generates 4 follow-up question suggestions (Claude)
- `app/api/speak/route.js` — translates typed English→Chinese for TTS playback (Claude)
- `app/globals.css` — all styling
