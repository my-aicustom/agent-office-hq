import { sendJson,readJson,handleError,routeMatch } from './helpers.mjs';
export async function handleOperationsRoutes(req,res,{path,platform}){try{let m;
 if(path==='/api/pmo/suppliers'&&req.method==='POST'){sendJson(res,201,{status:'success',supplier:platform.procurement.addSupplier(await readJson(req))});return true;}
 if(path==='/api/pmo/materials'&&req.method==='POST'){sendJson(res,201,{status:'success',material:platform.procurement.addMaterial(await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/purchase-requests$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',request:platform.procurement.createRequest(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/purchase-requests\/([^/]+)\/items$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',item:platform.procurement.addRequestItem(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/purchase-orders$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',purchaseOrder:platform.procurement.createPO(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/production-jobs$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',job:platform.production.createJob(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/production-jobs\/([^/]+)\/steps$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',step:platform.production.addStep(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/production-jobs\/([^/]+)\/status$/);if(m&&req.method==='POST'){const b=await readJson(req);sendJson(res,200,{status:'success',job:platform.production.setJobStatus(m[0],b.status)});return true;}
 m=routeMatch(path,/^\/api\/pmo\/production-steps\/([^/]+)\/complete$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',step:platform.production.completeStep(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/qc$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',inspection:platform.quality.createInspection(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/qc-items\/([^/]+)$/);if(m&&req.method==='PATCH'){const b=await readJson(req);sendJson(res,200,{status:'success',item:platform.quality.setItem(m[0],b.status,b.note,b.evidence)});return true;}
 m=routeMatch(path,/^\/api\/pmo\/qc\/([^/]+)\/finalize$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',inspection:platform.quality.finalize(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/installations$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',installation:platform.installation.schedule(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/installations\/([^/]+)\/status$/);if(m&&req.method==='POST'){const b=await readJson(req);sendJson(res,200,{status:'success',installation:platform.installation.setStatus(m[0],b.status,b)});return true;}
 m=routeMatch(path,/^\/api\/pmo\/projects\/([^/]+)\/handovers$/);if(m&&req.method==='POST'){sendJson(res,201,{status:'success',handover:platform.installation.createHandover(m[0],await readJson(req))});return true;}
 m=routeMatch(path,/^\/api\/pmo\/handovers\/([^/]+)\/accept$/);if(m&&req.method==='POST'){sendJson(res,200,{status:'success',handover:platform.installation.acceptHandover(m[0],await readJson(req))});return true;}
 return false;}catch(error){handleError(res,error);return true;}}
