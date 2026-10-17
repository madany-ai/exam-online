/** أخطاء تطبيقية برسائل عربية آمنة للعرض (لا آثار مكدّس ولا أسرار). */

export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "العنصر غير موجود.") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

/** يُستخدم عند محاولة الوصول لمورد لا يملكه المستخدم. */
export class ForbiddenError extends AppError {
  constructor(message = "لا تملك صلاحية تنفيذ هذا الإجراء.") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** رسالة آمنة وواضحة لأي خطأ (تُستخدم في ردود الـ API والإجراءات). */
export function safeMessage(error: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى."): string {
  if (isAppError(error)) return error.message;
  return fallback;
}
