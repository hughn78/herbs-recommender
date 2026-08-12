import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronDown, ExternalLink, FileText, Loader2, Search } from "lucide-react";
import { searchKbFn } from "@/lib/ingest.functions";
import {
  listDocumentSectionsFn,
  listSourceDocumentsFn,
  type SourceDocumentRow,
  type SourceSectionRow,
} from "@/lib/references.functions";

export const Route = createFileRoute("/app/references")({
  component: ReferencesPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
});

const SOURCE_LABEL: Record<string, string> = {
  TG: "Therapeutic Guidelines",
  AMH: "Australian Medicines Handbook",
  CMI: "Consumer Medicines Information",
  PI: "Product Information",
};

const ROLE_LABEL: Record<string, string> = {
  source_of_truth: "Source of truth",
  cross_check: "Cross-check",
  readability_cross_check: "Readability cross-check",
  archive_duplicate: "Archive duplicate",
};

function ReferencesPage() {
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">References</p>
        <h1 className="font-display text-3xl mt-1">Source material</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          The governed provenance chain behind every catalogue product: the source documents, the
          per-product monograph sections, and the page-level citations. Available to all pharmacy
          staff — ingestion controls remain administrator-only.
        </p>
      </header>

      <SourceLibrary />
      <KbSearch />
    </div>
  );
}

function SourceLibrary() {
  const listDocs = useServerFn(listSourceDocumentsFn);
  const docsQuery = useQuery({
    queryKey: ["source-documents"],
    queryFn: () => listDocs(),
    retry: false,
  });

  const [selected, setSelected] = useState<SourceDocumentRow | null>(null);

  if (docsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading source library…</p>;
  }
  if (docsQuery.isError) {
    return (
      <Card className="p-4 bg-amber-500/5 border-amber-500/20 text-sm">
        Source library unavailable ({(docsQuery.error as Error).message}). The governed catalogue
        migrations may not be applied yet — the knowledge search below still works.
      </Card>
    );
  }
  const docs = docsQuery.data ?? [];

  return (
    <section className="space-y-4">
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5" /> Source library · {docs.length} documents
      </h2>

      {docs.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          No source documents registered. Run the ingestion pipeline to register the corpus.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {docs.map((d) => (
          <button
            key={d.documentId}
            type="button"
            onClick={() => setSelected(selected?.documentId === d.documentId ? null : d)}
            className={`text-left rounded-lg border p-4 transition ${
              selected?.documentId === d.documentId
                ? "border-accent/40 bg-accent/5"
                : "border-hairline bg-card/60 hover:bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-base leading-snug">{d.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground font-mono truncate">
                  {d.corpusPath}
                </p>
              </div>
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              <Badge variant="secondary" className="uppercase tracking-wider">
                {d.format}
              </Badge>
              <Badge variant="secondary" className="uppercase tracking-wider">
                {ROLE_LABEL[d.role] ?? d.role}
              </Badge>
              {d.pageCount && (
                <Badge variant="secondary" className="uppercase tracking-wider">
                  {d.pageCount} pages
                </Badge>
              )}
              {d.sectionCount > 0 && (
                <Badge variant="secondary" className="uppercase tracking-wider">
                  {d.sectionCount} sections
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>

      {selected && <DocumentSections doc={selected} />}
    </section>
  );
}

function DocumentSections({ doc }: { doc: SourceDocumentRow }) {
  const listSections = useServerFn(listDocumentSectionsFn);
  const sectionsQuery = useQuery({
    queryKey: ["source-sections", doc.documentId],
    queryFn: () => listSections({ data: { documentId: doc.documentId } }),
  });
  const sections = sectionsQuery.data ?? [];

  return (
    <Card className="p-5 bg-card/60 backdrop-blur-sm space-y-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {doc.title} · {sections.length} product sections
      </p>
      {sectionsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Loading sections…</p>
      )}
      <div className="space-y-2">
        {sections.map((s) => (
          <SectionRow key={s.sectionId} section={s} />
        ))}
      </div>
    </Card>
  );
}

function SectionRow({ section }: { section: SourceSectionRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-hairline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 text-sm">
          <Link
            to="/app/products/$hogCode"
            params={{ hogCode: section.hogCode }}
            className="font-mono text-xs text-accent hover:underline underline-offset-2"
            onClick={(e) => e.stopPropagation()}
          >
            {section.hogCode}
          </Link>
          <span className="ml-2">{section.heading ?? "Product monograph"}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          {section.page ? `p. ${section.page}` : ""}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        </span>
      </button>
      {open && section.text && (
        <p className="px-3 pb-3 text-xs leading-relaxed text-foreground/80 whitespace-pre-line line-clamp-[12]">
          {section.text}
        </p>
      )}
    </div>
  );
}

function KbSearch() {
  const search = useServerFn(searchKbFn);
  const [q, setQ] = useState("");
  const mut = useMutation({
    mutationFn: (query: string) => search({ data: { query, limit: 25 } }),
  });

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) mut.mutate(q.trim());
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
        <Search className="h-3.5 w-3.5" /> Clinical knowledge search
      </h2>

      <form onSubmit={go} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. metformin renal dose, warfarin bleeding, statin myopathy"
            className="pl-9 h-11"
          />
        </div>
        <Button type="submit" disabled={mut.isPending} className="h-11 px-6">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Search"}
        </Button>
      </form>

      {mut.isError && (
        <div className="text-sm text-destructive" role="alert">
          {(mut.error as Error).message}
        </div>
      )}

      {mut.data && mut.data.results.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No matches. Confirm the knowledge base has been ingested in{" "}
          <span className="font-medium">Set-up</span>.
        </Card>
      )}

      <div className="space-y-3">
        {mut.data?.results.map((r) => (
          <Card key={r.chunk_id} className="p-5 bg-card/60 backdrop-blur-sm hover:bg-card transition">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="space-y-1 min-w-0">
                <div className="font-display text-base leading-snug truncate">
                  {r.title || r.section_heading || "Untitled"}
                </div>
                {r.section_heading && r.title && r.section_heading !== "(body)" && (
                  <div className="text-xs text-muted-foreground truncate">{r.section_heading}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  Tier {r.source_tier} · {SOURCE_LABEL[r.source] ?? r.source}
                </Badge>
                {r.source_url && (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line line-clamp-6">
              {r.text}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
