// POST /api/logout — clear session cookie.

import { clearSessionCookie } from '../lib/auth.js';

export default function handler(req, res){
  clearSessionCookie(res);
  if(req.method === 'GET'){
    return res.redirect(302, '/admin');
  }
  return res.status(200).json({ ok: true });
}
