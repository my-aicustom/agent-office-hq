import { nowIso, jsonStringify } from '../core/utils.mjs';
export class AuditService {
 constructor(db){ this.db=db.db||db; }
 record({entityType,entityId=null,action,actor={type:'SYSTEM',id:'system'},before=null,after=null,metadata=null}){
  this.db.prepare(`INSERT INTO audit_events(entity_type,entity_id,action,actor_type,actor_id,before_json,after_json,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(entityType,entityId,action,actor.type||'SYSTEM',actor.id||null,jsonStringify(before),jsonStringify(after),jsonStringify(metadata),nowIso());
 }
 list(entityType,entityId,{limit=100}={}){ return this.db.prepare(`SELECT * FROM audit_events WHERE entity_type=? AND entity_id=? ORDER BY id DESC LIMIT ?`).all(entityType,entityId,Math.min(500,Number(limit)||100)); }
}
