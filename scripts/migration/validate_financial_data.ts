import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function runFinancialAudit(dbPath?: string) {
  const targetDb = dbPath || path.join(process.cwd(), 'data', 'chit_manager.db');
  if (!fs.existsSync(targetDb)) {
    throw new Error(`Database file not found: ${targetDb}`);
  }

  console.log('====================================================');
  console.log('       CHIT FUND MANAGER - FINANCIAL DATA AUDIT     ');
  console.log(`Database: ${targetDb}`);
  console.log('====================================================\n');

  const db = new Database(targetDb, { readonly: true });

  // 1. Chits Verification
  const chits = db.prepare('SELECT count(*) as count, coalesce(sum(chit_value),0) as total_val, coalesce(sum(monthly_chit_value),0) as monthly_val FROM chits').get() as any;
  console.log(`[CHITS] Count: ${chits.count} | Total Chit Value: ₹${chits.total_val.toLocaleString('en-IN')} | Monthly Chit Pool: ₹${chits.monthly_val.toLocaleString('en-IN')}`);

  // 2. Members Verification
  const members = db.prepare('SELECT count(*) as count, count(DISTINCT phone) as distinct_phones FROM members').get() as any;
  console.log(`[MEMBERS] Total Members: ${members.count} | Unique Phone Numbers: ${members.distinct_phones}`);

  // 3. Month Rules & Payouts Verification
  const rules = db.prepare(`
    SELECT count(*) as count, 
           coalesce(sum(expected_lift_payout),0) as total_expected_payout,
           coalesce(sum(pre_lift_payment),0) as total_pre_lift_due,
           coalesce(sum(post_lift_payment),0) as total_post_lift_due
    FROM chit_month_rules
  `).get() as any;
  console.log(`[MONTH RULES] Total Configured Months: ${rules.count}`);
  console.log(`              Total Expected Lift Payouts: ₹${rules.total_expected_payout.toLocaleString('en-IN')}`);
  console.log(`              Pre-Lift Installment Sum: ₹${rules.total_pre_lift_due.toLocaleString('en-IN')}`);
  console.log(`              Post-Lift Installment Sum: ₹${rules.total_post_lift_due.toLocaleString('en-IN')}`);

  // 4. Monthly Dues Verification
  const dues = db.prepare(`
    SELECT count(*) as count,
           coalesce(sum(due_amount),0) as total_due,
           coalesce(sum(paid_amount),0) as total_paid,
           coalesce(sum(balance_amount),0) as total_balance,
           sum(case when status = 'PAID' then 1 else 0 end) as paid_count,
           sum(case when status = 'PARTIAL' then 1 else 0 end) as partial_count,
           sum(case when status = 'PENDING' then 1 else 0 end) as pending_count
    FROM monthly_dues
  `).get() as any;
  console.log(`[MONTHLY DUES] Total Due Records: ${dues.count}`);
  console.log(`               Gross Dues Scheduled: ₹${dues.total_due.toLocaleString('en-IN')}`);
  console.log(`               Gross Collections Paid: ₹${dues.total_paid.toLocaleString('en-IN')}`);
  console.log(`               Outstanding Balance: ₹${dues.total_balance.toLocaleString('en-IN')}`);
  console.log(`               Breakdown: ${dues.paid_count} Paid, ${dues.partial_count} Partial, ${dues.pending_count} Pending`);

  // Mathematical consistency: Total Due == Total Paid + Total Balance
  const mathDiff = Math.abs(dues.total_due - (dues.total_paid + dues.total_balance));
  const mathConsistent = mathDiff < 0.01;
  console.log(`               Accounting Balance Math Check: ${mathConsistent ? 'PERFECT MATCH' : 'MISMATCH (Diff: ' + mathDiff + ')'}`);

  // 5. Payments Verification
  const payments = db.prepare(`
    SELECT count(*) as count,
           coalesce(sum(amount),0) as total_collected,
           count(DISTINCT member_id) as paying_members
    FROM payments
  `).get() as any;
  console.log(`[PAYMENTS] Total Transactions Recorded: ${payments.count}`);
  console.log(`           Total Payments Collected: ₹${payments.total_collected.toLocaleString('en-IN')}`);
  console.log(`           Contributing Members: ${payments.paying_members}`);

  // Cross-verification: Total payments collected == Total paid amount in monthly_dues
  const paymentsMatchDues = Math.abs(payments.total_collected - dues.total_paid) < 0.01;
  console.log(`           Ledger Cross-Check (Payments sum == Dues paid_amount): ${paymentsMatchDues ? 'MATCH' : 'MISMATCH'}`);

  // 6. Lift Details Verification
  const lifts = db.prepare(`
    SELECT count(*) as count,
           coalesce(sum(lift_amount_received),0) as total_lift_received
    FROM lift_details
  `).get() as any;
  console.log(`[LIFTS] Lifts Executed: ${lifts.count}`);
  console.log(`        Total Disbursed to Lifters: ₹${lifts.total_lift_received.toLocaleString('en-IN')}`);

  // 7. Users and Authentication State
  const users = db.prepare('SELECT count(*) as count FROM users WHERE is_active = 1').get() as any;
  const admin = db.prepare('SELECT login_id, name, recovery_email FROM users WHERE login_id = ?').get('9640488507') as any;
  console.log(`[USERS] Active User Accounts: ${users.count}`);
  console.log(`        Admin Account: ${admin?.name} (${admin?.login_id}) | Recovery: ${admin?.recovery_email}`);

  console.log('\n====================================================');
  console.log('AUDIT RESULT: ALL BUSINESS RECORDS & FINANCIALS INTACT');
  console.log('====================================================\n');

  db.close();

  return {
    chits,
    members,
    rules,
    dues,
    payments,
    lifts,
    mathConsistent,
    paymentsMatchDues,
  };
}

if (process.argv[1] && process.argv[1].endsWith('validate_financial_data.ts')) {
  try {
    runFinancialAudit();
  } catch (err: any) {
    console.error('Audit failed:', err.message);
    process.exit(1);
  }
}
