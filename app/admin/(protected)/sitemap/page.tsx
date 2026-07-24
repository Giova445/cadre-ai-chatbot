import { requireAdmin } from "@/lib/admin/auth";
import { sitemapRepo } from "@/lib/ingest/sitemap-repo";
import { SitemapForm } from "../../_components/SitemapForm";
import { CrawlJobTable } from "../../_components/CrawlJobTable";
import { PageStatusTable } from "../../_components/PageStatusTable";
import styles from "../../admin.module.css";

const RECENT_JOBS_LIMIT = 20;

function refreshHref(client: string | undefined, jobId: string): string {
  const params = new URLSearchParams();
  params.set("job", jobId);
  if (client) params.set("client", client);
  return `/admin/sitemap?${params.toString()}`;
}

// Read-mostly sitemap-ingest screen (docs/product/admin-embed-and-sitemap.md
// § B, Phase 4). `?client` scopes the job list to a tenant (via the header
// ClientSelector, already global to the admin layout); `?job` additionally
// drills into one crawl job's per-URL status table — the core deliverable,
// not a single "done" indicator.
export default async function SitemapPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; job?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const client = sp.client || undefined;
  const jobId = sp.job || undefined;

  const jobs = await sitemapRepo.listJobs(client ?? null, RECENT_JOBS_LIMIT);
  const selectedJob = jobId ? await sitemapRepo.getJob(jobId) : null;
  const pages = selectedJob ? await sitemapRepo.listPages(selectedJob.id) : [];

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Sitemap ingest</h1>
        <p className={styles.pageSub}>
          Crawl a site's sitemap into the knowledge base
          {client ? ` · client: ${client}` : ""}
        </p>
      </div>

      <SitemapForm client={client} />

      <section className={styles.sitemapSection} aria-labelledby="recent-jobs-heading">
        <h2 id="recent-jobs-heading" className={styles.sitemapSectionTitle}>
          Recent crawl jobs
        </h2>
        {jobs.length === 0 ? (
          <p className={styles.emptyState}>No crawl jobs yet. Paste a sitemap URL above to start one.</p>
        ) : (
          <CrawlJobTable jobs={jobs} activeJobId={selectedJob?.id} client={client} />
        )}
      </section>

      {jobId && (
        <section className={styles.sitemapSection} aria-labelledby="job-detail-heading">
          <div className={styles.sitemapSectionHead}>
            <h2 id="job-detail-heading" className={styles.sitemapSectionTitle}>
              {selectedJob ? selectedJob.sitemapUrl : "Job not found"}
            </h2>
            {selectedJob && (
              // A plain anchor (not next/link) to the SAME url — clicking it
              // forces a real navigation/re-render even though the href is
              // identical, which is enough to watch a crawl's per-page
              // statuses progress from queued -> embedded/skipped/failed
              // without any client-side polling.
              <a href={refreshHref(client, jobId)} className={styles.cellLink}>
                Refresh
              </a>
            )}
          </div>
          {!selectedJob ? (
            <p className={styles.emptyState}>This crawl job could not be found.</p>
          ) : selectedJob.status !== "done" ? (
            <p className={styles.pageNote}>
              Crawling — {selectedJob.embedded + selectedJob.skipped + selectedJob.failed} of{" "}
              {selectedJob.discovered} pages processed so far. Use Refresh above to see progress.
            </p>
          ) : null}
          {pages.length === 0 ? (
            <p className={styles.emptyState}>No pages discovered yet for this job.</p>
          ) : (
            <PageStatusTable pages={pages} />
          )}
        </section>
      )}
    </div>
  );
}
