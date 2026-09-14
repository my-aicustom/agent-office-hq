export class PmoError extends Error {
  constructor(message, { code='PMO_ERROR', status=400, details=null } = {}) {
    super(message); this.name='PmoError'; this.code=code; this.status=status; this.details=details;
  }
}
export class NotFoundError extends PmoError { constructor(message='NOT_FOUND', details=null){ super(message,{code:'NOT_FOUND',status:404,details}); } }
export class ConflictError extends PmoError { constructor(message='CONFLICT', details=null){ super(message,{code:'CONFLICT',status:409,details}); } }
export class ValidationError extends PmoError { constructor(message='VALIDATION_ERROR', details=null){ super(message,{code:'VALIDATION_ERROR',status:422,details}); } }
export class ForbiddenError extends PmoError { constructor(message='FORBIDDEN', details=null){ super(message,{code:'FORBIDDEN',status:403,details}); } }
