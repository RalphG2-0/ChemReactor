import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

/**
 * Loads quiz questions for a given lab from the Supabase `questions` table,
 * falling back to a local hardcoded array if Supabase isn't configured or
 * the fetch fails. This keeps every lab working out of the box (e.g. forks
 * that haven't set up Supabase yet, or a network hiccup).
 *
 * @param {string} labId - matches the `lab` column in Supabase, e.g. 'gas-laws'
 * @param {Array} fallbackQuestions - the lab's local question array
 * @returns {{ questions: Array, loading: boolean, source: 'supabase'|'fallback' }}
 */
export function useQuestions(labId, fallbackQuestions) {
  const [state, setState] = useState({
    questions: fallbackQuestions,
    loading: Boolean(supabase),
    source: 'fallback',
  });

  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;

    supabase
      .from('questions')
      .select('question, options, correct, explain')
      .eq('lab', labId)
      .order('order_index', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          if (error) console.warn(`Supabase questions fetch failed for "${labId}":`, error.message);
          setState({ questions: fallbackQuestions, loading: false, source: 'fallback' });
          return;
        }
        const mapped = data.map((row) => ({
          q: row.question,
          options: row.options,
          correct: row.correct,
          explain: row.explain,
        }));
        setState({ questions: mapped, loading: false, source: 'supabase' });
      });

    return () => {
      cancelled = true;
    };
    // fallbackQuestions is a module-level constant per lab, safe to omit here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId]);

  return state;
}
