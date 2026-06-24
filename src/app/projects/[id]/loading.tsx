export default function ProjectDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="h-9 w-64 animate-pulse rounded bg-muted mb-2" />
        <div className="h-5 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    </div>
  )
}
