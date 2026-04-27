// /api/requests
//   GET     — list all aanvragen (newest first)
//   PATCH   — update status / note
//   DELETE  — remove (soft requires id query)

import { kv, isConfigured as kvConfigured } from '../lib/kv.js';
import { requireAdmin } from '../lib/auth.js';

const STATUSES = ['nieuw', 'gebeld', 'ingepland', 'afgerond', 'geannuleerd'];

export default async function handler(req, res){
  const session = requireAdmin(req, res);
  if(!session) return;
  if(!kvConfigured()) return res.status(500).json({ error: 'KV not configured' });

  if(req.method === 'GET'){
    try {
      const ids = await kv.zrevrange('pf:requests', 0, 199);
      if(!ids || !ids.length) return res.status(200).json({ requests: [] });
      const list = await Promise.all(ids.map(async id => {
        try {
          const raw = await kv.get(`pf:request:${id}`);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      }));
      return res.status(200).json({ requests: list.filter(Boolean) });
    } catch(err){
      console.error('list error:', err);
      return res.status(500).json({ error: 'list failed' });
    }
  }

  if(req.method === 'PATCH'){
    let data = req.body;
    if(typeof data === 'string'){ try { data = JSON.parse(data); } catch { data = {}; } }
    const { id, status, note } = data || {};
    if(!id) return res.status(400).json({ error: 'id required' });
    if(status && !STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
    try {
      const raw = await kv.get(`pf:request:${id}`);
      if(!raw) return res.status(404).json({ error: 'not found' });
      const rec = JSON.parse(raw);
      if(status) rec.status = status;
      if(typeof note === 'string') rec.note = note.slice(0, 2000);
      rec.updated = new Date().toISOString();
      rec.updatedBy = session.email;
      await kv.set(`pf:request:${id}`, JSON.stringify(rec));
      return res.status(200).json({ ok: true, request: rec });
    } catch(err){
      console.error('patch error:', err);
      return res.status(500).json({ error: 'update failed' });
    }
  }

  if(req.method === 'DELETE'){
    const id = req.query?.id;
    if(!id) return res.status(400).json({ error: 'id required' });
    try {
      await kv.del(`pf:request:${id}`);
      await kv.zrem('pf:requests', id);
      return res.status(200).json({ ok: true });
    } catch(err){
      console.error('delete error:', err);
      return res.status(500).json({ error: 'delete failed' });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
