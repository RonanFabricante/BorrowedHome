import { Nav } from "@/components/nav";
import { Card, CardContent } from "@/components/ui/card";
import { guestTermsMarkdown } from "@/lib/legal/terms-au";

// Simple markdown renderer (safe, no HTML injection)
function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      // Empty line - flush current paragraph or list
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${listKey++}`} className="list-disc pl-6 mb-4 space-y-2">
            {listItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      if (currentParagraph.length > 0) {
        elements.push(
          <p key={`p-${i}`} className="mb-4">
            {currentParagraph.join(" ")}
          </p>
        );
        currentParagraph = [];
      }
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${listKey++}`} className="list-disc pl-6 mb-4 space-y-2">
            {listItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      if (currentParagraph.length > 0) {
        elements.push(
          <p key={`p-${i}`} className="mb-4">
            {currentParagraph.join(" ")}
          </p>
        );
        currentParagraph = [];
      }
      elements.push(
        <h1 key={`h1-${i}`} className="text-4xl font-bold mb-6 mt-8 first:mt-0">
          {line.substring(2)}
        </h1>
      );
      continue;
    }

    if (line.startsWith("## ")) {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${listKey++}`} className="list-disc pl-6 mb-4 space-y-2">
            {listItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      if (currentParagraph.length > 0) {
        elements.push(
          <p key={`p-${i}`} className="mb-4">
            {currentParagraph.join(" ")}
          </p>
        );
        currentParagraph = [];
      }
      elements.push(
        <h2 key={`h2-${i}`} className="text-2xl font-semibold mb-4 mt-8 first:mt-0">
          {line.substring(3)}
        </h2>
      );
      continue;
    }

    // List items
    if (line.startsWith("- ")) {
      if (currentParagraph.length > 0) {
        elements.push(
          <p key={`p-${i}`} className="mb-4">
            {currentParagraph.join(" ")}
          </p>
        );
        currentParagraph = [];
      }
      listItems.push(line.substring(2));
      continue;
    }

    // Regular paragraph text
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${listKey++}`} className="list-disc pl-6 mb-4 space-y-2">
          {listItems.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
    currentParagraph.push(line);
  }

  // Close any remaining elements
  if (listItems.length > 0) {
    elements.push(
      <ul key={`ul-${listKey++}`} className="list-disc pl-6 mb-4 space-y-2">
        {listItems.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );
  }
  if (currentParagraph.length > 0) {
    elements.push(
      <p key="p-final" className="mb-4">
        {currentParagraph.join(" ")}
      </p>
    );
  }

  return elements;
}

export default function GuestTermsPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-8 prose prose-slate max-w-none">
              {renderMarkdown(guestTermsMarkdown)}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
