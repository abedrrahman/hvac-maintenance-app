import { useEffect, useRef } from 'react';

export function useDebouncedSave(value: string, onSave: (v: string) => void, delay = 2000) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    const timer = setTimeout(() => {
      onSaveRef.current(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
}