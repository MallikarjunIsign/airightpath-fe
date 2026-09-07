/**
 * Full-page placeholder shown while the session is being restored, so a
 * refresh never flashes the signed-out version of a page before the redirect.
 */
export function AuthLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--textSecondary)] text-sm">Loading...</p>
      </div>
    </div>
  );
}
