import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './AdminAuth.css'

function AdminAuth({
  carregando = false,
  acessoNegado = false,
  contaInativa = false,
  usuario = null
}) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  const entrar = async (evento) => {
    evento.preventDefault()
    setErro('')
    setProcessando(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha
    })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setProcessando(false)
    }
  }

  const sair = async () => {
    setErro('')
    setProcessando(true)

    const { error } = await supabase.auth.signOut({
      scope: 'local'
    })

    if (error) {
      setErro('Não foi possível encerrar a sessão. Tente novamente.')
      setProcessando(false)
    }
  }

  const voltarParaLoja = () => {
    window.location.href = '/'
  }

  return (
    <main className="admin-auth-page">
      <div className="admin-auth-decoration admin-auth-decoration-one">
        ❧
      </div>

      <div className="admin-auth-decoration admin-auth-decoration-two">
        ❧
      </div>

      <section className="admin-auth-card" aria-live="polite">
        <div className="admin-auth-brand">
          <div className="admin-auth-brand-symbol">✿</div>

          <div>
            <span>Bazar</span>
            <strong>Encanto Feminino</strong>
          </div>
        </div>

        <div className="admin-auth-divider" />

        {carregando ? (
          <div className="admin-auth-state">
            <div className="admin-auth-loader" aria-hidden="true" />
            <h1>Verificando acesso</h1>
            <p>Aguarde um instante.</p>
          </div>
        ) : (acessoNegado || contaInativa) ? (
          <div className="admin-auth-state">
            <div className="admin-auth-state-icon" aria-hidden="true">!</div>
            <span className="admin-auth-eyebrow">ACESSO RESTRITO</span>
            <h1>{contaInativa ? 'Conta desativada' : 'Acesso não autorizado.'}</h1>
            <p>
              {contaInativa ? (
                <>
                  A conta {usuario?.email && <strong>{usuario.email}</strong>} está desativada no momento.
                  Solicite a reativação ao administrador do sistema.
                </>
              ) : (
                <>
                  A conta {usuario?.email && <strong>{usuario.email}</strong>} não
                  possui permissão administrativa.
                </>
              )}
            </p>

            {erro && <div className="admin-auth-message error">{erro}</div>}

            <button
              className="admin-auth-primary"
              type="button"
              onClick={sair}
              disabled={processando}
            >
              {processando ? 'Encerrando sessão...' : 'Sair e entrar com outra conta'}
            </button>

            <button
              className="admin-auth-secondary"
              type="button"
              onClick={voltarParaLoja}
            >
              Voltar para a Loja
            </button>
          </div>
        ) : (
          <>
            <div className="admin-auth-heading">
              <span className="admin-auth-eyebrow">ACESSO RESTRITO</span>
              <h1>Painel administrativo</h1>
              <p>Entre com seu e-mail e senha para acessar o painel do Bazar.</p>
            </div>

            <form className="admin-auth-form" onSubmit={entrar}>
              <label htmlFor="admin-email">
                E-mail
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  placeholder="seu-email@bazar.com"
                  disabled={processando}
                />
              </label>

              <label htmlFor="admin-password">
                Senha
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={senha}
                  onChange={(evento) => setSenha(evento.target.value)}
                  placeholder="Sua senha de acesso"
                  disabled={processando}
                />
              </label>

              {erro && <div className="admin-auth-message error">{erro}</div>}

              <button
                className="admin-auth-primary"
                type="submit"
                disabled={processando}
              >
                {processando ? 'Entrando...' : 'Entrar no painel'}
              </button>

              <button
                className="admin-auth-secondary"
                type="button"
                onClick={voltarParaLoja}
                disabled={processando}
              >
                Voltar para a Loja
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}

export default AdminAuth
