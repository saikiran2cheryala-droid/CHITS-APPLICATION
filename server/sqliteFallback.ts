/**
 * OFFLINE / LOCAL DEVELOPMENT SQLITE FALLBACK ONLY
 * 
 * IMPORTANT: This module is ONLY used when DATABASE_URL is not configured (offline development).
 * In production (when DATABASE_URL is present), the application uses Prisma with PostgreSQL exclusively.
 */

import {
  db,
  findUserByLoginId as dbFindUserByLoginId,
  recordFailedLogin as dbRecordFailedLogin,
  resetFailedLogins as dbResetFailedLogins,
  createSession as dbCreateSession,
  verifySessionToken as dbVerifySessionToken,
  destroySession as dbDestroySession,
  createPasswordReset as dbCreatePasswordReset,
  verifyPasswordResetCode as dbVerifyPasswordResetCode,
  resetUserPasswordWithToken as dbResetUserPasswordWithToken,
  changeUserPassword as dbChangeUserPassword,
  updateUserSettings as dbUpdateUserSettings,
  updateUserSecurityQuestion as dbUpdateUserSecurityQuestion,
  createSecurityResetToken as dbCreateSecurityResetToken,
  recordFailedRecovery as dbRecordFailedRecovery,
  resetFailedRecovery as dbResetFailedRecovery,
  createTempChangePasswordToken as dbCreateTempChangePasswordToken,
  verifyTempChangePasswordToken as dbVerifyTempChangePasswordToken,
  ensureMonthlyDuesForChitAndMonth as dbEnsureMonthlyDuesForChitAndMonth,
  syncDuesOnLift as dbSyncDuesOnLift,
  computeChitCurrentMonth as dbComputeChitCurrentMonth,
  syncChitsCurrentMonth as dbSyncChitsCurrentMonth,
  initDatabase as dbInitDatabase,
} from './db.ts';

export {
  dbFindUserByLoginId,
  dbRecordFailedLogin,
  dbResetFailedLogins,
  dbCreateSession,
  dbVerifySessionToken,
  dbDestroySession,
  dbCreatePasswordReset,
  dbVerifyPasswordResetCode,
  dbResetUserPasswordWithToken,
  dbChangeUserPassword,
  dbUpdateUserSettings,
  dbUpdateUserSecurityQuestion,
  dbCreateSecurityResetToken,
  dbRecordFailedRecovery,
  dbResetFailedRecovery,
  dbCreateTempChangePasswordToken,
  dbVerifyTempChangePasswordToken,
  dbEnsureMonthlyDuesForChitAndMonth,
  dbSyncDuesOnLift,
  dbComputeChitCurrentMonth,
  dbSyncChitsCurrentMonth,
  dbInitDatabase,
};

export function fallbackCalculateChitFullTermProjection(chit: any) {
  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chit.id) as any[];
  const totalMonths = Number(chit.total_months) || rules.length || 0;
  const totalMembers = Number(chit.total_members) || 0;

  let totalProjectedCollection = 0;
  let totalProjectedLiftPayout = 0;
  let totalProjectedProfit = 0;
  const monthlyProjections: any[] = [];

  for (let m = 1; m <= totalMonths; m++) {
    const rule = rules.find((r: any) => r.month_number === m) || {};
    const preAmount = Number(rule.pre_lift_payment) || 0;
    const postAmount = Number(rule.post_lift_payment) || 0;
    const liftPayout = Number(rule.expected_lift_payout) || 0;

    const postLiftCount = Math.max(0, Math.min(m - 1, totalMembers));
    const preLiftCount = Math.max(0, totalMembers - postLiftCount);

    const projectedCollection = (preLiftCount * preAmount) + (postLiftCount * postAmount);
    const profitOrLoss = projectedCollection - liftPayout;

    totalProjectedCollection += projectedCollection;
    totalProjectedLiftPayout += liftPayout;
    totalProjectedProfit += profitOrLoss;

    monthlyProjections.push({
      month_number: m,
      month_name: rule.month_name || `Month ${m}`,
      pre_lift_payment: preAmount,
      post_lift_payment: postAmount,
      pre_lift_count: preLiftCount,
      post_lift_count: postLiftCount,
      projected_collection: projectedCollection,
      lift_payout: liftPayout,
      profit_or_loss: profitOrLoss,
      is_profit: profitOrLoss >= 0,
      manager_add_required: profitOrLoss < 0 ? Math.abs(profitOrLoss) : 0,
    });
  }

  return {
    total_projected_collection: totalProjectedCollection,
    total_projected_lift_payout: totalProjectedLiftPayout,
    total_projected_profit: totalProjectedProfit,
    monthly_projections: monthlyProjections,
  };
}

export function fallbackGetDashboardStats() {
  const activeChitsCount = db.prepare("SELECT COUNT(*) as count FROM chits WHERE status = 'active'").get() as { count: number };
  const membersCount = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'active'").get() as { count: number };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayColl = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_date LIKE ?`).get(`${todayStr}%`) as { total: number };
  const thisMonthStr = todayStr.substring(0, 7);
  const monthColl = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_date LIKE ?`).get(`${thisMonthStr}%`) as { total: number };

  const chits = db.prepare('SELECT * FROM chits ORDER BY created_at DESC').all() as any[];
  let totalPendingCurrentMonths = 0;
  let totalDueCurrentMonths = 0;
  let totalCollectedCurrentMonths = 0;
  let totalActualCurrentMonthProfit = 0;
  let totalProjectedChitProfit = 0;
  let totalProjectedChitCollection = 0;
  let totalProjectedChitPayout = 0;
  const projectedProfitBreakdown: any[] = [];
  const currentMonthProfitBreakdown: any[] = [];

  const chitsSummary = chits.map(chit => {
    const currMonth = dbComputeChitCurrentMonth(chit.start_month, chit.total_months);

    const chitMembersCount = db.prepare("SELECT COUNT(*) as count FROM members WHERE chit_id = ? AND status = 'active'").get(chit.id) as { count: number };
    const chitToday = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE chit_id = ? AND payment_date LIKE ?').get(chit.id, `${todayStr}%`) as { total: number };

    const monthStats = db.prepare(`
      SELECT 
        COALESCE(SUM(due_amount), 0) as total_due,
        COALESCE(SUM(paid_amount), 0) as total_collected,
        COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_pending
      FROM monthly_dues 
      WHERE chit_id = ? AND month_number = ?
    `).get(chit.id, currMonth) as { total_due: number; total_collected: number; total_pending: number };

    const liftedCount = db.prepare('SELECT COUNT(*) as count FROM lift_details WHERE chit_id = ?').get(chit.id) as { count: number };
    const rule = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? AND month_number = ?').get(chit.id, currMonth) as any;
    const lift = db.prepare(`
      SELECT l.*, m.customer_name, m.ticket_number 
      FROM lift_details l
      JOIN members m ON l.member_id = m.id
      WHERE l.chit_id = ? AND l.lift_month = ?
    `).get(chit.id, currMonth) as any;

    const liftPayout = lift
      ? (Number(lift.lift_amount_received) || 0)
      : (rule ? (Number(rule.expected_lift_payout) || Number(rule.monthly_chit_value) || 0) : 0);

    const actualCurrentMonthProfit = monthStats.total_collected - liftPayout;
    const fullTermProj = fallbackCalculateChitFullTermProjection(chit);

    if (chit.status === 'active') {
      totalDueCurrentMonths += monthStats.total_due;
      totalCollectedCurrentMonths += monthStats.total_collected;
      totalPendingCurrentMonths += monthStats.total_pending;
      totalActualCurrentMonthProfit += actualCurrentMonthProfit;

      totalProjectedChitProfit += fullTermProj.total_projected_profit;
      totalProjectedChitCollection += fullTermProj.total_projected_collection;
      totalProjectedChitPayout += fullTermProj.total_projected_lift_payout;

      projectedProfitBreakdown.push({
        chit_id: chit.id,
        chit_name: chit.name,
        chit_value: chit.chit_value,
        total_months: chit.total_months,
        total_members: chit.total_members,
        status: chit.status,
        total_projected_profit: fullTermProj.total_projected_profit,
        total_projected_collection: fullTermProj.total_projected_collection,
        total_projected_payout: fullTermProj.total_projected_lift_payout,
        monthly_projections: fullTermProj.monthly_projections,
      });

      currentMonthProfitBreakdown.push({
        chit_id: chit.id,
        chit_name: chit.name,
        current_month: currMonth,
        total_due: monthStats.total_due,
        total_collected: monthStats.total_collected,
        total_pending: monthStats.total_pending,
        lift_payout: liftPayout,
        profit: actualCurrentMonthProfit,
      });
    }

    return {
      ...chit,
      active_members_count: chitMembersCount.count,
      today_collection: chitToday.total,
      pending_amount: monthStats.total_pending,
      total_collected: monthStats.total_collected,
      total_due: monthStats.total_due,
      lifted_members_count: liftedCount.count,
      current_month: currMonth,
      profit: actualCurrentMonthProfit,
      total_projected_profit: fullTermProj.total_projected_profit,
      total_projected_collection: fullTermProj.total_projected_collection,
      total_projected_payout: fullTermProj.total_projected_lift_payout,
      projected_monthly: fullTermProj.monthly_projections,
    };
  });

  const paidCust = db.prepare(`SELECT COUNT(DISTINCT member_id) as count FROM monthly_dues WHERE status = 'PAID'`).get() as { count: number };
  const pendingCust = db.prepare(`SELECT COUNT(DISTINCT member_id) as count FROM monthly_dues WHERE status != 'PAID'`).get() as { count: number };
  const totalCollAllTime = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments`).get() as { total: number };

  const recentPayments = db.prepare(`
    SELECT p.*, m.customer_name, m.ticket_number, c.name as chit_name
    FROM payments p
    JOIN members m ON p.member_id = m.id
    JOIN chits c ON p.chit_id = c.id
    ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.payment_date DESC, p.created_at DESC
    LIMIT 15
  `).all();

  return {
    stats: {
      totalActiveChits: activeChitsCount.count,
      totalMembers: membersCount.count,
      todayCollection: todayColl.total,
      thisMonthCollection: monthColl.total,
      totalDue: totalDueCurrentMonths,
      totalCollection: totalCollectedCurrentMonths,
      totalPending: totalPendingCurrentMonths,
      totalPendingAmount: totalPendingCurrentMonths,
      totalOutstanding: totalPendingCurrentMonths,
      totalCollected: totalCollAllTime.total,
      totalProjectedChitProfit,
      totalProjectedCollection: totalProjectedChitCollection,
      totalProjectedLiftPayout: totalProjectedChitPayout,
      projectedProfitBreakdown,
      actualCurrentMonthProfit: totalActualCurrentMonthProfit,
      currentMonthProfitBreakdown,
      totalAssumedProfit: totalProjectedChitProfit,
      assumedProfitBreakdown: projectedProfitBreakdown,
      totalPaidCustomers: paidCust.count,
      totalPendingCustomers: pendingCust.count,
      recentPayments,
    },
    chits: chitsSummary,
  };
}

export function fallbackGetAllChitsWithStats() {
  const chits = db.prepare('SELECT * FROM chits ORDER BY created_at DESC').all() as any[];
  return chits.map(chit => {
    const currMonth = dbComputeChitCurrentMonth(chit.start_month, chit.total_months);

    const memberCount = db.prepare('SELECT COUNT(*) as count FROM members WHERE chit_id = ?').get(chit.id) as { count: number };
    const monthStats = db.prepare(`
      SELECT 
        COALESCE(SUM(due_amount), 0) as total_due,
        COALESCE(SUM(paid_amount), 0) as total_collected,
        COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_pending
      FROM monthly_dues 
      WHERE chit_id = ? AND month_number = ?
    `).get(chit.id, currMonth) as { total_due: number; total_collected: number; total_pending: number };

    const lifted = db.prepare('SELECT COUNT(*) as count FROM lift_details WHERE chit_id = ?').get(chit.id) as { count: number };
    return {
      ...chit,
      current_month: currMonth,
      active_members_count: memberCount.count,
      total_due: monthStats.total_due,
      total_collected: monthStats.total_collected,
      total_pending: monthStats.total_pending,
      lifted_members_count: lifted.count,
    };
  });
}

export function fallbackGetChitByIdWithDetails(chitId: string, queryMonth?: number) {
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) return null;

  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chit.id);
  const members = db.prepare(`
    SELECT m.*, l.id as lift_id, l.lift_month, l.lift_amount, l.lift_amount_received, l.remaining_payout, l.payout_status,
           l.lift_date, l.payment_method, l.reference_number, l.notes as lift_notes, l.status as lift_status_text,
           l.created_at as lift_created_at, l.updated_at as lift_updated_at,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ?
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(chit.id) as any[];

  const computedCurrentMonth = dbComputeChitCurrentMonth(chit.start_month, chit.total_months);
  const selectedMonth = queryMonth || computedCurrentMonth;

  const monthStats = db.prepare(`
    SELECT 
      COALESCE(SUM(due_amount), 0) as total_due,
      COALESCE(SUM(paid_amount), 0) as total_collected,
      COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_pending,
      SUM(CASE WHEN status = 'PAID' OR (due_amount > 0 AND paid_amount >= due_amount) THEN 1 ELSE 0 END) as paid_members_count,
      SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN 1 ELSE 0 END) as pending_members_count
    FROM monthly_dues
    WHERE chit_id = ? AND month_number = ?
  `).get(chit.id, selectedMonth) as any;

  const liftedCount = members.filter((m: any) => m.lift_status === 'lifted').length;
  const unliftedCount = members.length - liftedCount;

  for (const m of members) {
    if (m.lift_id) {
      m.transactions = db.prepare('SELECT * FROM lift_payout_transactions WHERE lift_id = ? ORDER BY payment_date ASC, created_at ASC').all(m.lift_id);
    } else {
      m.transactions = [];
    }
  }

  const fullTermProj = fallbackCalculateChitFullTermProjection(chit);

  return {
    ...chit,
    current_month: computedCurrentMonth,
    rules,
    members,
    selected_month: selectedMonth,
    total_due: monthStats.total_due,
    total_collected: monthStats.total_collected,
    total_pending: monthStats.total_pending,
    paid_members_count: monthStats.paid_members_count,
    pending_members_count: monthStats.pending_members_count,
    lifted_members_count: liftedCount,
    unlifted_members_count: unliftedCount,
    total_projected_profit: fullTermProj.total_projected_profit,
    total_projected_collection: fullTermProj.total_projected_collection,
    total_projected_payout: fullTermProj.total_projected_lift_payout,
    projected_monthly: fullTermProj.monthly_projections,
  };
}

export function fallbackCreateChitFull(body: any) {
  const { name, chit_value, total_months, total_members, start_month, end_month, members, rules } = body;
  const chitId = 'chit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();
  const computedCurrentMonth = dbComputeChitCurrentMonth(start_month, total_months);

  const insertChit = db.prepare(`
    INSERT INTO chits (id, name, chit_value, total_months, total_members, start_month, end_month, status, current_month, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `);

  const insertRule = db.prepare(`
    INSERT INTO chit_month_rules (id, chit_id, month_number, month_name, pre_lift_payment, post_lift_payment, monthly_chit_value, expected_lift_payout)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMember = db.prepare(`
    INSERT INTO members (id, chit_id, customer_name, phone, ticket_number, status, join_date, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const insertDue = db.prepare(`
    INSERT INTO monthly_dues (id, chit_id, member_id, month_number, month_name, due_amount, paid_amount, balance_amount, status, due_date, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)
  `);

  const tx = db.transaction(() => {
    insertChit.run(chitId, name, chit_value, total_months, total_members, start_month, end_month, computedCurrentMonth, now, now);

    for (const rule of rules) {
      const ruleId = `rule-${chitId}-m${rule.month_number}`;
      insertRule.run(
        ruleId,
        chitId,
        rule.month_number,
        rule.month_name,
        rule.pre_lift_payment,
        rule.post_lift_payment,
        rule.monthly_chit_value,
        rule.expected_lift_payout
      );
    }

    members.forEach((m: any, index: number) => {
      const memberId = `mem-${chitId}-${index + 1}-${Math.random().toString(36).substring(2, 6)}`;
      const ticket = m.ticket_number || String(index + 1).padStart(2, '0');
      insertMember.run(memberId, chitId, m.customer_name, m.phone, ticket, now, now);

      for (const rule of rules) {
        const dueId = `due-${chitId}-${memberId}-m${rule.month_number}`;
        insertDue.run(
          dueId,
          chitId,
          memberId,
          rule.month_number,
          rule.month_name,
          rule.pre_lift_payment,
          rule.pre_lift_payment,
          now,
          now
        );
      }
    });
  });

  tx();
  return db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId);
}

export function fallbackUpdateChit(chitId: string, body: any) {
  const { name, status, chit_value, start_month, end_month, total_months, total_members } = body;
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!existing) return null;

  const newName = name !== undefined && String(name).trim() ? String(name).trim() : existing.name;
  const newStatus = status !== undefined ? status : existing.status;
  const newChitValue = chit_value !== undefined && !isNaN(Number(chit_value)) ? Number(chit_value) : existing.chit_value;
  const newStartMonth = start_month !== undefined && String(start_month).trim() ? String(start_month).trim() : existing.start_month;
  const newEndMonth = end_month !== undefined && String(end_month).trim() ? String(end_month).trim() : existing.end_month;
  const newTotalMonths = total_months !== undefined && !isNaN(Number(total_months)) ? Number(total_months) : existing.total_months;
  const newTotalMembers = total_members !== undefined && !isNaN(Number(total_members)) ? Number(total_members) : existing.total_members;

  db.prepare(`
    UPDATE chits
    SET name = ?, status = ?, chit_value = ?, start_month = ?, end_month = ?, total_months = ?, total_members = ?, updated_at = ?
    WHERE id = ?
  `).run(newName, newStatus, newChitValue, newStartMonth, newEndMonth, newTotalMonths, newTotalMembers, now, chitId);

  return db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId);
}

export function fallbackDeleteChitFull(chitId: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM monthly_dues WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM lift_details WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM members WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM chit_month_rules WHERE chit_id = ?').run(chitId);
    db.prepare('DELETE FROM chits WHERE id = ?').run(chitId);
  });
  tx();
  return true;
}

export function fallbackUpdateChitRules(chitId: string, rules: any[]) {
  const updateRuleStmt = db.prepare(`
    UPDATE chit_month_rules
    SET pre_lift_payment = ?, post_lift_payment = ?, monthly_chit_value = ?, expected_lift_payout = ?
    WHERE chit_id = ? AND month_number = ?
  `);

  const updateDueStmt = db.prepare(`
    UPDATE monthly_dues
    SET due_amount = ?, balance_amount = ?
    WHERE chit_id = ? AND member_id = ? AND month_number = ? AND paid_amount = 0
  `);

  const members = db.prepare(`
    SELECT m.id, l.lift_month FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ?
  `).all(chitId) as any[];

  const tx = db.transaction(() => {
    for (const r of rules) {
      updateRuleStmt.run(r.pre_lift_payment, r.post_lift_payment, r.monthly_chit_value, r.expected_lift_payout, chitId, r.month_number);
      for (const m of members) {
        const isPostLift = m.lift_month && r.month_number > m.lift_month;
        const targetAmount = isPostLift ? r.post_lift_payment : r.pre_lift_payment;
        updateDueStmt.run(targetAmount, targetAmount, chitId, m.id, r.month_number);
      }
    }
  });

  tx();
  return true;
}

export function fallbackUpdateMonthRulePayouts(chitId: string, payouts: any[]) {
  const chit = db.prepare('SELECT id, total_months FROM chits WHERE id = ?').get(chitId) as { id: string; total_months: number } | undefined;
  if (!chit) return { updated_count: 0 };

  const updatePayoutStmt = db.prepare(`
    UPDATE chit_month_rules
    SET expected_lift_payout = ?
    WHERE chit_id = ? AND month_number = ?
  `);

  let updatedCount = 0;
  const tx = db.transaction(() => {
    for (const item of payouts) {
      const monthNum = Number(item.month_number);
      const amount = Number(item.lift_payout);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > chit.total_months) continue;
      if (isNaN(amount) || amount < 0) continue;

      const result = updatePayoutStmt.run(amount, chitId, monthNum);
      if (result.changes > 0) updatedCount++;
    }
  });

  tx();
  return { updated_count: updatedCount };
}

export function fallbackGetMonthViewData(chitId: string, monthNumber: number) {
  const rule = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? AND month_number = ?').get(chitId, monthNumber) as any;
  if (!rule) return null;

  const dues = db.prepare(`
    SELECT d.*, m.customer_name, m.phone, m.ticket_number,
           l.id as lift_id, l.lift_month, l.lift_amount, l.lift_amount_received, l.remaining_payout, l.payout_status, l.lift_date,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status,
           (SELECT p.payment_method FROM payments p WHERE (p.monthly_due_id = d.id OR (p.chit_id = d.chit_id AND p.member_id = d.member_id AND p.month_number = d.month_number)) ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.created_at DESC LIMIT 1) as last_payment_method,
           (SELECT p.payment_date FROM payments p WHERE (p.monthly_due_id = d.id OR (p.chit_id = d.chit_id AND p.member_id = d.member_id AND p.month_number = d.month_number)) ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.created_at DESC LIMIT 1) as last_payment_date,
           (SELECT p.reference_no FROM payments p WHERE (p.monthly_due_id = d.id OR (p.chit_id = d.chit_id AND p.member_id = d.member_id AND p.month_number = d.month_number)) ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.created_at DESC LIMIT 1) as last_payment_reference,
           (SELECT p.notes FROM payments p WHERE (p.monthly_due_id = d.id OR (p.chit_id = d.chit_id AND p.member_id = d.member_id AND p.month_number = d.month_number)) ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.created_at DESC LIMIT 1) as last_payment_notes,
           (SELECT p.amount FROM payments p WHERE (p.monthly_due_id = d.id OR (p.chit_id = d.chit_id AND p.member_id = d.member_id AND p.month_number = d.month_number)) ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.created_at DESC LIMIT 1) as last_payment_amount,
           (SELECT COALESCE(p.updated_at, p.created_at) FROM payments p WHERE (p.monthly_due_id = d.id OR (p.chit_id = d.chit_id AND p.member_id = d.member_id AND p.month_number = d.month_number)) ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.created_at DESC LIMIT 1) as last_payment_updated_at
    FROM monthly_dues d
    JOIN members m ON d.member_id = m.id
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE d.chit_id = ? AND d.month_number = ? AND m.status = 'active'
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(chitId, monthNumber) as any[];

  const payments = db.prepare(`
    SELECT p.*, m.customer_name, m.phone, m.ticket_number
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.chit_id = ? AND p.month_number = ?
    ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.payment_date DESC, p.created_at DESC
  `).all(chitId, monthNumber);

  const stats = db.prepare(`
    SELECT 
      COALESCE(SUM(due_amount), 0) as total_due,
      COALESCE(SUM(paid_amount), 0) as total_paid,
      COALESCE(SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN (due_amount - paid_amount) ELSE 0 END), 0) as total_balance,
      SUM(CASE WHEN status = 'PAID' OR (due_amount > 0 AND paid_amount >= due_amount) THEN 1 ELSE 0 END) as count_paid,
      SUM(CASE WHEN status = 'PARTIAL' OR (paid_amount > 0 AND paid_amount < due_amount) THEN 1 ELSE 0 END) as count_partial,
      SUM(CASE WHEN (due_amount - paid_amount) > 0 THEN 1 ELSE 0 END) as count_pending
    FROM monthly_dues
    WHERE chit_id = ? AND month_number = ?
  `).get(chitId, monthNumber) as any;

  const lift = db.prepare(`
    SELECT l.*, m.customer_name, m.ticket_number
    FROM lift_details l
    JOIN members m ON l.member_id = m.id
    WHERE l.chit_id = ? AND l.lift_month = ?
  `).get(chitId, monthNumber) as any;

  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  const fullTermProj = fallbackCalculateChitFullTermProjection(chit);
  const monthProj = fullTermProj.monthly_projections.find((p: any) => p.month_number === monthNumber);

  const totalMembers = Number(chit?.total_members) || 0;
  const preAmount = Number(rule.pre_lift_payment) || 0;
  const postAmount = Number(rule.post_lift_payment) || 0;
  const postLiftCount = Math.max(0, Math.min(monthNumber - 1, totalMembers));
  const preLiftCount = Math.max(0, totalMembers - postLiftCount);
  const projectedCollection = monthProj ? monthProj.projected_collection : ((preLiftCount * preAmount) + (postLiftCount * postAmount));
  const configuredLiftPayout = Number(rule.expected_lift_payout) || Number(rule.monthly_chit_value) || Number(chit?.chit_value) || 0;
  const projectedProfit = projectedCollection - configuredLiftPayout;
  const managerAddRequired = projectedProfit < 0 ? Math.abs(projectedProfit) : 0;

  const actualCollection = Number(stats.total_paid) || 0;
  const actualLiftPayout = lift ? (Number(lift.lift_amount_received) || 0) : configuredLiftPayout;
  const actualProfit = actualCollection - actualLiftPayout;
  const actualManagerAddRequired = actualProfit < 0 ? Math.abs(actualProfit) : 0;

  const profit_details = {
    has_lift: Boolean(lift),
    is_projected: !lift,
    month_number: monthNumber,
    month_name: rule.month_name,
    projected_collection: projectedCollection,
    configured_lift_payout: configuredLiftPayout,
    projected_profit: projectedProfit,
    is_profit: projectedProfit >= 0,
    manager_add_required: managerAddRequired,
    pre_lift_payment: preAmount,
    post_lift_payment: postAmount,
    pre_lift_count: preLiftCount,
    post_lift_count: postLiftCount,
    total_members: totalMembers,
    actual_collection: actualCollection,
    actual_lift_payout: actualLiftPayout,
    actual_profit: actualProfit,
    actual_manager_add_required: actualManagerAddRequired,
    profit: projectedProfit,
    total_collection: projectedCollection,
    total_due: Number(stats.total_due) || projectedCollection,
    lift_payout: configuredLiftPayout,
    lifted_member_name: lift ? lift.customer_name : null,
    ticket_number: lift ? lift.ticket_number : null,
  };

  return {
    rule,
    dues,
    stats,
    lift: lift || null,
    profit: profit_details,
    payments,
  };
}

export function fallbackGetMembersByChit(chitId: string) {
  return db.prepare(`
    SELECT m.*, l.lift_month, l.lift_amount, l.lift_amount_received, l.remaining_payout, l.payout_status,
           l.lift_date, l.notes as lift_notes, l.payment_method as lift_payment_method, l.payment_method,
           l.reference_number as lift_reference_number, l.reference_number,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status,
           (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE member_id = m.id) as total_paid,
           (SELECT COALESCE(SUM(balance_amount), 0) FROM monthly_dues WHERE member_id = m.id) as total_pending
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ?
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(chitId);
}

export function fallbackAddMemberToChit(chitId: string, body: any) {
  const { customer_name, phone, ticket_number } = body;
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) return null;

  const memberId = 'mem-' + chitId + '-' + Date.now();
  const now = new Date().toISOString();
  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chitId) as any[];

  const insertMember = db.prepare(`
    INSERT INTO members (id, chit_id, customer_name, phone, ticket_number, status, join_date, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const insertDue = db.prepare(`
    INSERT INTO monthly_dues (id, chit_id, member_id, month_number, month_name, due_amount, paid_amount, balance_amount, status, due_date, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)
  `);

  const tx = db.transaction(() => {
    insertMember.run(memberId, chitId, customer_name, phone, ticket_number || '', now, now);
    for (const rule of rules) {
      const dueId = `due-${chitId}-${memberId}-m${rule.month_number}`;
      insertDue.run(dueId, chitId, memberId, rule.month_number, rule.month_name, rule.pre_lift_payment, rule.pre_lift_payment, now, now);
    }
  });

  tx();
  return db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
}

export function fallbackImportMembersToChit(chitId: string, customers: any[]) {
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) throw new Error('Chit not found');

  const existingMembers = db.prepare('SELECT * FROM members WHERE chit_id = ?').all(chitId) as any[];
  const totalMembersLimit = Number(chit.total_members) || 25;
  const currentCount = existingMembers.length;
  const remainingSlots = Math.max(0, totalMembersLimit - currentCount);

  if (remainingSlots <= 0) {
    return {
      error: `Chit member limit of ${totalMembersLimit} is already reached. No more members can be imported.`,
      imported_count: 0,
      skipped_count: customers.length,
      limit_reached: true,
      imported: [],
      skipped: customers,
    };
  }

  let maxTicket = 0;
  for (const m of existingMembers) {
    const num = parseInt(m.ticket_number, 10);
    if (!isNaN(num) && num > maxTicket) maxTicket = num;
  }

  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ? ORDER BY month_number ASC').all(chitId) as any[];
  const now = new Date().toISOString();

  const insertMember = db.prepare(`
    INSERT INTO members (id, chit_id, customer_name, phone, ticket_number, status, join_date, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const insertDue = db.prepare(`
    INSERT INTO monthly_dues (id, chit_id, member_id, month_number, month_name, due_amount, paid_amount, balance_amount, status, due_date, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)
  `);

  const imported: any[] = [];
  const skipped: any[] = [];

  const tx = db.transaction(() => {
    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      const rawName = String(c.customer_name || c.name || '').trim();
      const rawPhone = String(c.phone || c.phone_number || '').trim();
      const cleanPhone = rawPhone.replace(/\D/g, '');

      if (!rawName || !rawPhone || cleanPhone.length < 10) {
        skipped.push({ ...c, reason: 'Invalid name or phone number' });
        continue;
      }

      if (imported.length >= remainingSlots) {
        skipped.push({ ...c, customer_name: rawName, phone: rawPhone, reason: 'Chit member limit reached' });
        continue;
      }

      maxTicket += 1;
      const ticketNumber = c.ticket_number ? String(c.ticket_number).trim() : String(maxTicket);
      const memberId = `mem-${chitId}-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;

      insertMember.run(memberId, chitId, rawName, rawPhone, ticketNumber, now, now);

      for (const rule of rules) {
        const dueId = `due-${chitId}-${memberId}-m${rule.month_number}`;
        insertDue.run(dueId, chitId, memberId, rule.month_number, rule.month_name, rule.pre_lift_payment, rule.pre_lift_payment, now, now);
      }

      imported.push({
        id: memberId,
        customer_name: rawName,
        phone: rawPhone,
        ticket_number: ticketNumber,
      });
    }
  });

  tx();
  return {
    success: true,
    imported_count: imported.length,
    skipped_count: skipped.length,
    limit_skipped_count: 0,
    imported,
    skipped,
  };
}

export function fallbackUpdateMember(memberId: string, body: any) {
  const { customer_name, phone, ticket_number, status } = body;
  db.prepare(`
    UPDATE members
    SET customer_name = COALESCE(?, customer_name),
        phone = COALESCE(?, phone),
        ticket_number = COALESCE(?, ticket_number),
        status = COALESCE(?, status)
    WHERE id = ?
  `).run(customer_name, phone, ticket_number, status, memberId);

  return db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
}

export function fallbackDeleteMember(memberId: string) {
  const hasPayments = db.prepare('SELECT COUNT(*) as count FROM payments WHERE member_id = ?').get(memberId) as { count: number };
  if (hasPayments.count > 0) {
    db.prepare("UPDATE members SET status = 'inactive' WHERE id = ?").run(memberId);
    return { success: true, message: 'Member has payment history and was marked inactive.' };
  }
  db.prepare('DELETE FROM members WHERE id = ?').run(memberId);
  return { success: true };
}

export function fallbackGetMemberProfile(memberId: string) {
  const member = db.prepare(`
    SELECT m.*, c.name as chit_name, c.chit_value, c.total_months, c.start_month, c.end_month,
           l.id as lift_id, l.lift_month, l.lift_amount, l.lift_amount_received, l.remaining_payout, l.payout_status,
           l.lift_date, l.payment_method as lift_payment_method, l.payment_method,
           l.reference_number as lift_reference_number, l.reference_number,
           l.notes as lift_notes, l.status as lift_status_text,
           l.created_at as lift_created_at, l.updated_at as lift_updated_at,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM members m
    JOIN chits c ON m.chit_id = c.id
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.id = ?
  `).get(memberId) as any;

  if (!member) return null;

  const dues = db.prepare('SELECT * FROM monthly_dues WHERE member_id = ? ORDER BY month_number ASC').all(member.id);
  const payments = db.prepare('SELECT * FROM payments WHERE member_id = ? ORDER BY payment_date DESC, created_at DESC').all(member.id);

  let liftTransactions: any[] = [];
  if (member.lift_id) {
    liftTransactions = db.prepare('SELECT * FROM lift_payout_transactions WHERE lift_id = ? ORDER BY payment_date ASC, created_at ASC').all(member.lift_id);
  }

  const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE member_id = ?').get(member.id) as { total: number };
  const totalOutstanding = db.prepare('SELECT COALESCE(SUM(balance_amount), 0) as total FROM monthly_dues WHERE member_id = ?').get(member.id) as { total: number };

  return {
    member: { ...member, transactions: liftTransactions },
    dues,
    payments,
    lift_transactions: liftTransactions,
    total_paid: totalPaid.total,
    total_outstanding: totalOutstanding.total,
  };
}

export function fallbackSaveLiftAuction(chitId: string, memberId: string, body: any) {
  const { lift_month, lift_date, payment_method, reference_number, notes } = body;
  const parsedMonth = Number(lift_month);

  const existingLift = db.prepare('SELECT * FROM lift_details WHERE chit_id = ? AND lift_month = ?').get(chitId, parsedMonth) as any;
  if (existingLift && existingLift.member_id !== memberId) {
    throw new Error(`Month ${parsedMonth} is already assigned to another customer.`);
  }

  const configuredPayout = Number(
    body.lift_amount !== undefined
      ? body.lift_amount
      : (body.configured_lift_payout !== undefined ? body.configured_lift_payout : body.lift_amount_received)
  );

  const initialPaid = Number(
    body.initial_amount_paid !== undefined
      ? body.initial_amount_paid
      : (body.lift_amount_received !== undefined ? body.lift_amount_received : configuredPayout)
  );

  const existingMemberLift = db.prepare('SELECT * FROM lift_details WHERE member_id = ?').get(memberId) as any;
  const id = existingMemberLift ? existingMemberLift.id : ('lift-' + chitId + '-' + memberId);
  const now = new Date().toISOString();
  const dateValue = String(lift_date).trim();
  const methodValue = String(payment_method).trim();
  const refValue = reference_number ? String(reference_number).trim() : null;
  const notesValue = notes ? String(notes).trim() : '';

  const tx = db.transaction(() => {
    if (existingMemberLift) {
      const existingTxCount = db.prepare('SELECT count(*) as count FROM lift_payout_transactions WHERE lift_id = ?').get(id) as { count: number };
      let finalPaid = initialPaid;

      if (existingTxCount.count > 0) {
        const sumRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM lift_payout_transactions WHERE lift_id = ?').get(id) as { total: number };
        finalPaid = sumRow.total;
      } else if (initialPaid > 0) {
        const txId = 'tx-' + id + '-' + Date.now();
        db.prepare(`
          INSERT INTO lift_payout_transactions (id, lift_id, chit_id, member_id, amount, payment_date, payment_method, reference_number, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(txId, id, chitId, memberId, initialPaid, dateValue, methodValue, refValue, notesValue || 'Initial lift payout', now);
      }

      const remaining = Math.max(0, configuredPayout - finalPaid);
      const payoutStatus = remaining <= 0 ? 'PAID' : 'PARTIAL';

      db.prepare(`
        UPDATE lift_details
        SET lift_month = ?, lift_amount = ?, lift_amount_received = ?, remaining_payout = ?, payout_status = ?, lift_date = ?, payment_method = ?, reference_number = ?, notes = ?, status = 'Completed', updated_at = ?
        WHERE id = ?
      `).run(parsedMonth, configuredPayout, finalPaid, remaining, payoutStatus, dateValue, methodValue, refValue, notesValue, now, id);
    } else {
      const remaining = Math.max(0, configuredPayout - initialPaid);
      const payoutStatus = remaining <= 0 ? 'PAID' : 'PARTIAL';

      db.prepare(`
        INSERT INTO lift_details (id, chit_id, member_id, lift_month, lift_amount, lift_amount_received, remaining_payout, payout_status, lift_date, payment_method, reference_number, notes, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?)
      `).run(id, chitId, memberId, parsedMonth, configuredPayout, initialPaid, remaining, payoutStatus, dateValue, methodValue, refValue, notesValue, now, now);

      if (initialPaid > 0) {
        const txId = 'tx-' + id + '-' + Date.now();
        db.prepare(`
          INSERT INTO lift_payout_transactions (id, lift_id, chit_id, member_id, amount, payment_date, payment_method, reference_number, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(txId, id, chitId, memberId, initialPaid, dateValue, methodValue, refValue, notesValue || 'Initial lift payout', now);
      }
    }

    dbSyncDuesOnLift(chitId, memberId, parsedMonth);
  });

  tx();
  const updatedLift = db.prepare('SELECT * FROM lift_details WHERE id = ?').get(id) as any;
  const transactions = db.prepare('SELECT * FROM lift_payout_transactions WHERE lift_id = ? ORDER BY payment_date ASC, created_at ASC').all(id);
  return {
    ...updatedLift,
    transactions,
  };
}

export function fallbackDeleteLiftAuction(chitId: string, memberId: string) {
  const rules = db.prepare('SELECT * FROM chit_month_rules WHERE chit_id = ?').all(chitId) as any[];
  const rulesMap = new Map(rules.map(r => [r.month_number, r]));

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lift_payout_transactions WHERE member_id = ?').run(memberId);
    db.prepare('DELETE FROM lift_details WHERE member_id = ?').run(memberId);

    const updateStmt = db.prepare(`
      UPDATE monthly_dues
      SET due_amount = ?, balance_amount = ?
      WHERE chit_id = ? AND member_id = ? AND month_number = ? AND paid_amount = 0
    `);

    for (const [mNum, rule] of rulesMap.entries()) {
      updateStmt.run(rule.pre_lift_payment, rule.pre_lift_payment, chitId, memberId, mNum);
    }
  });

  tx();
  return true;
}

export function fallbackRecordLiftPayoutPayment(chitId: string, memberId: string, body: any) {
  const { amount, payment_date, payment_method, reference_number, notes } = body;
  const numericAmount = Number(amount);

  const lift = db.prepare('SELECT * FROM lift_details WHERE chit_id = ? AND member_id = ?').get(chitId, memberId) as any;
  if (!lift) throw new Error('Lift record not found for this customer.');

  const now = new Date().toISOString();
  const txId = 'tx-payout-' + lift.id + '-' + Date.now();
  const dateValue = payment_date ? String(payment_date).trim() : new Date().toISOString().split('T')[0];
  const methodValue = payment_method ? String(payment_method).trim() : 'Cash';
  const refValue = reference_number ? String(reference_number).trim() : null;
  const notesValue = notes ? String(notes).trim() : null;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO lift_payout_transactions (id, lift_id, chit_id, member_id, amount, payment_date, payment_method, reference_number, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(txId, lift.id, chitId, memberId, numericAmount, dateValue, methodValue, refValue, notesValue, now);

    const sumRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM lift_payout_transactions WHERE lift_id = ?').get(lift.id) as { total: number };
    const totalPaid = sumRow.total;
    const configuredPayout = Number(lift.lift_amount);
    const newRemaining = Math.max(0, configuredPayout - totalPaid);
    const newStatus = newRemaining <= 0 ? 'PAID' : 'PARTIAL';

    db.prepare(`
      UPDATE lift_details
      SET lift_amount_received = ?, remaining_payout = ?, payout_status = ?, updated_at = ?
      WHERE id = ?
    `).run(totalPaid, newRemaining, newStatus, now, lift.id);
  });

  tx();
  const updatedLift = db.prepare('SELECT * FROM lift_details WHERE id = ?').get(lift.id) as any;
  const transactions = db.prepare('SELECT * FROM lift_payout_transactions WHERE lift_id = ? ORDER BY payment_date ASC, created_at ASC').all(lift.id);
  return { lift: updatedLift, transactions };
}

export function fallbackGetLiftPayoutTransactions(chitId: string, memberId: string) {
  const lift = db.prepare('SELECT * FROM lift_details WHERE chit_id = ? AND member_id = ?').get(chitId, memberId) as any;
  if (!lift) return null;
  const transactions = db.prepare('SELECT * FROM lift_payout_transactions WHERE lift_id = ? ORDER BY payment_date ASC, created_at ASC').all(lift.id);
  return { lift, transactions };
}

export function fallbackCreatePaymentRecord(body: any) {
  const { monthly_due_id, amount, payment_method, reference_no, notes, payment_date, allow_overpayment } = body;
  const due = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(monthly_due_id) as any;
  if (!due) throw new Error('Monthly due record not found.');

  const currentPaymentsTotalRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE monthly_due_id = ?').get(monthly_due_id) as any;
  const currentPaymentsTotal = currentPaymentsTotalRow ? Number(currentPaymentsTotalRow.total) : 0;
  const currentBalance = Math.max(0, Number(due.due_amount) - currentPaymentsTotal);

  if (amount > (currentBalance + 0.01) && !allow_overpayment) {
    throw new Error(`Payment amount (₹${amount.toLocaleString('en-IN')}) exceeds outstanding balance (₹${currentBalance.toLocaleString('en-IN')}).`);
  }

  const paymentId = 'pay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();
  const payDate = payment_date || now;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (id, monthly_due_id, chit_id, member_id, month_number, month_name, amount, payment_method, reference_no, notes, payment_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, monthly_due_id, due.chit_id, due.member_id, due.month_number, due.month_name, amount, payment_method || 'Cash', reference_no || '', notes || '', payDate, now, now);

    const postPaymentRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments 
      WHERE (monthly_due_id = ? OR (chit_id = ? AND member_id = ? AND month_number = ?))
    `).get(monthly_due_id, due.chit_id, due.member_id, due.month_number) as any;
    const authoritativePaid = postPaymentRow ? Number(postPaymentRow.total) : amount;
    const newBalance = Math.max(0, Number(due.due_amount) - authoritativePaid);
    const newStatus = authoritativePaid >= Number(due.due_amount) ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    db.prepare(`
      UPDATE monthly_dues
      SET paid_amount = ?, balance_amount = ?, status = ?
      WHERE id = ?
    `).run(authoritativePaid, newBalance, newStatus, monthly_due_id);
  });

  tx();
  const updatedDue = db.prepare(`
    SELECT d.*, m.customer_name, m.phone, m.ticket_number
    FROM monthly_dues d
    JOIN members m ON d.member_id = m.id
    WHERE d.id = ?
  `).get(monthly_due_id);
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  return { payment, updatedDue };
}

export function fallbackGetAllPayments(filters: { chit_id?: string; member_id?: string; limit?: number }) {
  let query = `
    SELECT p.*, m.customer_name, m.phone, m.ticket_number, c.name as chit_name
    FROM payments p
    JOIN members m ON p.member_id = m.id
    JOIN chits c ON p.chit_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (filters.chit_id) {
    query += ' AND p.chit_id = ?';
    params.push(filters.chit_id);
  }
  if (filters.member_id) {
    query += ' AND p.member_id = ?';
    params.push(filters.member_id);
  }
  query += ' ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.payment_date DESC, p.created_at DESC LIMIT ?';
  params.push(filters.limit || 50);

  return db.prepare(query).all(...params);
}

export function fallbackGetPaymentsByDueId(dueId: string) {
  const due = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(dueId) as any;
  if (due) {
    return db.prepare(`
      SELECT p.*, m.customer_name, m.phone, m.ticket_number, c.name as chit_name
      FROM payments p
      LEFT JOIN members m ON p.member_id = m.id
      LEFT JOIN chits c ON p.chit_id = c.id
      WHERE p.monthly_due_id = ? OR (p.chit_id = ? AND p.member_id = ? AND p.month_number = ?)
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.payment_date DESC, p.created_at DESC
    `).all(dueId, due.chit_id, due.member_id, due.month_number);
  }
  return db.prepare(`
    SELECT p.*, m.customer_name, m.phone, m.ticket_number, c.name as chit_name
    FROM payments p
    LEFT JOIN members m ON p.member_id = m.id
    LEFT JOIN chits c ON p.chit_id = c.id
    WHERE p.monthly_due_id = ?
    ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.payment_date DESC, p.created_at DESC
  `).all(dueId);
}

export function fallbackUpdatePaymentRecord(id: string, body: any) {
  const { amount, payment_method, reference_no, notes, payment_date } = body;
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
  if (!payment) throw new Error('Payment record not found.');

  const due = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(payment.monthly_due_id) as any;
  if (!due) throw new Error('Associated monthly due record not found.');

  const newAmount = amount !== undefined ? Number(amount) : payment.amount;
  const newMethod = payment_method || payment.payment_method || 'Cash';
  const newRef = reference_no !== undefined ? reference_no : payment.reference_no;
  const newNotes = notes !== undefined ? notes : payment.notes;
  const newDate = payment_date || payment.payment_date;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE payments
      SET amount = ?, payment_method = ?, reference_no = ?, notes = ?, payment_date = ?, updated_at = ?
      WHERE id = ?
    `).run(newAmount, newMethod, newRef, newNotes, newDate, now, id);

    const postRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments 
      WHERE (monthly_due_id = ? OR (chit_id = ? AND member_id = ? AND month_number = ?))
    `).get(due.id, due.chit_id, due.member_id, due.month_number) as any;
    const authoritativePaid = postRow ? Number(postRow.total) : newAmount;
    const finalBalance = Math.max(0, Number(due.due_amount) - authoritativePaid);
    const finalStatus = authoritativePaid >= Number(due.due_amount) ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    db.prepare(`
      UPDATE monthly_dues
      SET paid_amount = ?, balance_amount = ?, status = ?
      WHERE id = ?
    `).run(authoritativePaid, finalBalance, finalStatus, due.id);
  });

  tx();
  const updatedPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  const updatedDue = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(due.id);
  return { payment: updatedPayment, updatedDue };
}

export function fallbackDeletePaymentRecord(id: string) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
  if (!payment) throw new Error('Payment record not found.');

  const due = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(payment.monthly_due_id) as any;
  if (!due) throw new Error('Associated monthly due record not found.');

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(id);

    const postRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments 
      WHERE (monthly_due_id = ? OR (chit_id = ? AND member_id = ? AND month_number = ?))
    `).get(due.id, due.chit_id, due.member_id, due.month_number) as any;
    const authoritativePaid = postRow ? Number(postRow.total) : 0;
    const finalBalance = Math.max(0, Number(due.due_amount) - authoritativePaid);
    const finalStatus = authoritativePaid >= Number(due.due_amount) ? 'PAID' : (authoritativePaid > 0 ? 'PARTIAL' : 'PENDING');

    db.prepare(`
      UPDATE monthly_dues
      SET paid_amount = ?, balance_amount = ?, status = ?
      WHERE id = ?
    `).run(authoritativePaid, finalBalance, finalStatus, due.id);
  });

  tx();
  const updatedDue = db.prepare('SELECT * FROM monthly_dues WHERE id = ?').get(due.id);
  return { updatedDue };
}

export function fallbackGetPendingDues(chitId?: string, isCurrentOnly = true) {
  dbSyncChitsCurrentMonth();
  const activeChits = db.prepare("SELECT id, current_month FROM chits WHERE status = 'active'").all() as any[];
  for (const c of activeChits) {
    dbEnsureMonthlyDuesForChitAndMonth(c.id, c.current_month || 1);
  }

  let sql = `
    SELECT 
      d.*,
      c.name as chit_name,
      c.current_month as chit_current_month,
      m.customer_name,
      m.phone,
      m.ticket_number,
      l.lift_month,
      CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM monthly_dues d
    JOIN chits c ON d.chit_id = c.id
    JOIN members m ON d.member_id = m.id
    LEFT JOIN lift_details l ON d.member_id = l.member_id
    WHERE d.balance_amount > 0 AND c.status = 'active'
  `;

  const params: any[] = [];
  if (chitId) {
    sql += ' AND d.chit_id = ?';
    params.push(chitId);
  }
  if (isCurrentOnly) {
    sql += ' AND d.month_number = c.current_month';
  }
  sql += ' ORDER BY c.name ASC, CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC';

  const dues = db.prepare(sql).all(...params) as any[];
  const totalPendingAmount = dues.reduce((sum, d) => sum + (d.balance_amount || 0), 0);
  return {
    dues,
    summary: {
      totalPendingMembers: dues.length,
      totalPendingAmount,
    },
  };
}

export function fallbackGetChitReports(chitId: string) {
  const chit = db.prepare('SELECT * FROM chits WHERE id = ?').get(chitId) as any;
  if (!chit) return null;

  const monthlyCollection = db.prepare(`
    SELECT r.month_number, r.month_name, r.pre_lift_payment, r.post_lift_payment, r.monthly_chit_value, r.expected_lift_payout,
           COALESCE(SUM(d.due_amount), 0) as total_due,
           COALESCE(SUM(d.paid_amount), 0) as total_paid,
           COALESCE(SUM(d.balance_amount), 0) as total_balance,
           COUNT(d.id) as total_members_count,
           SUM(CASE WHEN d.status = 'PAID' THEN 1 ELSE 0 END) as count_paid,
           SUM(CASE WHEN d.status = 'PARTIAL' THEN 1 ELSE 0 END) as count_partial,
           SUM(CASE WHEN d.status = 'PENDING' THEN 1 ELSE 0 END) as count_pending,
           l.lift_amount_received, m.customer_name as lifted_by
    FROM chit_month_rules r
    LEFT JOIN monthly_dues d ON r.chit_id = d.chit_id AND r.month_number = d.month_number
    LEFT JOIN lift_details l ON r.chit_id = l.chit_id AND r.month_number = l.lift_month
    LEFT JOIN members m ON l.member_id = m.id
    WHERE r.chit_id = ?
    GROUP BY r.month_number
    ORDER BY r.month_number ASC
  `).all(chitId);

  const customerWise = db.prepare(`
    SELECT m.id, m.customer_name, m.phone, m.ticket_number, m.status,
           l.id as lift_id, l.lift_month, l.lift_amount, l.lift_amount_received, l.remaining_payout, l.payout_status, l.lift_date,
           l.payment_method, l.reference_number, l.notes as lift_notes, l.status as lift_status_text,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status,
           COALESCE(SUM(d.due_amount), 0) as total_due,
           COALESCE(SUM(d.paid_amount), 0) as total_paid,
           COALESCE(SUM(d.balance_amount), 0) as total_balance,
           SUM(CASE WHEN d.status = 'PAID' THEN 1 ELSE 0 END) as paid_months_count,
           SUM(CASE WHEN d.status != 'PAID' THEN 1 ELSE 0 END) as pending_months_count
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    LEFT JOIN monthly_dues d ON m.id = d.member_id
    WHERE m.chit_id = ?
    GROUP BY m.id
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC, m.customer_name ASC
  `).all(chitId);

  const liftedMembers = db.prepare(`
    SELECT l.*, m.customer_name, m.phone, m.ticket_number
    FROM lift_details l
    JOIN members m ON l.member_id = m.id
    WHERE l.chit_id = ?
    ORDER BY l.lift_month ASC
  `).all(chitId);

  const unliftedMembers = db.prepare(`
    SELECT m.*
    FROM members m
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.chit_id = ? AND l.id IS NULL AND m.status = 'active'
    ORDER BY CAST(m.ticket_number AS INTEGER) ASC
  `).all(chitId);

  const totals = db.prepare(`
    SELECT 
      COALESCE(SUM(due_amount), 0) as grand_total_due,
      COALESCE(SUM(paid_amount), 0) as grand_total_collected,
      COALESCE(SUM(balance_amount), 0) as grand_total_outstanding
    FROM monthly_dues
    WHERE chit_id = ?
  `).get(chitId) as any;

  return {
    chit,
    monthlyCollection,
    customerWise,
    liftedMembers,
    unliftedMembers,
    totals,
  };
}

export function fallbackGlobalSearch(query: string) {
  if (!query) return [];
  return db.prepare(`
    SELECT m.id, m.customer_name, m.phone, m.ticket_number, m.chit_id,
           c.name as chit_name, c.chit_value,
           l.lift_month,
           CASE WHEN l.id IS NOT NULL THEN 'lifted' ELSE 'not_lifted' END as lift_status
    FROM members m
    JOIN chits c ON m.chit_id = c.id
    LEFT JOIN lift_details l ON m.id = l.member_id
    WHERE m.customer_name LIKE ? OR m.phone LIKE ? OR m.ticket_number LIKE ? OR c.name LIKE ?
    LIMIT 20
  `).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
}
