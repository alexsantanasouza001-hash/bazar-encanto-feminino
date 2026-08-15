import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './AdminAuth.css'

function AdminAuth({
  carregando = false,
  acessoNegado = false,
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
        ) : acessoNegado ? (
          <div className="admin-auth-state">
            <div className="admin-auth-state-icon" aria-hidden="true">!</div>
            <span className="admin-auth-eyebrow">ACESSO RESTRITO</span>
            <h1>Acesso não autorizado.</h1>
            <p>
              A conta {usuario?.email && <strong>{usuario.email}</strong>} não
              possui permissão administrativa.
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
              <p>Entre com a conta autorizada para administrar o Bazar.</p>
            </div>

            <form className="admin-auth-form" onSubmit={entrar}>
              <label htmlFor="admin-email">
                E-mail
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  placeholder="admin@exemplo.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label htmlFor="admin-senha">
                Senha
                <input
                  id="admin-senha"
                  type="password"
                  value={senha}
                  onChange={(evento) => setSenha(evento.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                />
              </label>

              {erro && <div className="admin-auth-message error">{erro}</div>}

              <button
                className="admin-auth-primary"
                type="submit"
                disabled={processando}
              >
                {processando ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <button
              className="admin-auth-store-link"
              type="button"
              onClick={voltarParaLoja}
            >
              ← Voltar para a Loja
            </button>
          </>
        )}
      </section>
    </main>
  )
}

export default AdminAuth
