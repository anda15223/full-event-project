export const CONCEPT_SLUGS = ['fish-chips', 'gyros', 'creperie', 'chicks'] as const;
export type ConceptSlug = typeof CONCEPT_SLUGS[number];

export interface Concept {
  id: string;
  slug: ConceptSlug;
  name: string;
  display_order: number;
  color_hex?: string | null;
  short_name?: string | null;
}

export interface ConceptManager {
  concept_id: string;
  manager_staff_id: string | null;
  manager_name: string | null;
}

export const CONCEPT_LABELS: Record<ConceptSlug, string> = {
  'fish-chips': 'Fish & Chips',
  'gyros': 'Gyropolis Gyros',
  'creperie': 'La Creperie',
  'chicks': "Chicks 'n' Buns",
};

export const CONCEPT_EMOJI: Record<ConceptSlug, string> = {
  'fish-chips': '🐟',
  'gyros': '🥙',
  'creperie': '🥞',
  'chicks': '🍔',
};
