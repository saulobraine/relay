import { useId, useRef, useState } from 'react'
import type { AccountModelResult } from '@shared/types'

export function AccountModelsButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [result, setResult] = useState<AccountModelResult | null>(null)
  const [loading, setLoading] = useState(false)

  const openCatalog = async () => {
    const relay = window.relay
    if (!relay || !dialog.current || loading) return
    dialog.current.showModal()
    setResult(null)
    setLoading(true)
    try {
      setResult(await relay.getAccountModels(accountId))
    } catch {
      setResult({ ok: false, message: 'Não foi possível consultar os modelos desta conta.' })
    } finally {
      setLoading(false)
    }
  }

  if (!window.relay) return null

  return (
    <>
      <button
        type="button"
        className="account-models-button"
        disabled={loading}
        aria-label={`Modelos disponíveis para ${accountName}`}
        onClick={() => void openCatalog()}
      >
        Modelos disponíveis
      </button>
      <dialog ref={dialog} className="account-models-dialog" aria-labelledby={titleId}>
        <div className="account-models-dialog-header">
          <h2 id={titleId}>Modelos disponíveis · {accountName}</h2>
          <form method="dialog">
            <button className="btn-action-card">Fechar</button>
          </form>
        </div>
        {loading && <p role="status">Consultando o Antigravity…</p>}
        {result?.ok === false && <p role="status">{result.message}</p>}
        {result?.ok === true && (
          <>
            <p role="status">{result.models.length} opções, incluindo níveis de raciocínio.</p>
            <ul className="account-models-list">
              {result.models.map((model) => (
                <li key={model.id}>
                  <span>{model.label}</span>
                  <code>{model.id}</code>
                </li>
              ))}
            </ul>
          </>
        )}
      </dialog>
    </>
  )
}
