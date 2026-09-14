import { jsonParse } from '../core/utils.mjs';
export function rows(stmt, params=[]){ return stmt.all(...params); }
export function one(stmt, params=[]){ return stmt.get(...params) || null; }
export function decodeJsonFields(row, fields=[]){ if(!row) return row; const out={...row}; for(const f of fields) out[f]=jsonParse(out[f], null); return out; }
export function decodeMany(list, fields=[]){ return list.map((r)=>decodeJsonFields(r,fields)); }
export function placeholders(n){ return Array.from({length:n},()=>'?').join(','); }
