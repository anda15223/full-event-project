export interface Email {
  id: number;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedAt: string;
  classification: "invoice" | "task";
  aiSummary: string;
  isRead: boolean;
  body?: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "dismissed";
  priority: "low" | "medium" | "high" | "urgent";
  category: "task" | "invoice" | "read_lecture" | "read_learn" | "might_be_interesting";
  urgencyScore: number;
  importanceScore: number;
  priorityScore: number;
  quadrant: "do_first" | "schedule" | "delegate" | "archive";
  source: "email" | "whatsapp" | "manual";
  emailId?: number;
  dueDate?: string;
  createdAt: string;
  isOverdue?: boolean;
  suggestedAction?: string;
}

export interface Invoice {
  id: number;
  emailId: number;
  supplier: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  date: string;
  dueDate: string;
  products: string;
  status: "pending" | "reviewed" | "sent_to_economic" | "paid" | "rejected";
  invoiceType: "faktura" | "pbs" | "unknown";
  lineItems?: { description: string; quantity: number; unitPrice: string; total: string }[];
}

export interface WhatsAppMessage {
  id: number;
  senderName: string;
  senderPhone: string;
  messageText: string;
  classification: "problem" | "question" | "update" | "request";
  aiSummary: string;
  receivedAt: string;
  isProcessed: boolean;
}

export interface Employee {
  id: number;
  name: string;
  phone: string;
  role: string;
  department: string;
}

// Mock data
export const mockEmails: Email[] = [
  { id: 1, subject: "Invoice #4521 from Nordic Supplies", fromName: "Nordic Supplies", fromAddress: "billing@nordicsupplies.dk", receivedAt: "2026-03-31T09:15:00Z", classification: "invoice", aiSummary: "Invoice for office supplies, total 3,450 DKK due April 15", isRead: false },
  { id: 2, subject: "Stage setup requirements for Friday", fromName: "Lars Jensen", fromAddress: "lars@example.dk", receivedAt: "2026-03-31T08:30:00Z", classification: "task", aiSummary: "Need confirmation on stage dimensions and lighting rig setup", isRead: true },
  { id: 3, subject: "PBS payment confirmation - Electricity", fromName: "Ørsted A/S", fromAddress: "noreply@orsted.dk", receivedAt: "2026-03-30T14:00:00Z", classification: "invoice", aiSummary: "Automatic PBS payment 1,892 DKK processed for March electricity", isRead: true },
  { id: 4, subject: "Vendor contract renewal deadline", fromName: "Maria Andersen", fromAddress: "maria@vendorco.dk", receivedAt: "2026-03-30T11:45:00Z", classification: "task", aiSummary: "Contract expires April 30, need review and renewal decision", isRead: false },
  { id: 5, subject: "Invoice #892 - Sound Equipment Rental", fromName: "ProSound DK", fromAddress: "invoices@prosound.dk", receivedAt: "2026-03-29T16:20:00Z", classification: "invoice", aiSummary: "Sound equipment rental for Easter event, 12,500 DKK", isRead: true },
  { id: 6, subject: "Team meeting agenda - April planning", fromName: "Sofie Nielsen", fromAddress: "sofie@company.dk", receivedAt: "2026-03-29T10:00:00Z", classification: "task", aiSummary: "April planning meeting scheduled, agenda items needed", isRead: true },
  { id: 7, subject: "Faktura #1033 - Catering Services", fromName: "Gourmet Catering", fromAddress: "faktura@gourmetcatering.dk", receivedAt: "2026-03-28T15:30:00Z", classification: "invoice", aiSummary: "Catering for corporate event, 8,200 DKK, manual payment required", isRead: false },
  { id: 8, subject: "Security briefing for upcoming event", fromName: "Peter Sørensen", fromAddress: "peter@security.dk", receivedAt: "2026-03-28T09:15:00Z", classification: "task", aiSummary: "Security plan needs review before April 5 event", isRead: true },
];

export const mockTasks: Task[] = [
  { id: 1, title: "Review vendor contract renewal", description: "Contract with VendorCo expires April 30", status: "pending", priority: "high", category: "task", urgencyScore: 8, importanceScore: 9, priorityScore: 85, quadrant: "do_first", source: "email", emailId: 4, dueDate: "2026-04-10", createdAt: "2026-03-30T11:45:00Z", suggestedAction: "Schedule meeting with vendor before April 15" },
  { id: 2, title: "Process Invoice #4521 - Nordic Supplies", description: "Office supplies 3,450 DKK", status: "pending", priority: "high", category: "invoice", urgencyScore: 7, importanceScore: 7, priorityScore: 70, quadrant: "do_first", source: "email", emailId: 1, dueDate: "2026-04-15", createdAt: "2026-03-31T09:15:00Z" },
  { id: 3, title: "Confirm stage setup dimensions", description: "Lars needs confirmation on stage dimensions and lighting", status: "in_progress", priority: "urgent", category: "task", urgencyScore: 9, importanceScore: 8, priorityScore: 86, quadrant: "do_first", source: "email", emailId: 2, dueDate: "2026-04-03", createdAt: "2026-03-31T08:30:00Z", isOverdue: false },
  { id: 4, title: "Review security briefing", description: "Security plan for April 5 event", status: "pending", priority: "high", category: "task", urgencyScore: 8, importanceScore: 8, priorityScore: 80, quadrant: "do_first", source: "email", emailId: 8, dueDate: "2026-04-04", createdAt: "2026-03-28T09:15:00Z" },
  { id: 5, title: "Prepare April planning agenda", description: "Collect agenda items for team meeting", status: "pending", priority: "medium", category: "task", urgencyScore: 5, importanceScore: 7, priorityScore: 58, quadrant: "schedule", source: "email", emailId: 6, createdAt: "2026-03-29T10:00:00Z" },
  { id: 6, title: "Process Invoice #892 - ProSound rental", description: "Sound equipment rental 12,500 DKK", status: "pending", priority: "medium", category: "invoice", urgencyScore: 6, importanceScore: 6, priorityScore: 60, quadrant: "schedule", source: "email", emailId: 5, createdAt: "2026-03-29T16:20:00Z" },
  { id: 7, title: "Process Faktura #1033 - Catering", description: "Catering services 8,200 DKK", status: "pending", priority: "medium", category: "invoice", urgencyScore: 5, importanceScore: 5, priorityScore: 50, quadrant: "delegate", source: "email", emailId: 7, createdAt: "2026-03-28T15:30:00Z" },
  { id: 8, title: "Read: Modern Event Management Trends", description: "Industry article on event management best practices", status: "pending", priority: "low", category: "read_learn", urgencyScore: 2, importanceScore: 6, priorityScore: 36, quadrant: "archive", source: "email", createdAt: "2026-03-27T14:00:00Z" },
  { id: 9, title: "Fix broken speaker at stage B", description: "WhatsApp from technician about faulty speaker", status: "pending", priority: "urgent", category: "task", urgencyScore: 9, importanceScore: 7, priorityScore: 82, quadrant: "do_first", source: "whatsapp", createdAt: "2026-03-31T07:00:00Z" },
  { id: 10, title: "Order replacement cables", description: "Need XLR cables before weekend event", status: "completed", priority: "high", category: "task", urgencyScore: 7, importanceScore: 6, priorityScore: 66, quadrant: "delegate", source: "manual", createdAt: "2026-03-26T10:00:00Z" },
];

export const mockInvoices: Invoice[] = [
  // The Fish Project
  { id: 1, emailId: 1, supplier: "The Fish Project", invoiceNumber: "FP-2026-041", amount: "4,200.00", currency: "DKK", date: "2026-03-28", dueDate: "2026-04-12", products: "Fresh seafood delivery - weekly order", status: "pending", invoiceType: "faktura", lineItems: [{ description: "Fresh Salmon (5kg)", quantity: 5, unitPrice: "180.00", total: "900.00" }, { description: "Cod Fillets (8kg)", quantity: 8, unitPrice: "120.00", total: "960.00" }, { description: "Shrimp (3kg)", quantity: 3, unitPrice: "280.00", total: "840.00" }, { description: "Delivery fee", quantity: 1, unitPrice: "1,500.00", total: "1,500.00" }] },
  { id: 2, emailId: 2, supplier: "The Fish Project", invoiceNumber: "FP-2026-038", amount: "3,850.00", currency: "DKK", date: "2026-03-21", dueDate: "2026-04-05", products: "Fresh seafood delivery - weekly order", status: "reviewed", invoiceType: "faktura", lineItems: [{ description: "Fresh Salmon (4kg)", quantity: 4, unitPrice: "180.00", total: "720.00" }, { description: "Tuna Steaks (6kg)", quantity: 6, unitPrice: "220.00", total: "1,320.00" }, { description: "Oysters (2 dozen)", quantity: 24, unitPrice: "45.00", total: "1,080.00" }] },
  { id: 3, emailId: 3, supplier: "The Fish Project", invoiceNumber: "FP-2026-035", amount: "2,900.00", currency: "DKK", date: "2026-03-14", dueDate: "2026-03-28", products: "Fresh seafood - event catering", status: "paid", invoiceType: "faktura" },

  // MCA Trading
  { id: 4, emailId: 4, supplier: "MCA Trading", invoiceNumber: "MCA-8821", amount: "18,500.00", currency: "DKK", date: "2026-03-25", dueDate: "2026-04-10", products: "Event equipment - stage materials", status: "pending", invoiceType: "faktura", lineItems: [{ description: "Portable Stage Panels (10)", quantity: 10, unitPrice: "850.00", total: "8,500.00" }, { description: "Steel Truss System", quantity: 2, unitPrice: "3,200.00", total: "6,400.00" }, { description: "Safety Barriers", quantity: 12, unitPrice: "300.00", total: "3,600.00" }] },
  { id: 5, emailId: 5, supplier: "MCA Trading", invoiceNumber: "MCA-8790", amount: "7,200.00", currency: "DKK", date: "2026-03-15", dueDate: "2026-03-30", products: "Sound cables and connectors", status: "paid", invoiceType: "faktura" },
  { id: 6, emailId: 6, supplier: "MCA Trading", invoiceNumber: "MCA-8834", amount: "12,350.00", currency: "DKK", date: "2026-03-29", dueDate: "2026-04-15", products: "Lighting equipment rental", status: "reviewed", invoiceType: "faktura", lineItems: [{ description: "LED Par Lights (20)", quantity: 20, unitPrice: "250.00", total: "5,000.00" }, { description: "Moving Head Spots (8)", quantity: 8, unitPrice: "680.00", total: "5,440.00" }, { description: "DMX Controllers", quantity: 2, unitPrice: "955.00", total: "1,910.00" }] },

  // Nordic Supplies
  { id: 7, emailId: 7, supplier: "Nordic Supplies", invoiceNumber: "NS-4521", amount: "3,450.00", currency: "DKK", date: "2026-03-30", dueDate: "2026-04-15", products: "Office supplies, printer paper, toner", status: "pending", invoiceType: "faktura", lineItems: [{ description: "A4 Printer Paper (10 reams)", quantity: 10, unitPrice: "89.00", total: "890.00" }, { description: "HP Toner Cartridge", quantity: 2, unitPrice: "1,280.00", total: "2,560.00" }] },
  { id: 8, emailId: 8, supplier: "Nordic Supplies", invoiceNumber: "NS-4488", amount: "1,890.00", currency: "DKK", date: "2026-03-18", dueDate: "2026-04-02", products: "Cleaning supplies and paper goods", status: "paid", invoiceType: "faktura" },

  // Ørsted (PBS)
  { id: 9, emailId: 9, supplier: "Ørsted A/S", invoiceNumber: "PBS-2026-03", amount: "1,892.00", currency: "DKK", date: "2026-03-01", dueDate: "2026-03-30", products: "Electricity March 2026", status: "paid", invoiceType: "pbs" },
  { id: 10, emailId: 10, supplier: "Ørsted A/S", invoiceNumber: "PBS-2026-02", amount: "2,105.00", currency: "DKK", date: "2026-02-01", dueDate: "2026-02-28", products: "Electricity February 2026", status: "paid", invoiceType: "pbs" },

  // ProSound DK
  { id: 11, emailId: 11, supplier: "ProSound DK", invoiceNumber: "PS-892", amount: "12,500.00", currency: "DKK", date: "2026-03-28", dueDate: "2026-04-12", products: "Sound equipment rental - Easter event", status: "reviewed", invoiceType: "faktura", lineItems: [{ description: "PA System Rental (3 days)", quantity: 1, unitPrice: "7,500.00", total: "7,500.00" }, { description: "Wireless Microphone Set", quantity: 4, unitPrice: "1,250.00", total: "5,000.00" }] },

  // Gourmet Catering
  { id: 12, emailId: 12, supplier: "Gourmet Catering", invoiceNumber: "GC-1033", amount: "8,200.00", currency: "DKK", date: "2026-03-27", dueDate: "2026-04-10", products: "Catering for corporate event", status: "pending", invoiceType: "faktura" },
  { id: 13, emailId: 13, supplier: "Gourmet Catering", invoiceNumber: "GC-1028", amount: "5,600.00", currency: "DKK", date: "2026-03-20", dueDate: "2026-04-03", products: "Lunch catering - team meeting", status: "sent_to_economic", invoiceType: "faktura" },

  // TDC (PBS)
  { id: 14, emailId: 14, supplier: "TDC Erhverv", invoiceNumber: "PBS-TDC-03", amount: "899.00", currency: "DKK", date: "2026-03-01", dueDate: "2026-03-30", products: "Internet & phone March 2026", status: "paid", invoiceType: "pbs" },
];

export const mockWhatsAppMessages: WhatsAppMessage[] = [
  { id: 1, senderName: "Thomas K.", senderPhone: "+4520123456", messageText: "The speaker at stage B is broken, we need a replacement ASAP", classification: "problem", aiSummary: "Urgent: Broken speaker at stage B needs immediate replacement", receivedAt: "2026-03-31T07:00:00Z", isProcessed: false },
  { id: 2, senderName: "Anna M.", senderPhone: "+4520234567", messageText: "What time should the team arrive for setup on Friday?", classification: "question", aiSummary: "Asking about Friday setup arrival time", receivedAt: "2026-03-30T16:30:00Z", isProcessed: true },
  { id: 3, senderName: "Erik P.", senderPhone: "+4520345678", messageText: "All lighting rigs are tested and working. Ready for the event.", classification: "update", aiSummary: "Lighting rigs tested and confirmed working", receivedAt: "2026-03-30T14:15:00Z", isProcessed: true },
  { id: 4, senderName: "Mia L.", senderPhone: "+4520456789", messageText: "Can we get extra tables for the VIP area? Need at least 5 more.", classification: "request", aiSummary: "Requesting 5 additional tables for VIP area", receivedAt: "2026-03-29T11:00:00Z", isProcessed: false },
];

export const mockEmployees: Employee[] = [
  { id: 1, name: "Thomas Kristensen", phone: "+4520123456", role: "Sound Technician", department: "Technical" },
  { id: 2, name: "Anna Mortensen", phone: "+4520234567", role: "Stage Manager", department: "Operations" },
  { id: 3, name: "Erik Petersen", phone: "+4520345678", role: "Lighting Technician", department: "Technical" },
  { id: 4, name: "Mia Larsen", phone: "+4520456789", role: "Event Coordinator", department: "Operations" },
  { id: 5, name: "Jonas Hansen", phone: "+4520567890", role: "Security Lead", department: "Security" },
];

// Stats helpers
export const emailStats = {
  total: mockEmails.length,
  unread: mockEmails.filter(e => !e.isRead).length,
  invoices: mockEmails.filter(e => e.classification === "invoice").length,
  tasks: mockEmails.filter(e => e.classification === "task").length,
};

export const taskStats = {
  total: mockTasks.length,
  pending: mockTasks.filter(t => t.status === "pending").length,
  inProgress: mockTasks.filter(t => t.status === "in_progress").length,
  completed: mockTasks.filter(t => t.status === "completed").length,
  overdue: mockTasks.filter(t => t.isOverdue).length,
};

export const invoiceStats = {
  total: mockInvoices.length,
  pending: mockInvoices.filter(i => i.status === "pending").length,
  reviewed: mockInvoices.filter(i => i.status === "reviewed").length,
  paid: mockInvoices.filter(i => i.status === "paid").length,
  faktura: mockInvoices.filter(i => i.invoiceType === "faktura").length,
  pbs: mockInvoices.filter(i => i.invoiceType === "pbs").length,
  totalAmount: "25,042.00",
};
