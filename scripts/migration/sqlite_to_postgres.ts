import Database from 'better-sqlite3';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

interface FinancialSummary {
  chitsCount: number;
  totalChitValue: number;
  membersCount: number;
  rulesCount: number;
  totalExpectedLift: number;
  duesCount: number;
  totalDueAmount: number;
  totalPaidAmount: number;
  paymentsCount: number;
  totalPayments: number;
  liftsCount: number;
  totalLiftReceived: number;
}

export async function migrateSqliteToPostgres(sqlitePath?: string) {
  const dbPath = sqlitePath || path.join(process.cwd(), 'data', 'chit_manager.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found at ${dbPath}`);
  }

  const pgUrl = process.env.DATABASE_URL;
  if (!pgUrl && !process.env.PGHOST) {
    throw new Error('Neither DATABASE_URL nor PGHOST is defined in environment variables.');
  }

  const sqlite = new Database(dbPath, { readonly: true });
  const client = new Client(pgUrl ? { connectionString: pgUrl } : {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  await client.connect();
  console.log('Connected to target PostgreSQL / Cloud SQL database.');

  try {
    // 1. Compute Pre-Migration SQLite Stats
    console.log('\n--- 1. COMPUTING PRE-MIGRATION SQLITE METRICS ---');
    const chitsRow = sqlite.prepare('SELECT count(*) as c, coalesce(sum(chit_value),0) as val FROM chits').get() as any;
    const membersRow = sqlite.prepare('SELECT count(*) as c FROM members').get() as any;
    const rulesRow = sqlite.prepare('SELECT count(*) as c, coalesce(sum(expected_lift_payout),0) as payout FROM chit_month_rules').get() as any;
    const duesRow = sqlite.prepare('SELECT count(*) as c, coalesce(sum(due_amount),0) as due, coalesce(sum(paid_amount),0) as paid FROM monthly_dues').get() as any;
    const paymentsRow = sqlite.prepare('SELECT count(*) as c, coalesce(sum(amount),0) as amt FROM payments').get() as any;
    const liftsRow = sqlite.prepare('SELECT count(*) as c, coalesce(sum(lift_amount_received),0) as amt FROM lift_details').get() as any;
    const usersRow = sqlite.prepare('SELECT count(*) as c FROM users').get() as any;
    const sessionsRow = sqlite.prepare('SELECT count(*) as c FROM sessions').get() as any;
    const resetsRow = sqlite.prepare('SELECT count(*) as c FROM password_resets').get() as any;

    const sqliteSummary: FinancialSummary = {
      chitsCount: chitsRow.c,
      totalChitValue: Number(chitsRow.val),
      membersCount: membersRow.c,
      rulesCount: rulesRow.c,
      totalExpectedLift: Number(rulesRow.payout),
      duesCount: duesRow.c,
      totalDueAmount: Number(duesRow.due),
      totalPaidAmount: Number(duesRow.paid),
      paymentsCount: paymentsRow.c,
      totalPayments: Number(paymentsRow.amt),
      liftsCount: liftsRow.c,
      totalLiftReceived: Number(liftsRow.amt),
    };

    console.log('SQLite Users:', usersRow.c);
    console.log('SQLite Chits:', sqliteSummary.chitsCount, '| Total Chit Value: ₹' + sqliteSummary.totalChitValue);
    console.log('SQLite Members:', sqliteSummary.membersCount);
    console.log('SQLite Month Rules:', sqliteSummary.rulesCount, '| Total Expected Lift: ₹' + sqliteSummary.totalExpectedLift);
    console.log('SQLite Monthly Dues:', sqliteSummary.duesCount, '| Due: ₹' + sqliteSummary.totalDueAmount, '| Paid: ₹' + sqliteSummary.totalPaidAmount);
    console.log('SQLite Payments:', sqliteSummary.paymentsCount, '| Total: ₹' + sqliteSummary.totalPayments);
    console.log('SQLite Lift Details:', sqliteSummary.liftsCount, '| Total Lift Received: ₹' + sqliteSummary.totalLiftReceived);

    // 2. Initialize PostgreSQL Schema
    console.log('\n--- 2. APPLYING POSTGRESQL SCHEMA ---');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schemaSql);
    console.log('Schema applied successfully.');

    // 3. Migrate Data in Exact Foreign Key Order inside a Transaction
    console.log('\n--- 3. MIGRATING DATA IN TRANSACTION ---');
    await client.query('BEGIN');

    const tablesInOrder = [
      'users',
      'chits',
      'chit_month_rules',
      'members',
      'lift_details',
      'monthly_dues',
      'payments',
      'sessions',
      'password_resets',
    ];

    for (const table of tablesInOrder) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as any[];
      console.log(`Migrating ${table}: ${rows.length} records...`);

      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const colNames = columns.join(', ');

      for (const row of rows) {
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = columns.map(c => row[c]);
        const insertQuery = `
          INSERT INTO ${table} (${colNames}) 
          VALUES (${placeholders})
          ON CONFLICT (id) DO NOTHING
        `;
        await client.query(insertQuery, values);
      }
    }

    await client.query('COMMIT');
    console.log('All table data migrated and committed.');

    // 4. Verify PostgreSQL Stats
    console.log('\n--- 4. POST-MIGRATION VERIFICATION ---');
    const pgChits = await client.query('SELECT count(*)::int as c, coalesce(sum(chit_value),0)::numeric as val FROM chits');
    const pgMembers = await client.query('SELECT count(*)::int as c FROM members');
    const pgRules = await client.query('SELECT count(*)::int as c, coalesce(sum(expected_lift_payout),0)::numeric as payout FROM chit_month_rules');
    const pgDues = await client.query('SELECT count(*)::int as c, coalesce(sum(due_amount),0)::numeric as due, coalesce(sum(paid_amount),0)::numeric as paid FROM monthly_dues');
    const pgPayments = await client.query('SELECT count(*)::int as c, coalesce(sum(amount),0)::numeric as amt FROM payments');
    const pgLifts = await client.query('SELECT count(*)::int as c, coalesce(sum(lift_amount_received),0)::numeric as amt FROM lift_details');
    const pgUsers = await client.query('SELECT count(*)::int as c FROM users');

    const pgSummary: FinancialSummary = {
      chitsCount: pgChits.rows[0].c,
      totalChitValue: Number(pgChits.rows[0].val),
      membersCount: pgMembers.rows[0].c,
      rulesCount: pgRules.rows[0].c,
      totalExpectedLift: Number(pgRules.rows[0].payout),
      duesCount: pgDues.rows[0].c,
      totalDueAmount: Number(pgDues.rows[0].due),
      totalPaidAmount: Number(pgDues.rows[0].paid),
      paymentsCount: pgPayments.rows[0].c,
      totalPayments: Number(pgPayments.rows[0].amt),
      liftsCount: pgLifts.rows[0].c,
      totalLiftReceived: Number(pgLifts.rows[0].amt),
    };

    // 5. Compare All Metrics
    console.log('\n--- 5. COMPARISON AUDIT ---');
    const checks = [
      { name: 'Users Count', sqlite: usersRow.c, pg: pgUsers.rows[0].c },
      { name: 'Total Chits', sqlite: sqliteSummary.chitsCount, pg: pgSummary.chitsCount },
      { name: 'Total Members', sqlite: sqliteSummary.membersCount, pg: pgSummary.membersCount },
      { name: 'Total Month Rules', sqlite: sqliteSummary.rulesCount, pg: pgSummary.rulesCount },
      { name: 'Total Monthly Dues', sqlite: sqliteSummary.duesCount, pg: pgSummary.duesCount },
      { name: 'Total Payments Count', sqlite: sqliteSummary.paymentsCount, pg: pgSummary.paymentsCount },
      { name: 'Total Lift Records', sqlite: sqliteSummary.liftsCount, pg: pgSummary.liftsCount },
      { name: 'Total Chit Value', sqlite: sqliteSummary.totalChitValue, pg: pgSummary.totalChitValue },
      { name: 'Total Expected Lift Payouts', sqlite: sqliteSummary.totalExpectedLift, pg: pgSummary.totalExpectedLift },
      { name: 'Total Due Amounts', sqlite: sqliteSummary.totalDueAmount, pg: pgSummary.totalDueAmount },
      { name: 'Total Paid Amounts', sqlite: sqliteSummary.totalPaidAmount, pg: pgSummary.totalPaidAmount },
      { name: 'Total Payment Amounts', sqlite: sqliteSummary.totalPayments, pg: pgSummary.totalPayments },
      { name: 'Total Lift Received Amounts', sqlite: sqliteSummary.totalLiftReceived, pg: pgSummary.totalLiftReceived },
    ];

    let hasMismatch = false;
    for (const check of checks) {
      const match = check.sqlite === check.pg;
      const status = match ? 'PASS' : 'FAIL MISMATCH';
      console.log(`[${status}] ${check.name}: SQLite=${check.sqlite} vs PostgreSQL=${check.pg}`);
      if (!match) hasMismatch = true;
    }

    if (hasMismatch) {
      throw new Error('CRITICAL: Financial totals or record counts mismatch detected after migration! Investigation required.');
    }

    console.log('\n=== MIGRATION VERIFICATION COMPLETE: 100% MATCH ===\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    sqlite.close();
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('sqlite_to_postgres.ts')) {
  migrateSqliteToPostgres().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
