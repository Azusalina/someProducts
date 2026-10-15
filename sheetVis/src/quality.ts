import { parseXML, type Score } from './score';

export interface RecognitionJob {
  id: string; state: string; results: { name: string; url: string }[];
  total_pages?: number; included_pages?: number[]; skipped_pages?: number[];
  quality?: { rhythm_issues: { page: number; system: number; stack: number }[]; missing_offsets: number; export_errors?: { page: number; stack: number }[]; accuracy: null };
  exit_code?: number;
  meter_repairs?: {page:number;stack:string;meter:string;source:string}[];
  dynamics_repairs?: {page:number;wedge:string;reason:string}[];
}

export function qualityFeedback(score: Score, job?: RecognitionJob) {
  const issues: string[] = [];
  const facts = [`${score.notes.length} 个播放音符 · ${score.measures.length} 个播放小节`,
    `左手 ${score.notes.filter(n => n.hand === 'left').length} · 右手 ${score.notes.filter(n => n.hand === 'right').length}`];
  if (job?.meter_repairs?.length) facts.push(...job.meter_repairs.map(r=>`依据双谱表内嵌数字，恢复 PDF 第 ${r.page} 页第 ${r.stack} 小节拍号 ${r.meter}，并重新计算节奏。`));
  if (job?.dynamics_repairs?.length) issues.push(`省略 ${job.dynamics_repairs.length} 个起奏位置未解析的渐强／渐弱标记，以避免整个小节导出失败；音符保留。`);
  const invalid = score.notes.filter(n => !Number.isFinite(n.midi + n.start + n.duration + n.soundDuration) || n.start < 0 || n.duration <= 0 || n.soundDuration < n.duration).length;
  if (invalid) issues.push(`${invalid} 个音符的播放数据异常。`);
  else facts.push('音高与时值数据可用于播放；未与原谱逐音核对。');
  const outside = score.notes.filter(n => n.midi < 21 || n.midi > 108).length;
  if (outside) issues.push(`${outside} 个音符超出 88 键范围。`);
  if (!score.notes.some(n => n.hand === 'left') || !score.notes.some(n => n.hand === 'right')) issues.push('播放数据只包含单手；可能是单手乐谱，也可能有声部遗漏。');
  if (score.xml) {
    const doc = parseXML(score.xml);
    const xmlMeasures = [...doc.querySelectorAll('part > measure')];
    const nonControlling = xmlMeasures.filter(m => m.getAttribute('non-controlling') === 'yes').length;
    if (nonControlling) issues.push(`${nonControlling} 个小节带有识别引擎的节奏异常标记。`);
  }
  if (job?.quality) {
    const rhythms = job.quality.rhythm_issues;
    if (rhythms.length) {
      issues.push(`识别引擎报告 ${rhythms.length} 处小节节奏无法配平。`);
      const pages = [...new Set(rhythms.map(r => r.page))].sort((a, b) => a - b);
      issues.push(`需检查原 PDF 第 ${pages.join('、')} 页；详情在识别日志。`);
    }
    if (job.quality.missing_offsets) issues.push(`${job.quality.missing_offsets} 个和弦缺少可靠起奏位置，导出时可能被遗漏或移位。`);
    if (job.quality.export_errors?.length) issues.push(`MusicXML 导出有 ${job.quality.export_errors.length} 处小节错误（PDF 第 ${[...new Set(job.quality.export_errors.map(e => e.page))].sort((a,b) => a-b).join('、')} 页），结果可能缺少音符或力度数据。`);
  }
  if (job?.exit_code) issues.push(`识别引擎退出码 ${job.exit_code}；导出结果可能不完整。`);
  issues.push(...score.warnings.filter(w => !w.startsWith('PDF 自动识别')));
  const distinct = [...new Set(issues)];
  return { facts, issues: distinct, summary: distinct.length ? `可播放 · ${distinct.length} 项待检查` : '可播放 · 结构检查通过',
    limit: job ? '准确率未知：自动检查无法确认错音或漏音，尚未与原谱逐音核对。' : '结构检查不等于原谱准确率。' };
}
