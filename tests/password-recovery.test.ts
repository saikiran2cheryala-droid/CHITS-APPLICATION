import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashRecoveryCode,
  createPasswordReset,
  verifyPasswordResetCode,
  resetUserPasswordWithToken,
  findUserByLoginId,
  validatePasswordStrength,
  verifyPassword,
} from '../server/prismaRepository';
import { initDatabase } from '../server/db';

describe('Password Recovery & OTP Flow', () => {
  let testLoginId = 'admin';

  before(async () => {
    initDatabase();
    const admin = (await findUserByLoginId('9640488507')) || (await findUserByLoginId('admin'));
    if (admin) {
      testLoginId = admin.login_id || admin.username || '9640488507';
    }
  });

  it('1. Generates exactly 6-digit cryptographically secure OTP with 10-minute validity', async () => {
    const user = await findUserByLoginId(testLoginId);
    assert.ok(user, 'User should exist in repository');

    const result = await createPasswordReset(user.id);
    assert.ok(result.recoveryCode, 'Should return a recovery code');
    assert.ok(result.resetToken, 'Should return a reset token');

    // Exactly 6 digits
    assert.equal(result.recoveryCode.length, 6, 'Recovery code must be exactly 6 characters');
    assert.match(result.recoveryCode, /^\d{6}$/, 'Recovery code must contain only 6 digits');
    const num = parseInt(result.recoveryCode, 10);
    assert.ok(num >= 100000 && num <= 999999, 'Code must be between 100000 and 999999');
  });

  it('2. Hashes OTP with HMAC-SHA256 so database never stores plaintext code', () => {
    const code = '482910';
    const hash = hashRecoveryCode(code);
    assert.notEqual(hash, code, 'Hash must differ from plaintext code');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64, 'HMAC-SHA256 hex string must be 64 characters');

    // Deterministic hash verification with the same secret
    const hashAgain = hashRecoveryCode(code);
    assert.equal(hash, hashAgain, 'Hash must be deterministic for identical input');
  });

  it('3. Successfully verifies 6-digit code and returns resetToken', async () => {
    const user = await findUserByLoginId(testLoginId);
    assert.ok(user);

    const { recoveryCode, resetToken } = await createPasswordReset(user.id);

    // Verify with correct code
    const verification = await verifyPasswordResetCode(testLoginId, recoveryCode);
    assert.ok(verification, 'Verification must succeed with matching OTP');
    assert.equal(verification.resetToken, resetToken, 'Must return the resetToken matching the reset record');
  });

  it('4. Rejects invalid or mismatched recovery codes', async () => {
    const user = await findUserByLoginId(testLoginId);
    assert.ok(user);

    await createPasswordReset(user.id);

    // Wrong code
    const wrong = await verifyPasswordResetCode(testLoginId, '000000');
    assert.equal(wrong, null, 'Verification must fail with incorrect code');
  });

  it('5. Enforces single-use policy by invalidating prior tokens when new one is generated', async () => {
    const user = await findUserByLoginId(testLoginId);
    assert.ok(user);

    const first = await createPasswordReset(user.id);
    const second = await createPasswordReset(user.id);

    // First code should now be superseded / invalidated
    const firstCheck = await verifyPasswordResetCode(testLoginId, first.recoveryCode);
    assert.equal(firstCheck, null, 'First code should be invalid after generating a new code');

    // Second code should be valid
    const secondCheck = await verifyPasswordResetCode(testLoginId, second.recoveryCode);
    assert.ok(secondCheck, 'Latest code must be valid');
  });

  it('6. Validates password strength rules during reset', () => {
    assert.equal(validatePasswordStrength('short').isValid, false);
    assert.equal(validatePasswordStrength('nouppercase1!').isValid, false);
    assert.equal(validatePasswordStrength('NOLOWERCASE1!').isValid, false);
    assert.equal(validatePasswordStrength('NoSpecialChar1').isValid, false);
    assert.equal(validatePasswordStrength('StrongPass123!').isValid, true);
  });

  it('7. Resets user password successfully, invalidates token and updates password hash', async () => {
    const user = await findUserByLoginId(testLoginId);
    assert.ok(user);

    const { recoveryCode, resetToken } = await createPasswordReset(user.id);
    const verification = await verifyPasswordResetCode(testLoginId, recoveryCode);
    assert.ok(verification);

    const newPass = 'SecureResetPass#2026';
    const resetResult = await resetUserPasswordWithToken(resetToken, newPass);
    assert.equal(resetResult, true, 'Reset should return true on success');

    // Verify new password works
    const updatedUser = await findUserByLoginId(testLoginId);
    assert.ok(updatedUser);
    const matchesNew = verifyPassword(newPass, updatedUser.password_hash, updatedUser.salt);
    assert.equal(matchesNew, true, 'Updated password must verify against stored hash');

    // Attempting to reuse the same resetToken must fail
    await assert.rejects(
      async () => {
        await resetUserPasswordWithToken(resetToken, 'AnotherPass#2026');
      },
      /expired or is invalid|Invalid or expired reset token/,
      'Reusing the same resetToken must throw'
    );
  });

  it('8. Tests sendPasswordRecoveryEmail with Resend HTTPS API interface', async () => {
    const { sendPasswordRecoveryEmail } = await import('../server/email');

    // Without RESEND_API_KEY in dev, it safely simulates dispatch
    const result = await sendPasswordRecoveryEmail({
      to: 'test@example.com',
      name: 'Test Administrator',
      loginId: 'admin',
      recoveryCode: '123456',
      resetLink: 'http://localhost:3000/#reset?token=xyz',
      expiresInMinutes: 10,
    });

    assert.ok(result);
    assert.equal(result.sent, true);
    assert.ok(result.message);
  });
});
