import { AUTONOMY_LEVELS } from './constants.mjs';
import { ForbiddenError } from './errors.mjs';
const RANK=Object.fromEntries(AUTONOMY_LEVELS.map((v,i)=>[v,i]));
export class AutonomyPolicy {
  constructor({ level=process.env.PMO_AUTONOMY_LEVEL || 'SUPERVISED', maxAutoSpend=Number(process.env.PMO_MAX_AUTO_SPEND || 0) }={}){ this.level=AUTONOMY_LEVELS.includes(level)?level:'SUPERVISED'; this.maxAutoSpend=maxAutoSpend; }
  canAuto(action,{amount=0,risk='LOW'}={}){ if(RANK[this.level]<RANK.SUPERVISED) return false; if(['HIGH','CRITICAL'].includes(risk)) return false; if(['PURCHASE','REFUND','DISCOUNT'].includes(action)&&Number(amount)>this.maxAutoSpend) return false; return this.level==='AUTONOMOUS'; }
  requireHuman(action,context={}){ return !this.canAuto(action,context); }
  assertMutationAllowed(actor={}){ if(actor.type==='AGENT' && this.level==='MANUAL') throw new ForbiddenError('AI mutations disabled by PMO autonomy policy'); }
}
