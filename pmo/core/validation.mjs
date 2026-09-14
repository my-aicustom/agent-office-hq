import { ValidationError } from './errors.mjs';
export function requireFields(input, fields){ const missing=fields.filter((f)=>input?.[f]===undefined||input?.[f]===null||input?.[f]===''); if(missing.length) throw new ValidationError(`Missing required fields: ${missing.join(', ')}`,{missing}); }
export function assertEnum(value, allowed, field='value'){ if(!allowed.includes(value)) throw new ValidationError(`Invalid ${field}: ${value}`,{field,value,allowed}); return value; }
export function optionalString(value,{max=5000}={}){ if(value==null) return null; const s=String(value).trim(); if(s.length>max) throw new ValidationError(`String exceeds ${max} chars`); return s; }
export function positiveMoney(value, field='amount'){ const n=Number(value); if(!Number.isFinite(n)||n<0) throw new ValidationError(`${field} must be >= 0`); return Math.round(n*100)/100; }
