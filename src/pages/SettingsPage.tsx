import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Mail, MessageCircle, Key, Server } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your integrations and API keys</p>
      </div>

      {/* Email */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Email Account (IMAP/SMTP)
          </CardTitle>
          <CardDescription>Connect your one.com email for inbox monitoring</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>IMAP Host</Label>
              <Input placeholder="imap.one.com" className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label>IMAP Port</Label>
              <Input placeholder="993" className="bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input placeholder="you@domain.dk" className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="••••••••" className="bg-background" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
              <div className="h-1.5 w-1.5 rounded-full bg-accent mr-1.5 status-blink" /> Demo Mode
            </Badge>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Save & Test</Button>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> WhatsApp Business API
          </CardTitle>
          <CardDescription>Connect WhatsApp Cloud API for employee messaging</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Phone Number ID</Label>
            <Input placeholder="Enter WhatsApp Phone Number ID" className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label>Access Token</Label>
            <Input type="password" placeholder="••••••••" className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label>Verify Token</Label>
            <Input placeholder="Your webhook verify token" className="bg-background" />
          </div>
          <Button variant="outline">Save WhatsApp Config</Button>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" /> API Keys
          </CardTitle>
          <CardDescription>OpenAI and e-conomic integration keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>OpenAI API Key</Label>
            <Input type="password" placeholder="sk-..." className="bg-background" />
          </div>
          <div className="space-y-2">
            <Label>e-conomic API Key</Label>
            <Input type="password" placeholder="Enter e-conomic API key" className="bg-background" />
          </div>
          <Button variant="outline">Save API Keys</Button>
        </CardContent>
      </Card>
    </div>
  );
}
