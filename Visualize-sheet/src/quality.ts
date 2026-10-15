import { parseXML, type Score } from './score';

export interface RecognitionJob {
  id: string; state: string; message?:string; results: { name: string; url: string }[];
  upgrade_available?:boolean;
  total_pages?: number; included_pages?: number[]; skipped_pages?: number[];
  quality?: { rhythm_issues: { page: number; system: number; stack: number }[]; missing_offsets: number; export_errors?: { page: number; stack: number }[]; accuracy: null };
  exit_code?: number;
  octave_audit?: {upper:number;lower:number;native_labels:number;findings:{page:number;reason:string}[]};
  octave_recovery?: {available:boolean;repairs:{page:number;kind:string}[];reason?:string};
  resources?: {threads:number; memory_mb:number; parallel:boolean};
  meter_repairs?: {page:number;stack:string;meter:string;source:string}[];
  dynamics_repairs?: {page:number;wedge:string;reason:string}[];
}

export function qualityFeedback(score: Score, job?: RecognitionJob) {
  const issues: string[] = [];
  const facts = [`${score.notes.length} 个播放音符 · ${score.measures.length} 个播放小节`,
    `左手 ${score.notes.filter(n => n.hand === 'left').length} · 右手 ${score.notes.filter(n => n.hand === 'right').length}`];
  if (job?.octave_audit) {
    const audit=job.octave_audit;
    facts.push(`八度复核：高八度 ${audit.upper} · 低八度 ${audit.lower} · PDF 文本标记 ${audit.native_labels}`);
    if (audit.findings.length) issues.push(`八度线有 ${audit.findings.length} 处范围或位置待核查（PDF 第 ${[...new Set(audit.findings.map(f=>f.page))].join('、')} 页）；未根据不确定范围改写音高。`);
  }
  if (job?.octave_recovery?.repairs.length) facts.push(`依据扫描图像恢复 ${job.octave_recovery.repairs.length} 处八度线的范围和谱表关联，并由识别引擎重新导出实际音高。`);
  if (job?.octave_recovery && !job.octave_recovery.available) issues.push('图像八度线恢复不可用：需要本地 Pillow；现有 OMR 八度标记仍需核查。');
  if (job?.resources) facts.push(`本地识别：${job.resources.threads} 个 CPU 核心 · Java 内存上限 ${job.resources.memory_mb} MB${job.resources.parallel ? ' · 并行处理' : ''}`);
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
    const octaveLines = doc.querySelectorAll('octave-shift[type="up"], octave-shift[type="down"]').length;
    const arpeggios=doc.querySelectorAll('arpeggiate').length;
    if (arpeggios) facts.push(`琶音标记 ${arpeggios} · 展开音符 ${score.notes.filter(n=>n.decoration==='arpeggio').length}`);
    const slurs = doc.querySelectorAll('slur[type="start"]').length;
    const tied = score.notes.filter(n => (n.sources?.length ?? 0) > 1).length;
    const tuplets = [...doc.querySelectorAll('time-modification')];
    const triplets = tuplets.filter(t => t.querySelector('actual-notes')?.textContent === '3').length;
    const quintuplets = tuplets.filter(t => t.querySelector('actual-notes')?.textContent === '5').length;
    const clefs = new Map<string,string>(); let clefChanges = 0;
    for (const clef of doc.querySelectorAll('clef')) {
      const key = `${clef.closest('part')?.getAttribute('id')}:${clef.getAttribute('number') ?? '1'}`;
      const sign = `${clef.querySelector('sign')?.textContent}:${clef.querySelector('line')?.textContent}:${clef.querySelector('clef-octave-change')?.textContent ?? '0'}`;
      if (clefs.has(key) && clefs.get(key) !== sign) clefChanges++;
      clefs.set(key,sign);
    }
    facts.push(`MusicXML 标记：八度线 ${octaveLines} · 谱号变更 ${clefChanges} · 连奏线 ${slurs} · 合并延音 ${tied}`);
    if (tuplets.length) facts.push(`连音音符 ${tuplets.length}（三连音 ${triplets} · 五连音 ${quintuplets}），按实际时值播放。`);
    const grace = doc.querySelectorAll('note > grace').length;
    const ornaments = [...doc.querySelectorAll('ornaments > *')].filter(e => e.localName !== 'accidental-mark' && e.localName !== 'wavy-line');
    if (grace || ornaments.length) {
      facts.push(`倚音 ${grace} · 颤音 ${ornaments.filter(e => e.localName === 'trill-mark').length} · 波音 ${ornaments.filter(e => e.localName.includes('mordent')).length} · 回音 ${ornaments.filter(e => e.localName.includes('turn')).length}（MusicXML 谱面标记）`);
      facts.push(`装饰奏法生成 ${score.notes.filter(n => n.decoration === 'grace').length} 个倚音击键、${score.notes.filter(n => n.decoration === 'ornament').length} 个装饰击键；按常见奏法近似处理。`);
    }
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
