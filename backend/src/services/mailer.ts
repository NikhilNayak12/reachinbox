import nodemailer, { Transporter } from 'nodemailer';

const cache = new Map<string, Transporter>();

export interface SmtpSender {
  sender_id: string;
  sender_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
}

function transportFor(s: SmtpSender) {
  let t = cache.get(s.sender_id);
  if (!t) {
    t = nodemailer.createTransport({
      host: s.smtp_host,
      port: s.smtp_port,
      secure: false,
      auth: { user: s.smtp_user, pass: s.smtp_pass },
    });
    cache.set(s.sender_id, t);
  }
  return t;
}

export async function sendMail(s: SmtpSender, opts: { id: string; to: string; subject: string; body: string }) {
  const info = await transportFor(s).sendMail({
    from: `"ReachInbox Scheduler" <${s.sender_email}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    html: opts.body.replace(/\n/g, '<br/>'),
    // Deterministic Message-ID => a duplicate delivery would be detectable
    messageId: `<${opts.id}@reachinbox.local>`,
  });
  return nodemailer.getTestMessageUrl(info) || null;
}
