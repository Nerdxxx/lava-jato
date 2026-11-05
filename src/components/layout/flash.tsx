export function Flash({ ok, erro }: { ok?: string | undefined; erro?: string | undefined }) {
  if (!ok && !erro) return null;
  return erro ? (
    <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
      {erro}
    </p>
  ) : (
    <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">
      {ok}
    </p>
  );
}
