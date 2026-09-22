import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const backupDir = path.join(process.cwd(), 'data', 'backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const db = new Database(path.join(process.cwd(), 'data', 'chit_manager.db'), { readonly: true });
let sqlDump = `-- CHIT FUND MANAGER FULL DATABASE BACKUP DUMP\n-- Date: ${new Date().toISOString()}\n\n`;

const tables = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string; sql: string }[];

for (const t of tables) {
  sqlDump += `-- Schema for ${t.name}\n${t.sql};\n\n`;
  const rows = db.prepare(`SELECT * FROM ${t.name}`).all() as any[];
  if (rows.length > 0) {
    for (const r of rows) {
      const cols = Object.keys(r);
      const vals = Object.values(r).map(v => {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return v;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      sqlDump += `INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
    }
    sqlDump += '\n';
  }
}

const dumpPath = path.join(backupDir, 'chit_manager_backup_sqldump.sql');
fs.writeFileSync(dumpPath, sqlDump, 'utf8');
console.log('SQL dump written successfully. Size:', fs.statSync(dumpPath).size, 'bytes');
