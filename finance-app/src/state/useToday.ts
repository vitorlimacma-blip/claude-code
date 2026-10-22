import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayKey } from '../domain/dates';

/**
 * Today's date key (in America/Sao_Paulo, see `todayKey`), refreshed when the app returns to the foreground, so a
 * screen left open overnight doesn't keep computing "this month" for
 * yesterday.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayKey());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(todayKey());
    });
    return () => sub.remove();
  }, []);
  return today;
}
