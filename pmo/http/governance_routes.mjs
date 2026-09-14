import { sendJson,readJson,handleError,routeMatch } from './helpers.mjs';
export async function handleGovernanceRoutes(req,res,{path,platform}){try{let m;
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/risks$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',risk:platform.governance.addRisk(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/issues$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',issue:platform.governance.addIssue(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/decisions$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',decision:platform.governance.requestDecision(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/decisions\/([^/]+)\/decide$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',decision:platform.governance.decide(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/approvals$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',approval:platform.governance.requestApproval(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/approvals\/([^/]+)\/decision$/);if(m&&req.method==='POST'){const b=await readJson(req);sendJson(res,200,{status:'success',approval:platform.governance.decideApproval(m[0],b.status,b)});return true;}
 if(path==='/api/pmo/approvals/pending'&&req.method==='GET'){const approvals=platform.governance.pendingApprovals();sendJson(res,200,{status:'success',count:approvals.length,approvals});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/evidence$/);if(m&&req.method==='POST'){const b=await readJson(req);sendJson(res,201,{status:'success',evidence:platform.evidence.add({...b,projectId:m[0]})});return true;}
 return false;}catch(error){handleError(res,error);return true;}}
