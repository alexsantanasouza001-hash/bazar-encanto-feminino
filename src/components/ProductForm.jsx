import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function ProductForm({
  onClose,
  onAddProduct,
  onUpdateProduct,
  produtoEditando
}) {
  const inputFotoRef = useRef(null)

  const [enviandoFoto, setEnviandoFoto] = useState(false)

  const [form, setForm] = useState({
    nome: '',
    marca: '',
    categoria: '',
    tamanho: '',
    cor: '',
    custo: '',
    venda: '',
    sku: '',
    quantidade: '',
    fornecedor: '',
    descricao: '',
    foto: ''
  })

  // =====================================================
  // CARREGAR PRODUTO PARA EDIÇÃO
  // =====================================================

  useEffect(() => {
    if (produtoEditando) {
      setForm({
        nome: produtoEditando.nome || '',
        marca: produtoEditando.marca || '',
        categoria: produtoEditando.categoria || '',
        tamanho: produtoEditando.tamanho || '',
        cor: produtoEditando.cor || '',
        custo: produtoEditando.custo ?? '',
        venda: produtoEditando.venda ?? '',
        sku: produtoEditando.sku || '',
        quantidade: produtoEditando.quantidade ?? '',
        fornecedor: produtoEditando.fornecedor || '',
        descricao: produtoEditando.descricao || '',
        foto: produtoEditando.foto || ''
      })
    } else {
      setForm({
        nome: '',
        marca: '',
        categoria: '',
        tamanho: '',
        cor: '',
        custo: '',
        venda: '',
        sku: '',
        quantidade: '',
        fornecedor: '',
        descricao: '',
        foto: ''
      })
    }
  }, [produtoEditando])

  // =====================================================
  // ALTERAR CAMPOS
  // =====================================================

  const handleChange = (e) => {
    const { name, value } = e.target

    setForm((formAtual) => ({
      ...formAtual,
      [name]: value
    }))
  }

  // =====================================================
  // ENVIAR FOTO PARA O SUPABASE
  // =====================================================

  const handleFotoChange = async (e) => {
    const arquivo = e.target.files?.[0]

    if (!arquivo) {
      return
    }

    if (!arquivo.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem válido.')
      return
    }

    const tamanhoMaximo = 5 * 1024 * 1024

    if (arquivo.size > tamanhoMaximo) {
      alert('A imagem deve ter no máximo 5 MB.')
      return
    }

    try {
      setEnviandoFoto(true)

      // =================================================
      // CRIAR NOME ÚNICO PARA A FOTO
      // =================================================

      const extensao =
        arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'

      const nomeArquivo =
        String(Date.now()) +
        '-' +
        String(Math.random().toString(36).substring(2, 10)) +
        '.' +
        extensao

      const caminhoArquivo =
        'produtos/' + nomeArquivo

      // =================================================
      // UPLOAD PARA O BUCKET PRODUTOS
      // =================================================

      const { error: erroUpload } =
        await supabase.storage
          .from('produtos')
          .upload(caminhoArquivo, arquivo, {
            cacheControl: '3600',
            upsert: false,
            contentType: arquivo.type
          })

      if (erroUpload) {
        console.error(
          'Erro ao enviar foto para o Supabase:',
          erroUpload
        )

        alert(
          'Não foi possível enviar a foto para o servidor.\n\n' +
          (erroUpload.message || '')
        )

        return
      }

      // =================================================
      // PEGAR URL PÚBLICA
      // =================================================

      const {
        data: urlData
      } = supabase.storage
        .from('produtos')
        .getPublicUrl(caminhoArquivo)

      const urlPublica =
        urlData?.publicUrl || ''

      if (!urlPublica) {
        alert(
          'A foto foi enviada, mas não foi possível gerar a URL pública.'
        )
        return
      }

      // =================================================
      // SALVAR URL NO FORMULÁRIO
      // =================================================

      setForm((formAtual) => ({
        ...formAtual,
        foto: urlPublica
      }))

    } catch (erro) {
      console.error(
        'Erro inesperado ao enviar foto:',
        erro
      )

      alert(
        'Ocorreu um erro ao enviar a foto para o servidor.'
      )
    } finally {
      setEnviandoFoto(false)
    }
  }

  // =====================================================
  // REMOVER FOTO
  // =====================================================

  const removerFoto = () => {
    setForm((formAtual) => ({
      ...formAtual,
      foto: ''
    }))

    if (inputFotoRef.current) {
      inputFotoRef.current.value = ''
    }
  }

  // =====================================================
  // CÁLCULO DO LUCRO
  // =====================================================

  const custo =
    Number(form.custo) || 0

  const venda =
    Number(form.venda) || 0

  const lucro =
    venda - custo

  const margem =
    venda > 0
      ? ((lucro / venda) * 100).toFixed(1)
      : '0.0'

  // =====================================================
  // SALVAR PRODUTO
  // =====================================================

  const handleSubmit = (e) => {
    e.preventDefault()

    if (enviandoFoto) {
      alert(
        'Aguarde o envio da foto terminar.'
      )
      return
    }

    if (!form.nome.trim()) {
      alert('Digite o nome do produto.')
      return
    }

    if (
      !form.venda ||
      Number(form.venda) <= 0
    ) {
      alert('Digite um preço de venda válido.')
      return
    }

    const produto = {
      ...form,

      nome:
        form.nome.trim(),

      custo,

      venda,

      lucro,

      margem:
        Number(margem),

      quantidade:
        Number(form.quantidade) || 0,

      foto:
        form.foto || ''
    }

    if (produtoEditando) {
      produto.id =
        produtoEditando.id

      onUpdateProduct(produto)
    } else {
      onAddProduct(produto)
    }

    onClose()
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="modal-overlay">

      <div className="product-modal">

        {/* =================================================
            CABEÇALHO
        ================================================= */}

        <div className="modal-header">

          <div>

            <h2>
              {produtoEditando
                ? 'Editar produto'
                : 'Novo produto'}
            </h2>

            <p>
              {produtoEditando
                ? 'Atualize as informações da peça'
                : 'Cadastre uma nova peça no seu bazar'}
            </p>

          </div>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
          >
            ✕
          </button>

        </div>

        {/* =================================================
            FORMULÁRIO
        ================================================= */}

        <form onSubmit={handleSubmit}>

          {/* =================================================
              FOTO
          ================================================= */}

          <div className="photo-area">

            <div
              className="photo-preview"
              onClick={() => {
                if (!enviandoFoto) {
                  inputFotoRef.current?.click()
                }
              }}
            >

              {form.foto ? (

                <img
                  src={form.foto}
                  alt="Prévia do produto"
                />

              ) : (

                <div className="photo-placeholder">
                  📷
                </div>

              )}

            </div>

            <div className="photo-content">

              <strong>
                Foto da peça
              </strong>

              <p>
                {enviandoFoto
                  ? 'Enviando foto para o servidor...'
                  : 'Adicione uma foto para exibir o produto na loja.'}
              </p>

              <div className="photo-actions">

                <button
                  type="button"
                  className="photo-button"
                  disabled={enviandoFoto}
                  onClick={() =>
                    inputFotoRef.current?.click()
                  }
                >
                  {enviandoFoto
                    ? 'Enviando...'
                    : form.foto
                      ? 'Trocar foto'
                      : 'Adicionar foto'}
                </button>

                {form.foto && !enviandoFoto && (

                  <button
                    type="button"
                    className="photo-remove-button"
                    onClick={removerFoto}
                  >
                    Remover
                  </button>

                )}

              </div>

              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                onChange={handleFotoChange}
                style={{
                  display: 'none'
                }}
              />

            </div>

          </div>

          {/* =================================================
              NOME
          ================================================= */}

          <div className="form-group">

            <label>
              Nome do produto *
            </label>

            <input
              name="nome"
              value={form.nome}
              onChange={handleChange}
              placeholder="Ex: Vestido estampado"
            />

          </div>

          {/* =================================================
              MARCA / CATEGORIA
          ================================================= */}

          <div className="form-row">

            <div className="form-group">

              <label>
                Marca
              </label>

              <input
                name="marca"
                value={form.marca}
                onChange={handleChange}
                placeholder="Ex: Farm"
              />

            </div>

            <div className="form-group">

              <label>
                Categoria
              </label>

              <select
                name="categoria"
                value={form.categoria}
                onChange={handleChange}
              >

                <option value="">
                  Selecione
                </option>

                <option value="Vestidos">
                  Vestidos
                </option>

                <option value="Blusas">
                  Blusas
                </option>

                <option value="Calças">
                  Calças
                </option>

                <option value="Shorts">
                  Shorts
                </option>

                <option value="Saias">
                  Saias
                </option>

                <option value="Conjuntos">
                  Conjuntos
                </option>

                <option value="Outros">
                  Outros
                </option>

              </select>

            </div>

          </div>

          {/* =================================================
              TAMANHO / COR
          ================================================= */}

          <div className="form-row">

            <div className="form-group">

              <label>
                Tamanho
              </label>

              <select
                name="tamanho"
                value={form.tamanho}
                onChange={handleChange}
              >

                <option value="">
                  Selecione
                </option>

                <option value="PP">
                  PP
                </option>

                <option value="P">
                  P
                </option>

                <option value="M">
                  M
                </option>

                <option value="G">
                  G
                </option>

                <option value="GG">
                  GG
                </option>

                <option value="36">
                  36
                </option>

                <option value="38">
                  38
                </option>

                <option value="40">
                  40
                </option>

                <option value="42">
                  42
                </option>

              </select>

            </div>

            <div className="form-group">

              <label>
                Cor
              </label>

              <input
                name="cor"
                value={form.cor}
                onChange={handleChange}
                placeholder="Ex: Azul"
              />

            </div>

          </div>

          {/* =================================================
              CUSTO / VENDA
          ================================================= */}

          <div className="form-row">

            <div className="form-group">

              <label>
                Preço de custo
              </label>

              <input
                type="number"
                step="0.01"
                min="0"
                name="custo"
                value={form.custo}
                onChange={handleChange}
                placeholder="0,00"
              />

            </div>

            <div className="form-group">

              <label>
                Preço de venda *
              </label>

              <input
                type="number"
                step="0.01"
                min="0"
                name="venda"
                value={form.venda}
                onChange={handleChange}
                placeholder="0,00"
              />

            </div>

          </div>

          {/* =================================================
              LUCRO
          ================================================= */}

          <div className="profit-box">

            <div>

              <span>
                Lucro por peça
              </span>

              <strong>
                R$ {lucro.toFixed(2)}
              </strong>

            </div>

            <div>

              <span>
                Margem
              </span>

              <strong>
                {margem}%
              </strong>

            </div>

          </div>

          {/* =================================================
              SKU / QUANTIDADE
          ================================================= */}

          <div className="form-row">

            <div className="form-group">

              <label>
                Código / SKU
              </label>

              <input
                name="sku"
                value={form.sku}
                onChange={handleChange}
                placeholder="Ex: VES-001"
              />

            </div>

            <div className="form-group">

              <label>
                Quantidade
              </label>

              <input
                type="number"
                min="0"
                name="quantidade"
                value={form.quantidade}
                onChange={handleChange}
                placeholder="0"
              />

            </div>

          </div>

          {/* =================================================
              FORNECEDOR
          ================================================= */}

          <div className="form-group">

            <label>
              Fornecedor
            </label>

            <input
              name="fornecedor"
              value={form.fornecedor}
              onChange={handleChange}
              placeholder="Nome do fornecedor"
            />

          </div>

          {/* =================================================
              DESCRIÇÃO
          ================================================= */}

          <div className="form-group">

            <label>
              Descrição
            </label>

            <textarea
              name="descricao"
              value={form.descricao}
              onChange={handleChange}
              placeholder="Descreva a peça..."
              rows="4"
            />

          </div>

          {/* =================================================
              BOTÕES
          ================================================= */}

          <div className="modal-actions">

            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
              disabled={enviandoFoto}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="save-button"
              disabled={enviandoFoto}
            >
              {produtoEditando
                ? 'Salvar alterações'
                : 'Cadastrar produto'}
            </button>

          </div>

        </form>

      </div>

    </div>
  )
}

export default ProductForm