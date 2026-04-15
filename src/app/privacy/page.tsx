import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Avalon",
};

const EFFECTIVE_DATE = "April 10, 2026";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="text-sm text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Finn Cotton</p>
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">Privacy Policy</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-2">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-gray max-w-none text-[var(--color-text-secondary)] space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">1. About This Policy</h2>
            <p>
              This Privacy Policy describes how Finn Cotton (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or
              &ldquo;us&rdquo;) collects, uses, and protects information in connection with{" "}
              <strong>Avalon</strong>, an internal business operations platform used exclusively by
              authorised employees and contractors of Finn Cotton.
            </p>
            <p className="mt-2">
              Avalon is not a consumer-facing product. Access is restricted to invited internal
              users only. By using Avalon, you agree to the practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">2. Information We Collect</h2>
            <p>We collect the following categories of information:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>
                <strong>Account information</strong> — name and work email address used to
                authenticate internal users via Supabase.
              </li>
              <li>
                <strong>TikTok account data</strong> — when a user connects a TikTok account via
                OAuth, we receive and store the account&apos;s display name, unique open ID, and
                OAuth tokens (access token and refresh token). We do not receive or store TikTok
                passwords.
              </li>
              <li>
                <strong>TikTok content statistics</strong> — view counts, like counts, comment
                counts, and share counts for videos published on the connected TikTok account.
                This data is used solely for internal analytics reporting.
              </li>
              <li>
                <strong>Social media analytics</strong> — aggregate page metrics (reach,
                impressions, follower counts) from connected Facebook, Instagram, and YouTube
                accounts, retrieved via their respective official APIs.
              </li>
              <li>
                <strong>Usage data</strong> — standard server logs including IP addresses,
                request timestamps, and page routes visited. This data is used for security and
                debugging purposes only.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">3. How We Use Information</h2>
            <p>All information collected through Avalon is used exclusively for internal business purposes:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Displaying social media performance dashboards to internal team members</li>
              <li>Generating KPI reports for marketing and creative departments</li>
              <li>Automating data collection to reduce manual reporting overhead</li>
              <li>Maintaining secure access and auditing user activity within the platform</li>
            </ul>
            <p className="mt-2">
              We do not use collected data for advertising, profiling, or any purpose outside of
              internal operations.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">4. TikTok API Data</h2>
            <p>
              Avalon integrates with the TikTok Display API to retrieve video performance statistics
              for TikTok accounts owned and operated by Finn Cotton. Specifically, we access:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Basic user profile information (<code>user.info.basic</code>)</li>
              <li>Account-level statistics (<code>user.info.stats</code>)</li>
              <li>Video list and per-video engagement metrics (<code>video.list</code>)</li>
            </ul>
            <p className="mt-2">
              This data is accessed only for accounts explicitly connected by an authorised Finn
              Cotton administrator. TikTok data is stored in a private database and is never shared
              with third parties, sold, or used outside of internal reporting.
            </p>
            <p className="mt-2">
              You may disconnect a TikTok account at any time via the Avalon platform settings or
              by revoking access directly through your{" "}
              <a
                href="https://www.tiktok.com/settings/connected-apps"
                className="text-[var(--color-accent)] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                TikTok connected apps settings
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">5. Data Sharing</h2>
            <p>
              We do not sell, rent, or share personal data with third parties for commercial
              purposes. Data may be shared with:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>
                <strong>Supabase</strong> — our database and authentication provider, which stores
                application data on secure infrastructure.
              </li>
              <li>
                <strong>Vercel</strong> — our hosting provider, which processes web requests to
                serve the Avalon platform.
              </li>
              <li>
                <strong>Law enforcement or regulators</strong> — where required by applicable law.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">6. Data Retention</h2>
            <p>
              Social media statistics are retained for as long as the connected platform account
              remains active within Avalon. Internal user accounts are retained for the duration of
              employment or engagement with Finn Cotton. Data may be deleted upon written request to{" "}
              <a href="mailto:support@finncotton.com" className="text-[var(--color-accent)] hover:underline">
                support@finncotton.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">7. Security</h2>
            <p>
              All data is stored in encrypted databases hosted on Supabase. Access tokens for
              third-party platforms (TikTok, Meta, YouTube) are stored securely and are never
              exposed to the browser or frontend. Access to Avalon is restricted to authenticated
              internal users only.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">8. Your Rights</h2>
            <p>
              Internal users and individuals whose data appears in Avalon may request access to,
              correction of, or deletion of their data by contacting us at{" "}
              <a href="mailto:support@finncotton.com" className="text-[var(--color-accent)] hover:underline">
                support@finncotton.com
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The effective date at the top of
              this page will always reflect the most recent revision. Continued use of Avalon after
              an update constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">10. Contact</h2>
            <p>
              For any questions or concerns regarding this Privacy Policy, please contact us:
            </p>
            <address className="not-italic mt-2 text-[var(--color-text-secondary)]">
              <strong>Finn Cotton</strong><br />
              Unit 1, Delcon Residences<br />
              Don Jesus Blvd, Cupang<br />
              Muntinlupa, 1771 Metro Manila<br />
              Philippines<br />
              <a href="mailto:support@finncotton.com" className="text-[var(--color-accent)] hover:underline">
                support@finncotton.com
              </a>
            </address>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>© {new Date().getFullYear()} Finn Cotton. All rights reserved.</span>
          <a href="/terms" className="hover:text-[var(--color-text-secondary)]">Terms of Service →</a>
        </div>
      </div>
    </div>
  );
}
