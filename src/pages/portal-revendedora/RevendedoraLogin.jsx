import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { carregarPerfilRevendedoraLogada } from '../../storage'
import './PortalRevendedora.css'

export default function RevendedoraLogin({ onNavegar, onLoginSucesso }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucessoMsg, setSucessoMsg] = useState('')
  const [modoEsqueciSenha, setModoEsqueciSenha] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setErro('')
    setSucessoMsg('')

    const emailLimpo = email.trim().toLowerCase()
    if (!emailLimpo || !senha) {
      setErro('Informe seu e-mail e sua senha.')
      return
    }

    try {
      setCarregando(true)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password: senha
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErro('E-mail ou senha incorretos.')
        } else {
          setErro(error.message || 'Erro ao realizar login.')
        }
        return
      }

      if (data?.user) {
        // Verifica vínculo na tabela revendedoras
        const perfil = await carregarPerfilRevendedoraLogada(data.user.id)
        if (!perfil) {
          await supabase.auth.signOut()
          setErro('Esta conta não está vinculada a nenhuma revendedora cadastrada no Bazar.')
          return
        }

        if (perfil.status_acesso === 'BLOQUEADO') {
          await supabase.auth.signOut()
          setErro('Seu acesso ao portal está bloqueado pelo Bazar. Entre em contato com a administração.')
          return
        }

        if (perfil.status !== 'Ativa') {
          await supabase.auth.signOut()
          setErro('Seu cadastro de revendedora não está ativo no momento.')
          return
        }

        if (onLoginSucesso) {
          onLoginSucesso(perfil)
        }
        if (onNavegar) {
          onNavegar('/revendedora')
        }
      }
    } catch (err) {
      console.error('Erro ao fazer login:', err)
      setErro('Erro inesperado ao conectar. Verifique sua conexão e tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  const handleEsqueciSenha = async (e) => {
    e.preventDefault()
    setErro('')
    setSucessoMsg('')

    const emailLimpo = email.trim().toLowerCase()
    if (!emailLimpo) {
      setErro('Informe o seu e-mail para receber o link de redefinição.')
      return
    }

    try {
      setCarregando(true)
      const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, {
        redirectTo: `${window.location.origin}/revendedora/login`
      })

      if (error) {
        setErro(error.message || 'Erro ao enviar instruções.')
        return
      }

      setSucessoMsg('Instruções para redefinição de senha enviadas para seu e-mail.')
      setModoEsqueciSenha(false)
    } catch (err) {
      console.error('Erro ao resetar senha:', err)
      setErro('Erro ao processar solicitação de recuperação de senha.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-login-brand-symbol">✿</div>
        <h1 className="portal-login-title">Bazar Encanto Feminino</h1>
        <div className="portal-badge-portal" style={{ margin: '0 auto 16px auto', width: 'fit-content' }}>
          Portal da Revendedora
        </div>

        <p className="portal-login-subtitle">
          {modoEsqueciSenha
            ? 'Digite seu e-mail cadastrado para redefinir sua senha'
            : 'Acesse suas peças, registre vendas e acompanhe suas comissões'}
        </p>

        {erro && (
          <div
            style={{
              background: 'var(--danger-light, #F5E3DE)',
              color: 'var(--danger, #B85F4A)',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '16px',
              textAlign: 'left'
            }}
          >
            {erro}
          </div>
        )}

        {sucessoMsg && (
          <div
            style={{
              background: 'var(--success-light, #E8EEE2)',
              color: 'var(--success, #56745A)',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '16px',
              textAlign: 'left'
            }}
          >
            {sucessoMsg}
          </div>
        )}

        {!modoEsqueciSenha ? (
          <form onSubmit={handleLogin}>
            <div className="portal-form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="portal-login-email">E-mail da Revendedora</label>
              <input
                id="portal-login-email"
                type="email"
                className="portal-form-input"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={carregando}
              />
            </div>

            <div className="portal-form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="portal-login-senha">Senha de Acesso</label>
              <input
                id="portal-login-senha"
                type="password"
                className="portal-form-input"
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
                disabled={carregando}
              />
            </div>

            <button
              type="submit"
              className="portal-btn-submit"
              disabled={carregando}
              style={{ marginTop: '8px' }}
            >
              {carregando ? 'Entrando...' : 'ENTRAR NO PORTAL'}
            </button>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--primary, #234B36)', cursor: 'pointer', padding: 0 }}
                onClick={() => setModoEsqueciSenha(true)}
              >
                Esqueci minha senha
              </button>

              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #6E746B)', cursor: 'pointer', padding: 0 }}
                onClick={() => (onNavegar ? onNavegar('/') : (window.location.href = '/'))}
              >
                ← Ir para a Loja
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleEsqueciSenha}>
            <div className="portal-form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="portal-recuperar-email">E-mail Cadastrado</label>
              <input
                id="portal-recuperar-email"
                type="email"
                className="portal-form-input"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={carregando}
              />
            </div>

            <button
              type="submit"
              className="portal-btn-submit"
              disabled={carregando}
              style={{ marginTop: '8px' }}
            >
              {carregando ? 'Enviando...' : 'ENVIAR INSTRUÇÕES'}
            </button>

            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px' }}>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--primary, #234B36)', cursor: 'pointer' }}
                onClick={() => setModoEsqueciSenha(false)}
              >
                ← Voltar para o Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
