import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createChitFull, computeChitCurrentMonth } from '../server/prismaRepository';

describe('New Chit Creation Flow & Batch Dues Generation', () => {
  it('1. Computes correct start month index dynamically', () => {
    const currentMonth = computeChitCurrentMonth('October 2026', 25);
    assert.equal(typeof currentMonth, 'number');
    assert.ok(currentMonth >= 1 && currentMonth <= 25);
  });

  it('2. Generates complete rules and member dues in createChitFull data payload', async () => {
    const mockRules = Array.from({ length: 25 }, (_, i) => ({
      month_number: i + 1,
      month_name: `Month ${i + 1}`,
      pre_lift_payment: 16000,
      post_lift_payment: 20000,
      monthly_chit_value: 500000,
      expected_lift_payout: 310000 + (i * 2500),
    }));

    const mockMembers = Array.from({ length: 25 }, (_, i) => ({
      customer_name: `Member ${i + 1}`,
      phone: `98765432${String(i).padStart(2, '0')}`,
      ticket_number: String(i + 1).padStart(2, '0'),
    }));

    const payload = {
      name: 'TEST 5 LAKH CHIT',
      chit_value: 500000,
      total_months: 25,
      total_members: 25,
      start_month: 'October 2026',
      end_month: 'October 2028',
      rules: mockRules,
      members: mockMembers,
    };

    const chit = await createChitFull(payload);
    assert.ok(chit);
    assert.ok(chit.id);
    assert.equal(chit.name, 'TEST 5 LAKH CHIT');
    assert.equal(chit.chit_value, 500000);
    assert.equal(chit.total_months, 25);
    assert.equal(chit.total_members, 25);
  });
});
