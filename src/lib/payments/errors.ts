// SECURITY_RULES applied in this file:
//   Rule 11: collect minimum PII — error messages never echo card data or full payer details
//   Rule 12: no CVV, PAN, or track-data references

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number = 500,
  ) {
    super(message)
    this.name = 'PaymentError'
  }
}

export class SubscriptionConflictError extends PaymentError {
  constructor(businessId: string) {
    super(
      `Business ${businessId} already has an active subscription.`,
      'SUBSCRIPTION_ALREADY_ACTIVE',
      409,
    )
  }
}

export class PlanNotFoundError extends PaymentError {
  constructor(planId: string) {
    super(`Plan ${planId} not found or inactive.`, 'PLAN_NOT_FOUND', 404)
  }
}

export class WebhookSignatureError extends PaymentError {
  constructor() {
    super('Webhook signature verification failed.', 'INVALID_WEBHOOK_SIGNATURE', 401)
  }
}

export class WebhookTimestampError extends PaymentError {
  constructor() {
    super('Webhook timestamp outside acceptable window.', 'WEBHOOK_TIMESTAMP_EXPIRED', 401)
  }
}

export class MercadoPagoApiError extends PaymentError {
  constructor(message: string) {
    super(message, 'MP_API_ERROR', 502)
  }
}

export class MercadoPagoPayerSiteError extends PaymentError {
  constructor() {
    super(
      'El email ingresado no corresponde a una cuenta de Mercado Pago Chile. Usa el email con el que entras a Mercado Pago.',
      'MP_PAYER_SITE_MISMATCH',
      422,
    )
  }
}
