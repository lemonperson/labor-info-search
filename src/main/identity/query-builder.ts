import { companySubjectSchema } from '../../shared/schemas'
import type { CompanySubject, SearchQuery } from '../../shared/types'

const topics = [
  { id: 'wages', topic: '欠薪/工资拖欠', terms: ['欠薪', '工资拖欠'] },
  { id: 'labor-disputes', topic: '劳动仲裁/劳动争议', terms: ['劳动仲裁', '劳动争议'] },
  { id: 'termination', topic: '违法解除/裁员', terms: ['违法解除', '裁员'] },
  { id: 'working-hours', topic: '加班/工时', terms: ['加班', '工时'] },
  { id: 'insurance-injury', topic: '社保/工伤', terms: ['社保', '工伤'] },
  { id: 'labor-inspection', topic: '劳动保障监察/行政处罚', terms: ['劳动保障监察', '行政处罚'] },
  { id: 'employee-treatment', topic: '员工待遇', terms: ['员工待遇'] },
  { id: 'company-response', topic: '企业回应/情况说明', terms: ['企业回应', '情况说明'] }
] as const

export function buildLaborQueries(subject: CompanySubject): SearchQuery[] {
  const selected = companySubjectSchema.parse(subject)
  return topics.map(({ id, topic, terms }) => ({
    id: `${selected.id}:${id}`,
    subjectId: selected.id,
    terms: [selected.name, ...terms],
    topic
  }))
}
