import { useState } from 'react'

import {
  registrarEntradaEstoque
} from '../storage'


function EntradaEstoque({
  produtos,
  onClose,
  onSuccess
}) {

  const [produtoId, setProdutoId] =
    useState('')

  const [quantidade, setQuantidade] =
    useState('')

  const [observacao, setObservacao] =
    useState('')

  const [erro, setErro] =
    useState('')


  const handleSubmit = async (e) => {

    e.preventDefault()

    setErro('')


    if (!produtoId) {

      setErro(
        'Selecione um produto.'
      )

      return
    }


    if (
      !quantidade ||
      Number(quantidade) <= 0
    ) {

      setErro(
        'Informe uma quantidade válida.'
      )

      return
    }


    const resultado =
      await registrarEntradaEstoque({
        produtoId,
        quantidade: Number(quantidade),
        observacao
      })


    if (
      !resultado ||
      !resultado.sucesso
    ) {

      setErro(
        resultado?.mensagem ||
        'Não foi possível registrar a entrada.'
      )

      return
    }


    onSuccess(
      resultado.produtos
    )

    onClose()
  }


  return (

    <div className="modal-overlay">

      <div className="modal-estoque">


        {/* CABEÇALHO */}

        <div className="modal-header">

          <div>

            <h2>
              Entrada de estoque
            </h2>

            <p>
              Adicione novas peças ao estoque
            </p>

          </div>


          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >

            ×

          </button>

        </div>


        <form
          onSubmit={handleSubmit}
        >


          {/* PRODUTO */}

          <div className="form-group">

            <label>
              Produto
            </label>


            <select
              value={produtoId}
              onChange={(e) => {

                setProdutoId(
                  e.target.value
                )

                setErro('')
              }}
            >

              <option value="">
                Selecione um produto
              </option>


              {produtos.map(
                produto => (

                  <option
                    key={produto.id}
                    value={produto.id}
                  >

                    {produto.nome}

                    {produto.sku
                      ? ` — ${produto.sku}`
                      : ''
                    }

                    {' | Estoque: '}

                    {Number(
                      produto.quantidade || 0
                    )}

                  </option>

                )
              )}

            </select>

          </div>


          {/* QUANTIDADE */}

          <div className="form-group">

            <label>
              Quantidade recebida
            </label>


            <input
              type="number"
              min="1"
              value={quantidade}
              onChange={(e) => {

                setQuantidade(
                  e.target.value
                )

                setErro('')
              }}
              placeholder="Ex.: 10"
            />

          </div>


          {/* OBSERVAÇÃO */}

          <div className="form-group">

            <label>
              Observação
            </label>


            <textarea
              value={observacao}
              onChange={(e) =>
                setObservacao(
                  e.target.value
                )
              }
              placeholder="Ex.: Compra de reposição, nova coleção..."
              rows="3"
            />

          </div>


          {/* ERRO */}

          {erro && (

            <div className="estoque-erro">

              ⚠️ {erro}

            </div>

          )}


          {/* BOTÕES */}

          <div className="modal-actions">

            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
            >

              Cancelar

            </button>


            <button
              type="submit"
              className="btn-confirm"
            >

              Confirmar entrada

            </button>

          </div>


        </form>

      </div>

    </div>

  )
}


export default EntradaEstoque
