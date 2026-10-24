import type { SearchSession } from '../../../src/shared/types'

export function session(id = 'session-1', name = '示例制造有限公司'): SearchSession {
  return {
    id, inputType: 'company-name',
    subject: { id: 'subject-1', name, role: 'manufacturer', verification: 'user-confirmed', evidence: ['完整公司名称匹配'] },
    queries: [{ id: 'query-1', subjectId: 'subject-1', terms: [name, '欠薪'], topic: '欠薪' }],
    records: [{ id: 'record-1', subjectId: 'subject-1', title: '员工公开陈述', sourceType: 'employee-statement',
      publisher: '公开讨论平台', url: 'https://example.com/1', accessedAt: '2026-10-24T07:00:00Z',
      excerpt: '个人陈述，尚待核验。', claimStatus: 'unverified', matchEvidence: ['完整名称'], availability: 'available' }],
    eventGroups: [{ id: 'event-1', subjectId: 'subject-1', title: '劳动争议', recordIds: ['record-1'], status: 'suggested', matchEvidence: ['来源信息相关'] }],
    startedAt: '2026-10-24T07:00:00Z', status: 'partial',
    connectorRuns: [{ connectorId: 'public-source', status: 'partial', message: '部分来源不可用' }]
  }
}
