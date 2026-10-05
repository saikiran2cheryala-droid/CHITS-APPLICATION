export interface PasswordRecoveryEmailParams {
  to: string;
  name: string;
  loginId: string;
  recoveryCode: string;
  resetLink: string;
  expiresInMinutes?: number;
}

export interface SendEmailResult {
  sent: boolean;
  message: string;
  id?: string;
  previewUrl?: string;
  mode: 'resend' | 'logged';
}

export async function sendPasswordRecoveryEmail(params: PasswordRecoveryEmailParams): Promise<SendEmailResult> {
  const { to, name, loginId, recoveryCode, resetLink, expiresInMinutes = 10 } = params;

  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim();

  console.log(`\n======================================================`);
  console.log(`📧 [PASSWORD RECOVERY] Preparing email for: ${to}`);
  console.log(`👤 User: ${name} (Login ID: ${loginId})`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔑 Verification Code: ${recoveryCode}`);
    console.log(`🔗 Direct Reset Link: ${resetLink}`);
  }
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
            Valid for the next ${expiresInMinutes} minutes (single-use only)
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

  // Fallback for local development when RESEND_API_KEY is not yet supplied
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      const err = new Error('RESEND_API_KEY environment variable is not configured.');
      console.error('❌ [EMAIL DISPATCH ERROR]', err.message);
      throw err;
    }
    console.warn('⚠️ [RESEND] RESEND_API_KEY is not configured. Email simulated for local development.');
    return {
      sent: true,
      message: `Recovery code generated and simulated for ${to} (RESEND_API_KEY not configured).`,
      mode: 'logged',
    };
  }

  // Resend HTTPS API endpoint
  const resendUrl = 'https://api.resend.com/emails';

  const payload = {
    from: fromEmail,
    to: [to],
    subject: 'Password Recovery Verification Code',
    html: htmlContent,
  };

  const response = await fetch(resendUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let rawError = '';
    try {
      const errJson = (await response.json()) as any;
      rawError = errJson?.message || JSON.stringify(errJson);
    } catch {
      rawError = await response.text();
    }

    // Safely sanitize any accidental key leak from the error details
    const sanitizedError = apiKey ? rawError.split(apiKey).join('[REDACTED_API_KEY]') : rawError;
    console.error(`❌ [RESEND API ERROR] HTTP ${response.status}: ${sanitizedError}`);
    throw new Error(`Resend email delivery failed (${response.status}): ${sanitizedError}`);
  }

  const result = (await response.json()) as any;
  console.log(`✅ [PASSWORD RECOVERY] Email dispatched successfully to ${to} via Resend (ID: ${result?.id || 'unknown'})`);

  return {
    sent: true,
    id: result?.id,
    message: `Password recovery verification code sent successfully to ${to}.`,
    mode: 'resend',
  };
}
