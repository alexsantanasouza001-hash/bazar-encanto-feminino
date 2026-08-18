import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  'https://vqfqqxzzdaqkbwtgzarh.supabase.co'

const supabaseKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  'sb_publishable_cprR9lLhGr7xx5_Buuz07Q_JaTzyTeM'

if (!supabaseUrl) {
  throw new Error(
    'VITE_SUPABASE_URL não foi encontrada no arquivo .env'
  )
}

if (!supabaseKey) {
  throw new Error(
    'VITE_SUPABASE_PUBLISHABLE_KEY não foi encontrada no arquivo .env'
  )
}

export const supabase =
  createClient(
    supabaseUrl,
    supabaseKey
  )