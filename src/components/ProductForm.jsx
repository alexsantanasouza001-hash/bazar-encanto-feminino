import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CORES_PADRAO_SUGESTO, normalizarVariacoesProduto } from '../pages/variacoesHelpers.js'

const TAMANHOS_GRADE = ['PP', 'P', 'M', 'G', 'GG']

function criarVariacaoVazia(nome = 'Verde Tropical', hex = '#234B36', index = 0) {
  return {
    id: `temp-var-${Date.now()}-${index}`,
    cor_nome: nome,
    cor_hex: hex,
    fotos: [],
    tamanhos: {
      PP: 0,
      P: 0,
      M: 0,
      G: 0,
      GG: 0
    }
  }
}

function ProductForm({
  onClose,
  onAddProduct,
  onUpdateProduct,
  produtoEditando
}) {
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [variacaoAtivaUpload, setVariacaoAtivaUpload] = useState(0)
  const inputFotoRef = useRef(null)

  const [form, setForm] = useState({
    nome: '',
    marca: '',
    categoria: '',
    custo: '',
    venda: '',
    sku: '',
    fornecedor: '',
    descricao: '',
    peso_kg: '0.300',
    altura_cm: '4',
    largura_cm: '20',
    comprimento_cm: '25'
  })

  const [variacoes, setVariacoes] = useState([
    criarVariacaoVazia('Verde Tropical', '#234B36', 0)
  ])

  // =====================================================
  // CARREGAR PRODUTO PARA EDIÇÃO
  // =====================================================

  useEffect(() => {
    if (!produtoEditando) {
      setForm({
        nome: '',
        marca: '',
        categoria: '',
        custo: '',
        venda: '',
        sku: '',
        fornecedor: '',
        descricao: '',
        peso_kg: '0.300',
        altura_cm: '4',
        largura_cm: '20',
        comprimento_cm: '25'
      })
      setVariacoes([criarVariacaoVazia('Verde Tropical', '#234B36', 0)])
      return
    }

    setForm({
      nome: produtoEditando.nome || '',
      marca: produtoEditando.marca || '',
      categoria: produtoEditando.categoria || '',
      custo: produtoEditando.custo ?? '',
      venda: produtoEditando.venda ?? '',
      sku: produtoEditando.sku || '',
      fornecedor: produtoEditando.fornecedor || '',
      descricao: produtoEditando.descricao || '',
      peso_kg: String(produtoEditando.peso_kg || '0.300'),
      altura_cm: String(produtoEditando.altura_cm || '4'),
      largura_cm: String(produtoEditando.largura_cm || '20'),
      comprimento_cm: String(produtoEditando.comprimento_cm || '25')
    })

    const varsNormalizadas = normalizarVariacoesProduto(produtoEditando)

    if (varsNormalizadas.length > 0) {
      const varsParaForm = varsNormalizadas.map((v, vIdx) => {
        const mapaTamanhos = { PP: 0, P: 0, M: 0, G: 0, GG: 0 }
        for (const t of (v.tamanhos || [])) {
          const tamKey = String(t.tamanho).toUpperCase()
          mapaTamanhos[tamKey] = Number(t.quantidade || 0)
        }

        const fotosList = (v.fotos || []).map((f, fIdx) => ({
          id: f.id || `f-${vIdx}-${fIdx}`,
          foto: typeof f === 'string' ? f : f.foto,
          ordem: f.ordem ?? fIdx
        }))

        return {
          id: v.id || `var-${produtoEditando.id}-${vIdx}`,
          cor_nome: v.cor_nome || 'Única',
          cor_hex: v.cor_hex || '#234B36',
          fotos: fotosList,
          tamanhos: mapaTamanhos
        }
      })
      setVariacoes(varsParaForm)
    } else {
      setVariacoes([criarVariacaoVazia(produtoEditando.cor || 'Única', '#234B36', 0)])
    }
  }, [produtoEditando])

  // =====================================================
  // MANIPULAÇÃO DE VARIAÇÕES
  // =====================================================

  const adicionarVariacao = () => {
    const proximaSugestao = CORES_PADRAO_SUGESTO[variacoes.length % CORES_PADRAO_SUGESTO.length]
    setVariacoes((atuais) => [
      ...atuais,
      criarVariacaoVazia(
        proximaSugestao.nome,
        proximaSugestao.hex,
        atuais.length
      )
    ])
  }

  const removerVariacao = (index) => {
    if (variacoes.length <= 1) {
      alert('O produto precisa ter pelo menos 1 variação de cor.')
      return
    }
    setVariacoes((atuais) => atuais.filter((_, idx) => idx !== index))
  }

  const atualizarCampoVariacao = (index, campo, valor) => {
    setVariacoes((atuais) =>
      atuais.map((v, idx) => (idx === index ? { ...v, [campo]: valor } : v))
    )
  }

  const alterarQtdTamanho = (varIndex, tamanho, valor) => {
    const qtd = Math.max(0, parseInt(valor, 10) || 0)
    setVariacoes((atuais) =>
      atuais.map((v, idx) => {
        if (idx !== varIndex) return v
        return {
          ...v,
          tamanhos: {
            ...v.tamanhos,
            [tamanho]: qtd
          }
        }
      })
    )
  }

  // =====================================================
  // TOTAL DE ESTOQUE GERAL
  // =====================================================

  const quantidadeTotal = variacoes.reduce((totalGeral, v) => {
    const totalVar = Object.values(v.tamanhos || {}).reduce(
      (acc, qtd) => acc + (Number(qtd) || 0),
      0
    )
    return totalGeral + totalVar
  }, 0)

  // =====================================================
  // UPLOAD DE FOTOS POR VARIAÇÃO
  // =====================================================

  const dispararUploadFoto = (varIndex) => {
    setVariacaoAtivaUpload(varIndex)
    if (inputFotoRef.current) {
      inputFotoRef.current.value = ''
      inputFotoRef.current.click()
    }
  }

  const enviarFotoArquivo = async (arquivo) => {
    if (!arquivo) return

    if (!arquivo.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem válido.')
      return
    }

    if (arquivo.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5 MB.')
      return
    }

    try {
      setEnviandoFoto(true)
      const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
      const nomeArquivo = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${extensao}`
      const caminho = `produtos/${nomeArquivo}`

      const { error: erroUpload } = await supabase.storage
        .from('produtos')
        .upload(caminho, arquivo, {
          cacheControl: '3600',
          upsert: false,
          contentType: arquivo.type
        })

      if (erroUpload) {
        console.error('Erro no upload de foto:', erroUpload)
        alert('Não foi possível enviar a foto: ' + erroUpload.message)
        return
      }

      const { data: urlData } = supabase.storage.from('produtos').getPublicUrl(caminho)
      const urlFinal = urlData?.publicUrl

      if (urlFinal) {
        setVariacoes((atuais) =>
          atuais.map((v, idx) => {
            if (idx !== variacaoAtivaUpload) return v
            const novaFoto = {
              id: `foto-${Date.now()}`,
              foto: urlFinal,
              ordem: (v.fotos || []).length
            }
            return {
              ...v,
              fotos: [...(v.fotos || []), novaFoto]
            }
          })
        )
      }
    } catch (erro) {
      console.error('Erro inesperado no envio de foto:', erro)
      alert('Erro inesperado ao enviar a foto.')
    } finally {
      setEnviandoFoto(false)
    }
  }

  const removerFotoVariacao = (varIndex, fotoIndex) => {
    setVariacoes((atuais) =>
      atuais.map((v, idx) => {
        if (idx !== varIndex) return v
        const novasFotos = (v.fotos || []).filter((_, fIdx) => fIdx !== fotoIndex)
        return { ...v, fotos: novasFotos }
      })
    )
  }

  // =====================================================
  // SUBMIT DO FORMULÁRIO
  // =====================================================

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!form.nome.trim()) {
      alert('Por favor, informe o nome do produto.')
      return
    }

    const custoNum = parseFloat(String(form.custo).replace(',', '.')) || 0
    const vendaNum = parseFloat(String(form.venda).replace(',', '.')) || 0
    const pesoNum = Math.max(0.001, parseFloat(String(form.peso_kg).replace(',', '.')) || 0.300)
    const alturaNum = Math.max(1, parseFloat(String(form.altura_cm).replace(',', '.')) || 4)
    const larguraNum = Math.max(1, parseFloat(String(form.largura_cm).replace(',', '.')) || 20)
    const comprimentoNum = Math.max(1, parseFloat(String(form.comprimento_cm).replace(',', '.')) || 25)

    if (vendaNum <= 0) {
      alert('Por favor, informe um preço de venda válido maior que zero.')
      return
    }

    if (pesoNum <= 0 || alturaNum <= 0 || larguraNum <= 0 || comprimentoNum <= 0) {
      alert('Os dados de envio (peso e dimensões) devem ser maiores que zero.')
      return
    }

    // Estruturar variações para salvar
    const variacoesFinais = variacoes.map((v, vIdx) => {
      const tamanhosArr = Object.entries(v.tamanhos || {}).map(([tam, qtd]) => ({
        tamanho: tam,
        quantidade: Math.max(0, Number(qtd) || 0)
      }))

      return {
        id: typeof v.id === 'number' ? v.id : undefined,
        cor_nome: v.cor_nome.trim() || `Cor ${vIdx + 1}`,
        cor_hex: v.cor_hex || '#234B36',
        fotos: v.fotos || [],
        foto: v.fotos?.[0]?.foto || null,
        tamanhos: tamanhosArr,
        ativo: true,
        ordem: vIdx
      }
    })

    const totalCalculado = variacoesFinais.reduce((totalGeral, v) => {
      const totalVar = v.tamanhos.reduce((sub, t) => sub + (Number(t.quantidade) || 0), 0)
      return totalGeral + totalVar
    }, 0)

    const payload = {
      ...(produtoEditando || {}),
      nome: form.nome.trim(),
      marca: form.marca.trim(),
      categoria: form.categoria.trim(),
      custo: custoNum,
      venda: vendaNum,
      sku: form.sku.trim(),
      fornecedor: form.fornecedor.trim(),
      descricao: form.descricao.trim(),
      peso_kg: pesoNum,
      altura_cm: alturaNum,
      largura_cm: larguraNum,
      comprimento_cm: comprimentoNum,
      quantidade: totalCalculado,
      cor: variacoesFinais[0]?.cor_nome || '',
      foto: variacoesFinais[0]?.fotos?.[0]?.foto || null,
      fotos: variacoesFinais.flatMap((v) => v.fotos),
      variacoes: variacoesFinais
    }

    if (produtoEditando) {
      onUpdateProduct(payload)
    } else {
      onAddProduct(payload)
    }
  }

  return (
    <div className="product-form-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="product-form-modal">
        <div className="product-form-header">
          <h2>{produtoEditando ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button type="button" className="product-form-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="product-form-body">
          {/* DADOS PRINCIPAIS */}
          <section className="product-form-section">
            <h3 className="product-form-section-title">Dados do Produto</h3>
            <div className="product-form-grid">
              <div className="form-group form-group-full">
                <label>Nome do Produto *</label>
                <input
                  type="text"
                  name="nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Vestido Tropical Elegance"
                  required
                />
              </div>

              <div className="form-group">
                <label>Categoria</label>
                <input
                  type="text"
                  name="categoria"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  placeholder="Ex: Vestidos, Blusas, Calças"
                />
              </div>

              <div className="form-group">
                <label>Marca</label>
                <input
                  type="text"
                  name="marca"
                  value={form.marca}
                  onChange={(e) => setForm({ ...form, marca: e.target.value })}
                  placeholder="Ex: Farm, Bazar Encanto"
                />
              </div>

              <div className="form-group">
                <label>Preço de Venda (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="venda"
                  value={form.venda}
                  onChange={(e) => setForm({ ...form, venda: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>

              <div className="form-group">
                <label>Preço de Custo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="custo"
                  value={form.custo}
                  onChange={(e) => setForm({ ...form, custo: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div className="form-group">
                <label>Código / SKU</label>
                <input
                  type="text"
                  name="sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="Ex: VEST-TROP-01"
                />
              </div>

              <div className="form-group">
                <label>Fornecedor</label>
                <input
                  type="text"
                  name="fornecedor"
                  value={form.fornecedor}
                  onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                  placeholder="Nome do fornecedor"
                />
              </div>

              <div className="form-group form-group-full">
                <label>Descrição da Peça</label>
                <textarea
                  name="descricao"
                  rows="3"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Detalhes sobre o tecido, caimento e estilo..."
                />
              </div>
            </div>
          </section>

          {/* DADOS DE ENVIO / LOGÍSTICA */}
          <section className="product-form-section">
            <h3 className="product-form-section-title">Dados de Envio (Melhor Envio)</h3>
            <p className="product-form-section-subtitle">
              Dimensões e peso do pacote para cotação automática de frete no Checkout.
            </p>
            <div className="product-form-grid">
              <div className="form-group">
                <label>Peso (kg) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  name="peso_kg"
                  value={form.peso_kg}
                  onChange={(e) => setForm({ ...form, peso_kg: e.target.value })}
                  placeholder="0.300"
                  required
                />
              </div>

              <div className="form-group">
                <label>Altura (cm) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  name="altura_cm"
                  value={form.altura_cm}
                  onChange={(e) => setForm({ ...form, altura_cm: e.target.value })}
                  placeholder="4"
                  required
                />
              </div>

              <div className="form-group">
                <label>Largura (cm) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  name="largura_cm"
                  value={form.largura_cm}
                  onChange={(e) => setForm({ ...form, largura_cm: e.target.value })}
                  placeholder="20"
                  required
                />
              </div>

              <div className="form-group">
                <label>Comprimento (cm) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  name="comprimento_cm"
                  value={form.comprimento_cm}
                  onChange={(e) => setForm({ ...form, comprimento_cm: e.target.value })}
                  placeholder="25"
                  required
                />
              </div>
            </div>
          </section>

          {/* VARIAÇÕES DE COR E ESTOQUE */}
          <section className="product-form-section">
            <div className="product-form-section-header">
              <div>
                <h3 className="product-form-section-title">Cores, Fotos e Estoque</h3>
                <p className="product-form-section-subtitle">
                  Cadastre cada variação de cor com suas próprias fotos e grade PP, P, M, G, GG.
                </p>
              </div>
              <button
                type="button"
                className="btn-add-variacao"
                onClick={adicionarVariacao}
              >
                + Adicionar Cor
              </button>
            </div>

            <div className="product-variacoes-list">
              {variacoes.map((v, vIdx) => {
                const totalVar = Object.values(v.tamanhos || {}).reduce(
                  (acc, qtd) => acc + (Number(qtd) || 0),
                  0
                )

                return (
                  <div key={v.id || vIdx} className="product-variacao-card">
                    <div className="product-variacao-header">
                      <div className="product-variacao-cor-badge">
                        <span
                          className="cor-preview-circulo"
                          style={{ backgroundColor: v.cor_hex }}
                        />
                        <strong>Cor #{vIdx + 1}: {v.cor_nome || 'Sem nome'}</strong>
                        <span className="cor-total-estoque">({totalVar} un.)</span>
                      </div>

                      {variacoes.length > 1 && (
                        <button
                          type="button"
                          className="btn-remover-variacao"
                          onClick={() => removerVariacao(vIdx)}
                          title="Remover esta cor"
                        >
                          ✕ Remover Cor
                        </button>
                      )}
                    </div>

                    <div className="product-variacao-grid">
                      {/* NOME DA COR E SELETOR HEX */}
                      <div className="form-group">
                        <label>Nome da Cor *</label>
                        <input
                          type="text"
                          value={v.cor_nome}
                          onChange={(e) =>
                            atualizarCampoVariacao(vIdx, 'cor_nome', e.target.value)
                          }
                          placeholder="Ex: Verde Tropical"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Cor Visual (HEX)</label>
                        <div className="cor-picker-wrapper">
                          <input
                            type="color"
                            className="cor-color-input"
                            value={v.cor_hex}
                            onChange={(e) =>
                              atualizarCampoVariacao(vIdx, 'cor_hex', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            className="cor-hex-text-input"
                            value={v.cor_hex}
                            onChange={(e) =>
                              atualizarCampoVariacao(vIdx, 'cor_hex', e.target.value)
                            }
                            placeholder="#234B36"
                          />
                        </div>
                      </div>

                      {/* SUGESTÕES RÁPIDAS DE CORES */}
                      <div className="form-group form-group-full">
                        <label className="label-sugestoes">Sugestões rápidas:</label>
                        <div className="cor-sugestoes-grid">
                          {CORES_PADRAO_SUGESTO.map((sug) => (
                            <button
                              key={sug.nome}
                              type="button"
                              className="cor-sugestao-pill"
                              onClick={() => {
                                atualizarCampoVariacao(vIdx, 'cor_nome', sug.nome)
                                atualizarCampoVariacao(vIdx, 'cor_hex', sug.hex)
                              }}
                            >
                              <span
                                className="cor-sugestao-dot"
                                style={{ backgroundColor: sug.hex }}
                              />
                              <span>{sug.nome}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* FOTOS DA COR */}
                      <div className="form-group form-group-full">
                        <label>Fotos desta Cor ({v.fotos?.length || 0})</label>
                        <div className="variacao-fotos-container">
                          {v.fotos && v.fotos.length > 0 && (
                            <div className="variacao-fotos-grid">
                              {v.fotos.map((f, fIdx) => (
                                <div key={f.id || fIdx} className="variacao-foto-thumb-wrap">
                                  <img src={f.foto} alt={`Foto ${fIdx + 1}`} className="variacao-foto-thumb" />
                                  <button
                                    type="button"
                                    className="btn-remover-foto-thumb"
                                    onClick={() => removerFotoVariacao(vIdx, fIdx)}
                                    title="Remover foto"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            className="btn-upload-foto-variacao"
                            onClick={() => dispararUploadFoto(vIdx)}
                            disabled={enviandoFoto}
                          >
                            {enviandoFoto && variacaoAtivaUpload === vIdx
                              ? '⏳ Enviando foto...'
                              : '📷 + Adicionar Foto para esta Cor'}
                          </button>
                        </div>
                      </div>

                      {/* GRADE DE ESTOQUE DA COR */}
                      <div className="form-group form-group-full">
                        <label>Grade de Estoque desta Cor (PP, P, M, G, GG)</label>
                        <div className="grade-tamanhos-inputs">
                          {TAMANHOS_GRADE.map((tam) => (
                            <div key={tam} className="grade-tam-col">
                              <span className="grade-tam-label">{tam}</span>
                              <input
                                type="number"
                                min="0"
                                className="grade-tam-input"
                                value={v.tamanhos?.[tam] ?? 0}
                                onChange={(e) =>
                                  alterarQtdTamanho(vIdx, tam, e.target.value)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* INPUT FILE OCULTO */}
          <input
            type="file"
            ref={inputFotoRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                enviarFotoArquivo(e.target.files[0])
              }
            }}
          />

          {/* RODAPÉ DO MODAL COM RESUMO E AÇÕES */}
          <div className="product-form-footer">
            <div className="product-form-resumo">
              <span>Total de Peças: <strong>{quantidadeTotal} un.</strong></span>
              <span>Variações de Cor: <strong>{variacoes.length}</strong></span>
            </div>

            <div className="product-form-acoes">
              <button type="button" className="btn-cancelar-modal" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn-salvar-modal">
                {produtoEditando ? 'Salvar Alterações' : 'Cadastrar Produto'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProductForm