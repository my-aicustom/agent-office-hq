import { PmoPlatform } from '../pmo/platform.mjs';
const p=new PmoPlatform();
try{
 const project=p.projects.create({title:'Demo Kitchen Set BSD',clientName:'Demo Client',clientPhone:'081234567890',siteAddress:'BSD, Tangerang Selatan',source:'DEMO',scope:'Kitchen set custom plywood finishing HPL',contractValue:35000000});
 p.planning.addMilestone(project.id,{title:'Survey & Design',weight:15});
 p.planning.addMilestone(project.id,{title:'Production',weight:55});
 p.planning.addMilestone(project.id,{title:'Installation & Handover',weight:30});
 p.governance.addRisk(project.id,{title:'Material HPL selected stock risk',probability:.5,impact:.6,mitigation:'Confirm stock before DP release'});
 console.log(JSON.stringify({ok:true,project:p.projects.get(project.id)},null,2));
} finally { p.close(); }
