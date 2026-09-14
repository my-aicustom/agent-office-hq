import crypto from 'node:crypto'; import { uid,nowIso,jsonStringify } from '../core/utils.mjs';
export class EvidenceService {constructor(db){this.db=db.db||db;}
 add(input){const id=uid('ev'),hash=input.bytes?crypto.createHash('sha256').update(input.bytes).digest('hex'):(input.sha256||null);this.db.prepare(`INSERT INTO evidence(id,project_id,entity_type,entity_id,kind,uri,sha256,metadata_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,input.projectId||null,input.entityType||null,input.entityId||null,input.kind||'DOCUMENT',input.uri||null,hash,jsonStringify(input.metadata),input.createdBy||null,nowIso());return this.db.prepare(`SELECT * FROM evidence WHERE id=?`).get(id);}
 list(projectId){return this.db.prepare(`SELECT * FROM evidence WHERE project_id=? ORDER BY created_at DESC`).all(projectId);}
}
