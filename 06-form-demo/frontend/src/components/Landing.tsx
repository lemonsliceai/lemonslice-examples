export function Landing() {
  return (
    <main className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
      <nav className="flex h-[82px] items-center justify-between px-12 py-5">
        <strong>Acme Education</strong>
        <div className="flex items-center gap-7 text-[15px] font-medium">
          <span>Products</span>
          <span>Solutions</span>
          <span>Pricing</span>
          <span className="rounded-lg border border-border px-4 py-2.5 text-[15px] font-medium">Sign in</span>
        </div>
      </nav>

      <section className="px-12 pt-12">
        <h1 className="m-0 max-w-[620px] text-[52px] font-bold leading-[1.05] tracking-tight">
          Training your teams shouldn&apos;t be this hard.
        </h1>
      </section>

      <section className="mt-12 flex min-h-0 w-full min-w-0 items-stretch border-t border-border">
        <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col px-12 pb-12">
          <p className="mt-[126px] text-[15px] leading-[1.45] text-muted">
            Acme Education is the operating layer for enterprise L&amp;D — from onboarding to compliance, built for teams that
            can&apos;t afford to slow down.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex h-[42px] cursor-pointer items-center justify-center rounded-lg border border-border bg-transparent px-4 text-[15px] font-semibold text-accent"
            >
              Book a demo
            </button>
            <button
              type="button"
              className="inline-flex h-[42px] cursor-pointer items-center justify-center rounded-lg border border-border bg-transparent px-4 text-[15px] font-semibold text-accent"
            >
              See case studies
            </button>
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col p-20 border-l border-border">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar border border-border">
            <div className="flex min-h-[98px] items-center gap-2 px-5 py-6">
              <span className="w-[90px] shrink-0 text-[36px] font-bold tracking-tight">40%</span>
              <span className="text-[15px] font-medium text-accent">faster onboarding on average</span>
            </div>
            <div className="h-px bg-black/[0.08]" />
            <div className="flex min-h-[98px] items-center gap-2 px-5 py-6">
              <span className="w-[90px] shrink-0 text-[36px] font-bold tracking-tight">98%</span>
              <span className="text-[15px] font-medium text-accent">compliance audit pass rate</span>
            </div>
            <div className="h-px bg-black/[0.08]" />
            <div className="flex min-h-[98px] items-center gap-2 px-5 py-6">
              <span className="w-[90px] shrink-0 text-[36px] font-bold tracking-tight">500+</span>
              <span className="text-[15px] font-medium text-accent">enterprise customers worldwide</span>
            </div>
          </div>
        </div>
      </section>

      <section className="flex border-t border-border">
        <div className="min-h-[274px] flex-1 border-r border-border p-12">
          <div className="mb-14 text-sm font-semibold tracking-[0.06em]">01</div>
          <h3 className="mb-3 text-[15px] font-semibold">LMS Integration</h3>
          <p className="m-0 text-[15px] leading-[1.45] text-muted">
            Connects to Workday, SAP, and 40+ platforms. No rip-and-replace required.
          </p>
        </div>
        <div className="min-h-[274px] flex-1 border-r border-border p-12">
          <div className="mb-14 text-sm font-semibold tracking-[0.06em]">02</div>
          <h3 className="mb-3 text-[15px] font-semibold">Live analytics</h3>
          <p className="m-0 text-[15px] leading-[1.45] text-muted">
            Completion rates, skill gaps, and ROI by team or role — updated in real time.
          </p>
        </div>
        <div className="min-h-[274px] flex-1 p-12">
          <div className="mb-14 text-sm font-semibold tracking-[0.06em]">03</div>
          <h3 className="mb-3 text-[15px] font-semibold">Compliance reports</h3>
          <p className="m-0 text-[15px] leading-[1.45] text-muted">
            Auto-generated, audit-ready. Never miss a certification window again.
          </p>
        </div>
      </section>

      <section className="flex justify-between gap-12 border-t border-border px-12 py-12">
        <blockquote className="m-0 max-w-[640px] text-[28px] font-semibold leading-tight tracking-tight">
          &quot;We cut onboarding time by 40% in the first quarter. The analytics alone justified the cost.&quot;
        </blockquote>
        <cite className="max-w-[220px] self-end text-right text-sm not-italic leading-normal text-muted">
          Daniel G.
          <br />
          VP People Ops, Stratos Group
          <br />
          3,200 employees
        </cite>
      </section>

      <footer className="border-t border-border px-12 pb-12 pt-14">
        <div className="flex flex-wrap justify-between gap-12 pb-12">
          <div className="max-w-[280px]">
            <strong className="text-[15px]">Acme Education</strong>
            <p className="mt-3 m-0 text-[15px] leading-[1.45] text-muted">
              Enterprise learning that keeps pace with how your business actually runs.
            </p>
          </div>
          <div className="flex flex-wrap gap-16 text-[15px]">
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Product</div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                <li>Platform overview</li>
                <li>Integrations</li>
                <li>Security</li>
              </ul>
            </div>
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Company</div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                <li>About</li>
                <li>Careers</li>
                <li>Contact</li>
              </ul>
            </div>
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Resources</div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                <li>Documentation</li>
                <li>Customer stories</li>
                <li>Status</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between pt-20 text-sm text-muted">
          <span>© {new Date().getFullYear()} Acme Education. All rights reserved.</span>
          <div className="flex flex-wrap gap-6">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Cookie settings</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
