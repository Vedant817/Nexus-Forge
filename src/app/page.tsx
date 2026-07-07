import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <section className="max-w-3xl mx-auto text-center mb-20">
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          Turn learning into <span className="text-primary">shipped proof-of-work</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
          Hermes Forge is an AI-native workflow operator that turns YouTube transcripts, blog posts, GitHub repos, PRs, 
          and AI coding-agent chats into executable build workflows, release-readiness reports, and portfolio-ready proof packs.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Start Building
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-6 py-3 text-base font-medium hover:bg-accent transition-colors"
          >
            View Projects
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto mb-20">
        <h2 className="text-2xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: "1", title: "Ingest", desc: "Add learning sources — YouTube transcripts, blog posts, Substack articles, AI-agent chat logs, GitHub repos, and PRs." },
            { step: "2", title: "Analyze", desc: "Five AI agents extract knowledge, analyze repo readiness, plan workflows, review release safety, and generate proof packs." },
            { step: "3", title: "Ship", desc: "Export executable workflows with copyable AI prompts, release-readiness reports, and portfolio-ready proof-of-work documentation." },
          ].map((item) => (
            <div key={item.step} className="text-center p-6 rounded-lg border bg-card">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center mx-auto mb-4">
                {item.step}
              </div>
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto mb-20">
        <h2 className="text-2xl font-bold text-center mb-8">What Makes Hermes Forge Different</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { title: "Full Journey, Not Just Code", desc: "Code review tools check a PR. Hermes Forge checks the whole builder journey — learning, implementation, release readiness, and portfolio proof." },
            { title: "Evidence-Based Scoring", desc: "No fake scores. Every score is computed from actual evidence — README quality, tests, architecture, CI/CD, security hygiene." },
            { title: "Copyable Agent Prompts", desc: "Every workflow task includes a copyable AI agent prompt that coding agents like Claude Code, Codex, and Cursor can use directly." },
            { title: "Portfolio-Ready Output", desc: "Export proof packs with resume bullets, demo scripts, interview explanations, and LinkedIn posts — ready for hiring." },
          ].map((item) => (
            <div key={item.title} className="p-5 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
