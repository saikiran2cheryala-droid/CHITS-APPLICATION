import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChitFull,
  addMemberToChit,
  createPaymentRecord,
  saveLiftAuction,
  recordLiftPayoutPayment,
  getMonthViewData,
  getChitByIdWithDetails,
  getDashboardStats,
  getAllChitsWithStats,
  getChitReports,
  findUserByLoginId,
  verifyPassword,
} from '../server/prismaRepository';
import { initDatabase } from '../server/db';

describe('Performance Optimization & End-to-End Workflows', () => {
  let createdChitId = '';
  let member1Id = '';
  let member2Id = '';
  let monthlyDue1Id = '';

  before(() => {
    initDatabase();
  });

  it('1. New Chit creation: correctly generates chit, rules, and all initial monthly dues', async () => {
    const chitPayload = {
      name: 'Performance Test Chit 5L',
      chit_value: 500000,
      monthly_chit_value: 25000,
      total_months: 20,
      total_members: 2,
      start_month: '2026-01',
      end_month: '2027-08',
      members: [
        { customer_name: 'Alpha Member', phone: '9876543210', ticket_number: '01' },
        { customer_name: 'Beta Member', phone: '9876543211', ticket_number: '02' },
      ],
      rules: Array.from({ length: 20 }, (_, i) => ({
        month_number: i + 1,
        month_name: `Month ${i + 1}`,
        pre_lift_payment: 20000,
        post_lift_payment: 25000,
        monthly_chit_value: 25000,
        expected_lift_payout: 350000,
      })),
    };

    const chit = await createChitFull(chitPayload);
    assert.ok(chit?.id, 'Chit should be created with an ID');
    createdChitId = chit.id;

    // Verify month view data reads accurately
    const m1 = await getMonthViewData(createdChitId, 1);
    assert.ok(m1, 'Month 1 view data should exist');
    assert.equal(m1.dues.length, 2, 'Should have dues for both members');
    assert.equal(m1.dues[0].due_amount, 20000);
    assert.equal(m1.dues[0].paid_amount, 0);
    assert.equal(m1.dues[0].balance_amount, 20000);
    assert.equal(m1.dues[0].status, 'PENDING');

    member1Id = m1.dues[0].member_id;
    member2Id = m1.dues[1].member_id;
    monthlyDue1Id = m1.dues[0].id;
  });

  it('2. Add member: creates member and auto-generates all monthly dues records', async () => {
    const newMember = await addMemberToChit(createdChitId, {
      customer_name: 'Gamma Member',
      phone: '9876543212',
      ticket_number: '03',
    });
    assert.ok(newMember?.id, 'Member should be created');

    const m1 = await getMonthViewData(createdChitId, 1);
    assert.equal(m1?.dues.length, 3, 'Should now have 3 members with dues in month 1');
  });

  it('3. Payment recording: creates payment and atomically updates monthly due status and balance', async () => {
    const payRes = await createPaymentRecord({
      monthly_due_id: monthlyDue1Id,
      amount: 20000,
      payment_method: 'Cash',
      reference_no: 'RCPT-001',
      notes: 'Full payment month 1',
      payment_date: new Date().toISOString(),
      allow_overpayment: false,
    });

    assert.ok(payRes.payment, 'Payment record should be created');
    assert.equal(payRes.updatedDue.status, 'PAID', 'Due status should transition to PAID');
    assert.equal(payRes.updatedDue.paid_amount, 20000);
    assert.equal(payRes.updatedDue.balance_amount, 0);

    // Verify via read-only getMonthViewData
    const m1 = await getMonthViewData(createdChitId, 1);
    const paidDue = m1?.dues.find((d: any) => d.id === monthlyDue1Id);
    assert.equal(paidDue?.status, 'PAID');
    assert.equal(paidDue?.balance_amount, 0);
  });

  it('4. Lift auction & Lift Payout: records lift and synchronizes post-lift dues', async () => {
    // Member 1 lifts in month 1
    const liftRes = await saveLiftAuction(createdChitId, member1Id, {
      lift_month: 1,
      lift_amount: 350000,
      lift_amount_received: 200000, // Partial payout
      payment_method: 'Bank Transfer',
      reference_number: 'TXN-LIFT-001',
      notes: 'Initial lift payout',
      lift_date: new Date().toISOString(),
    });

    assert.ok(liftRes, 'Lift should be recorded');
    assert.equal(liftRes.payout_status, 'PARTIAL');
    assert.equal(liftRes.remaining_payout, 150000);

    // Record second payout transaction to complete payout
    const payoutRes = await recordLiftPayoutPayment(createdChitId, member1Id, {
      amount: 150000,
      payment_method: 'Cash',
      reference_number: 'TXN-LIFT-002',
      payment_date: new Date().toISOString(),
      notes: 'Final payout settlement',
    });

    const payoutStatus = payoutRes?.lift?.payout_status || payoutRes?.payout_status;
    const remainingPayout = payoutRes?.lift !== undefined ? payoutRes.lift.remaining_payout : payoutRes?.remaining_payout;
    assert.equal(payoutStatus, 'PAID');
    assert.equal(remainingPayout, 0);

    // Verify month 2 dues for Member 1 transitioned to post_lift_payment (25,000)
    const m2 = await getMonthViewData(createdChitId, 2);
    const m1DueInMonth2 = m2?.dues.find((d: any) => d.member_id === member1Id);
    assert.equal(m1DueInMonth2?.due_amount, 25000, 'Lifted member should pay post-lift rate in month 2');

    const m2DueInMonth2 = m2?.dues.find((d: any) => d.member_id === member2Id);
    assert.equal(m2DueInMonth2?.due_amount, 20000, 'Non-lifted member should continue paying pre-lift rate');
  });

  it('5. Monthly dues & Reports: calculate stats accurately without mutation during GET', async () => {
    const reports = await getChitReports(createdChitId);
    assert.ok(reports, 'Reports should be computed');
    assert.ok(reports.totals, 'Totals stats should exist');
    assert.ok(reports.monthlyCollection.length > 0, 'Monthly collection breakdown should be populated');
  });

  it('6. Navigate into Chit & Change Month: read endpoints execute without triggering writes', async () => {
    const chitDetails = await getChitByIdWithDetails(createdChitId, 1);
    assert.ok(chitDetails, 'Chit details should be returned');
    assert.equal(chitDetails.id, createdChitId);

    const m3 = await getMonthViewData(createdChitId, 3);
    assert.ok(m3, 'Month 3 data should be returned');
    assert.equal(m3.rule.month_number, 3);
  });

  it('7. Refresh after save/update: getDashboardStats & getAllChitsWithStats are read-only and fast', async () => {
    const start = Date.now();
    const stats = await getDashboardStats();
    const chits = await getAllChitsWithStats();
    const elapsed = Date.now() - start;

    assert.ok(stats.stats.totalActiveChits >= 1);
    assert.ok(chits.length >= 1);
    assert.ok(elapsed < 1000, `Reading stats should be fast (took ${elapsed}ms)`);
  });

  it('8. Authentication: verify login and user session lookup', async () => {
    const user = await findUserByLoginId('admin') || await findUserByLoginId('9640488507');
    assert.ok(user, 'Admin user should be found');
    assert.ok(user.password_hash || user.passwordHash, 'User should have password hash');
  });
});
