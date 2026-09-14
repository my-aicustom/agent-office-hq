import { uid,nowIso,jsonStringify,jsonParse } from '../core/utils.mjs';
export class AutomationService {constructor(db){this.db=db.db||db;}
 async run({projectId=null,adapter,action,input,execute}){const id=uid('run'),start=nowIso();this.db.prepare(`INSERT INTO automation_runs(id,project_id,adapter,action,status,input_json,started_at) VALUES(?,?,?,?,?,?,?)`).run(id,projectId,adapter,action,'RUNNING',jsonStringify(input),start);try{const output=await execute(input);this.db.prepare(`UPDATE automation_runs SET status='DONE',output_json=?,finished_at=? WHERE id=?`).run(jsonStringify(output),nowIso(),id);return {id,status:'DONE',output};}catch(error){this.db.prepare(`UPDATE automation_runs SET status='FAILED',error=?,finished_at=? WHERE id=?`).run(String(error.message||error),nowIso(),id);throw error;}}
 get(id){const r=this.db.prepare(`SELECT * FROM automation_runs WHERE id=?`).get(id);return r?{...r,input:jsonParse(r.input_json,{}),output:jsonParse(r.output_json,null)}:null;}
}
