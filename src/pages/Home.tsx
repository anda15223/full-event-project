import { Button } from "@/components/ui/button";
import { LayoutDashboard, Mail, CheckSquare, FileText, MessageCircle, Cpu, Zap, Shield, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const stations = [
  {
    icon: Mail,
    title: "Inbox Intelligence",
    description: "AI-powered email classification. Every email becomes either an Invoice or a Task — automatically.",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
  },
  {
    icon: FileText,
    title: "Invoice Extraction",
    description: "Automatically extract supplier, amounts, and line items from invoices. PBS vs Faktura distinction.",
    color: "text-accent",
    bg: "bg-accent/10 border-accent/20",
  },
  {
    icon: CheckSquare,
    title: "Smart Task Board",
    description: "AI-scored urgency and importance. Eisenhower matrix auto-sorting. Never miss a deadline.",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp Integration",
    description: "Employee messages classified, summarized, and turned into actionable tasks automatically.",
    color: "text-accent",
    bg: "bg-accent/10 border-accent/20",
  },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Cpu className="h-5 w-5 text-primary" />
            </div>
            <span className="font-heading font-bold text-lg tracking-tight">AI Assistant Suite</span>
          </div>
          <Button onClick={() => navigate("/dashboard")} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Open Dashboard
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden scanline-overlay">
        <div className="max-w-6xl mx-auto px-4 py-24 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="h-2 w-2 rounded-full bg-accent status-blink" />
              <span className="text-xs font-mono text-muted-foreground tracking-widest uppercase">Command Center v2.0</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-heading font-bold tracking-tight mb-6 leading-tight">
              Your AI-Powered<br />
              <span className="text-primary">Business Operations</span><br />
              Command Center
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl">
              Email classification, invoice extraction, task management, and WhatsApp integration — all powered by AI, all in one place.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={() => navigate("/dashboard")} size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground glow-amber">
                Enter Command Center <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button onClick={() => navigate("/emails")} size="lg" variant="outline" className="border-border hover:border-primary/40">
                <Mail className="mr-2 h-4 w-4" /> View Inbox
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 -z-10 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }} />
      </section>

      {/* Stations */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-heading font-bold mb-3">AI Stations</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">Four integrated modules working together to automate your operations</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {stations.map((station, i) => (
            <motion.div
              key={station.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className={`glass-panel rounded-xl p-6 border ${station.bg} hover:border-primary/40 transition-all duration-300`}
            >
              <div className={`h-10 w-10 rounded-lg ${station.bg} flex items-center justify-center mb-4`}>
                <station.icon className={`h-5 w-5 ${station.color}`} />
              </div>
              <h3 className="font-heading font-bold text-lg mb-2">{station.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{station.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features strip */}
      <section className="border-t border-border py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { icon: Zap, label: "AI Classification", desc: "Every email auto-classified" },
              { icon: Shield, label: "PBS vs Faktura", desc: "Automatic invoice typing" },
              { icon: Cpu, label: "Priority Scoring", desc: "Urgency × Importance matrix" },
            ].map((feat) => (
              <div key={feat.label} className="flex flex-col items-center">
                <feat.icon className="h-6 w-6 text-primary mb-3" />
                <h4 className="font-heading font-semibold mb-1">{feat.label}</h4>
                <p className="text-sm text-muted-foreground">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-muted-foreground">
          AI Assistant Suite — Command Center v2.0
        </div>
      </footer>
    </div>
  );
}
