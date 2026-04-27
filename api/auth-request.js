// POST /api/auth-request — start magic-link login.
// Always responds 200 to avoid email enumeration.

import { kv, isConfigured as kvConfigured } from '../lib/kv.js';
import { sendEmail } from '../lib/email.js';
import { adminEmails, randomToken } from '../lib/auth.js';

function publicBase(req){
  if(process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/,'');
  if(process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if(process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0];
  return `${proto}://${host}`;
}

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  let data = req.body;
  if(typeof data === 'string'){ try { data = JSON.parse(data); } catch { data = {}; } }
  const email = String(data?.email || '').trim().toLowerCase();

  // Always 200 from here on
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    return res.status(200).json({ ok: true });
  }
  if(!kvConfigured()){
    console.error('auth-request: KV not configured');
    return res.status(200).json({ ok: true });
  }

  const allowed = adminEmails();
  if(!allowed.length){
    console.error('auth-request: ADMIN_EMAILS not set');
    return res.status(200).json({ ok: true });
  }
  if(!allowed.includes(email)){
    // Silent denial
    return res.status(200).json({ ok: true });
  }

  // Rate limit: max 5 magic-link requests per email per 10 minutes
  try {
    const rlKey = `pf:rl:magic:${email}`;
    const c = await kv.incr(rlKey);
    if(c === 1) await kv.expire(rlKey, 600);
    if(c > 5) return res.status(200).json({ ok: true });
  } catch(_) {}

  const token = randomToken(32);
  await kv.set(`pf:magic:${token}`, email, 900); // 15 min

  const base = publicBase(req);
  const link = `${base}/api/auth-verify?token=${encodeURIComponent(token)}`;

  try {
    await sendEmail({
      to: email,
      subject: 'Pestforce admin — Inloglink',
      text: `Klik op de link om in te loggen op het Pestforce admin-paneel:

${link}

Deze link is 15 minuten geldig en kan één keer gebruikt worden.
Heeft u dit niet aangevraagd? Negeer deze e-mail.`,
      html: `<!doctype html><html><body style="margin:0;background:#F5F1EB">
<div style="max-width:480px;margin:0 auto;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0A0A0A">
  <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#6B6B68;margin-bottom:8px">Pestforce Nederland — Admin</div>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:32px;letter-spacing:-.02em;margin:0 0 18px;line-height:1.05">Uw inloglink.</h1>
  <p style="color:#3A3A37;line-height:1.6;font-size:15px;margin:0 0 24px">Klik op de knop hieronder om in te loggen. De link is 15 minuten geldig.</p>
  <p style="margin:0 0 28px">
    <a href="${link}" style="display:inline-block;background:#0A0A0A;color:#F5F1EB;text-decoration:none;padding:14px 24px;border-radius:999px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:500">Inloggen</a>
  </p>
  <p style="color:#6B6B68;font-size:12px;line-height:1.6;margin:0 0 8px">Werkt de knop niet? Plak deze link in uw browser:</p>
  <p style="color:#3A3A37;font-size:12px;line-height:1.5;word-break:break-all;margin:0">${link}</p>
  <p style="color:#6B6B68;font-size:11px;letter-spacing:.04em;margin-top:36px;padding-top:18px;border-top:1px solid #ddd">Heeft u dit niet aangevraagd? Negeer deze e-mail. Er gebeurt niets met uw account.</p>
</div></body></html>`
    });
  } catch(err){
    console.error('Magic-link email failed:', err);
  }

  return res.status(200).json({ ok: true });
}
