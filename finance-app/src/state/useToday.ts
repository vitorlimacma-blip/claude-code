import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toDateKey } from '../domain/dates';

/**
 * Today's date key, refreshed when the app returns to the foreground, so a
 * screen left open overnight doesn't keep computing "this month" for
 * yesterday.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(toDateKey(new Date()));
    });
    return () => sub.remove();
  }, []);
  return today;
}
