import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface PasswordRecoveryEmailParams {
  to: string;
  name: string;
  loginId: string;
  recoveryCode: string;
  resetLink: string;
  expiresInMinutes?: number;
}

interface SendEmailResult {
  sent: boolean;
  message: string;
  previewUrl?: string;
  mode: 'smtp' | 'ethereal' | 'logged';
}

let transporter: Transporter | null = null;
let isEthereal = false;

async function getTransporter(): Promise<{ transport: Transporter; fromAddress: string; mode: 'smtp' | 'ethereal' | 'logged' } | null> {
  const host = process.env.SMTP_HOST || (process.env.GMAIL_USER ? 'smtp.gmail.com' : '');
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.EMAIL_PASS || '';
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = process.env.SMTP_FROM || (user ? `"SAIKIRAN CHITS" <${user}>` : '"SAIKIRAN CHITS" <noreply@saikiranchits.com>');

  // 1. If explicit SMTP credentials are provided, use them
  if (host && user && pass) {
    if (!transporter || isEthereal) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      isEthereal = false;
    }
    return { transport: transporter, fromAddress: from, mode: 'smtp' };
  }

  // 2. If Resend / API key is provided
  if (process.env.RESEND_API_KEY) {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY,
        },
      });
      isEthereal = false;
    }
    return { transport: transporter, fromAddress: from, mode: 'smtp' };
  }

  // 3. Fallback: Create or reuse an Ethereal test account so real email transactions can be previewed
  try {
    if (!transporter) {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      isEthereal = true;
    }
    return {
      transport: transporter,
      fromAddress: '"SAIKIRAN CHITS Password Recovery" <security@saikiranchits.com>',
      mode: 'ethereal',
    };
  } catch (err) {
    console.warn('Could not create Ethereal test mailer, falling back to simulated log delivery:', err);
    return null;
  }
}

export async function sendPasswordRecoveryEmail(params: PasswordRecoveryEmailParams): Promise<SendEmailResult> {
  const { to, name, loginId, recoveryCode, resetLink, expiresInMinutes = 15 } = params;

  console.log(`\n======================================================`);
  console.log(`📧 [PASSWORD RECOVERY] Preparing email for: ${to}`);
  console.log(`👤 User: ${name} (Login ID: ${loginId})`);
  console.log(`🔑 Verification Code: ${recoveryCode}`);
  console.log(`🔗 Direct Reset Link: ${resetLink}`);
  console.log(`⏱️ Expiration: ${expiresInMinutes} minutes`);
  console.log(`======================================================\n`);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Recovery - SAIKIRAN CHITS</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <tr>
      <td style="background-color: #1e3a8a; padding: 28px 32px; text-align: left;">
        <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">SAIKIRAN CHITS</h1>
        <p style="margin: 4px 0 0 0; color: #93c5fd; font-size: 12px; font-weight: 500;">Chit Fund Multi-Ledger Management Platform</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 700;">Password Recovery Request</h2>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          Hello <strong>${name || 'Administrator'}</strong>,
        </p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          We received a request to recover the password for your account linked to Login ID: <strong style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #0f172a;">${loginId}</strong>.
        </p>

        <!-- Recovery Code Badge -->
        <div style="background-color: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <div style="font-size: 12px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
            Your 6-Digit Recovery Code
          </div>
          <div style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1e3a8a; margin: 4px 0;">
            ${recoveryCode}
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
            Valid for the next ${expiresInMinutes} minutes
          </div>
        </div>

        <!-- 1-Click Reset Button -->
        <div style="text-align: center; margin: 28px 0 20px 0;">
          <a href="${resetLink}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
            Reset Password Directly
          </a>
          <p style="font-size: 11px; color: #64748b; margin: 10px 0 0 0;">
            Click above to open the reset password screen with your recovery token.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />

        <!-- Security Notice -->
        <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
          <strong>Security Notice:</strong> If you did not make this request, please disregard this email. Your password will remain unchanged, and your account remains protected by end-to-end authentication.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f1f5f9; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #64748b;">
          SAIKIRAN CHITS • Automated Security Dispatch • Do not reply directly to this email
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  try {
    const mailer = await getTransporter();

    if (mailer) {
      const info = await mailer.transport.sendMail({
        from: mailer.fromAddress,
        to,
        subject: `[SAIKIRAN CHITS] Password Recovery Code: ${recoveryCode}`,
        text: `Hello ${name || 'User'},\n\nYour 6-digit password recovery code for Login ID ${loginId} is: ${recoveryCode}\n\nReset Link: ${resetLink}\n\nThis code will expire in ${expiresInMinutes} minutes.\nIf you did not request this, please ignore this email.`,
        html: htmlContent,
      });

      let previewUrl: string | undefined;
      if (mailer.mode === 'ethereal') {
        previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
        console.log(`🌐 [Ethereal Mail Preview URL]: ${previewUrl}`);
      }

      console.log(`✅ [PASSWORD RECOVERY] Email dispatched successfully to ${to} (Message ID: ${info.messageId})`);
      return {
        sent: true,
        message: mailer.mode === 'smtp'
          ? `Recovery email sent successfully to ${to}.`
          : `Recovery email dispatched (Test environment: ${previewUrl || 'sent'}).`,
        previewUrl,
        mode: mailer.mode,
      };
    } else {
      // Mail transport not available; logged to console
      return {
        sent: true,
        message: `Recovery code generated and logged for ${to}.`,
        mode: 'logged',
      };
    }
  } catch (err: any) {
    console.error('❌ [PASSWORD RECOVERY] Error sending email:', err);
    return {
      sent: false,
      message: `Failed to deliver email: ${err.message || 'SMTP delivery error'}. (Code logged for access: ${recoveryCode})`,
      mode: 'logged',
    };
  }
}
