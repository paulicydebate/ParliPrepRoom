import type { Sheet } from '../import/importFile';

// The sample flow, written as spreadsheet rows and read in the same way an Excel file is (src/import/flowImport.ts),
// so there is one way to turn rows into cells. A cell answers the nearest cell above it in the column before.
const HEAD = ['PMC', 'LOC', 'MG', 'MO', 'LOR', 'PMR'];

export const SAMPLE_FLOW_SHEETS: Sheet[] = [
  {
    name: 'Gov: Ban police facial recognition',
    rows: [
      HEAD,
      ['★ Advantage 1: wrongful arrests. The tech misidentifies people at very different rates (NIST 2019: false positives 10–100x higher for some groups)', 'Accuracy is improving fast', 'Improvement is uneven; police buy cheap vendors', 'Cheap vendors are what regulation fixes, not a ban', 'The ban is the only thing that stops cheap vendors being bought'],
      ['', 'Human review catches errors', '✓ Review is rubber-stamping; documented wrongful arrests'],
      ['', '[DROPPED] A match is a lead, not an arrest'],
      ['→ Advantage 2: chilling effect on protest', 'No evidence anyone stays home', 'Surveys show people do avoid protests when watched'],
    ],
  },
  {
    name: 'Opp: Regulation CP',
    rows: [
      ['LOC', 'MG', 'MO', 'LOR', 'PMR'],
      ['CP: mandate accuracy audits and warrants instead of a ban', 'Perm: do both', 'Perm severs the ban; it is not competitive with itself', 'Severance is a voting issue'],
    ],
  },
];
