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

  const { english, dialect = 'mandarin' } = await req.json();
  if (!english || typeof english !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing english text' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const dialectInstruction =
    dialect === 'cantonese'
      ? 'natural, conversational Cantonese (廣東話). Use colloquial Cantonese vocabulary and particles (e.g. 係, 喺, 唔, 咋, 囉, 啩, 呀), not Mandarin.'
      : 'natural, conversational Mandarin Chinese (普通話).';

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Translate this English question to ${dialectInstruction} Output only the Chinese translation, nothing else:\n\n${english}`,
        },
      ],
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
  const chinese = data?.content?.[0]?.text?.trim() || '';

  return new Response(JSON.stringify({ chinese }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
