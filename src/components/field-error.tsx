/** Maydon ostida ko'rsatiladigan validatsiya xatosi (forma UI). */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  );
}
