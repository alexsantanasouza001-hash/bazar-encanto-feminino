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

function obterOrigemPermitida(origem: string): string {
  if (!origem) return ORIGENS_PADRAO[0]
  const configuradas = Deno.env.get('CHECKOUT_ALLOWED_ORIGINS')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const origens = configuradas?.length ? configuradas : ORIGENS_PADRAO
  if (origens.includes(origem)) return origem
  if (origem.endsWith('.vercel.app') || origem.startsWith('http://localhost:')) {
    return origem
  }
  return ORIGENS_PADRAO[0]
}

function responder(status: number, corpo: Record<string, unknown>, origem: string) {
  const permitida = obterOrigemPermitida(origem)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': permitida,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  }

  if (status === 204) {
    return new Response(null, {
      status: 204,
      headers
    })
  }

  headers['Content-Type'] = 'application/json; charset=utf-8'
  headers['Cache-Control'] = 'no-store'

  return new Response(JSON.stringify(corpo), {
    status,
    headers
  })
}

Deno.serve(async (request) => {
  const origem = request.headers.get('origin') || ''

  try {
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

    // 2. Verificar se o chamador possui perfil ADMINISTRADOR ou SÓCIO ativo
    const callerEmail = caller.email ? caller.email.toLowerCase().trim() : ''
    const { data: adminProfile } = await supabaseAdmin
      .from('admin_usuarios')
      .select('*')
      .or(`user_id.eq.${caller.id},email.eq.${callerEmail}`)
      .eq('ativo', true)
      .maybeSingle()

    const eAdminJwt = caller.app_metadata?.role === 'admin'
    const eAdminTabela = adminProfile?.papel === 'admin'
    const eSocioTabela = adminProfile?.papel === 'socio'

    if (!eAdminJwt && !eAdminTabela && !eSocioTabela) {
      return responder(403, {
        sucesso: false,
        erro: 'Acesso negado: Somente administradores ou sócios podem gerenciar usuários e permissões.'
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

      // ----------------------------------------------------
      // GESTÃO DE ACESSO AO PORTAL DA REVENDEDORA (PELO ADMIN)
      // ----------------------------------------------------
      case 'revendedora_consultar_acesso': {
        const revendedoraId = Number(payload.revendedora_id)
        if (!revendedoraId) {
          return responder(400, { sucesso: false, erro: 'ID da revendedora obrigatório.' }, origem)
        }

        const { data: rev, error: revErr } = await supabaseAdmin
          .from('revendedoras')
          .select('id, nome, email, auth_user_id, status_acesso')
          .eq('id', revendedoraId)
          .single()

        if (revErr || !rev) {
          return responder(404, { sucesso: false, erro: 'Revendedora não encontrada.' }, origem)
        }

        let authDetalhes = null
        if (rev.auth_user_id) {
          try {
            const { data: userData } = await supabaseAdmin.auth.admin.getUserById(rev.auth_user_id)
            if (userData?.user) {
              authDetalhes = {
                email: userData.user.email,
                ultimo_acesso: userData.user.last_sign_in_at || null,
                confirmado: Boolean(userData.user.email_confirmed_at)
              }
            }
          } catch (e) {
            console.warn('Erro ao consultar auth de revendedora:', e)
          }
        }

        return responder(200, {
          sucesso: true,
          acesso: {
            revendedora_id: rev.id,
            nome: rev.nome,
            email: rev.email,
            status_acesso: rev.status_acesso || 'SEM_ACESSO',
            auth_user_id: rev.auth_user_id,
            auth: authDetalhes
          }
        }, origem)
      }

      case 'revendedora_criar_acesso': {
        const revendedoraId = Number(payload.revendedora_id)
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
        const senha = typeof payload.senha === 'string' ? payload.senha.trim() : ''

        if (!revendedoraId) {
          return responder(400, { sucesso: false, erro: 'ID da revendedora obrigatório.' }, origem)
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!email || !emailRegex.test(email)) {
          return responder(400, { sucesso: false, erro: 'Informe um e-mail válido para o acesso.' }, origem)
        }

        if (senha && senha.length < 6) {
          return responder(400, { sucesso: false, erro: 'A senha provisória deve conter no mínimo 6 caracteres.' }, origem)
        }

        const { data: rev, error: revErr } = await supabaseAdmin
          .from('revendedoras')
          .select('*')
          .eq('id', revendedoraId)
          .single()

        if (revErr || !rev) {
          return responder(404, { sucesso: false, erro: 'Revendedora não encontrada.' }, origem)
        }

        // Verifica se usuário já existe no auth
        const { data: authList } = await supabaseAdmin.auth.admin.listUsers()
        let authUser = authList?.users?.find((u) => u.email?.toLowerCase() === email)
        let userId = authUser?.id

        if (!authUser) {
          const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: senha || 'Bazar@123456',
            email_confirm: true,
            user_metadata: { name: rev.nome, role: 'revendedora', revendedora_id: rev.id },
            app_metadata: { role: 'revendedora', revendedora_id: rev.id }
          })
          if (createErr) {
            console.error('Erro ao criar usuário no auth:', createErr)
            return responder(400, {
              sucesso: false,
              erro: createErr.message || 'Erro ao criar usuário de autenticação.'
            }, origem)
          }
          userId = createData?.user?.id
        } else {
          // Atualiza dados
          const updatePayload: any = {
            email_confirm: true,
            app_metadata: { ...authUser.app_metadata, role: 'revendedora', revendedora_id: rev.id },
            user_metadata: { ...authUser.user_metadata, name: rev.nome, role: 'revendedora', revendedora_id: rev.id }
          }
          if (senha) {
            updatePayload.password = senha
          }
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId!, updatePayload)
          if (updErr) {
            console.error('Erro ao atualizar usuário no auth:', updErr)
            return responder(400, {
              sucesso: false,
              erro: updErr.message || 'Erro ao atualizar dados do usuário.'
            }, origem)
          }
        }

        if (!userId) {
          return responder(500, { sucesso: false, erro: 'Falha ao obter ID do usuário gerado.' }, origem)
        }

        // Vincula na tabela revendedoras
        const { error: updateRevErr } = await supabaseAdmin
          .from('revendedoras')
          .update({
            auth_user_id: userId,
            status_acesso: 'ATIVO',
            email: email,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', revendedoraId)

        if (updateRevErr) {
          console.error('Erro ao vincular auth_user_id na tabela revendedoras:', updateRevErr)
          return responder(500, {
            sucesso: false,
            erro: 'Usuário de autenticação criado, mas falhou ao vincular a revendedora: ' + updateRevErr.message
          }, origem)
        }

        try {
          await supabaseAdmin.from('admin_usuarios_auditoria').insert({
            usuario_alvo_email: email,
            acao: 'criacao_acesso_revendedora',
            detalhes: { revendedora_id: revendedoraId, nome: rev.nome },
            executado_por: caller.id,
            executado_por_email: caller.email
          })
        } catch (auditErr) {
          console.warn('Falha não-bloqueante na auditoria:', auditErr)
        }

        return responder(200, {
          sucesso: true,
          mensagem: `Acesso ao portal criado com sucesso para ${rev.nome} (${email}).`,
          auth_user_id: userId
        }, origem)
      }

      case 'revendedora_redefinir_senha': {
        const revendedoraId = Number(payload.revendedora_id)
        const novaSenha = typeof payload.nova_senha === 'string' ? payload.nova_senha.trim() : ''

        if (!revendedoraId) {
          return responder(400, { sucesso: false, erro: 'ID da revendedora obrigatório.' }, origem)
        }

        const { data: rev, error: revErr } = await supabaseAdmin
          .from('revendedoras')
          .select('*')
          .eq('id', revendedoraId)
          .single()

        if (revErr || !rev || !rev.auth_user_id) {
          return responder(404, { sucesso: false, erro: 'Revendedora não possui acesso ao portal ativo.' }, origem)
        }

        if (novaSenha) {
          if (novaSenha.length < 6) {
            return responder(400, { sucesso: false, erro: 'A nova senha deve ter no mínimo 6 caracteres.' }, origem)
          }
          await supabaseAdmin.auth.admin.updateUserById(rev.auth_user_id, {
            password: novaSenha
          })
          return responder(200, {
            sucesso: true,
            mensagem: 'Nova senha definida com sucesso para a revendedora.'
          }, origem)
        } else if (rev.email) {
          await supabaseAdmin.auth.resetPasswordForEmail(rev.email, {
            redirectTo: 'https://bazar-encanto-feminino.vercel.app/revendedora/login'
          })
          return responder(200, {
            sucesso: true,
            mensagem: `Link de redefinição de senha enviado para ${rev.email}.`
          }, origem)
        } else {
          return responder(400, { sucesso: false, erro: 'Informe a nova senha ou cadastre um e-mail válido.' }, origem)
        }
      }

      case 'revendedora_alterar_status_acesso': {
        const revendedoraId = Number(payload.revendedora_id)
        const novoStatus = typeof payload.status_acesso === 'string' ? payload.status_acesso.trim().toUpperCase() : ''

        if (!revendedoraId || !['ATIVO', 'BLOQUEADO'].includes(novoStatus)) {
          return responder(400, { sucesso: false, erro: 'ID ou status de acesso inválido (deve ser ATIVO ou BLOQUEADO).' }, origem)
        }

        const { data: rev, error: revErr } = await supabaseAdmin
          .from('revendedoras')
          .select('*')
          .eq('id', revendedoraId)
          .single()

        if (revErr || !rev) {
          return responder(404, { sucesso: false, erro: 'Revendedora não encontrada.' }, origem)
        }

        const { error: updErr } = await supabaseAdmin
          .from('revendedoras')
          .update({
            status_acesso: novoStatus,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', revendedoraId)

        if (updErr) throw updErr

        await supabaseAdmin.from('admin_usuarios_auditoria').insert({
          usuario_alvo_email: rev.email,
          acao: novoStatus === 'BLOQUEADO' ? 'bloqueio_acesso_revendedora' : 'desbloqueio_acesso_revendedora',
          detalhes: { revendedora_id: revendedoraId, status_novo: novoStatus },
          executado_por: caller.id,
          executado_por_email: caller.email
        })

        return responder(200, {
          sucesso: true,
          status_acesso: novoStatus,
          mensagem: `Acesso da revendedora ${rev.nome} alterado para ${novoStatus}.`
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
