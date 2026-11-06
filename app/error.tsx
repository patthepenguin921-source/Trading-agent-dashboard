"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card">
      <h3>Couldn&apos;t load data</h3>
      <p className="muted small">{error.message}</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
