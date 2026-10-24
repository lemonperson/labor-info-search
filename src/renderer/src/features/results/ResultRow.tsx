import type { SourceRecord } from '../../../../shared/types'
import { SourceBadge } from '../../components/SourceBadge'

export function ResultRow({ record, onOpen }: { record: SourceRecord; onOpen: () => void }) {
  return <li className="result-row">
    <button type="button" className="result-row-button" onClick={onOpen}>
      <span className="result-row-meta"><SourceBadge sourceType={record.sourceType} claimStatus={record.claimStatus} />
        <span>{record.publisher}</span>{record.publishedAt && <time dateTime={record.publishedAt}>{record.publishedAt.slice(0, 10)}</time>}
      </span>
      <strong>{record.title}</strong>
      {record.excerpt && <span className="result-excerpt">{record.excerpt}</span>}
    </button>
  </li>
}
