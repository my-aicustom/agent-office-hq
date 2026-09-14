import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { FULL_SCHEMA } from './schema.mjs';
import { nowIso } from '../core/utils.mjs';
export class PmoDatabase {
  constructor({ dbPath=process.env.PMO_DB_PATH || path.resolve('data/pmo/pmo.db') }={}){
    this.dbPath=dbPath; if(dbPath!==':memory:') fs.mkdirSync(path.dirname(dbPath),{recursive:true});
    this.db=new DatabaseSync(dbPath); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(FULL_SCHEMA); this.db.prepare(`INSERT INTO pmo_meta(key,value,updated_at) VALUES('schema_version','1',?) ON CONFLICT(key) DO UPDATE SET updated_at=excluded.updated_at`).run(nowIso());
  }
  transaction(fn){ this.db.exec('BEGIN IMMEDIATE'); try{ const out=fn(this.db); this.db.exec('COMMIT'); return out; }catch(e){ try{this.db.exec('ROLLBACK');}catch{} throw e; } }
  close(){ this.db.close(); }
}
