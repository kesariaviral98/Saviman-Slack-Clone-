// ─────────────────────────────────────────────────────────────────────────────
// Email job — sends transactional emails via SMTP (nodemailer).
//
// Supported types: mention, reply, welcome, missed_call.
//
// If SMTP credentials are not configured the worker logs a warning and skips
// sending — this means the app works fully in dev without a mail server.
// ─────────────────────────────────────────────────────────────────────────────

import nodemailer from 'nodemailer';
import type Bull from 'bull';
import { emailQueue, type EmailJobData } from '../utils/bull';
import { logger } from '../utils/logger';
import { config } from '../config/config';

// ── Mailer singleton ──────────────────────────────────────────────────────────

function createTransport(): nodemailer.Transporter | null {
  const { host, user, pass } = config.smtp;

  if (!host || !user || !pass) {
    logger.warn('SMTP credentials not configured — email sending disabled');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: config.smtp.port,
    secure: false, // STARTTLS
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });
}

const FROM = config.smtp.from;
let transporter: nodemailer.Transporter | null = null;

// ── Worker ────────────────────────────────────────────────────────────────────

const CONCURRENCY = 3;

export function startEmailWorker(): void {
  // Lazily create the transporter so startup doesn't fail if SMTP is absent
  transporter = createTransport();

  emailQueue.process(CONCURRENCY, async (job: Bull.Job<EmailJobData>) => {
    const { to, subject, html, text } = job.data;

    if (!transporter) {
      // Log and skip — don't throw so the job doesn't fail/retry pointlessly
      logger.debug({ jobId: job.id, to }, 'Email skipped — no SMTP config');
      return;
    }

    logger.debug({ jobId: job.id, to, subject }, 'Sending email');

    const info = await transporter.sendMail({ from: FROM, to, subject, html, text });

    logger.info({ jobId: job.id, messageId: info.messageId, to }, 'Email sent');
  });

  logger.info('Email worker started (concurrency=%d)', CONCURRENCY);
}

// ── Helpers: build email payloads ─────────────────────────────────────────────

export function buildMentionEmail(opts: {
  to: string;
  mentionedBy: string;
  channelName: string;
  preview: string;
  link: string;
}): Omit<EmailJobData, 'type'> {
  return {
    to: opts.to,
    subject: `${opts.mentionedBy} mentioned you in #${opts.channelName}`,
    html: `
      <p>Hi,</p>
      <p><strong>${opts.mentionedBy}</strong> mentioned you in <strong>#${opts.channelName}</strong>:</p>
      <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555">
        ${opts.preview}
      </blockquote>
      <p><a href="${opts.link}">View message →</a></p>
      <p style="color:#999;font-size:12px">TeamChat · You received this because you were mentioned.</p>
    `,
    text: `${opts.mentionedBy} mentioned you in #${opts.channelName}:\n\n"${opts.preview}"\n\n${opts.link}`,
  };
}

export function buildReplyEmail(opts: {
  to: string;
  repliedBy: string;
  channelName: string;
  preview: string;
  link: string;
}): Omit<EmailJobData, 'type'> {
  return {
    to: opts.to,
    subject: `${opts.repliedBy} replied to your message in #${opts.channelName}`,
    html: `
      <p>Hi,</p>
      <p><strong>${opts.repliedBy}</strong> replied to your message in <strong>#${opts.channelName}</strong>:</p>
      <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555">
        ${opts.preview}
      </blockquote>
      <p><a href="${opts.link}">View thread →</a></p>
      <p style="color:#999;font-size:12px">TeamChat · You received this because someone replied to your message.</p>
    `,
    text: `${opts.repliedBy} replied in #${opts.channelName}:\n\n"${opts.preview}"\n\n${opts.link}`,
  };
}

export function buildWelcomeEmail(opts: {
  to: string;
  displayName: string;
  workspaceName: string;
}): Omit<EmailJobData, 'type'> {
  return {
    to: opts.to,
    subject: `Welcome to ${opts.workspaceName} on TeamChat!`,
    html: `
      <p>Hi ${opts.displayName},</p>
      <p>You've been added to <strong>${opts.workspaceName}</strong> on TeamChat.</p>
      <p>Log in to start collaborating with your team:</p>
      <p><a href="${config.app.clientOrigin}">Open TeamChat →</a></p>
      <p style="color:#999;font-size:12px">TeamChat · The real-time collaboration platform.</p>
    `,
    text: `Hi ${opts.displayName},\n\nYou've been added to ${opts.workspaceName} on TeamChat.\n\nLog in at: ${config.app.clientOrigin}`,
  };
}

export function buildMissedCallEmail(opts: {
  to: string;
  callerName: string;
  channelName: string;
  link: string;
}): Omit<EmailJobData, 'type'> {
  return {
    to: opts.to,
    subject: `Missed call from ${opts.callerName}`,
    html: `
      <p>Hi,</p>
      <p>You missed a call from <strong>${opts.callerName}</strong> in <strong>#${opts.channelName}</strong>.</p>
      <p><a href="${opts.link}">Open TeamChat →</a></p>
      <p style="color:#999;font-size:12px">TeamChat · Missed call notification.</p>
    `,
    text: `You missed a call from ${opts.callerName} in #${opts.channelName}.\n\n${opts.link}`,
  };
}

export function buildInviteEmail(opts: {
  to: string;
  inviterName: string;
  workspaceName: string;
  inviteLink: string;
}): Omit<EmailJobData, 'type'> {
  return {
    to: opts.to,
    subject: `${opts.inviterName} invited you to ${opts.workspaceName} on TeamChat`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:20px">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1)">
          <div style="background:#3f0e40;padding:24px 32px">
            <span style="color:#fff;font-size:22px;font-weight:800">TeamChat</span>
          </div>
          <div style="padding:32px">
            <p style="margin:0 0 16px;font-size:16px;color:#1d1c1d">
              <strong>${opts.inviterName}</strong> has invited you to join the
              <strong>${opts.workspaceName}</strong> workspace on TeamChat.
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#616061">
              Click the button below to accept your invitation. This link expires in 24 hours.
            </p>
            <a href="${opts.inviteLink}"
               style="display:inline-block;background:#1264a3;color:#fff;text-decoration:none;
                      padding:12px 24px;border-radius:4px;font-size:15px;font-weight:600">
              Accept Invitation →
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#999">
              Or copy this link: <a href="${opts.inviteLink}" style="color:#1264a3">${opts.inviteLink}</a>
            </p>
          </div>
          <div style="background:#f4f4f5;padding:16px 32px;font-size:11px;color:#999">
            TeamChat · You received this because ${opts.inviterName} invited you.
          </div>
        </div>
      </body>
      </html>
    `,
    text: `${opts.inviterName} invited you to join ${opts.workspaceName} on TeamChat.\n\nAccept your invitation: ${opts.inviteLink}\n\nThis link expires in 24 hours.`,
  };
}
