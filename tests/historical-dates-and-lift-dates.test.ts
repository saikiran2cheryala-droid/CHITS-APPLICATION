import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateOnly,
  createChitFull,
  saveLiftAuction,
  recordLiftPayoutPayment,
  getChitByIdWithDetails,
  getDefaultLiftDateObj,
  computeChitCurrentMonth,
} from '../server/prismaRepository';
import {
  formatDDMMYYYY,
  toISODateInput,
  getDefaultLiftDate,
  formatDate,
} from '../src/utils/formatters';

describe('Historical Dates & Lift Date Processing Regression Tests', () => {
  describe('1. parseDateOnly unit tests', () => {
    it('parses production bug date "22-08-2026" correctly', () => {
      const parsed = parseDateOnly('22-08-2026');
      assert.ok(parsed instanceof Date, 'Should return a valid Date object');
      assert.equal(isNaN(parsed.getTime()), false, 'Date should not be NaN');
      assert.equal(parsed.getUTCFullYear(), 2026);
      assert.equal(parsed.getUTCMonth(), 7); // 0-indexed, 7 = August
      assert.equal(parsed.getUTCDate(), 22);
    });

    it('parses historical dates "22-08-2024", "01-08-2024", "15-01-2025", "31-12-2024", "31-12-2025"', () => {
      const d1 = parseDateOnly('22-08-2024');
      assert.ok(d1);
      assert.equal(d1.getUTCFullYear(), 2024);
      assert.equal(d1.getUTCMonth(), 7);
      assert.equal(d1.getUTCDate(), 22);

      const d2 = parseDateOnly('01-08-2024');
      assert.ok(d2);
      assert.equal(d2.getUTCFullYear(), 2024);
      assert.equal(d2.getUTCMonth(), 7);
      assert.equal(d2.getUTCDate(), 1);

      const d3 = parseDateOnly('15-01-2025');
      assert.ok(d3);
      assert.equal(d3.getUTCFullYear(), 2025);
      assert.equal(d3.getUTCMonth(), 0); // January
      assert.equal(d3.getUTCDate(), 15);

      const d4 = parseDateOnly('31-12-2024');
      assert.ok(d4);
      assert.equal(d4.getUTCFullYear(), 2024);
      assert.equal(d4.getUTCMonth(), 11); // December
      assert.equal(d4.getUTCDate(), 31);

      const d5 = parseDateOnly('31-12-2025');
      assert.ok(d5);
      assert.equal(d5.getUTCFullYear(), 2025);
      assert.equal(d5.getUTCMonth(), 11);
      assert.equal(d5.getUTCDate(), 31);
    });

    it('parses dates older than current year: "10-07-2023"', () => {
      const d = parseDateOnly('10-07-2023');
      assert.ok(d);
      assert.equal(d.getUTCFullYear(), 2023);
      assert.equal(d.getUTCMonth(), 6); // July
      assert.equal(d.getUTCDate(), 10);
    });

    it('parses HTML date input format YYYY-MM-DD: "2024-08-01", "2025-01-15", "2026-08-10"', () => {
      const d1 = parseDateOnly('2024-08-01');
      assert.ok(d1);
      assert.equal(d1.getUTCFullYear(), 2024);
      assert.equal(d1.getUTCMonth(), 7);
      assert.equal(d1.getUTCDate(), 1);

      const d2 = parseDateOnly('2025-01-15');
      assert.ok(d2);
      assert.equal(d2.getUTCFullYear(), 2025);
      assert.equal(d2.getUTCMonth(), 0);
      assert.equal(d2.getUTCDate(), 15);

      const d3 = parseDateOnly('2026-08-10');
      assert.ok(d3);
      assert.equal(d3.getUTCFullYear(), 2026);
      assert.equal(d3.getUTCMonth(), 7);
      assert.equal(d3.getUTCDate(), 10);
    });

    it('parses slash format DD/MM/YYYY: "22/08/2026"', () => {
      const d = parseDateOnly('22/08/2026');
      assert.ok(d);
      assert.equal(d.getUTCFullYear(), 2026);
      assert.equal(d.getUTCMonth(), 7);
      assert.equal(d.getUTCDate(), 22);
    });

    it('correctly returns null for invalid inputs', () => {
      assert.equal(parseDateOnly(''), null);
      assert.equal(parseDateOnly(undefined), null);
      assert.equal(parseDateOnly(null), null);
      assert.equal(parseDateOnly('Invalid Date'), null);
      assert.equal(parseDateOnly('abc'), null);
      assert.equal(parseDateOnly('2024-02-31'), null); // Feb 31 does not exist
      assert.equal(parseDateOnly('31-02-2024'), null);
      assert.equal(parseDateOnly(new Date('invalid')), null);
    });
  });

  describe('2. Timezone & date-only formatting helpers', () => {
    it('formatDDMMYYYY formats date without timezone shifting', () => {
      assert.equal(formatDDMMYYYY('2024-08-01'), '01-08-2024');
      assert.equal(formatDDMMYYYY('2024-08-01T00:00:00.000Z'), '01-08-2024');
      assert.equal(formatDDMMYYYY('22-08-2026'), '22-08-2026');
      assert.equal(formatDDMMYYYY('15/01/2025'), '15-01-2025');
    });

    it('toISODateInput returns YYYY-MM-DD for HTML input without timezone shifting', () => {
      assert.equal(toISODateInput('22-08-2026'), '2026-08-22');
      assert.equal(toISODateInput('01-08-2024'), '2024-08-01');
      assert.equal(toISODateInput('15/01/2025'), '2025-01-15');
      assert.equal(toISODateInput(''), '');
      assert.equal(toISODateInput(null), '');
      assert.equal(toISODateInput(undefined), '');
    });

    it('formatDate displays human readable string without shifting day', () => {
      assert.equal(formatDate('2024-08-01'), '01 Aug 2024');
      assert.equal(formatDate('2024-08-01T00:00:00.000Z'), '01 Aug 2024');
      assert.equal(formatDate('22-08-2026'), '22 Aug 2026');
    });

    it('getDefaultLiftDate calculates historical start month correctly', () => {
      assert.equal(getDefaultLiftDate('August 2024', 1), '2024-08-01');
      assert.equal(getDefaultLiftDate('August 2024', 2), '2024-09-01');
      assert.equal(getDefaultLiftDate('August 2024', 6), '2025-01-01');
      assert.equal(getDefaultLiftDate('January 2025', 1), '2025-01-01');
      assert.equal(getDefaultLiftDate('August 2026', 1), '2026-08-01');
    });

    it('getDefaultLiftDateObj returns correct Date object', () => {
      const d1 = getDefaultLiftDateObj('August 2024', 1);
      assert.equal(d1.getUTCFullYear(), 2024);
      assert.equal(d1.getUTCMonth(), 7); // August
      assert.equal(d1.getUTCDate(), 1);

      const d2 = getDefaultLiftDateObj('August 2024', 2);
      assert.equal(d2.getUTCFullYear(), 2024);
      assert.equal(d2.getUTCMonth(), 8); // September
      assert.equal(d2.getUTCDate(), 1);
    });
  });

  describe('3. Chit creation with historical dates & lift workflows', () => {
    let chitAug2024: any;
    let chitJan2025: any;
    let chitAug2026: any;

    it('creates a new chit starting in August 2024', async () => {
      const rules = Array.from({ length: 25 }, (_, i) => ({
        month_number: i + 1,
        month_name: `Month ${i + 1}`,
        pre_lift_payment: 16000,
        post_lift_payment: 20000,
        monthly_chit_value: 500000,
        expected_lift_payout: 350000,
      }));
      const members = Array.from({ length: 25 }, (_, i) => ({
        customer_name: `Aug2024 Customer ${i + 1}`,
        phone: `91111111${String(i).padStart(2, '0')}`,
        ticket_number: String(i + 1).padStart(2, '0'),
      }));

      chitAug2024 = await createChitFull({
        name: 'Historical Chit Aug 2024',
        chit_value: 500000,
        total_months: 25,
        total_members: 25,
        start_month: 'August 2024',
        end_month: 'August 2026',
        rules,
        members,
      });

      assert.ok(chitAug2024.id);
      assert.equal(chitAug2024.start_month, 'August 2024');
    });

    it('creates a new chit starting in January 2025', async () => {
      const rules = Array.from({ length: 20 }, (_, i) => ({
        month_number: i + 1,
        month_name: `Month ${i + 1}`,
        pre_lift_payment: 15000,
        post_lift_payment: 18000,
        monthly_chit_value: 300000,
        expected_lift_payout: 220000,
      }));
      const members = Array.from({ length: 20 }, (_, i) => ({
        customer_name: `Jan2025 Customer ${i + 1}`,
        phone: `92222222${String(i).padStart(2, '0')}`,
        ticket_number: String(i + 1).padStart(2, '0'),
      }));

      chitJan2025 = await createChitFull({
        name: 'Historical Chit Jan 2025',
        chit_value: 300000,
        total_months: 20,
        total_members: 20,
        start_month: 'January 2025',
        end_month: 'August 2026',
        rules,
        members,
      });

      assert.ok(chitJan2025.id);
      assert.equal(chitJan2025.start_month, 'January 2025');
    });

    it('creates a new chit starting in August 2026', async () => {
      const rules = Array.from({ length: 15 }, (_, i) => ({
        month_number: i + 1,
        month_name: `Month ${i + 1}`,
        pre_lift_payment: 10000,
        post_lift_payment: 12000,
        monthly_chit_value: 150000,
        expected_lift_payout: 120000,
      }));
      const members = Array.from({ length: 15 }, (_, i) => ({
        customer_name: `Aug2026 Customer ${i + 1}`,
        phone: `93333333${String(i).padStart(2, '0')}`,
        ticket_number: String(i + 1).padStart(2, '0'),
      }));

      chitAug2026 = await createChitFull({
        name: 'Chit Aug 2026',
        chit_value: 150000,
        total_months: 15,
        total_members: 15,
        start_month: 'August 2026',
        end_month: 'October 2027',
        rules,
        members,
      });

      assert.ok(chitAug2026.id);
      assert.equal(chitAug2026.start_month, 'August 2026');
    });

    it('saves Lift Month 1 with historical date "22-08-2024"', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member1 = details.members[0];

      const lift = await saveLiftAuction(chitAug2024.id, member1.id, {
        lift_month: 1,
        lift_date: '22-08-2024',
        configured_lift_payout: 350000,
        initial_amount_paid: 350000,
        payment_method: 'Cash',
      });

      assert.ok(lift);
      assert.equal(lift.lift_month, 1);
      // Verify date is preserved as 2024-08-22
      const formatted = formatDDMMYYYY(lift.lift_date);
      assert.equal(formatted, '22-08-2024');
    });

    it('saves Lift Month 2 with historical date "15-09-2024"', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member2 = details.members[1];

      const lift = await saveLiftAuction(chitAug2024.id, member2.id, {
        lift_month: 2,
        lift_date: '15-09-2024',
        configured_lift_payout: 350000,
        initial_amount_paid: 200000,
        payment_method: 'Bank Transfer',
        notes: 'Partial payout',
      });

      assert.ok(lift);
      assert.equal(lift.lift_month, 2);
      const formatted = formatDDMMYYYY(lift.lift_date);
      assert.equal(formatted, '15-09-2024');
    });

    it('updates an existing lift without changing its date (empty string date)', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member1 = details.members[0];

      // Update with empty lift_date
      const updated = await saveLiftAuction(chitAug2024.id, member1.id, {
        lift_month: 1,
        lift_date: '',
        configured_lift_payout: 360000,
        initial_amount_paid: 360000,
        payment_method: 'Cash',
      });

      assert.ok(updated);
      assert.equal(updated.lift_amount, 360000);
      // Original historical date 22-08-2024 MUST be preserved!
      assert.equal(formatDDMMYYYY(updated.lift_date), '22-08-2024');
    });

    it('updates an existing lift without changing its date (undefined date)', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member1 = details.members[0];

      // Update with undefined lift_date
      const updated = await saveLiftAuction(chitAug2024.id, member1.id, {
        lift_month: 1,
        configured_lift_payout: 365000,
        initial_amount_paid: 365000,
        payment_method: 'Cash',
      });

      assert.ok(updated);
      assert.equal(updated.lift_amount, 365000);
      // Original historical date 22-08-2024 MUST be preserved!
      assert.equal(formatDDMMYYYY(updated.lift_date), '22-08-2024');
    });

    it('updates an existing lift with a new historical date "25-08-2024"', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member1 = details.members[0];

      const updated = await saveLiftAuction(chitAug2024.id, member1.id, {
        lift_month: 1,
        lift_date: '25-08-2024',
        configured_lift_payout: 365000,
        initial_amount_paid: 365000,
        payment_method: 'Cash',
      });

      assert.ok(updated);
      assert.equal(formatDDMMYYYY(updated.lift_date), '25-08-2024');
    });

    it('rejects update with an invalid date string with clean validation error', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member1 = details.members[0];

      await assert.rejects(
        async () => {
          await saveLiftAuction(chitAug2024.id, member1.id, {
            lift_month: 1,
            lift_date: 'not-a-valid-date',
            configured_lift_payout: 365000,
            initial_amount_paid: 365000,
            payment_method: 'Cash',
          });
        },
        /Invalid lift date/,
        'Should reject invalid date string with clear validation error'
      );
    });

    it('records lift payout installment with historical date "22-08-2024"', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member2 = details.members[1]; // has partial lift

      const res = await recordLiftPayoutPayment(chitAug2024.id, member2.id, {
        amount: 150000,
        payment_date: '22-08-2024',
        payment_method: 'Cash',
        reference_number: 'TXN-HIST-001',
        notes: 'Final historical settlement',
      });

      assert.ok(res);
      const tx = res.transactions.find((t: any) => t.reference_number === 'TXN-HIST-001');
      assert.ok(tx);
      assert.equal(formatDDMMYYYY(tx.payment_date), '22-08-2024');
    });

    it('saves lift with exact production date "22-08-2026" in Chit Aug 2026', async () => {
      const details = await getChitByIdWithDetails(chitAug2026.id);
      const member = details.members[0];

      const lift = await saveLiftAuction(chitAug2026.id, member.id, {
        lift_month: 1,
        lift_date: '22-08-2026',
        configured_lift_payout: 120000,
        initial_amount_paid: 120000,
        payment_method: 'Bank Transfer',
      });

      assert.ok(lift);
      assert.equal(formatDDMMYYYY(lift.lift_date), '22-08-2026');
      assert.equal(toISODateInput(lift.lift_date), '2026-08-22');
    });

    it('saves lift with historical date "01-08-2024" in Chit Aug 2024', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member3 = details.members[2];

      const lift = await saveLiftAuction(chitAug2024.id, member3.id, {
        lift_month: 3,
        lift_date: '01-08-2024',
        configured_lift_payout: 350000,
        initial_amount_paid: 350000,
        payment_method: 'Cash',
      });

      assert.ok(lift);
      assert.equal(formatDDMMYYYY(lift.lift_date), '01-08-2024');
      assert.equal(toISODateInput(lift.lift_date), '2024-08-01');
    });

    it('saves lift with historical date "15-01-2025" in Chit Jan 2025', async () => {
      const details = await getChitByIdWithDetails(chitJan2025.id);
      const member = details.members[0];

      const lift = await saveLiftAuction(chitJan2025.id, member.id, {
        lift_month: 1,
        lift_date: '15-01-2025',
        configured_lift_payout: 220000,
        initial_amount_paid: 220000,
        payment_method: 'Cash',
      });

      assert.ok(lift);
      assert.equal(formatDDMMYYYY(lift.lift_date), '15-01-2025');
      assert.equal(toISODateInput(lift.lift_date), '2025-01-15');
    });

    it('saves lift with HTML date input format "2024-08-01"', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member4 = details.members[3];

      const lift = await saveLiftAuction(chitAug2024.id, member4.id, {
        lift_month: 4,
        lift_date: '2024-08-01',
        configured_lift_payout: 350000,
        initial_amount_paid: 350000,
        payment_method: 'Cash',
      });

      assert.ok(lift);
      assert.equal(formatDDMMYYYY(lift.lift_date), '01-08-2024');
      assert.equal(toISODateInput(lift.lift_date), '2024-08-01');
    });

    it('saves lift with HTML date input format "2025-01-15"', async () => {
      const details = await getChitByIdWithDetails(chitJan2025.id);
      const member2 = details.members[1];

      const lift = await saveLiftAuction(chitJan2025.id, member2.id, {
        lift_month: 2,
        lift_date: '2025-01-15',
        configured_lift_payout: 220000,
        initial_amount_paid: 220000,
        payment_method: 'Cash',
      });

      assert.ok(lift);
      assert.equal(formatDDMMYYYY(lift.lift_date), '15-01-2025');
      assert.equal(toISODateInput(lift.lift_date), '2025-01-15');
    });

    it('saves lift with HTML date input format "2026-08-22"', async () => {
      const details = await getChitByIdWithDetails(chitAug2026.id);
      const member2 = details.members[1];

      const lift = await saveLiftAuction(chitAug2026.id, member2.id, {
        lift_month: 2,
        lift_date: '2026-08-22',
        configured_lift_payout: 120000,
        initial_amount_paid: 120000,
        payment_method: 'Bank Transfer',
      });

      assert.ok(lift);
      assert.equal(formatDDMMYYYY(lift.lift_date), '22-08-2026');
      assert.equal(toISODateInput(lift.lift_date), '2026-08-22');
    });

    it('saves lift with historical date older than current year "10-07-2023"', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member5 = details.members[4];

      const lift = await saveLiftAuction(chitAug2024.id, member5.id, {
        lift_month: 5,
        lift_date: '10-07-2023',
        configured_lift_payout: 350000,
        initial_amount_paid: 350000,
        payment_method: 'Cash',
      });

      assert.ok(lift);
      assert.equal(formatDDMMYYYY(lift.lift_date), '10-07-2023');
      assert.equal(toISODateInput(lift.lift_date), '2023-07-10');
    });

    it('preserves historical date when updating without date (undefined / empty)', async () => {
      const details = await getChitByIdWithDetails(chitAug2024.id);
      const member5 = details.members[4]; // Has date 10-07-2023

      // Update payout amount with empty date
      const updatedEmpty = await saveLiftAuction(chitAug2024.id, member5.id, {
        lift_month: 5,
        lift_date: '',
        configured_lift_payout: 380000,
        initial_amount_paid: 380000,
        payment_method: 'Cash',
      });
      assert.equal(formatDDMMYYYY(updatedEmpty.lift_date), '10-07-2023');

      // Update payout amount with undefined date
      const updatedUndef = await saveLiftAuction(chitAug2024.id, member5.id, {
        lift_month: 5,
        configured_lift_payout: 390000,
        initial_amount_paid: 390000,
        payment_method: 'Cash',
      });
      assert.equal(formatDDMMYYYY(updatedUndef.lift_date), '10-07-2023');
    });
  });
});
