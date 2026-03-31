import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak
} from "docx";
import { saveAs } from "file-saver";

const BLUE = "3B82F6";
const PURPLE = "8B5CF6";
const GREEN = "10B981";
const GRAY = "94A3B8";
const DARK = "1E293B";
const LIGHT_BG = "F8FAFC";
const WHITE = "FFFFFF";

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: WHITE },
  bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
  left: { style: BorderStyle.NONE, size: 0, color: WHITE },
  right: { style: BorderStyle.NONE, size: 0, color: WHITE },
};
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

interface MemoryData {
  totalEmails: number;
  senders: [string, number][];
  suppliers: [string, number][];
  companies: { name: string; emailCount: number }[];
  languages: [string, number][];
  recentEmails: { sender: string; subject: string; company: string; classification: string; date: string }[];
}

function headerCell(text: string, width: number, color = BLUE): TableCell {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: color, type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: WHITE, font: "Arial", size: 20 })] })],
  });
}

function dataCell(text: string, width: number, shade = false): TableCell {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { fill: LIGHT_BG, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 20, color: DARK })] })],
  });
}

function sectionHeading(text: string, color: string): Paragraph {
  return new Paragraph({
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 8 } },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 28, color })],
  });
}

function statCard(label: string, value: string, color: string): TableCell {
  return new TableCell({
    borders: noBorders,
    width: { size: 2340, type: WidthType.DXA },
    shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
    margins: { top: 160, bottom: 160, left: 200, right: 200 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, bold: true, font: "Arial", size: 36, color })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: label, font: "Arial", size: 18, color: GRAY })] }),
    ],
  });
}

export async function exportMemoryDocument(data: MemoryData) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: "Arial", color: DARK },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: DARK },
          paragraph: { spacing: { before: 200, after: 160 }, outlineLevel: 1 } },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0", space: 4 } },
              children: [
                new TextRun({ text: "AI Email Memory Report", font: "Arial", size: 16, color: BLUE, bold: true }),
                new TextRun({ text: `    Generated ${dateStr}`, font: "Arial", size: 16, color: GRAY }),
              ],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", font: "Arial", size: 16, color: GRAY }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: GRAY }),
              ],
            })],
          }),
        },
        children: [
          // Title
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: "Email Memory Report", bold: true, font: "Arial", size: 44, color: DARK })],
          }),
          new Paragraph({
            spacing: { after: 400 },
            children: [new TextRun({ text: `Everything the AI system has learned from your emails \u2014 ${dateStr}`, font: "Arial", size: 22, color: GRAY })],
          }),

          // Stats summary
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2340, 2340, 2340, 2340],
            rows: [new TableRow({
              children: [
                statCard("Total Emails", String(data.totalEmails), BLUE),
                statCard("Known Senders", String(data.senders.length), PURPLE),
                statCard("Companies", String(data.companies.length), GREEN),
                statCard("Suppliers", String(data.suppliers.length), GREEN),
              ],
            })],
          }),

          // Known Senders
          sectionHeading("Known Senders", BLUE),
          ...(data.senders.length > 0
            ? [new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [7000, 2360],
                rows: [
                  new TableRow({ children: [headerCell("Sender", 7000, BLUE), headerCell("Emails", 2360, BLUE)] }),
                  ...data.senders.map(([sender, count], i) =>
                    new TableRow({ children: [dataCell(sender, 7000, i % 2 === 0), dataCell(String(count), 2360, i % 2 === 0)] })
                  ),
                ],
              })]
            : [new Paragraph({ children: [new TextRun({ text: "No senders recorded yet.", italics: true, color: GRAY, font: "Arial", size: 20 })] })]),

          // Known Suppliers
          sectionHeading("Known Suppliers", GREEN),
          ...(data.suppliers.length > 0
            ? [new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [7000, 2360],
                rows: [
                  new TableRow({ children: [headerCell("Supplier", 7000, GREEN), headerCell("Invoices", 2360, GREEN)] }),
                  ...data.suppliers.map(([name, count], i) =>
                    new TableRow({ children: [dataCell(name, 7000, i % 2 === 0), dataCell(String(count), 2360, i % 2 === 0)] })
                  ),
                ],
              })]
            : [new Paragraph({ children: [new TextRun({ text: "No suppliers recorded yet.", italics: true, color: GRAY, font: "Arial", size: 20 })] })]),

          // Companies
          sectionHeading("Companies", PURPLE),
          ...(data.companies.length > 0
            ? [new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [7000, 2360],
                rows: [
                  new TableRow({ children: [headerCell("Company", 7000, PURPLE), headerCell("Emails", 2360, PURPLE)] }),
                  ...data.companies.map((c, i) =>
                    new TableRow({ children: [dataCell(c.name, 7000, i % 2 === 0), dataCell(String(c.emailCount), 2360, i % 2 === 0)] })
                  ),
                ],
              })]
            : [new Paragraph({ children: [new TextRun({ text: "No companies configured yet.", italics: true, color: GRAY, font: "Arial", size: 20 })] })]),

          // Languages
          sectionHeading("Languages Detected", BLUE),
          ...(data.languages.length > 0
            ? [new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [7000, 2360],
                rows: [
                  new TableRow({ children: [headerCell("Language", 7000, BLUE), headerCell("Count", 2360, BLUE)] }),
                  ...data.languages.map(([lang, count], i) =>
                    new TableRow({ children: [dataCell(lang || "Unknown", 7000, i % 2 === 0), dataCell(String(count), 2360, i % 2 === 0)] })
                  ),
                ],
              })]
            : [new Paragraph({ children: [new TextRun({ text: "No languages detected yet.", italics: true, color: GRAY, font: "Arial", size: 20 })] })]),

          // Recent Emails
          new Paragraph({ children: [new PageBreak()] }),
          sectionHeading("Recently Learned Emails", BLUE),
          ...(data.recentEmails.length > 0
            ? [new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [2400, 3360, 1800, 1800],
                rows: [
                  new TableRow({ children: [
                    headerCell("Sender", 2400), headerCell("Subject", 3360),
                    headerCell("Company", 1800), headerCell("Category", 1800),
                  ]}),
                  ...data.recentEmails.map((e, i) =>
                    new TableRow({ children: [
                      dataCell(e.sender, 2400, i % 2 === 0), dataCell(e.subject, 3360, i % 2 === 0),
                      dataCell(e.company || "—", 1800, i % 2 === 0), dataCell(e.classification || "—", 1800, i % 2 === 0),
                    ]})
                  ),
                ],
              })]
            : [new Paragraph({ children: [new TextRun({ text: "No recent emails.", italics: true, color: GRAY, font: "Arial", size: 20 })] })]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  saveAs(buffer, `email-memory-report-${now.toISOString().slice(0, 10)}.docx`);
}
