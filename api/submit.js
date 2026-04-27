// POST /api/submit — public endpoint for the inspectie-aanvraag form.
// Stores in KV (when configured) and emails via SMTP2GO.

import { kv, isConfigured as kvConfigured } from '../lib/kv.js';
import { sendEmail, escapeHtml } from '../lib/email.js';

const ALLOWED_TYPES = [
  'Knaagdieren',
  'Insecten (boktor / houtworm)',
  'Bedwantsen',
  'Mieren',
  'Wespen',
  'Anders / onbekend'
];

function bad(res, msg, code = 400){ return res.status(code).json({ ok: false, error: msg }); }

function clean(v, max){
  return String(v ?? '').trim().slice(0, max);
}

export default async function handler(req, res){
  if(req.method !== 'POST') return bad(res, 'method not allowed', 405);

  let data = req.body;
  if(typeof data === 'string'){ try { data = JSON.parse(data); } catch { return bad(res, 'ongeldig formaat'); } }
  if(!data || typeof data !== 'object') return bad(res, 'ongeldig formaat');

  // Honeypot — silent success on bot submissions
  if(data.website && String(data.website).trim()){
    return res.status(200).json({ ok: true });
  }

  const naam     = clean(data.naam, 200);
  const bedrijf  = clean(data.bedrijf, 200);
  const email    = clean(data.email, 200).toLowerCase();
  const telefoon = clean(data.telefoon, 80);
  const adres    = clean(data.adres, 400);
  const type     = clean(data.type, 100);
  const urgentie = clean(data.urgentie, 100);
  const bericht  = clean(data.bericht, 3000);
  const datum    = clean(data.datum, 20);
  const tijd     = clean(data.tijd, 10);

  if(!naam) return bad(res, 'Naam is verplicht.');
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Geldig e-mailadres is verplicht.');
  if(!telefoon) return bad(res, 'Telefoonnummer is verplicht.');
  if(!adres) return bad(res, 'Adres / locatie is verplicht.');
  if(!type) return bad(res, 'Kies een type overlast.');
  if(type && !ALLOWED_TYPES.includes(type)) return bad(res, 'Ongeldig type overlast.');
  if(datum && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return bad(res, 'Ongeldige datum.');
  if(tijd && !/^\d{2}:\d{2}$/.test(tijd)) return bad(res, 'Ongeldige tijd.');

  // Per-IP rate limiting (best-effort, only when KV available)
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  if(kvConfigured()){
    try {
      const rlKey = `pf:rl:submit:${ip}`;
      const c = await kv.incr(rlKey);
      if(c === 1) await kv.expire(rlKey, 600);
      if(c > 8) return bad(res, 'Te veel aanvragen vanaf dit IP. Probeer het later opnieuw.', 429);
    } catch(_) {}
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const created = new Date().toISOString();
  const record = {
    id, created,
    status: 'nieuw',
    naam, bedrijf, email, telefoon, adres,
    type, urgentie, bericht, datum, tijd,
    ip, ua: clean(req.headers['user-agent'], 300)
  };

  // Persist
  let kvOk = false;
  if(kvConfigured()){
    try {
      await kv.set(`pf:request:${id}`, JSON.stringify(record));
      await kv.zadd('pf:requests', Date.now(), id);
      kvOk = true;
    } catch(err){
      console.error('KV save failed:', err);
    }
  }

  // Email
  const recipient = process.env.INSPECTION_RECIPIENT || process.env.SMTP2GO_FROM_EMAIL;
  const subject = `Nieuwe inspectie-aanvraag — ${type}`;

  const text = [
    `Nieuwe aanvraag via pestforcenederland.nl`,
    `Ontvangen: ${created}`,
    ``,
    `— Contact —`,
    `Naam: ${naam}`,
    bedrijf ? `Bedrijf: ${bedrijf}` : null,
    `E-mail: ${email}`,
    `Telefoon: ${telefoon}`,
    `Adres: ${adres}`,
    ``,
    `— Situatie —`,
    `Type: ${type}`,
    `Urgentie: ${urgentie || '—'}`,
    bericht ? `\nBeschrijving:\n${bericht}` : null,
    ``,
    `— Voorkeursmoment —`,
    datum ? `${datum}${tijd ? ' om ' + tijd : ' (tijd nader te bepalen)'}` : 'Telefonisch overleggen',
    ``,
    `Ref: ${id}`
  ].filter(Boolean).join('\n');

  const row = (label, value) => value ? `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #eee;color:#6B6B68;font-size:11px;letter-spacing:.18em;text-transform:uppercase;width:130px;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #eee;color:#0A0A0A;font-size:15px">${value}</td>
  </tr>` : '';

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F5F1EB">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0A0A0A">
  <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#6B6B68;margin-bottom:8px">Pestforce Nederland</div>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:32px;letter-spacing:-.02em;margin:0 0 6px;line-height:1.05">Nieuwe inspectie-<br/>aanvraag.</h1>
  <p style="color:#6B6B68;font-size:13px;margin:0 0 28px">Ontvangen ${escapeHtml(new Date(created).toLocaleString('nl-NL'))}</p>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee">
    ${row('Naam', escapeHtml(naam))}
    ${bedrijf ? row('Bedrijf', escapeHtml(bedrijf)) : ''}
    ${row('E-mail', `<a href="mailto:${escapeHtml(email)}" style="color:#0A0A0A">${escapeHtml(email)}</a>`)}
    ${row('Telefoon', `<a href="tel:${escapeHtml(telefoon)}" style="color:#0A0A0A">${escapeHtml(telefoon)}</a>`)}
    ${row('Adres', escapeHtml(adres))}
    ${row('Type', escapeHtml(type))}
    ${row('Urgentie', escapeHtml(urgentie || '—'))}
    ${row('Voorkeur', datum ? escapeHtml(datum) + (tijd ? ' om ' + escapeHtml(tijd) : '') : 'Telefonisch overleggen')}
  </table>
  ${bericht ? `<div style="margin-top:28px"><div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#6B6B68;margin-bottom:10px">Beschrijving</div><div style="white-space:pre-wrap;color:#3A3A37;line-height:1.6;font-size:15px">${escapeHtml(bericht)}</div></div>` : ''}
  <div style="margin-top:36px;padding-top:18px;border-top:1px solid #eee;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6B6B68">Ref: ${escapeHtml(id)}</div>
</div></body></html>`;

  let mailOk = false, mailError = null;
  try {
    await sendEmail({ to: recipient, replyTo: email, subject, text, html });
    mailOk = true;
  } catch(err){
    console.error('SMTP2GO failed:', err);
    mailError = err.message;
  }

  if(!mailOk && !kvOk){
    return res.status(502).json({ ok: false, error: 'Bezorging mislukt. Probeer telefonisch contact op te nemen.' });
  }

  return res.status(200).json({
    ok: true,
    id,
    stored: kvOk,
    emailed: mailOk,
    warning: mailOk ? null : 'opgeslagen, maar e-mail-bezorging is mislukt'
  });
}
