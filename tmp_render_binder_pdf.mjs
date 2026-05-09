import { createServer } from 'vite';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import fs from 'node:fs/promises';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { BinderDocument } = await vite.ssrLoadModule('/src/pages/festival/BinderDocument.tsx');
  const data = {
    festival: { id: 'bc3f8a61-c60e-420e-84f8-4f5b901f2718', slug: 'jelling-2026', name: 'Jelling Musikfestival', start_date: '2026-05-21', end_date: '2026-05-24', city: 'Jelling' },
    generatedAt: new Date().toISOString(),
    actionItems: [], contacts: [], primaryContacts: [], timelineEvents: [], contracts: [], concepts: [], transport: [], transportLegs: [], staff: [], facade: [], power: [], powerEquipment: [], cooling: [], coolingAssignments: [], safety: null, accommodation: [], questions: [], rules: [], topskilt: [], criticalCount: 0, overdueCount: 0,
  };
  const all = { overview: true, actions: true, contacts: true, timeline: true, contracts: true, transport: true, topskilt: true, facade: true, power: true, cooling: true, safety: true, accommodation: true, questions: true, rules: true };
  const blob = await pdf(React.createElement(BinderDocument, { data, options: { selected: all, includeCovers: true } })).toBlob();
  const ab = await blob.arrayBuffer();
  await fs.writeFile('/tmp/jelling_cover_probe.pdf', Buffer.from(ab));
  console.log('/tmp/jelling_cover_probe.pdf', Buffer.from(ab).length);
} finally {
  await vite.close();
}
