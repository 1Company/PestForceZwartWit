// GET /api/me — returns current session info (or { authenticated: false }).

import { readSession, isAdmin } from '../lib/auth.js';

export default function handler(req, res){
  const session = readSession(req);
  if(!session || !isAdmin(session.email)){
    return res.status(200).json({ authenticated: false });
  }
  return res.status(200).json({ authenticated: true, email: session.email });
}
