import type { ClaimStatus, SourceType } from '../../../shared/types'

const sourceNames: Record<SourceType, string> = {
  government: '政府与监管', 'court-arbitration': '法院与仲裁', media: '媒体',
  'company-response': '企业回应', 'employee-statement': '劳动者陈述', other: '其他来源'
}

export function SourceBadge({ sourceType, claimStatus }: { sourceType: SourceType; claimStatus: ClaimStatus }) {
  return <span className="source-label"><span>{sourceNames[sourceType]}</span><span className="claim-status">{claimStatus === 'independently-confirmed' ? '有独立来源印证' : claimStatus === 'disputed' ? '存在争议' : '尚未独立核实'}</span></span>
}
