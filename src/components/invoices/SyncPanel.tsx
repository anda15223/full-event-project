import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, Mail, FileText, AlertTriangle, CheckCircle2,
  Calendar, Loader2, Play, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLatestSyncJob, useStartSync, type SyncJob } from "@/hooks/useSyncJobs";
import { toast } from "sonner";

function SyncSetupModal({ onClose, onStart }: { onClose: () => void; onStart: (from: string, to: string) => void }) {
  const [syncFrom, setSyncFrom] = useState("2026-01-01");
  const [syncTo, setSyncTo] = useState(new Date().toISOString().split("T")[0]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl border border-border/40 bg-card p-6 shadow-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-agent-green" />
          <h3 className="font-heading font-semibold text-foreground">Reconcile email history</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary/60">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        The system will read your inbox and extract all invoices found in the selected date range.
        Emails are processed 5 at a time.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">From date</label>
          <Input
            type="date"
            value={syncFrom}
            onChange={(e) => setSyncFrom(e.target.value)}
            className="rounded-xl"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">To date</label>
          <Input
            type="date"
            value={syncTo}
            onChange={(e) => setSyncTo(e.target.value)}
            className="rounded-xl"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1 rounded-xl bg-agent-green hover:bg-agent-green/90 text-white gap-2"
          onClick={() => onStart(syncFrom, syncTo)}
        >
          <Play className="h-4 w-4" /> Start reconciliation
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}

function SyncProgressPanel({ job }: { job: SyncJob }) {
  const pct = job.total_emails_found > 0
    ? Math.round((job.total_processed / job.total_emails_found) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-agent-green/20 bg-agent-green/5 p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="h-4 w-4 text-agent-green animate-spin" />
        <span className="text-xs font-semibold tracking-wider uppercase text-agent-green">
          Reading your inbox — {job.sync_from} to {job.sync_to}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-secondary/40 rounded-full h-2.5 mb-3 overflow-hidden">
        <motion.div
          className="bg-agent-green h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-3">
        <div>
          <div className="text-lg font-bold text-foreground">{job.current_batch}/{job.total_batches}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Batch</div>
        </div>
        <div>
          <div className="text-lg font-bold text-foreground">{job.total_processed}/{job.total_emails_found}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Emails</div>
        </div>
        <div>
          <div className="text-lg font-bold text-agent-green">{job.total_invoices_extracted}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Invoices</div>
        </div>
        <div>
          <div className="text-lg font-bold text-muted-foreground">{job.total_skipped}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Skipped</div>
        </div>
      </div>

      {job.current_subject && (
        <div className="text-xs text-muted-foreground truncate">
          Currently reading: <span className="font-medium text-foreground">"{job.current_subject}"</span>
        </div>
      )}
    </motion.div>
  );
}

function SyncCompleteSummary({ job, onRunAgain }: { job: SyncJob; onRunAgain: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-success/20 bg-success/5 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <h3 className="font-heading font-semibold text-foreground">Reconciliation complete</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Period: {job.sync_from} — {job.sync_to}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-4">
        <div className="bg-card rounded-xl p-3 border border-border/30">
          <div className="text-xl font-bold text-foreground">{job.total_emails_found}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Emails read</div>
        </div>
        <div className="bg-card rounded-xl p-3 border border-border/30">
          <div className="text-xl font-bold text-agent-green">{job.total_invoices_extracted}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Invoices found</div>
        </div>
        <div className="bg-card rounded-xl p-3 border border-border/30">
          <div className="text-xl font-bold text-muted-foreground">{job.total_skipped}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Skipped</div>
        </div>
        <div className="bg-card rounded-xl p-3 border border-border/30">
          <div className="text-xl font-bold text-foreground">
            {job.total_emails_found - job.total_invoices_extracted - job.total_skipped}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase">Non-invoices</div>
        </div>
      </div>
      {job.completed_at && (
        <p className="text-[10px] text-muted-foreground mb-3">
          Completed at {new Date(job.completed_at).toLocaleString("da-DK")}
        </p>
      )}
      <Button
        variant="outline"
        className="rounded-xl text-xs gap-1.5"
        onClick={onRunAgain}
      >
        <RefreshCw className="h-3 w-3" /> Run again
      </Button>
    </motion.div>
  );
}

export default function SyncPanel() {
  const [showSetup, setShowSetup] = useState(false);
  const { data: latestJob, isLoading } = useLatestSyncJob();
  const startSync = useStartSync();

  const handleStart = (syncFrom: string, syncTo: string) => {
    setShowSetup(false);
    startSync.mutate(
      { sync_from: syncFrom, sync_to: syncTo, batch_size: 5 },
      {
        onError: (err) => toast.error(`Sync failed: ${err.message}`),
      },
    );
  };

  // Determine what to show
  const isRunning = latestJob?.status === "running";
  const isComplete = latestJob?.status === "completed";

  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait">
        {isRunning && latestJob && (
          <SyncProgressPanel key="progress" job={latestJob} />
        )}

        {isComplete && latestJob && !showSetup && (
          <SyncCompleteSummary
            key="complete"
            job={latestJob}
            onRunAgain={() => setShowSetup(true)}
          />
        )}

        {showSetup && (
          <SyncSetupModal
            key="setup"
            onClose={() => setShowSetup(false)}
            onStart={handleStart}
          />
        )}
      </AnimatePresence>

      {/* Show sync button when no job exists or not in setup/running */}
      {!isRunning && !showSetup && !isComplete && (
        <Button
          variant="outline"
          className="rounded-xl text-xs gap-1.5 h-9 border-agent-green/30 text-agent-green hover:bg-agent-green/10"
          onClick={() => setShowSetup(true)}
        >
          <Mail className="h-3.5 w-3.5" /> Sync emails
        </Button>
      )}

      {/* Small "Sync emails" button when complete summary is showing */}
      {isComplete && !showSetup && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl text-xs gap-1.5 h-8"
          onClick={() => setShowSetup(true)}
        >
          <Mail className="h-3 w-3" /> New sync
        </Button>
      )}
    </div>
  );
}
