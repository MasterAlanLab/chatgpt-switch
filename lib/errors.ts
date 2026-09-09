export class UserError extends Error {}

// Browser errors can contain cookie values. Only display messages we authored.
export function publicError(error: unknown): string {
  return error instanceof UserError
    ? error.message
    : '操作未完成，请检查扩展的站点访问权限后重试。';
}
