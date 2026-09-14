import { nowIso, jsonStringify } from '../core/utils.mjs';
export class ActivityService {
 constructor(db){this.db=db.db||db;}
 add({projectId=null,eventType,title,body=null,actor='system',payload=null}){ this.db.prepare(`INSERT INTO activity_events(project_id,event_type,title,body,actor,payload_json,created_at) VALUES(?,?,?,?,?,?,?)`).run(projectId,eventType,title,body,actor,jsonStringify(payload),nowIso()); }
 list(projectId,{limit=100}={}){ return this.db.prepare(`SELECT * FROM activity_events WHERE project_id=? ORDER BY id DESC LIMIT ?`).all(projectId,Math.min(500,Number(limit)||100)); }
}
