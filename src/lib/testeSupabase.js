import { supabase } from './supabase'

export async function testarSupabase() {
  const { data, error } = await supabase
    .from('produtos')
    .select('id')
    .limit(1)

  if (error) {
    console.error('ERRO SUPABASE:', error)
    return false
  }

  console.log('SUPABASE CONECTADO:', data)
  return true
}