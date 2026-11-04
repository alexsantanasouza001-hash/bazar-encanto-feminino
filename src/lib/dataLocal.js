/**
 * Retorna a data de HOJE no fuso horário LOCAL do navegador (Brasil), no formato "AAAA-MM-DD".
 *
 * NUNCA usar `new Date().toISOString().slice(0, 10)` para isso: toISOString() converte para UTC
 * primeiro. Como o Brasil é UTC-3, qualquer uso do sistema entre ~21h e meia-noite (horário de
 * Brasília) já é o dia seguinte em UTC, e o campo de data "hoje" preenche silenciosamente com
 * amanhã em vez de hoje.
 */
export function obterDataLocalHoje() {
  const d = new Date()
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
