import { uid,nowIso } from '../core/utils.mjs'; import { requireFields } from '../core/validation.mjs'; import { NotFoundError } from '../core/errors.mjs';
export class WarrantyService {constructor(db,{activity}={}){this.db=db.db||db;this.activity=activity;}
 open(projectId,input){requireFields(input,['title']);const id=uid('war'),ts=nowIso();this.db.prepare(`INSERT INTO warranty_cases(id,project_id,handover_id,title,description,status,priority,reported_at) VALUES(?,?,?,?,?,?,?,?)`).run(id,projectId,input.handoverId||null,input.title,input.description||null,'OPEN',input.priority||'NORMAL',ts);this.activity?.add({projectId,eventType:'WARRANTY_OPENED',title:input.title});return this.get(id);}
 resolve(id,input){const w=this.get(id);if(!w)throw new NotFoundError('WARRANTY_NOT_FOUND');const ts=nowIso();this.db.prepare(`UPDATE warranty_cases SET status='RESOLVED',resolved_at=?,resolution=? WHERE id=?`).run(ts,input.resolution||null,id);this.activity?.add({projectId:w.project_id,eventType:'WARRANTY_RESOLVED',title:w.title});return this.get(id);}
 get(id){return this.db.prepare(`SELECT * FROM warranty_cases WHERE id=?`).get(id)||null;}
}
