import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { FAQ_SECTIONS } from "@/lib/faq/content";
import { SupportContact } from "@/components/support-contact";

export const metadata: Metadata = {
  title: "FAQ — BorrowedHome",
  description:
    "How to book day-use homes, become a host, payments, and support on BorrowedHome.",
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="bh-micro mb-2 text-muted-foreground">help</p>
        <h1 className="font-display text-4xl font-bold lowercase tracking-tighter sm:text-5xl">
          faq
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          How BorrowedHome works — booking, hosting, payments, and getting help.
        </p>

        <nav
          aria-label="FAQ sections"
          className="mt-8 flex flex-wrap gap-2 border-b border-border pb-6"
        >
          {FAQ_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="bh-micro rounded-sm border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-14">
          {FAQ_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="font-display mb-6 text-2xl font-bold lowercase tracking-tighter">
                {section.title}
              </h2>
              <div className="divide-y divide-border border-y border-border">
                {section.items.map((item) => (
                  <details key={item.id} id={item.id} className="group scroll-mt-24">
                    <summary className="cursor-pointer list-none py-4 pr-8 text-left font-medium transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <span className="flex items-start justify-between gap-4">
                        <span>{item.question}</span>
                        <span
                          aria-hidden
                          className="bh-data shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </span>
                    </summary>
                    <div className="space-y-3 pb-5 text-sm leading-relaxed text-muted-foreground">
                      {item.answer.map((para) => (
                        <p key={para}>{para}</p>
                      ))}
                      {item.links && item.links.length > 0 && (
                        <ul className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                          {item.links.map((link) => (
                            <li key={link.href + link.label}>
                              {link.href.startsWith("mailto:") ? (
                                <a
                                  href={link.href}
                                  className="text-primary hover:underline"
                                >
                                  {link.label}
                                </a>
                              ) : (
                                <Link
                                  href={link.href}
                                  className="text-primary hover:underline"
                                >
                                  {link.label}
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 border-t border-border pt-8">
          <p className="bh-micro mb-2">still stuck?</p>
          <SupportContact />
        </div>
      </main>
    </div>
  );
}
