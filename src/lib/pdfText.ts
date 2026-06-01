// Browser-side PDF text extraction using pdfjs-dist.
// Lazy-loaded to keep initial bundle small.

export async function extractPdfText(url: string): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min?url" as any)).default
    ?? (await import("pdfjs-dist/build/pdf.worker.min.js?url" as any)).default;
  if (workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const loadingTask = pdfjs.getDocument({ url });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ");
    pages.push(text);
  }
  return pages.join("\n\n");
}
