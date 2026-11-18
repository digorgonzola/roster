export class AuthError extends Error {
  readonly code: string

  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'Sign-in required' : 'Not allowed')
    this.name = 'AuthError'
    this.code = status === 401 ? 'AUTH_MISSING_TOKEN' : 'AUTH_FORBIDDEN'
  }
}

/** Missing or invalid Worker configuration. Every API request fails closed with 500 until it is fixed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** A state-changing request (or socket) that a browser sent from another site. */
export class CrossSiteRequestError extends Error {
  readonly status = 403
  readonly code = 'AUTH_CROSS_SITE'

  constructor(readonly fetchSite: string) {
    super('Not allowed')
    this.name = 'CrossSiteRequestError'
  }
}

export class UnsupportedMediaTypeError extends Error {
  readonly status = 415
  readonly code = 'VALIDATION_UNSUPPORTED_MEDIA_TYPE'

  constructor(readonly contentType: string) {
    super('Send the request body as application/json')
    this.name = 'UnsupportedMediaTypeError'
  }
}
