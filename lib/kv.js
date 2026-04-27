// Minimal Upstash Redis REST client (works with Vercel KV).
// Reads KV_REST_API_URL + KV_REST_API_TOKEN from env.

const URL_  = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL  || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export function isConfigured(){ return !!(URL_ && TOKEN); }

async function call(parts){
  if(!isConfigured()) throw new Error('KV not configured (set KV_REST_API_URL and KV_REST_API_TOKEN)');
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(parts)
  });
  const j = await res.json().catch(()=>({ error: `non-json ${res.status}` }));
  if(!res.ok || j.error) throw new Error(`KV ${res.status}: ${j.error || JSON.stringify(j)}`);
  return j.result;
}

export const kv = {
  get:        (k)              => call(['GET', k]),
  set:        (k, v, ttl)      => ttl ? call(['SET', k, v, 'EX', String(ttl)]) : call(['SET', k, v]),
  del:        (k)              => call(['DEL', k]),
  incr:       (k)              => call(['INCR', k]),
  expire:     (k, ttl)         => call(['EXPIRE', k, String(ttl)]),
  zadd:       (k, score, m)    => call(['ZADD', k, String(score), m]),
  zrem:       (k, m)           => call(['ZREM', k, m]),
  zrevrange:  (k, start, stop) => call(['ZREVRANGE', k, String(start), String(stop)]),
  zcard:      (k)              => call(['ZCARD', k])
};
