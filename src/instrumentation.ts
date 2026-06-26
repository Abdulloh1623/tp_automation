// Next.js server xatolarini bitta joyda ushlaydi: server component (render),
// route handler (route), server action (action) va middleware.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

type RequestInfo = { path?: string; method?: string };
type ErrorCtx = { routerKind?: string; routePath?: string; routeType?: string };

export async function onRequestError(
  error: unknown,
  request: RequestInfo,
  context: ErrorCtx,
): Promise<void> {
  // Dinamik import — bu modul edge'da ham yuklanishi mumkin, og'ir bog'liqliklarni lazy qilamiz.
  const { reportError } = await import("@/lib/error-report");
  await reportError(error, {
    source: "server",
    path: context?.routePath || request?.path,
    method: request?.method,
    routeType: context?.routeType,
  });
}
