import { env, isEmailEnabled, isProduction } from '../config/env.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends transactional mail through Resend's REST API.
 *
 * Deliberately a plain fetch rather than the SDK: this is one POST, and keeping
 * it dependency-free means swapping to SES, Postmark or SMTP later is a change
 * to this file alone.
 *
 * With no API key configured the message is logged instead. That keeps the
 * password-reset flow usable in development and on a fresh deploy - the link is
 * recoverable from the server log - rather than failing in a way that looks
 * like a broken feature.
 */
export async function sendEmail(email: Email): Promise<{ delivered: boolean; reason?: string }> {
  if (!isEmailEnabled) {
    console.warn(
      `[mail] RESEND_API_KEY is not set, so this email was not sent.\n` +
        `[mail] to: ${email.to}\n[mail] subject: ${email.subject}\n${email.text}`,
    );
    return { delivered: false, reason: 'email_not_configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY as string}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[mail] Resend rejected the message (${response.status}): ${detail}`);
      // Never surfaced to the caller as a failure: see resetRequest for why the
      // response must not reveal anything about this address.
      if (!isProduction) console.warn(`[mail] undelivered body:\n${email.text}`);
      return { delivered: false, reason: 'provider_error' };
    }

    return { delivered: true };
  } catch (error) {
    console.error('[mail] Could not reach the email provider:', error);
    if (!isProduction) console.warn(`[mail] undelivered body:\n${email.text}`);
    return { delivered: false, reason: 'network_error' };
  }
}

export function passwordResetEmail(name: string, resetUrl: string, minutes: number): Email {
  const text = [
    `Hello ${name},`,
    '',
    'You asked to reset your ExamPrep password. Open this link to choose a new one:',
    resetUrl,
    '',
    `The link works once and expires in ${minutes} minutes.`,
    'If you did not ask for this, you can ignore this email - your password has not changed.',
  ].join('\n');

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1e293b">
  <p>Hello ${escapeHtml(name)},</p>
  <p>You asked to reset your ExamPrep password. Choose a new one here:</p>
  <p>
    <a href="${escapeHtml(resetUrl)}"
       style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
      Reset my password
    </a>
  </p>
  <p style="font-size:14px;color:#64748b">
    The link works once and expires in ${minutes} minutes.<br>
    If you did not ask for this, ignore this email - your password has not changed.
  </p>
</div>`.trim();

  return { to: '', subject: 'Reset your ExamPrep password', text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
