import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './ClienteAuth.css'

const CADASTRO_INICIAL = {
  nome: '',
  sobrenome: '',
  email: '',
  telefone: '',
  senha: '',
  confirmarSenha: '',
  termos: false
}

function mensagemErroAuth(erro, contexto) {
  const mensagem = String(
    erro?.message || ''
  ).toLowerCase()

  if (
    mensagem.includes(
      'invalid login credentials'
    )
  ) {
    return 'E-mail ou senha inválidos.'
  }

  if (
    mensagem.includes(
      'email not confirmed'
    )
  ) {
    return 'Não foi possível entrar. Tente novamente em alguns instantes.'
  }

  if (
    mensagem.includes(
      'user already registered'
    )
  ) {
    return 'Já existe uma conta com este e-mail.'
  }

  if (
    mensagem.includes(
      'password should be'
    )
  ) {
    return 'A senha precisa ter pelo menos 8 caracteres.'
  }

  if (
    mensagem.includes(
      'rate limit'
    )
  ) {
    return 'Muitas tentativas. Aguarde um pouco e tente novamente.'
  }

  return contexto
}

function ClienteAuth({
  aberto,
  sessao,
  carregandoSessao,
  recuperacaoSenhaAtiva,
  onRecuperacaoConcluida,
  onFechar
}) {
  const [tela, setTela] =
    useState('entrar')
  const [email, setEmail] =
    useState('')
  const [senha, setSenha] =
    useState('')
  const [novaSenha, setNovaSenha] =
    useState('')
  const [confirmarNovaSenha, setConfirmarNovaSenha] =
    useState('')
  const [cadastro, setCadastro] =
    useState(CADASTRO_INICIAL)
  const [processando, setProcessando] =
    useState(false)
  const [mensagem, setMensagem] =
    useState(null)

  const usuario = sessao?.user || null
  const metadata =
    usuario?.user_metadata || {}
  const nomeCliente =
    metadata.nome ||
    usuario?.email?.split('@')[0] ||
    'Cliente'

  useEffect(() => {
    if (!aberto) {
      return
    }

    setMensagem(null)

    if (recuperacaoSenhaAtiva) {
      setTela('nova-senha')
    } else if (usuario) {
      setTela('conta')
    } else {
      setTela('entrar')
    }
  }, [
    aberto,
    recuperacaoSenhaAtiva,
    usuario
  ])

  if (!aberto) {
    return null
  }

  const atualizarCadastro = (
    evento
  ) => {
    const { name, value, checked, type } =
      evento.target

    setCadastro(
      (atual) => ({
        ...atual,
        [name]:
          type === 'checkbox'
            ? checked
            : value
      })
    )
  }

  const entrar = async (evento) => {
    evento.preventDefault()
    setMensagem(null)

    if (!email.trim() || !senha) {
      setMensagem({
        tipo: 'erro',
        texto: 'Informe o e-mail e a senha.'
      })
      return
    }

    setProcessando(true)

    const { error } =
      await supabase.auth
        .signInWithPassword({
          email: email.trim(),
          password: senha
        })

    setProcessando(false)

    if (error) {
      setMensagem({
        tipo: 'erro',
        texto: mensagemErroAuth(
          error,
          'Não foi possível entrar. Verifique seus dados.'
        )
      })
      return
    }

    setSenha('')
    onFechar()
  }

  const criarConta = async (
    evento
  ) => {
    evento.preventDefault()
    setMensagem(null)

    if (
      !cadastro.nome.trim() ||
      !cadastro.email.trim() ||
      !cadastro.telefone.trim()
    ) {
      setMensagem({
        tipo: 'erro',
        texto: 'Preencha nome, e-mail e telefone.'
      })
      return
    }

    if (cadastro.senha.length < 8) {
      setMensagem({
        tipo: 'erro',
        texto: 'A senha precisa ter pelo menos 8 caracteres.'
      })
      return
    }

    if (
      cadastro.senha !==
      cadastro.confirmarSenha
    ) {
      setMensagem({
        tipo: 'erro',
        texto: 'As senhas não coincidem.'
      })
      return
    }

    if (!cadastro.termos) {
      setMensagem({
        tipo: 'erro',
        texto: 'Aceite os termos para criar sua conta.'
      })
      return
    }

    setProcessando(true)

    const { data, error } =
      await supabase.auth.signUp({
        email:
          cadastro.email.trim(),
        password:
          cadastro.senha,
        options: {
          data: {
            nome:
              cadastro.nome.trim(),
            sobrenome:
              cadastro.sobrenome.trim(),
            telefone:
              cadastro.telefone.trim()
          }
        }
      })

    setProcessando(false)

    if (error) {
      setMensagem({
        tipo: 'erro',
        texto: mensagemErroAuth(
          error,
          'Não foi possível criar a conta.'
        )
      })
      return
    }

    setCadastro(
      CADASTRO_INICIAL
    )

    if (data.session) {
      onFechar()
      return
    }

    // Se o Supabase não retornou sessão (confirmação de e-mail habilitada),
    // tentar login automático com as credenciais recém-cadastradas
    const { error: loginError } =
      await supabase.auth
        .signInWithPassword({
          email: cadastro.email.trim(),
          password: cadastro.senha
        })

    if (!loginError) {
      onFechar()
      return
    }

    // Se nem signUp com sessão nem login automático funcionaram,
    // informar sucesso e pedir para tentar entrar manualmente
    setMensagem({
      tipo: 'sucesso',
      texto: 'Conta criada com sucesso! Faça login para acessar sua conta.'
    })
    setTela('login')
  }

  const enviarRecuperacao = async (
    evento
  ) => {
    evento.preventDefault()
    setMensagem(null)

    if (!email.trim()) {
      setMensagem({
        tipo: 'erro',
        texto: 'Informe seu e-mail.'
      })
      return
    }

    setProcessando(true)

    const { error } =
      await supabase.auth
        .resetPasswordForEmail(
          email.trim(),
          {
            redirectTo:
              window.location.origin
          }
        )

    setProcessando(false)

    if (error) {
      setMensagem({
        tipo: 'erro',
        texto: mensagemErroAuth(
          error,
          'Não foi possível enviar o e-mail de recuperação.'
        )
      })
      return
    }

    setMensagem({
      tipo: 'sucesso',
      texto: 'Enviamos as instruções de recuperação para seu e-mail.'
    })
  }

  const atualizarSenha = async (
    evento
  ) => {
    evento.preventDefault()
    setMensagem(null)

    if (novaSenha.length < 8) {
      setMensagem({
        tipo: 'erro',
        texto: 'A nova senha precisa ter pelo menos 8 caracteres.'
      })
      return
    }

    if (
      novaSenha !==
      confirmarNovaSenha
    ) {
      setMensagem({
        tipo: 'erro',
        texto: 'As senhas não coincidem.'
      })
      return
    }

    setProcessando(true)

    const { error } =
      await supabase.auth.updateUser({
        password: novaSenha
      })

    setProcessando(false)

    if (error) {
      setMensagem({
        tipo: 'erro',
        texto: mensagemErroAuth(
          error,
          'Não foi possível atualizar a senha.'
        )
      })
      return
    }

    setNovaSenha('')
    setConfirmarNovaSenha('')
    onRecuperacaoConcluida()
    setTela('conta')
    setMensagem({
      tipo: 'sucesso',
      texto: 'Senha atualizada com sucesso.'
    })
  }

  const sair = async () => {
    setProcessando(true)
    setMensagem(null)

    const { error } =
      await supabase.auth.signOut({
        scope: 'local'
      })

    setProcessando(false)

    if (error) {
      setMensagem({
        tipo: 'erro',
        texto: 'Não foi possível sair da conta.'
      })
      return
    }

    onFechar()
  }

  const mostrarMensagem = () =>
    mensagem && (
      <div
        className={`cliente-auth-message ${mensagem.tipo}`}
        role="status"
      >
        {mensagem.texto}
      </div>
    )

  return (
    <div
      className="cliente-auth-overlay"
      role="presentation"
      onMouseDown={(evento) => {
        if (
          evento.target ===
          evento.currentTarget
        ) {
          onFechar()
        }
      }}
    >
      <section
        className="cliente-auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Conta da cliente"
      >
        <div className="cliente-auth-header">
          <div>
            <span>MINHA CONTA</span>
            <h2>
              {recuperacaoSenhaAtiva
                ? 'Criar nova senha'
                : usuario
                  ? `Olá, ${nomeCliente}`
                  : tela === 'cadastro'
                    ? 'Criar conta'
                    : tela === 'recuperar'
                      ? 'Recuperar senha'
                      : 'Bem-vinda'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {carregandoSessao ? (
          <div className="cliente-auth-loading">
            Carregando sua conta...
          </div>
        ) : tela === 'nova-senha' ? (
          <form
            className="cliente-auth-form"
            onSubmit={atualizarSenha}
          >
            <p>Escolha uma nova senha segura para sua conta.</p>
            {mostrarMensagem()}
            <label>
              Nova senha
              <input
                type="password"
                value={novaSenha}
                onChange={(evento) =>
                  setNovaSenha(evento.target.value)
                }
                autoComplete="new-password"
                minLength="8"
                required
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                value={confirmarNovaSenha}
                onChange={(evento) =>
                  setConfirmarNovaSenha(evento.target.value)
                }
                autoComplete="new-password"
                minLength="8"
                required
              />
            </label>
            <button
              className="cliente-auth-primary"
              type="submit"
              disabled={processando}
            >
              {processando ? 'Salvando...' : 'Atualizar senha'}
            </button>
          </form>
        ) : usuario ? (
          <div className="cliente-account">
            <nav aria-label="Área da cliente">
              <button
                type="button"
                className={tela === 'conta' ? 'active' : ''}
                onClick={() => setTela('conta')}
              >
                Minha conta
              </button>
              <button
                type="button"
                className={tela === 'pedidos' ? 'active' : ''}
                onClick={() => setTela('pedidos')}
              >
                Meus pedidos
              </button>
              <button
                type="button"
                className={tela === 'enderecos' ? 'active' : ''}
                onClick={() => setTela('enderecos')}
              >
                Meus endereços
              </button>
            </nav>

            {mostrarMensagem()}

            {tela === 'conta' && (
              <div className="cliente-account-panel">
                <span>DADOS DA CONTA</span>
                <dl>
                  <div>
                    <dt>Nome</dt>
                    <dd>
                      {[metadata.nome, metadata.sobrenome]
                        .filter(Boolean)
                        .join(' ') || 'Não informado'}
                    </dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{usuario.email}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{metadata.telefone || 'Não informado'}</dd>
                  </div>
                </dl>
              </div>
            )}

            {tela === 'pedidos' && (
              <div className="cliente-account-empty">
                <span aria-hidden="true">◇</span>
                <strong>Meus pedidos</strong>
                <p>
                  Seus pedidos aparecerão aqui quando houver um vínculo
                  seguro entre o pedido e sua conta.
                </p>
              </div>
            )}

            {tela === 'enderecos' && (
              <div className="cliente-account-empty">
                <span aria-hidden="true">⌂</span>
                <strong>Meus endereços</strong>
                <p>
                  Ainda não há endereços salvos. Esta área será habilitada
                  quando o cadastro seguro de endereços estiver disponível.
                </p>
              </div>
            )}

            <button
              className="cliente-auth-logout"
              type="button"
              onClick={sair}
              disabled={processando}
            >
              {processando ? 'Saindo...' : 'Sair da conta'}
            </button>
          </div>
        ) : tela === 'cadastro' ? (
          <form
            className="cliente-auth-form"
            onSubmit={criarConta}
          >
            <p>Crie sua conta para agilizar suas próximas compras.</p>
            {mostrarMensagem()}
            <div className="cliente-auth-grid">
              <label>
                Nome
                <input
                  name="nome"
                  value={cadastro.nome}
                  onChange={atualizarCadastro}
                  autoComplete="given-name"
                  required
                />
              </label>
              <label>
                Sobrenome
                <input
                  name="sobrenome"
                  value={cadastro.sobrenome}
                  onChange={atualizarCadastro}
                  autoComplete="family-name"
                />
              </label>
              <label className="cliente-auth-wide">
                E-mail
                <input
                  type="email"
                  name="email"
                  value={cadastro.email}
                  onChange={atualizarCadastro}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="cliente-auth-wide">
                Telefone / WhatsApp
                <input
                  type="tel"
                  name="telefone"
                  value={cadastro.telefone}
                  onChange={atualizarCadastro}
                  autoComplete="tel"
                  required
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  name="senha"
                  value={cadastro.senha}
                  onChange={atualizarCadastro}
                  autoComplete="new-password"
                  minLength="8"
                  required
                />
              </label>
              <label>
                Confirmar senha
                <input
                  type="password"
                  name="confirmarSenha"
                  value={cadastro.confirmarSenha}
                  onChange={atualizarCadastro}
                  autoComplete="new-password"
                  minLength="8"
                  required
                />
              </label>
            </div>
            <label className="cliente-auth-terms">
              <input
                type="checkbox"
                name="termos"
                checked={cadastro.termos}
                onChange={atualizarCadastro}
              />
              <span>Li e concordo com os termos e condições</span>
            </label>
            <button
              className="cliente-auth-primary"
              type="submit"
              disabled={processando}
            >
              {processando ? 'Criando conta...' : 'Criar conta'}
            </button>
            <button
              className="cliente-auth-link"
              type="button"
              onClick={() => {
                setMensagem(null)
                setTela('entrar')
              }}
            >
              Já tenho uma conta
            </button>
          </form>
        ) : tela === 'recuperar' ? (
          <form
            className="cliente-auth-form"
            onSubmit={enviarRecuperacao}
          >
            <p>Informe seu e-mail para receber as instruções.</p>
            {mostrarMensagem()}
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <button
              className="cliente-auth-primary"
              type="submit"
              disabled={processando}
            >
              {processando ? 'Enviando...' : 'Enviar recuperação'}
            </button>
            <button
              className="cliente-auth-link"
              type="button"
              onClick={() => {
                setMensagem(null)
                setTela('entrar')
              }}
            >
              Voltar para entrar
            </button>
          </form>
        ) : (
          <form
            className="cliente-auth-form"
            onSubmit={entrar}
          >
            <p>Entre para preencher seus dados automaticamente.</p>
            {mostrarMensagem()}
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button
              className="cliente-auth-link cliente-auth-forgot"
              type="button"
              onClick={() => {
                setMensagem(null)
                setTela('recuperar')
              }}
            >
              Esqueci minha senha
            </button>
            <button
              className="cliente-auth-primary"
              type="submit"
              disabled={processando}
            >
              {processando ? 'Entrando...' : 'Entrar'}
            </button>
            <button
              className="cliente-auth-secondary"
              type="button"
              onClick={() => {
                setMensagem(null)
                setTela('cadastro')
              }}
            >
              Criar conta
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

export default ClienteAuth
