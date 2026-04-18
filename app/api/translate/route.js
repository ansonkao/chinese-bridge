export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DeepL routes free-tier keys (suffix ':fx') to a different host than Pro keys.
function deeplEndpoint(apiKey) {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

export async function POST(req) {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server missing DEEPL_API_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { chinese, contextSummary = '' } = await req.json();
  if (!chinese || typeof chinese !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing chinese text' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = {
    text: [chinese],
    source_lang: 'ZH',
    target_lang: 'EN-US',
  };
  const trimmedContext = contextSummary.slice(-800);
  if (trimmedContext) body.context = trimmedContext;

  const upstream = await fetch(deeplEndpoint(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `DeepL-Auth-Key ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(
      JSON.stringify({ error: errText || 'DeepL error' }),
      {
        status: upstream.status || 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const data = await upstream.json();
  const english = data?.translations?.[0]?.text || '';

  return new Response(JSON.stringify({ english }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
