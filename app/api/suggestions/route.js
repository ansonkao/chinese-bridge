export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server missing ANTHROPIC_API_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { context = [], dialect = 'mandarin' } = await req.json();

  const recent = Array.isArray(context) ? context.slice(-5) : [];
  const recentContext = recent
    .map(
      (u) =>
        `Chinese: ${u.chinese || ''}\nEnglish: ${u.english || '(translating)'}`
    )
    .join('\n\n');

  const dialectInstruction =
    dialect === 'cantonese'
      ? 'natural, colloquial Cantonese (廣東話). Use colloquial Cantonese vocabulary and particles (e.g. 係, 喺, 唔, 咋, 囉, 啩, 呀), not Mandarin'
      : 'natural Mandarin Chinese (普通話)';

  const prompt = `You are helping an English-speaking interviewer conduct an interview in Chinese. Based on the conversation so far, generate 2 insightful follow-up questions the interviewer might want to ask.

Conversation so far:
${recentContext}

Return ONLY a JSON array of 2 objects, each with:
- "english": the question in English (how the interviewer reads it)
- "chinese": the question translated to ${dialectInstruction} (how it will be spoken aloud)

Return valid JSON only, no markdown, no explanation.`;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(
      JSON.stringify({ error: errText || 'Upstream error' }),
      { status: upstream.status || 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const data = await upstream.json();
  const raw = data?.content?.[0]?.text || '[]';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  let questions = [];
  try {
    questions = JSON.parse(cleaned);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Could not parse suggestions', raw }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ questions }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
