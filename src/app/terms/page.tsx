import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Avalon",
};

const EFFECTIVE_DATE = "April 10, 2026";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="text-sm text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Finn Cotton</p>
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">Terms of Service</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-2">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-gray max-w-none text-[var(--color-text-secondary)] space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">1. Overview</h2>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of <strong>Avalon</strong>,
              an internal business operations platform operated by Finn Cotton
              (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;), accessible at{" "}
              <a href="https://avalon.finncotton.com" className="text-[var(--color-accent)] hover:underline">
                avalon.finncotton.com
              </a>
              .
            </p>
            <p className="mt-2">
              Avalon is a private, invitation-only tool used exclusively by authorised employees
              and contractors of Finn Cotton. By accessing or using Avalon, you confirm that you
              have been granted access by Finn Cotton and that you agree to be bound by these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">2. Eligibility</h2>
            <p>
              Access to Avalon is restricted to individuals who have been explicitly invited by
              Finn Cotton. Unauthorised access to this platform is strictly prohibited. If you have
              received access in error, you must cease use immediately and notify us at{" "}
              <a href="mailto:support@finncotton.com" className="text-[var(--color-accent)] hover:underline">
                support@finncotton.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">3. Permitted Use</h2>
            <p>You may use Avalon solely for legitimate internal business purposes authorised by Finn Cotton, including:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Viewing and managing internal content schedules and social media analytics</li>
              <li>Accessing KPI dashboards, reports, and business data relevant to your role</li>
              <li>Connecting and managing official Finn Cotton social media accounts for analytics purposes</li>
              <li>Collaborating on tasks, scheduling, and communications within the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">4. Prohibited Use</h2>
            <p>You must not:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Share your login credentials with any other person</li>
              <li>Attempt to access areas of the platform beyond your assigned permissions</li>
              <li>Use Avalon to access, extract, or store data for purposes outside your role at Finn Cotton</li>
              <li>Reverse-engineer, scrape, or copy any part of the platform</li>
              <li>Connect social media accounts that you do not own or are not authorised to manage on behalf of Finn Cotton</li>
              <li>Use the platform in any manner that violates applicable laws or the terms of third-party platforms (including TikTok, Meta, and YouTube)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">5. Third-Party Platform Integrations</h2>
            <p>
              Avalon integrates with third-party platforms including TikTok, Facebook, Instagram,
              and YouTube via their official APIs. When you connect a social media account, you
              authorise Avalon to retrieve data from that account on your behalf in accordance with
              each platform&apos;s terms and the permissions you grant during the OAuth flow.
            </p>
            <p className="mt-2">
              You are responsible for ensuring that you have the right to connect any social media
              account to Avalon. Connected accounts must belong to or be officially managed by
              Finn Cotton.
            </p>
            <p className="mt-2">
              You may revoke access to any connected account at any time through the platform
              settings or directly through the third-party platform&apos;s connected apps page.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">6. Confidentiality</h2>
            <p>
              Avalon contains confidential business information including financial KPIs, internal
              performance data, content strategies, and personnel information. All users agree to
              keep this information strictly confidential and not to disclose it to any external
              party without prior written authorisation from Finn Cotton.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">7. Intellectual Property</h2>
            <p>
              Avalon, including its design, code, and all content within it, is the property of
              Finn Cotton. No part of the platform may be reproduced, distributed, or used outside
              of its intended purpose without express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">8. Termination of Access</h2>
            <p>
              Finn Cotton reserves the right to suspend or terminate any user&apos;s access to
              Avalon at any time, with or without notice, particularly upon the end of employment
              or engagement, or in the event of a breach of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">9. Disclaimer of Warranties</h2>
            <p>
              Avalon is provided &ldquo;as is&rdquo; for internal use. While we make reasonable
              efforts to keep the platform operational and accurate, we make no warranties regarding
              uptime, data completeness, or fitness for any particular purpose.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">10. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Finn Cotton shall not be liable for any
              indirect, incidental, or consequential damages arising from your use of, or inability
              to use, Avalon. This includes any loss of data or business disruption.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Republic of the Philippines. Any disputes
              arising from these Terms shall be subject to the exclusive jurisdiction of the courts
              of Metro Manila, Philippines.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">12. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. The effective date at the top of this
              page will always reflect the most recent revision. Continued use of Avalon after an
              update constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">13. Contact</h2>
            <p>For any questions about these Terms, please contact us:</p>
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
          <a href="/privacy" className="hover:text-[var(--color-text-secondary)]">← Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
