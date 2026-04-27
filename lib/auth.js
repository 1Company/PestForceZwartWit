// HMAC-signed session tokens + cookie helpers. No external deps.
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || '';
const COOKIE = 'pf_session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

function b64url(buf){ return Buffer.from(buf).toString('base64url'); }
function b64urlDecode(s){ return Buffer.from(s, 'base64url'); }

export function sign(payload, ttlSec = SESSION_TTL){
  if(!SECRET) throw new Error('AUTH_SECRET not set');
  const exp = Math.floor(Date.now()/1000) + ttlSec;
  const data = JSON.stringify({ ...payload, exp });
  const b = b64url(data);
  const sig = crypto.createHmac('sha256', SECRET).update(b).digest();
  return `${b}.${b64url(sig)}`;
}

export function verify(token){
  if(!token || !SECRET) return null;
  const [b, sig] = String(token).split('.');
  if(!b || !sig) return null;
  let expected, got;
  try {
    expected = crypto.createHmac('sha256', SECRET).update(b).digest();
    got = b64urlDecode(sig);
  } catch { return null; }
  if(expected.length !== got.length) return null;
  if(!crypto.timingSafeEqual(expected, got)) return null;
  let data;
  try { data = JSON.parse(b64urlDecode(b).toString('utf8')); } catch { return null; }
  if(data.exp && data.exp < Math.floor(Date.now()/1000)) return null;
  return data;
}

export function randomToken(bytes = 32){
  return crypto.randomBytes(bytes).toString('base64url');
}

export function adminEmails(){
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email){
  if(!email) return false;
  return adminEmails().includes(String(email).toLowerCase());
}

export function setSessionCookie(res, token){
  const cookie = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL}`
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res){
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function readSession(req){
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if(!m) return null;
  return verify(m[1]);
}

export function requireAdmin(req, res){
  const session = readSession(req);
  if(!session || !isAdmin(session.email)){
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return session;
}
