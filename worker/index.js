export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /api/config — renvoie les clés Supabase au frontend
    if (url.pathname === '/api/config' && request.method === 'GET') {
      return Response.json({
        supabaseUrl: env.SUPABASE_URL,
        supabaseKey: env.SUPABASE_ANON_KEY,
      }, { headers: corsHeaders });
    }

    // POST /api/ai — proxy vers Claude API (clé jamais exposée)
    if (url.pathname === '/api/ai' && request.method === 'POST') {
      const { prompt } = await request.json();

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.content?.map(c => c.text || '').join('') || '';
      return Response.json({ text }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });
  },
};
