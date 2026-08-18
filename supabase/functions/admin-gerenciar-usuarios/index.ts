import { createClient } from 'npm:@supabase/supabase-js@2.112.2'

const ORIGENS_PADRAO = [
  'https://bazar-encanto-feminino.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
]

type JsonObject = Record<string, unknown>

function eObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function responder(status: number, corpo: Record<string, unknown>, origem: string) {
  const configuradas = Deno.env.get('CHECKOUT_ALLOWED_ORIGINS')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const origens = configuradas?.length ? configuradas : ORIGENS_PADRAO
  const origemPermitida = origens.includes(origem) ? origem : ORIGENS_PADRAO[0]

  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Access-Control-Allow-Origin': origemPermitida,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Vary: 'Origin'
    }
  })
}

Deno.serve(async (request) => {
  const origem = request.headers.get('origin') || ''
  if (request.method === 'OPTIONS') {
    return responder(204, {}, origem)
  }

  if (request.method !== 'POST') {
    return responder(405, { sucesso: false, erro: 'Método não permitido.' }, origem)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return responder(503, { sucesso: false, erro: 'Serviço indisponível.' }, origem)
  }

  // 1. Validar autenticação do usuário chamador via JWT
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return responder(401, { sucesso: false, erro: 'Não autenticado.' }, origem)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  })

  const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token)

  if (callerError || !caller) {
    return responder(401, { sucesso: false, erro: 'Sessão inválida ou expirada.' }, origem)
  }

  // 2. Verificar se o chamador possui perfil ADMINISTRADOR ativo
  const { data: adminProfile } = await supabaseAdmin
    .from('admin_usuarios')
    .select('*')
    .eq('user_id', caller.id)
    .eq('ativo', true)
    .maybeSingle()

  const eAdminJwt = caller.app_metadata?.role === 'admin'
  const eAdminTabela = adminProfile?.papel === 'admin'

  if (!eAdminJwt && !eAdminTabela) {
    return responder(403, {
      sucesso: false,
      erro: 'Acesso negado: Somente administradores podem gerenciar usuários e permissões.'
    }, origem)
  }

  // 3. Processar payload e ação
  let payload: JsonObject = {}
  try {
    const raw = await request.json()
    if (eObjeto(raw)) {
      payload = raw
    }
  } catch {
    return responder(400, { sucesso: false, erro: 'Payload JSON inválido.' }, origem)
  }

  const acao = typeof payload.acao === 'string' ? payload.acao.trim() : ''

  try {
    switch (acao) {
      // ----------------------------------------------------
      // LISTAR USUÁRIOS ADMINISTRATIVOS
      // ----------------------------------------------------
      case 'listar': {
        const { data: usuarios, error } = await supabaseAdmin
          .from('admin_usuarios')
          .select('*')
          .order('criado_em', { ascending: true })

        if (error) throw error

        // Busca metadados de último login na Auth API
        const { data: authUsersData } = await supabaseAdmin.auth.admin.listUsers()
        const authMap = new Map()
        if (authUsersData?.users) {
          for (const u of authUsersData.users) {
            authMap.set(u.id, u)
            if (u.email) authMap.set(u.email.toLowerCase(), u)
          }
        }

        const listaFormatada = (usuarios || []).map((u) => {
          const authUser = authMap.get(u.user_id) || (u.email ? authMap.get(u.email.toLowerCase()) : null)
          return {
            ...u,
            ultimo_acesso: authUser?.last_sign_in_at || null,
            email_confirmado: Boolean(authUser?.confirmed_at || authUser?.email_confirmed_at)
          }
        })

        return responder(200, { sucesso: true, usuarios: listaFormatada }, origem)
      }

      // ----------------------------------------------------
      // ADICIONAR NOVO USUÁRIO
      // ----------------------------------------------------
      case 'adicionar': {
        const nome = typeof payload.nome === 'string' ? payload.nome.trim() : ''
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
        const papel = typeof payload.papel === 'string' ? payload.papel.trim().toLowerCase() : 'operador'
        const enviarConvite = payload.enviarConvite !== false

        if (!nome || nome.length < 2) {
          return responder(400, { sucesso: false, erro: 'Informe um nome válido com no mínimo 2 caracteres.' }, origem)
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!email || !emailRegex.test(email)) {
          return responder(400, { sucesso: false, erro: 'Informe um endereço de e-mail válido.' }, origem)
        }

        if (!['admin', 'socio', 'operador'].includes(papel)) {
          return responder(400, { sucesso: false, erro: 'Perfil inválido. Escolha Administrador, Sócio ou Operador.' }, origem)
        }

        // Verifica se usuário já existe no auth
        const { data: authList } = await supabaseAdmin.auth.admin.listUsers()
        let existingAuthUser = authList?.users?.find((u) => u.email?.toLowerCase() === email)
        let userId = existingAuthUser?.id

        if (!existingAuthUser) {
          if (enviarConvite) {
            try {
              const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
                data: { name: nome, papel },
                redirectTo: 'https://bazar-encanto-feminino.vercel.app/admin'
              })
              if (inviteErr) throw inviteErr
              userId = inviteData?.user?.id
            } catch (inviteErr) {
              console.warn('Falha no inviteUserByEmail, fallback para createUser:', inviteErr)
              const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: { name: nome, papel },
                app_metadata: { role: papel }
              })
              if (createErr) throw createErr
              userId = createData?.user?.id
            }
          } else {
            const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
              email,
              email_confirm: true,
              user_metadata: { name: nome, papel },
              app_metadata: { role: papel }
            })
            if (createErr) throw createErr
            userId = createData?.user?.id
          }
        } else {
          // Atualiza role no app_metadata
          await supabaseAdmin.auth.admin.updateUserById(userId!, {
            app_metadata: { role: papel },
            user_metadata: { ...existingAuthUser.user_metadata, name: nome, papel }
          })
        }

        // Upsert na tabela admin_usuarios
        const { data: novoAdmin, error: upsertErr } = await supabaseAdmin
          .from('admin_usuarios')
          .upsert({
            user_id: userId,
            nome,
            email,
            papel,
            ativo: true,
            criado_por: caller.id,
            atualizado_em: new Date().toISOString()
          }, { onConflict: 'email' })
          .select()
          .single()

        if (upsertErr) throw upsertErr

        // Registra auditoria
        await supabaseAdmin.from('admin_usuarios_auditoria').insert({
          usuario_alvo_id: novoAdmin.id,
          usuario_alvo_email: email,
          acao: 'criacao',
          detalhes: { nome, papel, enviarConvite },
          executado_por: caller.id,
          executado_por_email: caller.email
        })

        return responder(200, {
          sucesso: true,
          mensagem: `Usuário ${nome} adicionado com sucesso com perfil de ${papel.toUpperCase()}.`,
          usuario: novoAdmin
        }, origem)
      }

      // ----------------------------------------------------
      // ALTERAR PAPEL / PERMISSÃO
      // ----------------------------------------------------
      case 'alterar_papel': {
        const id = Number(payload.id)
        const novoPapel = typeof payload.papel === 'string' ? payload.papel.trim().toLowerCase() : ''

        if (!id || !['admin', 'socio', 'operador'].includes(novoPapel)) {
          return responder(400, { sucesso: false, erro: 'ID ou papel inválido.' }, origem)
        }

        const { data: targetUser, error: findErr } = await supabaseAdmin
          .from('admin_usuarios')
          .select('*')
          .eq('id', id)
          .single()

        if (findErr || !targetUser) {
          return responder(404, { sucesso: false, erro: 'Usuário não encontrado.' }, origem)
        }

        // Impede que o próprio admin logado se rebaixe caso seja o único admin
        if (targetUser.user_id === caller.id && novoPapel !== 'admin') {
          const { count } = await supabaseAdmin
            .from('admin_usuarios')
            .select('*', { count: 'exact', head: true })
            .eq('papel', 'admin')
            .eq('ativo', true)

          if ((count || 0) <= 1) {
            return responder(400, {
              sucesso: false,
              erro: 'Não é possível remover seu próprio acesso de administrador pois você é o único administrador ativo.'
            }, origem)
          }
        }

        const { error: updateErr } = await supabaseAdmin
          .from('admin_usuarios')
          .update({ papel: novoPapel, atualizado_em: new Date().toISOString() })
          .eq('id', id)

        if (updateErr) throw updateErr

        if (targetUser.user_id) {
          await supabaseAdmin.auth.admin.updateUserById(targetUser.user_id, {
            app_metadata: { role: novoPapel }
          })
        }

        await supabaseAdmin.from('admin_usuarios_auditoria').insert({
          usuario_alvo_id: id,
          usuario_alvo_email: targetUser.email,
          acao: 'alteracao_papel',
          detalhes: { papel_anterior: targetUser.papel, papel_novo: novoPapel },
          executado_por: caller.id,
          executado_por_email: caller.email
        })

        return responder(200, { sucesso: true, mensagem: `Perfil alterado para ${novoPapel.toUpperCase()}.` }, origem)
      }

      // ----------------------------------------------------
      // ATIVAR / DESATIVAR USUÁRIO
      // ----------------------------------------------------
      case 'alterar_status': {
        const id = Number(payload.id)
        const novoStatus = Boolean(payload.ativo)

        if (!id) {
          return responder(400, { sucesso: false, erro: 'ID inválido.' }, origem)
        }

        const { data: targetUser, error: findErr } = await supabaseAdmin
          .from('admin_usuarios')
          .select('*')
          .eq('id', id)
          .single()

        if (findErr || !targetUser) {
          return responder(404, { sucesso: false, erro: 'Usuário não encontrado.' }, origem)
        }

        if (targetUser.user_id === caller.id && !novoStatus) {
          return responder(400, { sucesso: false, erro: 'Você não pode desativar seu próprio usuário.' }, origem)
        }

        const { error: updateErr } = await supabaseAdmin
          .from('admin_usuarios')
          .update({ ativo: novoStatus, atualizado_em: new Date().toISOString() })
          .eq('id', id)

        if (updateErr) throw updateErr

        await supabaseAdmin.from('admin_usuarios_auditoria').insert({
          usuario_alvo_id: id,
          usuario_alvo_email: targetUser.email,
          acao: novoStatus ? 'ativacao' : 'desativacao',
          detalhes: { ativo: novoStatus },
          executado_por: caller.id,
          executado_por_email: caller.email
        })

        return responder(200, {
          sucesso: true,
          mensagem: `Usuário ${novoStatus ? 'ativado' : 'desativado'} com sucesso.`
        }, origem)
      }

      // ----------------------------------------------------
      // REMOVER ACESSO
      // ----------------------------------------------------
      case 'remover': {
        const id = Number(payload.id)
        if (!id) {
          return responder(400, { sucesso: false, erro: 'ID inválido.' }, origem)
        }

        const { data: targetUser, error: findErr } = await supabaseAdmin
          .from('admin_usuarios')
          .select('*')
          .eq('id', id)
          .single()

        if (findErr || !targetUser) {
          return responder(404, { sucesso: false, erro: 'Usuário não encontrado.' }, origem)
        }

        if (targetUser.user_id === caller.id) {
          return responder(400, { sucesso: false, erro: 'Você não pode remover seu próprio acesso.' }, origem)
        }

        // Remove do admin_usuarios
        const { error: deleteErr } = await supabaseAdmin
          .from('admin_usuarios')
          .delete()
          .eq('id', id)

        if (deleteErr) throw deleteErr

        // Remove do auth se aplicável
        if (targetUser.user_id) {
          try {
            await supabaseAdmin.auth.admin.deleteUser(targetUser.user_id)
          } catch (e) {
            console.warn('Erro ao deletar do auth:', e)
          }
        }

        await supabaseAdmin.from('admin_usuarios_auditoria').insert({
          usuario_alvo_id: id,
          usuario_alvo_email: targetUser.email,
          acao: 'remocao',
          detalhes: { usuario: targetUser },
          executado_por: caller.id,
          executado_por_email: caller.email
        })

        return responder(200, { sucesso: true, mensagem: 'Acesso do usuário removido com sucesso.' }, origem)
      }

      // ----------------------------------------------------
      // REENVIAR CONVITE / REDEFINIR SENHA
      // ----------------------------------------------------
      case 'reenviar_convite': {
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
        if (!email) {
          return responder(400, { sucesso: false, erro: 'E-mail obrigatório.' }, origem)
        }

        try {
          await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://bazar-encanto-feminino.vercel.app/admin'
          })
        } catch (e) {
          console.warn('Erro ao reenviar convite/recuperação:', e)
        }

        await supabaseAdmin.from('admin_usuarios_auditoria').insert({
          usuario_alvo_email: email,
          acao: 'convite',
          detalhes: { tipo: 'redefinicao_senha' },
          executado_por: caller.id,
          executado_por_email: caller.email
        })

        return responder(200, {
          sucesso: true,
          mensagem: `E-mail de instruções enviado com sucesso para ${email}.`
        }, origem)
      }

      default:
        return responder(400, { sucesso: false, erro: `Ação "${acao}" desconhecida.` }, origem)
    }
  } catch (erro: any) {
    console.error('Erro na função admin-gerenciar-usuarios:', erro)
    return responder(500, {
      sucesso: false,
      erro: erro?.message || 'Erro interno ao processar operação administrativa.'
    }, origem)
  }
})
