import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ViewPerfil({ revendedora, usuario, onSenhaAlterada }) {
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [alterando, setAlterando] = useState(false)
  const [erroSenha, setErroSenha] = useState('')
  const [msgSucesso, setMsgSucesso] = useState('')

  const handleTrocarSenha = async (e) => {
    e.preventDefault()
    setErroSenha('')
    setMsgSucesso('')

    if (novaSenha.length < 6) {
      setErroSenha('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setErroSenha('As senhas não coincidem.')
      return
    }

    try {
      setAlterando(true)
      const { error } = await supabase.auth.updateUser({
        password: novaSenha
      })

      if (error) {
        setErroSenha(error.message || 'Erro ao alterar a senha.')
        return
      }

      setMsgSucesso('Senha atualizada com sucesso!')
      setNovaSenha('')
      setConfirmarSenha('')
      if (onSenhaAlterada) {
        onSenhaAlterada('Sua senha foi alterada com sucesso!')
      }
    } catch (err) {
      console.error('Erro ao atualizar senha:', err)
      setErroSenha('Erro inesperado ao alterar senha.')
    } finally {
      setAlterando(false)
    }
  }

  return (
    <div>
      <div className="portal-section-title">
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontFamily: 'serif' }}>Meu Perfil</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Seus dados cadastrais e configurações de segurança
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div className="portal-form-card">
          <h2 style={{ fontSize: '16px', margin: '0 0 16px 0', color: 'var(--primary)' }}>
            Dados Cadastrais
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Nome</span>
              <strong>{revendedora?.nome}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>E-mail de Login</span>
              <strong>{usuario?.email || revendedora?.email || '-'}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Telefone / WhatsApp</span>
              <strong>{revendedora?.whatsapp || revendedora?.telefone || '-'}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Cidade / Estado</span>
              <strong>{revendedora?.cidade ? `${revendedora.cidade} - ${revendedora.estado || ''}` : '-'}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Comissão Padrão</span>
              <strong>{revendedora?.comissao_padrao || 20}%</strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Status da Conta</span>
              <span className="portal-badge-status confirmada" style={{ display: 'inline-block', marginTop: '2px' }}>
                {revendedora?.status_acesso === 'ATIVO' ? 'Acesso Ativo' : revendedora?.status_acesso}
              </span>
            </div>
          </div>
        </div>

        <div className="portal-form-card">
          <h2 style={{ fontSize: '16px', margin: '0 0 16px 0', color: 'var(--primary)' }}>
            Segurança da Conta
          </h2>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
            Altere sua senha de acesso ao portal da revendedora a qualquer momento:
          </p>

          {erroSenha && (
            <div style={{
              background: 'var(--danger-light, #F5E3DE)',
              color: 'var(--danger, #B85F4A)',
              padding: '10px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '12px'
            }}>
              {erroSenha}
            </div>
          )}

          {msgSucesso && (
            <div style={{
              background: 'var(--success-light, #E8EEE2)',
              color: 'var(--success, #56745A)',
              padding: '10px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '12px'
            }}>
              {msgSucesso}
            </div>
          )}

          <form onSubmit={handleTrocarSenha}>
            <div className="portal-form-group">
              <label htmlFor="perfil-nova-senha">Nova Senha</label>
              <input
                id="perfil-nova-senha"
                type="password"
                className="portal-form-input"
                placeholder="Mínimo de 6 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                disabled={alterando}
              />
            </div>

            <div className="portal-form-group">
              <label htmlFor="perfil-conf-senha">Confirmar Nova Senha</label>
              <input
                id="perfil-conf-senha"
                type="password"
                className="portal-form-input"
                placeholder="Repita a nova senha"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                required
                disabled={alterando}
              />
            </div>

            <button
              type="submit"
              className="portal-btn-submit"
              disabled={alterando || !novaSenha}
            >
              {alterando ? 'Alterando...' : 'SALVAR NOVA SENHA'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
