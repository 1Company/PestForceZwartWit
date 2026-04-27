// SMTP2GO HTTP API wrapper.
// Env: SMTP2GO_API_KEY, SMTP2GO_FROM_EMAIL, SMTP2GO_FROM_NAME (optional)

const API = 'https://api.smtp2go.com/v3/email/send';

export async function sendEmail({ to, subject, text, html, replyTo }){
  const apiKey    = process.env.SMTP2GO_API_KEY;
  const fromEmail = process.env.SMTP2GO_FROM_EMAIL;
  const fromName  = process.env.SMTP2GO_FROM_NAME || 'Pestforce Nederland';

  if(!apiKey)    throw new Error('SMTP2GO_API_KEY not set');
  if(!fromEmail) throw new Error('SMTP2GO_FROM_EMAIL not set');

  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if(!recipients.length) throw new Error('no recipients');

  const body = {
    api_key: apiKey,
    sender: `${fromName} <${fromEmail}>`,
    to: recipients,
    subject,
    text_body: text || undefined,
    html_body: html || undefined,
    custom_headers: replyTo ? [{ header: 'Reply-To', value: replyTo }] : undefined
  };

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(()=>({}));
  const failed = !res.ok || (j && j.data && (j.data.error || j.data.failed));
  if(failed){
    const detail = j?.data?.error || j?.data?.failures || JSON.stringify(j).slice(0,400);
    throw new Error(`SMTP2GO ${res.status}: ${detail}`);
  }
  return j;
}

export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
