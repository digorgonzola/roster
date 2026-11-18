/** Base for errors whose status and code are safe to return to the client. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class AuthError extends AppError {
  constructor(status: 401 | 403) {
    super(status, status === 401 ? 'AUTH_MISSING_TOKEN' : 'AUTH_FORBIDDEN', status === 401 ? 'Sign-in required' : 'Not allowed')
    this.name = 'AuthError'
  }
}

/** A state-changing request (or socket) that a browser sent from another site. */
export class CrossSiteRequestError extends AppError {
  constructor(readonly fetchSite: string) {
    super(403, 'AUTH_CROSS_SITE', 'Not allowed')
    this.name = 'CrossSiteRequestError'
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(readonly contentType: string) {
    super(415, 'VALIDATION_UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json')
    this.name = 'UnsupportedMediaTypeError'
  }
}

export class ValidationError extends AppError {
  constructor(readonly field: string) {
    super(400, 'VALIDATION_BAD_REQUEST', `Invalid ${field}`)
    this.name = 'ValidationError'
  }
}

/** Also used for rows of another household, so ids never leak (404, never 403). */
export class NotFoundError extends AppError {
  constructor(readonly resource: string) {
    super(404, 'NOT_FOUND_RESOURCE', 'Not found')
    this.name = 'NotFoundError'
  }
}

export class AlreadyMemberError extends AppError {
  constructor(readonly email: string) {
    super(409, 'CONFLICT_ALREADY_MEMBER', 'Already a member of this household')
    this.name = 'AlreadyMemberError'
  }
}

export class AlreadyInvitedError extends AppError {
  constructor(readonly email: string) {
    super(409, 'CONFLICT_ALREADY_INVITED', 'Already invited')
    this.name = 'AlreadyInvitedError'
  }
}

export class OnlyMemberError extends AppError {
  constructor(readonly householdId: string) {
    super(409, 'CONFLICT_ONLY_MEMBER', 'The only member cannot leave')
    this.name = 'OnlyMemberError'
  }
}

/** The client's pending ops belong to a household the person has left. */
export class HouseholdChangedError extends AppError {
  constructor(readonly sentHouseholdId: string) {
    super(409, 'CONFLICT_HOUSEHOLD_CHANGED', 'You moved to another household')
    this.name = 'HouseholdChangedError'
  }
}

/** Missing or invalid Worker configuration. Every API request fails closed with 500 until it is fixed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}
