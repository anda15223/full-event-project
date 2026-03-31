import { useState, useRef } from "react";
import { Upload, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  invoiceId: string;
  onUploaded: (url: string) => void;
}

export default function PdfUploadButton({ invoiceId, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }

    setUploading(true);
    try {
      const path = `${invoiceId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("invoice-pdfs")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("invoice-pdfs")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from("invoices")
        .update({ pdf_url: publicUrl })
        .eq("id", invoiceId);

      if (updateError) throw updateError;

      onUploaded(publicUrl);
      toast.success("PDF uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        size="sm"
        variant="outline"
        className="rounded-xl text-xs gap-1.5 h-8"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Upload className="h-3 w-3" />
        )}
        {uploading ? "Uploading…" : "Attach PDF"}
      </Button>
    </>
  );
}
