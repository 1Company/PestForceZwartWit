// GET /api/auth-verify?token=… — consume magic link, set session cookie, redirect.

import { kv, isConfigured as kvConfigured } from '../lib/kv.js';
import { sign, setSessionCookie, isAdmin } from '../lib/auth.js';

export default async function handler(req, res){
  const token = req.query?.token || '';
  if(!token) return res.redirect(302, '/admin?error=missing_token');
  if(!kvConfigured()) return res.redirect(302, '/admin?error=server_not_configured');

  const key = `pf:magic:${token}`;
  let email;
  try {
    email = await kv.get(key);
  } catch(err){
    console.error('auth-verify KV error:', err);
    return res.redirect(302, '/admin?error=server');
  }
  if(!email) return res.redirect(302, '/admin?error=invalid_or_expired');

  // Burn the token
  try { await kv.del(key); } catch(_) {}

  if(!isAdmin(email)) return res.redirect(302, '/admin?error=not_admin');

  try {
    const session = sign({ email, role: 'admin' });
    setSessionCookie(res, session);
  } catch(err){
    console.error('sign error:', err);
    return res.redirect(302, '/admin?error=server');
  }

  return res.redirect(302, '/admin');
}
