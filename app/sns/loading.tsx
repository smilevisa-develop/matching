/** SNS の数字は外部 API を待つので、押したらすぐ開いて読み込み中を出す */
export default function SnsLoading() {
  return (
    <div className="space-y-6 p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">SNS</h1>
      <div className="flex items-center gap-3 text-sm text-[var(--color-text-dark)]" role="status">
        <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-gray-300 border-t-[var(--color-text-dark)]" />
        読み込み中…
      </div>
    </div>
  );
}
