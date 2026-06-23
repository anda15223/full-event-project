import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(JSON.stringify({ error: 'lat and lng (numbers) required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const gmKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!lovableKey || !gmKey) {
      return new Response(JSON.stringify({ error: 'Google Maps connector not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${lat},${lng}&language=en`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': gmKey,
      },
    });
    const data = await resp.json();

    if (!resp.ok || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      return new Response(JSON.stringify({ error: 'No address found', details: data.status }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const best = data.results[0];
    const formatted: string = best.formatted_address ?? '';
    const comps: Array<{ long_name: string; short_name: string; types: string[] }> = best.address_components ?? [];
    const get = (t: string) => comps.find((c) => c.types.includes(t))?.long_name ?? null;
    const city = get('locality') || get('postal_town') || get('administrative_area_level_2') || get('administrative_area_level_1');

    return new Response(
      JSON.stringify({ address: formatted, city, raw: best }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
