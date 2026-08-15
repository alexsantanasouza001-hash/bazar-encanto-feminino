import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const TAMANHOS_DISPONIVEIS = [
  'PP',
  'P',
  'M',
  'G',
  'GG',
  '36',
  '38',
  '40',
  '42',
  '44',
  '46'
]

function ProductForm({
  onClose,
  onAddProduct,
  onUpdateProduct,
  produtoEditando
}) {
  const inputFotoRef = useRef(null)

  const [enviandoFoto, setEnviandoFoto] =
    useState(false)

  const [fotos, setFotos] = useState([])

  const [tamanhos, setTamanhos] =
    useState({})

  const [form, setForm] = useState({
    nome: '',
    marca: '',
    categoria: '',
    cor: '',
    custo: '',
    venda: '',
    sku: '',
    fornecedor: '',
    descricao: ''
  })

  // =====================================================
  // CARREGAR PRODUTO PARA EDIÇÃO
  // =====================================================

  useEffect(() => {
    async function carregarDadosEdicao() {
      if (!produtoEditando) {
        setForm({
          nome: '',
          marca: '',
          categoria: '',
          cor: '',
          custo: '',
          venda: '',
          sku: '',
          fornecedor: '',
          descricao: ''
        })

        setFotos([])
        setTamanhos({})
        return
      }

      setForm({
        nome: produtoEditando.nome || '',
        marca: produtoEditando.marca || '',
        categoria: produtoEditando.categoria || '',
        cor: produtoEditando.cor || '',
        custo: produtoEditando.custo ?? '',
        venda: produtoEditando.venda ?? '',
        sku: produtoEditando.sku || '',
        fornecedor: produtoEditando.fornecedor || '',
        descricao: produtoEditando.descricao || ''
      })

      // =================================================
      // FOTOS
      // =================================================

      let fotosProduto = []

      if (
        Array.isArray(
          produtoEditando.fotos
        )
      ) {
        fotosProduto =
          produtoEditando.fotos
      } else if (
        produtoEditando.foto
      ) {
        fotosProduto = [
          produtoEditando.foto
        ]
      }

      setFotos(
        fotosProduto
          .filter(Boolean)
          .map((foto, index) => ({
            id:
              foto.id ||
              `foto-${index}`,
            foto:
              typeof foto === 'string'
                ? foto
                : foto.foto,
            ordem:
              foto.ordem ?? index
          }))
      )

      // =================================================
      // TAMANHOS
      // =================================================

      try {
        const {
          data,
          error
        } = await supabase
          .from('produto_tamanhos')
          .select('*')
          .eq(
            'produto_id',
            Number(
              produtoEditando.id
            )
          )
          .order('id', {
            ascending: true
          })

        if (
          !error &&
          Array.isArray(data)
        ) {
          const tamanhosCarregados = {}

          data.forEach((item) => {
            tamanhosCarregados[
              item.tamanho
            ] =
              Number(
                item.quantidade || 0
              )
          })

          setTamanhos(
            tamanhosCarregados
          )
        } else {
          // Compatibilidade com produtos antigos
          if (
            produtoEditando.tamanho
          ) {
            setTamanhos({
              [produtoEditando.tamanho]:
                Number(
                  produtoEditando.quantidade ||
                    0
                )
            })
          } else {
            setTamanhos({})
          }
        }
      } catch (erro) {
        console.error(
          'Erro ao carregar tamanhos:',
          erro
        )

        if (
          produtoEditando.tamanho
        ) {
          setTamanhos({
            [produtoEditando.tamanho]:
              Number(
                produtoEditando.quantidade ||
                  0
              )
          })
        }
      }
    }

    carregarDadosEdicao()
  }, [produtoEditando])

  // =====================================================
  // ALTERAR CAMPOS
  // =====================================================

  const handleChange = (e) => {
    const {
      name,
      value
    } = e.target

    setForm(
      (formAtual) => ({
        ...formAtual,
        [name]: value
      })
    )
  }

  // =====================================================
  // ALTERAR QUANTIDADE DO TAMANHO
  // =====================================================

  const alterarQuantidadeTamanho = (
    tamanho,
    valor
  ) => {
    const quantidade =
      Math.max(
        0,
        Number(valor) || 0
      )

    setTamanhos(
      (tamanhosAtuais) => ({
        ...tamanhosAtuais,
        [tamanho]:
          quantidade
      })
    )
  }

  // =====================================================
  // TOTAL DE ESTOQUE
  // =====================================================

  const quantidadeTotal =
    Object.values(tamanhos).reduce(
      (total, quantidade) =>
        total +
        Number(
          quantidade || 0
        ),
      0
    )

  // =====================================================
  // ENVIAR FOTO
  // =====================================================

  const enviarFoto = async (
    arquivo
  ) => {
    if (!arquivo) {
      return
    }

    if (
      !arquivo.type.startsWith(
        'image/'
      )
    ) {
      alert(
        'Selecione um arquivo de imagem válido.'
      )
      return
    }

    const tamanhoMaximo =
      5 * 1024 * 1024

    if (
      arquivo.size >
      tamanhoMaximo
    ) {
      alert(
        'A imagem deve ter no máximo 5 MB.'
      )
      return
    }

    try {
      setEnviandoFoto(true)

      const extensao =
        arquivo.name
          .split('.')
          .pop()
          ?.toLowerCase() ||
        'jpg'

      const nomeArquivo =
        String(Date.now()) +
        '-' +
        String(
          Math.random()
            .toString(36)
            .substring(
              2,
              10
            )
        ) +
        '.' +
        extensao

      const caminhoArquivo =
        'produtos/' +
        nomeArquivo

      const {
        error: erroUpload
      } =
        await supabase.storage
          .from('produtos')
          .upload(
            caminhoArquivo,
            arquivo,
            {
              cacheControl:
                '3600',
              upsert: false,
              contentType:
                arquivo.type
            }
          )

      if (erroUpload) {
        console.error(
          'Erro ao enviar foto:',
          erroUpload
        )

        alert(
          'Não foi possível enviar a foto.\n\n' +
            (
              erroUpload.message ||
              ''
            )
        )

        return
      }

      const {
        data: urlData
      } =
        supabase.storage
          .from('produtos')
          .getPublicUrl(
            caminhoArquivo
          )

      const urlPublica =
        urlData?.publicUrl ||
        ''

      if (!urlPublica) {
        alert(
          'A foto foi enviada, mas não foi possível gerar a URL.'
        )
        return
      }

      setFotos(
        (fotosAtuais) => [
          ...fotosAtuais,
          {
            id:
              `nova-${Date.now()}-${Math.random()}`,
            foto:
              urlPublica,
            ordem:
              fotosAtuais.length
          }
        ]
      )
    } catch (erro) {
      console.error(
        'Erro ao enviar foto:',
        erro
      )

      alert(
        'Ocorreu um erro ao enviar a foto.'
      )
    } finally {
      setEnviandoFoto(false)

      if (
        inputFotoRef.current
      ) {
        inputFotoRef.current.value =
          ''
      }
    }
  }

  // =====================================================
  // SELECIONAR FOTOS
  // =====================================================

  const handleFotoChange =
    async (e) => {
      const arquivos =
        Array.from(
          e.target.files || []
        )

      if (
        arquivos.length === 0
      ) {
        return
      }

      for (
        const arquivo of arquivos
      ) {
        await enviarFoto(
          arquivo
        )
      }
    }

  // =====================================================
  // REMOVER FOTO
  // =====================================================

  const removerFoto = (
    index
  ) => {
    setFotos(
      (fotosAtuais) =>
        fotosAtuais.filter(
          (_, i) =>
            i !== index
        )
    )
  }

  // =====================================================
  // FOTO PRINCIPAL
  // =====================================================

  const definirFotoPrincipal =
    (index) => {
      setFotos(
        (fotosAtuais) => {
          if (
            index === 0
          ) {
            return fotosAtuais
          }

          const copia = [
            ...fotosAtuais
          ]

          const principal =
            copia.splice(
              index,
              1
            )[0]

          return [
            principal,
            ...copia
          ]
        }
      )
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
      ? (
          (lucro / venda) *
          100
        ).toFixed(1)
      : '0.0'

  // =====================================================
  // SALVAR PRODUTO
  // =====================================================

  const handleSubmit = (
    e
  ) => {
    e.preventDefault()

    if (enviandoFoto) {
      alert(
        'Aguarde o envio das fotos terminar.'
      )
      return
    }

    if (!form.nome.trim()) {
      alert(
        'Digite o nome do produto.'
      )
      return
    }

    if (
      !form.venda ||
      Number(form.venda) <=
        0
    ) {
      alert(
        'Digite um preço de venda válido.'
      )
      return
    }

    if (
      quantidadeTotal <= 0
    ) {
      alert(
        'Informe pelo menos uma quantidade de tamanho.'
      )
      return
    }

    const tamanhosArray =
      Object.entries(
        tamanhos
      )
        .filter(
          ([, quantidade]) =>
            Number(
              quantidade || 0
            ) > 0
        )
        .map(
          ([
            tamanho,
            quantidade
          ]) => ({
            tamanho,
            quantidade:
              Number(
                quantidade
              )
          })
        )

    const fotosArray =
      fotos
        .filter(
          (item) =>
            item &&
            item.foto
        )
        .map(
          (
            item,
            index
          ) => ({
            foto:
              item.foto,
            ordem:
              index
          })
        )

    const produto = {
      ...(produtoEditando ||
        {}),
      ...form,

      nome:
        form.nome.trim(),

      custo,

      venda,

      lucro,

      margem:
        Number(margem),

      quantidade:
        quantidadeTotal,

      tamanho:
        tamanhosArray
          .map(
            (item) =>
              item.tamanho
          )
          .join(', '),

      tamanhos:
        tamanhosArray,

      fotos:
        fotosArray,

      foto:
        fotosArray[0]?.foto ||
        ''
    }

    if (produtoEditando) {
      produto.id =
        produtoEditando.id

      onUpdateProduct(
        produto
      )
    } else {
      onAddProduct(
        produto
      )
    }

    onClose()
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="product-modal">

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

      <form
        onSubmit={
          handleSubmit
        }
      >

        {/* =================================================
            FOTOS
        ================================================= */}

        <div className="photo-area">

          <div
            className="photo-preview"
            style={{
              position:
                'relative',
              overflow:
                'hidden'
            }}
          >

            {fotos.length >
            0 ? (

              <img
                src={
                  fotos[0].foto
                }
                alt="Foto principal"
              />

            ) : (

              <div className="photo-placeholder">
                📷
              </div>

            )}

          </div>

          <div className="photo-content">

            <strong>
              Fotos da peça
            </strong>

            <p>
              {enviandoFoto
                ? 'Enviando foto para o servidor...'
                : 'Adicione várias fotos do mesmo produto.'}
            </p>

            <div className="photo-actions">

              <button
                type="button"
                className="photo-button"
                disabled={
                  enviandoFoto
                }
                onClick={() =>
                  inputFotoRef.current?.click()
                }
              >
                {enviandoFoto
                  ? 'Enviando...'
                  : '+ Adicionar fotos'}
              </button>

            </div>

            <input
              ref={
                inputFotoRef
              }
              type="file"
              accept="image/*"
              multiple
              onChange={
                handleFotoChange
              }
              style={{
                display:
                  'none'
              }}
            />

          </div>

        </div>

        {fotos.length > 0 && (

          <div
            style={{
              display:
                'flex',
              gap: '10px',
              flexWrap:
                'wrap',
              margin:
                '12px 0 22px'
            }}
          >

            {fotos.map(
              (
                item,
                index
              ) => (

                <div
                  key={
                    item.id ||
                    index
                  }
                  style={{
                    position:
                      'relative',
                    width:
                      '80px',
                    height:
                      '80px',
                    borderRadius:
                      '10px',
                    overflow:
                      'hidden',
                    border:
                      index === 0
                        ? '3px solid #8b5e83'
                        : '1px solid #ddd',
                    cursor:
                      'pointer'
                  }}
                  onClick={() =>
                    definirFotoPrincipal(
                      index
                    )
                  }
                >

                  <img
                    src={
                      item.foto
                    }
                    alt={`Foto ${index + 1}`}
                    style={{
                      width:
                        '100%',
                      height:
                        '100%',
                      objectFit:
                        'cover'
                    }}
                  />

                  <button
                    type="button"
                    onClick={(
                      evento
                    ) => {
                      evento.stopPropagation()

                      removerFoto(
                        index
                      )
                    }}
                    style={{
                      position:
                        'absolute',
                      top:
                        '4px',
                      right:
                        '4px',
                      width:
                        '22px',
                      height:
                        '22px',
                      border:
                        'none',
                      borderRadius:
                        '50%',
                      background:
                        'rgba(0,0,0,.7)',
                      color:
                        '#fff',
                      cursor:
                        'pointer'
                    }}
                  >
                    ×
                  </button>

                  {index ===
                    0 && (
                    <span
                      style={{
                        position:
                          'absolute',
                        left:
                          '4px',
                        bottom:
                          '4px',
                        background:
                          'rgba(0,0,0,.65)',
                        color:
                          '#fff',
                        fontSize:
                          '10px',
                        padding:
                          '3px 5px',
                        borderRadius:
                          '4px'
                      }}
                    >
                      Principal
                    </span>
                  )}

                </div>

              )
            )}

          </div>

        )}

        {/* =================================================
            NOME
        ================================================= */}

        <div className="form-group">

          <label>
            Nome do produto *
          </label>

          <input
            name="nome"
            value={
              form.nome
            }
            onChange={
              handleChange
            }
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
              value={
                form.marca
              }
              onChange={
                handleChange
              }
              placeholder="Ex: Farm"
            />

          </div>

          <div className="form-group">

            <label>
              Categoria
            </label>

            <select
              name="categoria"
              value={
                form.categoria
              }
              onChange={
                handleChange
              }
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
            TAMANHOS
        ================================================= */}

        <div className="form-group">

          <label>
            Tamanhos e quantidades
          </label>

          <p
            style={{
              margin:
                '4px 0 12px',
              fontSize:
                '13px',
              color:
                '#777'
            }}
          >
            Informe quantas peças você
            possui de cada tamanho.
          </p>

          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(4, minmax(0, 1fr))',
              gap:
                '10px'
            }}
          >

            {TAMANHOS_DISPONIVEIS.map(
              (tamanho) => {

                const quantidade =
                  Number(
                    tamanhos[
                      tamanho
                    ] || 0
                  )

                return (

                  <div
                    key={
                      tamanho
                    }
                    style={{
                      border:
                        quantidade >
                        0
                          ? '2px solid #8b5e83'
                          : '1px solid #ddd',
                      borderRadius:
                        '10px',
                      padding:
                        '10px',
                      textAlign:
                        'center'
                    }}
                  >

                    <strong>
                      {tamanho}
                    </strong>

                    <input
                      type="number"
                      min="0"
                      value={
                        quantidade ||
                        ''
                      }
                      onChange={(
                        e
                      ) =>
                        alterarQuantidadeTamanho(
                          tamanho,
                          e.target.value
                        )
                      }
                      placeholder="0"
                      style={{
                        width:
                          '100%',
                        marginTop:
                          '7px',
                        textAlign:
                          'center'
                      }}
                    />

                  </div>

                )
              }
            )}

          </div>

          <div
            style={{
              marginTop:
                '12px',
              padding:
                '12px',
              borderRadius:
                '10px',
              background:
                '#f7f3f6',
              display:
                'flex',
              justifyContent:
                'space-between'
            }}
          >

            <span>
              Estoque total
            </span>

            <strong>
              {quantidadeTotal}{' '}
              peça(s)
            </strong>

          </div>

        </div>

        {/* =================================================
            COR
        ================================================= */}

        <div className="form-group">

          <label>
            Cor
          </label>

          <input
            name="cor"
            value={
              form.cor
            }
            onChange={
              handleChange
            }
            placeholder="Ex: Azul"
          />

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
              value={
                form.custo
              }
              onChange={
                handleChange
              }
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
              value={
                form.venda
              }
              onChange={
                handleChange
              }
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
            SKU
        ================================================= */}

        <div className="form-row">

          <div className="form-group">

            <label>
              Código / SKU
            </label>

            <input
              name="sku"
              value={
                form.sku
              }
              onChange={
                handleChange
              }
              placeholder="Ex: VES-001"
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
            value={
              form.fornecedor
            }
            onChange={
              handleChange
            }
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
            value={
              form.descricao
            }
            onChange={
              handleChange
            }
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
            onClick={
              onClose
            }
            disabled={
              enviandoFoto
            }
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="save-button"
            disabled={
              enviandoFoto
            }
          >
            {produtoEditando
              ? 'Salvar alterações'
              : 'Cadastrar produto'}
          </button>

        </div>

      </form>

    </div>
  )
}

export default ProductForm