/**
 * SQLite to PostgreSQL Migration Utility for Chit Manager
 * 
 * Usage:
 *   DATABASE_URL="postgresql://user:password@host:port/database" npx tsx scripts/migrate-sqlite-to-postgres.ts
 * 
 * Can also export as pure SQL statements for direct import into Supabase, Neon, RDS, or Cloud SQL:
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts --export-sql > backup_postgres_migration.sql
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'chit_manager.db');

async function main() {
  const isSqlExport = process.argv.includes('--export-sql');

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ SQLite database not found at: ${DB_PATH}`);
    process.exit(1);
  }

  const sqlite = new Database(DB_PATH, { readonly: true });
  console.log(`🔍 Connected to SQLite at: ${DB_PATH}`);

  if (isSqlExport) {
    exportToSql(sqlite);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required to migrate directly into PostgreSQL.');
    console.log('💡 Tip: Run with --export-sql to generate a PostgreSQL .sql file instead:');
    console.log('   npx tsx scripts/migrate-sqlite-to-postgres.ts --export-sql > migration.sql');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('✅ Connected to target PostgreSQL database via Prisma');

    console.log('\n--- MIGRATING DATA ---');

    // 1. Users
    const users = sqlite.prepare('SELECT * FROM users').all() as any[];
    console.log(`Migrating ${users.length} users...`);
    for (const u of users) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: {
          username: u.username,
          passwordHash: u.password_hash,
          salt: u.salt,
          name: u.name,
          role: u.role || 'admin',
          loginId: u.login_id || u.username,
          recoveryEmail: u.recovery_email,
          recoveryPhone: u.recovery_phone,
          isActive: Boolean(u.is_active ?? 1),
          failedLoginAttempts: u.failed_login_attempts || 0,
          lockedUntil: u.locked_until ? new Date(u.locked_until) : null,
          passwordChangedAt: u.password_changed_at ? new Date(u.password_changed_at) : null,
          securityQuestion: u.security_question,
          securityAnswerHash: u.security_answer_hash,
          failedRecoveryAttempts: u.failed_recovery_attempts || 0,
          recoveryLockedUntil: u.recovery_locked_until ? new Date(u.recovery_locked_until) : null,
          createdAt: u.created_at ? new Date(u.created_at) : new Date(),
          updatedAt: u.updated_at ? new Date(u.updated_at) : null,
          lastLoginAt: u.last_login_at ? new Date(u.last_login_at) : null,
        },
        create: {
          id: u.id,
          username: u.username,
          passwordHash: u.password_hash,
          salt: u.salt,
          name: u.name,
          role: u.role || 'admin',
          loginId: u.login_id || u.username,
          recoveryEmail: u.recovery_email,
          recoveryPhone: u.recovery_phone,
          isActive: Boolean(u.is_active ?? 1),
          failedLoginAttempts: u.failed_login_attempts || 0,
          lockedUntil: u.locked_until ? new Date(u.locked_until) : null,
          passwordChangedAt: u.password_changed_at ? new Date(u.password_changed_at) : null,
          securityQuestion: u.security_question,
          securityAnswerHash: u.security_answer_hash,
          failedRecoveryAttempts: u.failed_recovery_attempts || 0,
          recoveryLockedUntil: u.recovery_locked_until ? new Date(u.recovery_locked_until) : null,
          createdAt: u.created_at ? new Date(u.created_at) : new Date(),
          updatedAt: u.updated_at ? new Date(u.updated_at) : null,
          lastLoginAt: u.last_login_at ? new Date(u.last_login_at) : null,
        },
      });
    }

    // 2. Chits
    const chits = sqlite.prepare('SELECT * FROM chits').all() as any[];
    console.log(`Migrating ${chits.length} chits...`);
    for (const c of chits) {
      await prisma.chit.upsert({
        where: { id: c.id },
        update: {
          name: c.name,
          chitValue: c.chit_value,
          monthlyChitValue: c.monthly_chit_value || 301500,
          totalMonths: c.total_months,
          totalMembers: c.total_members,
          currentMonth: c.current_month || 1,
          startMonth: c.start_month,
          endMonth: c.end_month,
          status: c.status || 'active',
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.updated_at),
        },
        create: {
          id: c.id,
          name: c.name,
          chitValue: c.chit_value,
          monthlyChitValue: c.monthly_chit_value || 301500,
          totalMonths: c.total_months,
          totalMembers: c.total_members,
          currentMonth: c.current_month || 1,
          startMonth: c.start_month,
          endMonth: c.end_month,
          status: c.status || 'active',
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.updated_at),
        },
      });
    }

    // 3. Chit Month Rules
    const rules = sqlite.prepare('SELECT * FROM chit_month_rules').all() as any[];
    console.log(`Migrating ${rules.length} chit month rules...`);
    for (const r of rules) {
      await prisma.chitMonthRule.upsert({
        where: { id: r.id },
        update: {
          chitId: r.chit_id,
          monthNumber: r.month_number,
          monthName: r.month_name,
          preLiftPayment: r.pre_lift_payment,
          postLiftPayment: r.post_lift_payment,
          monthlyChitValue: r.monthly_chit_value,
          expectedLiftPayout: r.expected_lift_payout,
        },
        create: {
          id: r.id,
          chitId: r.chit_id,
          monthNumber: r.month_number,
          monthName: r.month_name,
          preLiftPayment: r.pre_lift_payment,
          postLiftPayment: r.post_lift_payment,
          monthlyChitValue: r.monthly_chit_value,
          expectedLiftPayout: r.expected_lift_payout,
        },
      });
    }

    // 4. Members
    const members = sqlite.prepare('SELECT * FROM members').all() as any[];
    console.log(`Migrating ${members.length} members...`);
    for (const m of members) {
      await prisma.member.upsert({
        where: { id: m.id },
        update: {
          chitId: m.chit_id,
          customerName: m.customer_name,
          phone: m.phone,
          ticketNumber: m.ticket_number,
          status: m.status || 'active',
          joinDate: new Date(m.join_date),
          createdAt: new Date(m.created_at),
        },
        create: {
          id: m.id,
          chitId: m.chit_id,
          customerName: m.customer_name,
          phone: m.phone,
          ticketNumber: m.ticket_number,
          status: m.status || 'active',
          joinDate: new Date(m.join_date),
          createdAt: new Date(m.created_at),
        },
      });
    }

    // 5. Lift Details
    const lifts = sqlite.prepare('SELECT * FROM lift_details').all() as any[];
    console.log(`Migrating ${lifts.length} lift details...`);
    for (const l of lifts) {
      await prisma.liftDetail.upsert({
        where: { id: l.id },
        update: {
          chitId: l.chit_id,
          memberId: l.member_id,
          liftMonth: l.lift_month,
          liftAmount: l.lift_amount || 0,
          liftAmountReceived: l.lift_amount_received || 0,
          remainingPayout: l.remaining_payout || 0,
          payoutStatus: l.payout_status || 'PAID',
          liftDate: new Date(l.lift_date),
          paymentMethod: l.payment_method || 'Cash',
          referenceNumber: l.reference_number,
          notes: l.notes,
          status: l.status || 'Completed',
          createdAt: new Date(l.created_at),
          updatedAt: l.updated_at ? new Date(l.updated_at) : null,
        },
        create: {
          id: l.id,
          chitId: l.chit_id,
          memberId: l.member_id,
          liftMonth: l.lift_month,
          liftAmount: l.lift_amount || 0,
          liftAmountReceived: l.lift_amount_received || 0,
          remainingPayout: l.remaining_payout || 0,
          payoutStatus: l.payout_status || 'PAID',
          liftDate: new Date(l.lift_date),
          paymentMethod: l.payment_method || 'Cash',
          referenceNumber: l.reference_number,
          notes: l.notes,
          status: l.status || 'Completed',
          createdAt: new Date(l.created_at),
          updatedAt: l.updated_at ? new Date(l.updated_at) : null,
        },
      });
    }

    // 6. Lift Payout Transactions
    const txs = sqlite.prepare('SELECT * FROM lift_payout_transactions').all() as any[];
    console.log(`Migrating ${txs.length} lift payout transactions...`);
    for (const t of txs) {
      await prisma.liftPayoutTransaction.upsert({
        where: { id: t.id },
        update: {
          liftId: t.lift_id,
          chitId: t.chit_id,
          memberId: t.member_id,
          amount: t.amount,
          paymentDate: new Date(t.payment_date),
          paymentMethod: t.payment_method || 'Cash',
          referenceNumber: t.reference_number,
          notes: t.notes,
          createdAt: new Date(t.created_at),
        },
        create: {
          id: t.id,
          liftId: t.lift_id,
          chitId: t.chit_id,
          memberId: t.member_id,
          amount: t.amount,
          paymentDate: new Date(t.payment_date),
          paymentMethod: t.payment_method || 'Cash',
          referenceNumber: t.reference_number,
          notes: t.notes,
          createdAt: new Date(t.created_at),
        },
      });
    }

    // 7. Monthly Dues
    const dues = sqlite.prepare('SELECT * FROM monthly_dues').all() as any[];
    console.log(`Migrating ${dues.length} monthly dues...`);
    for (const d of dues) {
      await prisma.monthlyDue.upsert({
        where: { id: d.id },
        update: {
          chitId: d.chit_id,
          memberId: d.member_id,
          monthNumber: d.month_number,
          monthName: d.month_name,
          dueAmount: d.due_amount,
          paidAmount: d.paid_amount || 0,
          balanceAmount: d.balance_amount,
          status: d.status || 'PENDING',
          dueDate: new Date(d.due_date),
          generatedAt: new Date(d.generated_at),
        },
        create: {
          id: d.id,
          chitId: d.chit_id,
          memberId: d.member_id,
          monthNumber: d.month_number,
          monthName: d.month_name,
          dueAmount: d.due_amount,
          paidAmount: d.paid_amount || 0,
          balanceAmount: d.balance_amount,
          status: d.status || 'PENDING',
          dueDate: new Date(d.due_date),
          generatedAt: new Date(d.generated_at),
        },
      });
    }

    // 8. Payments
    const payments = sqlite.prepare('SELECT * FROM payments').all() as any[];
    console.log(`Migrating ${payments.length} payments...`);
    for (const p of payments) {
      await prisma.payment.upsert({
        where: { id: p.id },
        update: {
          monthlyDueId: p.monthly_due_id,
          chitId: p.chit_id,
          memberId: p.member_id,
          monthNumber: p.month_number,
          monthName: p.month_name,
          amount: p.amount,
          paymentMethod: p.payment_method,
          referenceNo: p.reference_no,
          notes: p.notes,
          paymentDate: new Date(p.payment_date),
          createdAt: new Date(p.created_at),
          updatedAt: p.updated_at ? new Date(p.updated_at) : null,
        },
        create: {
          id: p.id,
          monthlyDueId: p.monthly_due_id,
          chitId: p.chit_id,
          memberId: p.member_id,
          monthNumber: p.month_number,
          monthName: p.month_name,
          amount: p.amount,
          paymentMethod: p.payment_method,
          referenceNo: p.reference_no,
          notes: p.notes,
          paymentDate: new Date(p.payment_date),
          createdAt: new Date(p.created_at),
          updatedAt: p.updated_at ? new Date(p.updated_at) : null,
        },
      });
    }

    console.log('\n🎉 ALL DATA MIGRATED SUCCESSFULLY TO POSTGRESQL!');
  } finally {
    await prisma.$disconnect();
    sqlite.close();
  }
}

function exportToSql(sqlite: Database.Database) {
  console.log('-- ==============================================================');
  console.log('-- CHIT MANAGER SQLITE TO POSTGRESQL FULL EXPORT');
  console.log(`-- Generated: ${new Date().toISOString()}`);
  console.log('-- ==============================================================\n');

  const tables = [
    'users',
    'chits',
    'chit_month_rules',
    'members',
    'lift_details',
    'lift_payout_transactions',
    'monthly_dues',
    'payments',
  ];

  for (const t of tables) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${t}`).all() as any[];
      if (rows.length === 0) continue;

      console.log(`\n-- Data for table: ${t} (${rows.length} rows)`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map(c => {
          const val = row[c];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        console.log(`INSERT INTO "${t}" ("${cols.join('", "')}") VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`);
      }
    } catch (e: any) {
      console.error(`-- Error reading table ${t}: ${e.message}`);
    }
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
