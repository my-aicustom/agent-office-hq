const TEMPLATES={
 SURVEY_CONFIRMATION:'Halo {{client}}, jadwal survey proyek {{project}} kami konfirmasi pada {{schedule}}. Mohon pastikan akses lokasi tersedia. Terima kasih.',
 QUOTE_READY:'Halo {{client}}, penawaran untuk {{project}} sudah siap. Nilai penawaran {{amount}} dan berlaku sampai {{validUntil}}.',
 DP_REMINDER:'Halo {{client}}, pengingat DP proyek {{project}} sebesar {{amount}} agar jadwal produksi dapat kami kunci.',
 PRODUCTION_UPDATE:'Update proyek {{project}}: progres produksi saat ini {{progress}}%.',
 INSTALLATION_CONFIRMATION:'Halo {{client}}, pemasangan {{project}} dijadwalkan {{schedule}}. Tim kami akan menghubungi sebelum menuju lokasi.',
 HANDOVER_THANKS:'Terima kasih {{client}}. Proyek {{project}} telah diserahterimakan. Masa garansi berlaku sampai {{warrantyUntil}}.'
};
export class TemplateService {render(key,data={}){const tpl=TEMPLATES[key];if(!tpl)throw new Error(`UNKNOWN_TEMPLATE:${key}`);return tpl.replace(/{{(\w+)}}/g,(_,k)=>data[k]??`{{${k}}}`);} keys(){return Object.keys(TEMPLATES);} }
