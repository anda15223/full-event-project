import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

interface Props {
  pdfUrl: string;
}

export default function PdfViewer({ pdfUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const renderPage = useCallback(async (pdf: any, num: number) => {
    const page = await pdf.getPage(num);
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Scale to fit container width with some padding
    const containerWidth = container.clientWidth - 32;
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(containerWidth / unscaledViewport.width, 2);
    const viewport = page.getViewport({ scale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: canvas.getContext("2d")!,
      viewport,
    }).promise;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPageNum(1);
        await renderPage(pdf, 1);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Failed to load PDF");
        setLoading(false);
      }
    }

    if (pdfUrl) loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl, renderPage]);

  // Re-render when page changes
  useEffect(() => {
    if (pdfDocRef.current && pageNum > 0) {
      renderPage(pdfDocRef.current, pageNum);
    }
  }, [pageNum, renderPage]);

  const handleDownload = () => {
    window.open(pdfUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs">Loading PDF…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <p className="text-sm font-medium">Could not render PDF</p>
          <p className="text-xs text-muted-foreground/70">{error}</p>
          <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" /> Download PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Page controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-secondary/20 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            disabled={pageNum <= 1}
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {pageNum} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            disabled={pageNum >= totalPages}
            onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-secondary/10 flex justify-center p-4">
        <canvas ref={canvasRef} className="shadow-md rounded bg-white" />
      </div>

      {/* Download */}
      <div className="px-3 py-1.5 border-t border-border/30 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 w-full" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" /> Download PDF
        </Button>
      </div>
    </div>
  );
}
