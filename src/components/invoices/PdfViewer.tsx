import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

interface Props {
  /** Direct blob URL or data URL */
  pdfUrl?: string;
  /** Supabase storage path — will be fetched via edge function */
  storagePath?: string;
  /** Attachment ID — will be fetched via edge function */
  attachmentId?: string;
}

export default function PdfViewer({ pdfUrl, storagePath, attachmentId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(pdfUrl || null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch PDF via edge function to avoid Chrome blocking
  useEffect(() => {
    if (pdfUrl) {
      setBlobUrl(pdfUrl);
      return;
    }

    if (!storagePath && !attachmentId) {
      setLoading(false);
      setError("No PDF source");
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function fetchViaProxy() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke("serve-attachment", {
          body: { storagePath, attachmentId },
        });

        if (cancelled) return;

        if (fnError || !data?.base64) {
          setError(fnError?.message || data?.error || "Failed to fetch PDF");
          setLoading(false);
          return;
        }

        // Convert base64 to blob URL
        const byteChars = atob(data.base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: data.mimeType || "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to fetch PDF");
          setLoading(false);
        }
      }
    }

    fetchViaProxy();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfUrl, storagePath, attachmentId]);

  // Render a page to canvas
  const renderPage = useCallback(async (pdf: any, num: number) => {
    const page = await pdf.getPage(num);
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

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

  // Load PDF with PDF.js once we have a blob URL
  useEffect(() => {
    if (!blobUrl) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const pdf = await pdfjsLib.getDocument(blobUrl!).promise;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPageNum(1);
        // Small delay to ensure canvas is mounted
        requestAnimationFrame(async () => {
          if (!cancelled) {
            await renderPage(pdf, 1);
            setLoading(false);
          }
        });
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to render PDF");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [blobUrl, renderPage]);

  // Re-render on page change
  useEffect(() => {
    if (pdfDocRef.current && pageNum > 0 && !loading) {
      renderPage(pdfDocRef.current, pageNum);
    }
  }, [pageNum, renderPage, loading]);

  const handleDownload = () => {
    if (blobUrl) window.open(blobUrl, "_blank");
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
          {blobUrl && (
            <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" /> Download PDF
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-secondary/20 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={pageNum <= 1}
            onClick={() => setPageNum(p => Math.max(1, p - 1))}>
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">Page {pageNum} of {totalPages}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={pageNum >= totalPages}
            onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-auto bg-secondary/10 flex justify-center p-4">
        <canvas ref={canvasRef} className="shadow-md rounded bg-white" />
      </div>

      <div className="px-3 py-1.5 border-t border-border/30 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 w-full" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" /> Download PDF
        </Button>
      </div>
    </div>
  );
}
