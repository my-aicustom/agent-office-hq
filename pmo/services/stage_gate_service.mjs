import { ConflictError } from '../core/errors.mjs';
export class StageGateService {constructor(db){this.db=db.db||db;}
 check(projectId,toStage){const c=[];if(toStage==='DP_RECEIVED'){const paid=this.db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE project_id=? AND status='PAID' AND type='DP'`).get(projectId).v;if(paid<=0)c.push('DP payment has not been recorded');}
 if(toStage==='PRODUCTION'){const p=this.db.prepare(`SELECT stage FROM projects WHERE id=?`).get(projectId);if(!['DP_RECEIVED','PROCUREMENT','PRODUCTION'].includes(p?.stage))c.push('Project is not financially released for production');}
 if(toStage==='DELIVERY_READY'){const qc=this.db.prepare(`SELECT COUNT(*) c FROM qc_inspections WHERE project_id=? AND status='PASS'`).get(projectId).c;if(!qc)c.push('No passed QC inspection');}
 if(toStage==='CLOSED'){const ho=this.db.prepare(`SELECT COUNT(*) c FROM handovers WHERE project_id=? AND status='ACCEPTED'`).get(projectId).c;if(!ho)c.push('Handover is not accepted');}
 return c;}
 assert(projectId,toStage){const failures=this.check(projectId,toStage);if(failures.length)throw new ConflictError('Stage gate rejected',{toStage,failures});return true;}
}
