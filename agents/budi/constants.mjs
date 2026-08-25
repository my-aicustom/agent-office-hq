export const LEAD_STATUSES = Object.freeze({
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
  DUPLICATE: 'DUPLICATE'
});

export const LEAD_SOURCES = Object.freeze({
  WHATSAPP: 'WHATSAPP',
  WEBSITE_FORM: 'WEBSITE_FORM',
  TELEGRAM: 'TELEGRAM',
  INSTAGRAM: 'INSTAGRAM',
  MANUAL: 'MANUAL'
});

export const BUDI_PERMISSIONS = Object.freeze([
  'READ_LEADS',
  'CREATE_LEAD',
  'UPDATE_LEAD_STATUS',
  'READ_WHATSAPP_WEBHOOK',
  'DISPATCH_TELEGRAM_ALERT'
]);

export const BUDI_DENIED_CAPABILITIES = Object.freeze([
  'DELETE_LEAD',
  'SEND_WHATSAPP_MESSAGE',
  'EXPORT_CUSTOMER_DATA',
  'CHANGE_PRICING',
  'MERGE_PR',
  'DEPLOY_PRODUCTION'
]);

export const LEAD_VALIDATION_RULES = Object.freeze({
  requiredFields: ['name'],
  requiredContactFields: ['phone', 'email'],
  allowedSources: Object.values(LEAD_SOURCES),
  allowedStatuses: Object.values(LEAD_STATUSES)
});

export const DATA_STATUSES = Object.freeze({
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  MANUAL: 'MANUAL',
  DERIVED: 'DERIVED',
  UNAVAILABLE: 'UNAVAILABLE'
});

export const BUDI_IDENTITY = Object.freeze({
  id: 'lead-ops-b',
  name: 'Budi',
  avatar: '🧑‍💼',
  color: '#00ff9c',
  version: '1.0.0',
  role: 'Customer Success & Lead Ops Agent',
  goal: 'Capture every inbound lead (WhatsApp, website, manual) without loss, alert Bos in real time, and keep an accurate lead pipeline.',
  mode: 'DETERMINISTIC_RULE_ENGINE',
  permissions: BUDI_PERMISSIONS,
  deniedCapabilities: BUDI_DENIED_CAPABILITIES
});
