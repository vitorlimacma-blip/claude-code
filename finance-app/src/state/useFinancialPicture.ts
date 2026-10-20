import { useMemo } from 'react';
import { loadPictureData, PICTURE_TABLES } from '../data/pictureData';
import { computeFinancialPicture } from '../domain/picture';
import { useQuery } from './useQuery';
import { useToday } from './useToday';

export type { FinancialPicture } from '../domain/picture';

/** The shared financial picture (Resumo, Previsões), refreshed when the data changes. */
export function useFinancialPicture() {
  const today = useToday();
  const { data } = useQuery((r) => loadPictureData(r, today), [...PICTURE_TABLES], [today]);
  return useMemo(() => (data ? computeFinancialPicture(data, today) : null), [data, today]);
}
