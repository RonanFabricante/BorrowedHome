import { Nav } from "@/components/nav";
import { Card, CardContent } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-8 prose prose-slate max-w-none">
              <h1 className="text-4xl font-bold mb-2">BorrowedHome – Terms & Conditions</h1>
              <p className="text-sm text-muted-foreground mb-8">
                Last updated: January 7, 2026
              </p>

              <p className="mb-6">
                By creating an account or using BorrowedHome, you agree to the following Terms & Conditions. If you do not agree, you must not use the platform.
              </p>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">1. What BorrowedHome Is</h2>
                <p className="mb-4">
                  BorrowedHome is an <strong>online marketplace</strong> that connects hosts who make parts of their homes available for <strong>daytime use only</strong>, and guests who wish to book those spaces.
                </p>
                <p className="mb-4">BorrowedHome:</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Does <strong>not</strong> own, manage, inspect, or control any home</li>
                  <li>Is <strong>not</strong> a property manager, venue operator, or event organiser</li>
                  <li>Does <strong>not</strong> provide accommodation, lodging, or tenancy</li>
                </ul>
                <p>
                  BorrowedHome&apos;s role is limited to facilitating listings, bookings, and payments between users.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">2. No Overnight Stays or Accommodation</h2>
                <p className="mb-4">
                  All BorrowedHome bookings are strictly <strong>day use only</strong>.
                </p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Overnight stays are prohibited</li>
                  <li>Bookings do not create tenancy, lease, or accommodation rights</li>
                  <li>Guests must leave the property at the agreed end time</li>
                </ul>
                <p>
                  Any breach of this rule may result in account suspension or termination.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">3. User Responsibility and Assumption of Risk</h2>
                <p className="mb-4">You understand and agree that:</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Entering or allowing others into a private home carries inherent risks</li>
                  <li>BorrowedHome does <strong>not</strong> guarantee the condition, safety, legality, or suitability of any home or activity</li>
                  <li>You use the platform <strong>at your own risk</strong></li>
                </ul>
                <p>
                  To the maximum extent permitted by law, <strong>you voluntarily assume all risks</strong> arising from your use of BorrowedHome.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">4. Host Responsibilities</h2>
                <p className="mb-4">If you are a host, you confirm that:</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>You have the legal right to make the listed spaces available</li>
                  <li>Your listing information is accurate and not misleading</li>
                  <li>You comply with all applicable laws, insurance, strata, council, and safety requirements</li>
                  <li>You are responsible for the condition and safety of your home</li>
                </ul>
                <p>
                  BorrowedHome does not verify compliance and is not responsible for host omissions.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">5. Guest Responsibilities</h2>
                <p className="mb-4">If you are a guest, you agree to:</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Follow all house rules set by the host</li>
                  <li>Use the home only for the agreed purpose and time</li>
                  <li>Leave the home in the condition it was found</li>
                  <li>Be responsible for any damage, injury, or loss you cause</li>
                </ul>
                <p>
                  You are responsible for ensuring your activities are lawful and appropriate.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">6. House Rules and Conduct</h2>
                <p className="mb-4">Each listing includes specific house rules.</p>
                <p className="mb-4">By booking, you:</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Explicitly agree to comply with those rules</li>
                  <li>Accept that violations may result in removal, penalties, or account suspension</li>
                </ul>
                <p>
                  BorrowedHome is not responsible for enforcing house rules on-site.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">7. No Liability for Injuries, Loss, or Damages</h2>
                <p className="mb-4">
                  To the maximum extent permitted by law, BorrowedHome is <strong>not liable</strong> for:
                </p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Personal injury, illness, or death</li>
                  <li>Property damage or theft</li>
                  <li>Disputes between hosts and guests</li>
                  <li>Neighbour complaints or disturbances</li>
                  <li>Any indirect, incidental, or consequential loss</li>
                </ul>
                <p>
                  This applies whether the issue arises before, during, or after a booking.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">8. Indemnity (Very Important)</h2>
                <p className="mb-4">
                  You agree to <strong>indemnify and hold harmless</strong> BorrowedHome, its founders, employees, and partners from any claims, losses, damages, liabilities, or legal costs arising from:
                </p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Your use of the platform</li>
                  <li>Your listing or booking</li>
                  <li>Your breach of these Terms</li>
                  <li>Your interaction with another user</li>
                </ul>
                <p>
                  This clause survives termination of your account.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">9. Payments and Deposits</h2>
                <p className="mb-4">BorrowedHome facilitates payments between users.</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Any deposits are held to cover damage or rule breaches</li>
                  <li>BorrowedHome may deduct fees as disclosed</li>
                  <li>BorrowedHome is not responsible for payment disputes beyond platform processes</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">10. Platform Availability</h2>
                <p className="mb-4">
                  BorrowedHome is provided <strong>&quot;as is&quot; and &quot;as available.&quot;</strong>
                </p>
                <p className="mb-4">We do not guarantee:</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Continuous availability</li>
                  <li>Error-free operation</li>
                  <li>That listings will meet expectations</li>
                </ul>
                <p>
                  We may modify, suspend, or discontinue the platform at any time.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">11. Account Suspension or Termination</h2>
                <p className="mb-4">
                  BorrowedHome may suspend or terminate accounts if users:
                </p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                  <li>Breach these Terms</li>
                  <li>Violate house rules</li>
                  <li>Engage in unsafe or inappropriate behaviour</li>
                  <li>Expose the platform to legal or reputational risk</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">12. Limitation of Liability</h2>
                <p className="mb-4">
                  To the maximum extent permitted by law, BorrowedHome&apos;s total liability for any claim is limited to the <strong>fees paid to BorrowedHome for the relevant booking</strong>, or AUD $100 (or equivalent), whichever is lower.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">13. Governing Law</h2>
                <p>
                  These Terms are governed by the laws of New South Wales, Australia.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">14. Contact</h2>
                <p>
                  For questions about these Terms, contact:{" "}
                  <a href="mailto:hello@borrowedhome.app" className="text-primary hover:underline">
                    hello@borrowedhome.app
                  </a>
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
