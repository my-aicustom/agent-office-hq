import { uid,nowIso,jsonStringify } from '../core/utils.mjs';
export class WebhookService {constructor(db){this.db=db.db||db;}
 begin({provider,externalId=null,eventType=null,payload}){if(externalId){const old=this.db.prepare(`SELECT * FROM webhook_events WHERE provider=? AND external_id=?`).get(provider,externalId);if(old)return {event:old,duplicate:true};}const id=uid('wh'),ts=nowIso();this.db.prepare(`INSERT INTO webhook_events(id,provider,external_id,event_type,payload_json,status,received_at) VALUES(?,?,?,?,?,?,?)`).run(id,provider,externalId,eventType,jsonStringify(payload),'RECEIVED',ts);return {event:this.get(id),duplicate:false};}
 done(id){this.db.prepare(`UPDATE webhook_events SET status='PROCESSED',processed_at=?,error=NULL WHERE id=?`).run(nowIso(),id);return this.get(id);}
 fail(id,error){this.db.prepare(`UPDATE webhook_events SET status='FAILED',processed_at=?,error=? WHERE id=?`).run(nowIso(),String(error?.message||error),id);return this.get(id);}
 get(id){return this.db.prepare(`SELECT * FROM webhook_events WHERE id=?`).get(id)||null;}
}
