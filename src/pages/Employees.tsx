import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Phone, Briefcase, Building2 } from "lucide-react";
import { mockEmployees } from "@/data/mockData";

export default function Employees() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Employees</h1>
          <p className="text-muted-foreground mt-1">Employee directory for WhatsApp integration</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Add Employee
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockEmployees.map((emp) => (
          <Card key={emp.id} className="glass-panel hover:border-primary/30 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{emp.name.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{emp.name}</h3>
                  <p className="text-xs text-muted-foreground">{emp.role}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3" /> {emp.phone}
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-3 w-3" /> {emp.department}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
