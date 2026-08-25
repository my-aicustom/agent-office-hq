export const GILANG_PERMISSIONS = Object.freeze([
  'READ_BUILD_ARTIFACTS',
  'VALIDATE_STATIC_BUILD',
  'VERIFY_SITEMAP',
  'TRIGGER_BUILD',
  'PURGE_CACHE',
  'READ_DEPLOY_LOGS'
]);

export const GILANG_DENIED_CAPABILITIES = Object.freeze([
  'DELETE_DEPLOYMENT',
  'CHANGE_DNS_RECORDS',
  'ROTATE_API_TOKENS',
  'MERGE_PR',
  'DEPLOY_PRODUCTION_WITHOUT_VALIDATION'
]);

export const GILANG_IDENTITY = Object.freeze({
  id: 'devops-deployer-g',
  name: 'Gilang',
  avatar: '🛠️',
  color: '#00c2ff',
  version: '1.0.0',
  role: 'DevOps & Server Deployer',
  goal: 'Validate static builds, verify sitemaps, and safely roll out deployments across environments while keeping an accurate deploy history.',
  mode: 'DETERMINISTIC_RULE_ENGINE',
  permissions: GILANG_PERMISSIONS,
  deniedCapabilities: GILANG_DENIED_CAPABILITIES
});

export const DEPLOY_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  BUILDING: 'BUILDING',
  VALIDATING: 'VALIDATING',
  DEPLOYING: 'DEPLOYING',
  LIVE: 'LIVE',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK'
});

export const TARGET_ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: 'DEVELOPMENT',
  STAGING: 'STAGING',
  PRODUCTION: 'PRODUCTION'
});

export const DATA_STATUSES = Object.freeze({
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  MANUAL: 'MANUAL',
  DERIVED: 'DERIVED',
  UNAVAILABLE: 'UNAVAILABLE'
});
