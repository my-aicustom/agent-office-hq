import crypto from 'node:crypto';
export const nowIso = () => new Date().toISOString();
export const uid = (prefix='id') => `${prefix}_${crypto.randomUUID()}`;
export function normalizePhone(value='') { let s=String(value).trim().replace(/[^0-9+]/g,''); if(s.startsWith('0')) s=`62${s.slice(1)}`; if(s.startsWith('+')) s=s.slice(1); return s; }
export function jsonStringify(value, fallback='{}'){ try{return JSON.stringify(value ?? JSON.parse(fallback));}catch{return fallback;} }
export function jsonParse(value, fallback=null){ if(value==null||value==='') return fallback; try{return JSON.parse(value);}catch{return fallback;} }
export function clampNumber(value, min=0, max=Number.MAX_SAFE_INTEGER){ const n=Number(value); if(!Number.isFinite(n)) return min; return Math.max(min,Math.min(max,n)); }
export function slug(value=''){ return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }
export function money(value){ return Math.round((Number(value)||0)*100)/100; }
export function unique(items){ return [...new Set(items.filter(Boolean))]; }
