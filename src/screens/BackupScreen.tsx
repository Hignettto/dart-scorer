// Backup and restore (SPEC.md section 9). Data only exists on this phone,
// so a regular backup is the only protection against losing it.

import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import {
  backupAgeText,
  backupFileName,
  lastBackupAt,
  makeBackup,
  makeCsvExports,
  markBackedUp,
  parseBackup,
  readAll,
  restoreBackup,
} from '../data/backup'
import { db } from '../data/db'
import { Header } from './ui'

/**
 * Hands files to the phone. On iPhone this opens the share sheet, where
 * "Save to Files" keeps them. Elsewhere it downloads them.
 * Returns false if the person cancelled the share sheet.
 */
async function saveFiles(files: File[]): Promise<boolean> {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files })
      return true
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false
      // Otherwise fall through to a normal download.
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return true
}

export function BackupScreen({ onBack }: { onBack: () => void }) {
  const last = useLiveQuery(() => lastBackupAt(db), [])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const run = async (job: () => Promise<string | void>) => {
    setMessage('')
    setError('')
    try {
      const m = await job()
      if (m) setMessage(m)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const exportJson = () =>
    run(async () => {
      const backup = makeBackup(await readAll(db))
      const file = new File([JSON.stringify(backup, null, 1)], backupFileName(), { type: 'application/json' })
      if (!(await saveFiles([file]))) return
      await markBackedUp(db)
      return `Backup saved: ${backup.games.length} games, ${backup.darts.length} darts.`
    })

  const exportCsv = () =>
    run(async () => {
      const csv = makeCsvExports(await readAll(db))
      const files = Object.entries(csv).map(([name, text]) => new File([text], name, { type: 'text/csv' }))
      if (await saveFiles(files)) return 'CSV files exported.'
    })

  const importJson = (file: File) =>
    run(async () => {
      const backup = parseBackup(await file.text())
      const ok = confirm(
        `Restore this backup from ${new Date(backup.exportedAt).toLocaleString()}?\n\n` +
          `It has ${backup.players.length} players and ${backup.games.length} games.\n` +
          'Everything currently on this phone will be replaced.',
      )
      if (!ok) return
      await restoreBackup(db, backup)
      return 'Backup restored.'
    })

  return (
    <div className="screen">
      <Header title="Backup" onBack={onBack} />
      <p className="muted">
        Your data only lives on this phone. Last backup: <strong>{backupAgeText(last ?? null)}</strong>.
      </p>

      <h2>Full backup</h2>
      <button className="primary big" onClick={exportJson}>
        Export backup (JSON)
      </button>
      <button className="big" onClick={() => fileInput.current?.click()}>
        Restore from backup…
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) importJson(f)
        }}
      />

      <h2>For spreadsheets</h2>
      <button className="big" onClick={exportCsv}>
        Export darts (CSV)
      </button>
      <p className="muted small-print">
        Three files: games.csv, rtw_darts.csv and x01_darts.csv. Only finished games are included.
      </p>

      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
