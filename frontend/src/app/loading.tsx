export default function GlobalLoading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div
            className="absolute inset-0 rounded-full border-2 animate-spin"
            style={{
              borderColor: "rgba(76,141,246,0.15)",
              borderTopColor: "#4C8DF6",
            }}
          />
          <div
            className="absolute inset-1.5 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(76,141,246,0.1) 0%, transparent 70%)",
            }}
          />
        </div>
        <p
          className="text-xs font-mono tracking-widest uppercase"
          style={{ color: "rgba(76,141,246,0.4)" }}
        >
          Lädt…
        </p>
      </div>
    </div>
  );
}
