import { Button } from "@/components/ui/button";
import {
  Brain, FolderOpen, FileText, ListTodo, ClipboardList,
  Sparkles, ArrowRight, Zap, Shield, BarChart3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const agents = [
  {
    icon: Brain,
    title: "Email Memory Agent",
    description: "Learns and remembers every email — senders, companies, suppliers, topics, and deadlines become structured knowledge.",
    color: "text-agent-purple",
    bg: "bg-agent-purple/8 border-agent-purple/15",
  },
  {
    icon: FolderOpen,
    title: "Email Organizer Agent",
    description: "Classifies every email as invoice, task, waiting, information, or irrelevant — with company assignment and priority scoring.",
    color: "text-agent-teal",
    bg: "bg-agent-teal/8 border-agent-teal/15",
  },
  {
    icon: FileText,
    title: "Invoice Intelligence Agent",
    description: "Extracts supplier, amounts, VAT, due dates, and payment status from invoices and attachments automatically.",
    color: "text-agent-amber",
    bg: "bg-agent-amber/8 border-agent-amber/15",
  },
  {
    icon: ListTodo,
    title: "Task & Reply Agent",
    description: "Creates tasks from emails, tracks deadlines, drafts reply suggestions, and manages follow-up workflows.",
    color: "text-agent-rose",
    bg: "bg-agent-rose/8 border-agent-rose/15",
  },
  {
    icon: ClipboardList,
    title: "Non-Email Task Agent",
    description: "Manages manual and internal tasks — separate from email workflows, ready for future specialized agents.",
    color: "text-agent-blue",
    bg: "bg-agent-blue/8 border-agent-blue/15",
  },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/30 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <span className="font-heading font-bold text-base tracking-tight">AI Operations</span>
          </div>
          <Button onClick={() => navigate("/dashboard")} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 h-9 px-5 text-sm">
            Open Dashboard
            <ArrowRight className="h-3.5 w-3.5 ml-2" />
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-28 md:py-36">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/15">
              <div className="h-1.5 w-1.5 rounded-full bg-primary pulse-soft" />
              <span className="text-[11px] font-semibold text-primary tracking-wide uppercase">5 AI Agents Online</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-heading font-bold tracking-tight mb-6 leading-[1.1]">
              Your AI-Powered<br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Business Operations
              </span><br />
              Command Center
            </h1>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl leading-relaxed">
              Five specialized AI agents working together — email memory, classification, invoice extraction, task management, and operations.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={() => navigate("/dashboard")} size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 h-12 px-7">
                Enter Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button onClick={() => navigate("/agent/inbox")} size="lg" variant="outline" className="border-border/50 hover:border-primary/30 hover:bg-primary/5 h-12 px-7">
                View Agent Inbox
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Subtle gradient bg */}
        <div className="absolute inset-0 -z-10 gradient-mesh" />
      </section>

      {/* Agent Grid */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-heading font-bold mb-3">AI Agent Fleet</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">Five specialized agents operating your business email pipeline end-to-end</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className={`premium-card-hover p-6 border ${agent.bg}`}
            >
              <div className={`h-10 w-10 rounded-xl ${agent.bg} flex items-center justify-center mb-5`}>
                <agent.icon className={`h-5 w-5 ${agent.color}`} />
              </div>
              <h3 className="font-heading font-bold text-base mb-2">{agent.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features strip */}
      <section className="border-t border-border/30 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 text-center">
            {[
              { icon: Zap, label: "AI Classification", desc: "Every email auto-classified by AI" },
              { icon: Shield, label: "Invoice Extraction", desc: "Automatic supplier & amount detection" },
              { icon: BarChart3, label: "Priority Scoring", desc: "Urgency × Importance matrix" },
            ].map((feat) => (
              <div key={feat.label} className="flex flex-col items-center">
                <div className="h-10 w-10 rounded-xl bg-primary/8 border border-primary/10 flex items-center justify-center mb-4">
                  <feat.icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-heading font-semibold mb-1.5">{feat.label}</h4>
                <p className="text-sm text-muted-foreground">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-muted-foreground">
          AI Operations — Business Command Center
        </div>
      </footer>
    </div>
  );
}
