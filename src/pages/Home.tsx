import { Button } from "@/components/ui/button";
import {
  Brain, FolderOpen, FileText, ListTodo, ClipboardList,
  Sparkles, ArrowRight, Zap, Shield, BarChart3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const agents = [
  { icon: Brain, title: "Email Memory", description: "Learns senders, companies, suppliers, topics, and deadlines from every email.", color: "text-agent-blue", bg: "bg-agent-blue/8" },
  { icon: FolderOpen, title: "Email Organizer", description: "Classifies every email as invoice, task, waiting, information, or irrelevant.", color: "text-agent-purple", bg: "bg-agent-purple/8" },
  { icon: FileText, title: "Invoice Intelligence", description: "Extracts supplier, amounts, VAT, due dates from invoices and attachments.", color: "text-agent-green", bg: "bg-agent-green/8" },
  { icon: ListTodo, title: "Task & Reply Agent", description: "Creates tasks from emails, tracks deadlines, drafts reply suggestions.", color: "text-agent-orange", bg: "bg-agent-orange/8" },
  { icon: ClipboardList, title: "Non-Email Tasks", description: "Manages manual and internal tasks, separate from email workflows.", color: "text-agent-gray", bg: "bg-secondary" },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <span className="font-heading font-bold text-base tracking-tight">AI Operations</span>
          </div>
          <Button onClick={() => navigate("/dashboard")} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/15 h-9 px-5 text-sm">
            Open Dashboard <ArrowRight className="h-3.5 w-3.5 ml-2" />
          </Button>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-28 md:py-36">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/12">
              <div className="h-1.5 w-1.5 rounded-full bg-primary pulse-soft" />
              <span className="text-[11px] font-semibold text-primary tracking-wide uppercase">5 AI Agents Online</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-heading font-bold tracking-tight mb-6 leading-[1.1]">
              Your AI-Powered<br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">Business Operations</span><br />
              Command Center
            </h1>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl leading-relaxed">
              Five specialized AI agents working together — with an AI chat command center to control them all.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={() => navigate("/dashboard")} size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 h-12 px-7">
                Enter Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button onClick={() => navigate("/agent/inbox")} size="lg" variant="outline" className="border-border hover:border-primary/30 hover:bg-primary/5 h-12 px-7">
                View Agents
              </Button>
            </div>
          </motion.div>
        </div>
        <div className="absolute inset-0 -z-10 gradient-mesh" />
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-heading font-bold mb-3">AI Agent Fleet</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">Five specialized agents operating your business end-to-end</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent, i) => (
            <motion.div key={agent.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5 }}
              className="premium-card-hover p-6">
              <div className={`h-10 w-10 rounded-xl ${agent.bg} flex items-center justify-center mb-5`}>
                <agent.icon className={`h-5 w-5 ${agent.color}`} />
              </div>
              <h3 className="font-heading font-bold text-base mb-2">{agent.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/50 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 text-center">
            {[
              { icon: Zap, label: "AI Classification", desc: "Every email auto-classified" },
              { icon: Shield, label: "Invoice Extraction", desc: "Automatic supplier & amount detection" },
              { icon: BarChart3, label: "Chat Control", desc: "Command agents via AI chat" },
            ].map((feat) => (
              <div key={feat.label} className="flex flex-col items-center">
                <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center mb-4">
                  <feat.icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-heading font-semibold mb-1.5">{feat.label}</h4>
                <p className="text-sm text-muted-foreground">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-muted-foreground">
          AI Operations — Business Command Center
        </div>
      </footer>
    </div>
  );
}
