import { parseXML, type Score } from './score';

export interface RecognitionJob {
  id: string; state: string; filename?:string; message?:string; results: { name: string; url: string }[];
  upgrade_available?:boolean;progress?:number;
  pending_region?:boolean;
  region?:{parent:string;start:number;end:number;page:number;measures:import('./pdf-view').MeasureRegion[]};
  region_comparison?:{before:{notes:number;chords:number;clefs:number};after:{notes:number;chords:number;clefs:number};warnings:string[];unexported_heads:number;local_quality:{rhythm_issues:unknown[]}};
  initial_meter?:string; implicit_tuplets?:boolean; input_dpi?:number;
  baseline_notes?:number; exported_notes?:number;
  small_notes?:boolean;
  symbol_recovery?:{available:boolean;repairs:{page:number;kind:string}[];findings:{page:number;reason:string}[]};
  symbol_audit?:{physical_heads:number;mapped_heads:number;unexported_heads:{page:number;system:string;stack?:string;head:string}[];ambiguous_accidentals?:{page:number;reason:string}[]};
  ornament_recovery?:{native_marks:number;recovered:{kind:string}[];findings:{page:number;reason:string}[]};
  rejected_reprocessing?:{notes:number;baseline:number;reason:string};
  total_pages?: number; included_pages?: number[]; skipped_pages?: number[];
  quality?: { rhythm_issues: { page: number; system: number; stack: number }[]; missing_offsets: number; export_errors?: { page: number; stack: number }[]; accuracy: null };
  exit_code?: number;
  octave_audit?: {upper:number;lower:number;native_labels:number;verified_ranges?:number;native_available?:boolean;findings:{page:number;reason:string}[]};
  octave_recovery?: {available:boolean;repairs:{page:number;kind:string}[];reason?:string};
  resources?: {threads:number; memory_mb:number; parallel:boolean};
  meter_repairs?: {page:number;stack:string;meter:string;source:string}[];
  beam_repairs?:{page:number;heads:number}[];
  tuplet_repairs?:{page:number;system:string;stack:string;ratio:string}[];
  rhythm_audit?:{overfull_measures:{measure:string;expected_beats:number;actual_beats:number}[];silent_gaps:{measure:string;written_rest:boolean;forward:boolean}[];missing_meter_measures?:unknown[]};
  dynamics_repairs?: {page:number;wedge:string;reason:string}[];
}

export function qualityFeedback(score: Score, job?: RecognitionJob) {
  const issues: string[] = [];
  const facts = [`${score.notes.length} 个播放音符 · ${score.measures.length} 个播放小节`,
    `左手 ${score.notes.filter(n => n.hand === 'left').length} · 右手 ${score.notes.filter(n => n.hand === 'right').length}`];
  if(job?.beam_repairs?.length)facts.push(`依据同谱表的音梁与符干位置恢复 ${job.beam_repairs.length} 处短断裂连接，再计算节奏；不新增符头。`);
  if(job?.tuplet_repairs?.length)facts.push(`依据已印出的六连音上下文、完整音梁分组与拍号，恢复 ${job.tuplet_repairs.length} 组省略标记的六连音并重新计算声部；保留原有音符。`);
  if(job?.rhythm_audit){
    const audit=job.rhythm_audit;
    facts.push(`导出时值核查：${audit.overfull_measures.length} 个小节超过拍号；${audit.silent_gaps.length} 处未被音符覆盖的间隙（含写出的休止，不自动删除）。`);
    if(audit.missing_meter_measures?.length)issues.push(`${audit.missing_meter_measures.length} 个小节缺少已知拍号，不能判断是否超拍。`);
    if(audit.overfull_measures.length)issues.push(`仍有超拍小节：${audit.overfull_measures.slice(0,12).map(m=>m.measure).join('、')}${audit.overfull_measures.length>12?'等':''}；可能是连音、音梁或声部分配错误，需要对照原谱。`);
  }
  if(job?.region)facts.push(`局部识别${job.pending_region?'候选':'副本'}：PDF 第 ${job.region.page} 页，小节 ${job.region.measures.map(m=>m.number).join('、')}；其余小节保留原结果。`);
  if (job?.symbol_recovery) {
    const r=job.symbol_recovery;
    const clefs=r.repairs.filter(p=>p.kind==='TREBLE'||p.kind==='BASS').length;
    const accidentals=r.repairs.filter(p=>['NATURAL','SHARP','FLAT','DOUBLE_FLAT','DOUBLE_SHARP'].includes(p.kind)).length;
    const loops=r.repairs.filter(p=>p.kind==='clef-loop-head').length;
    facts.push(`原图符号复核：补入谱号 ${clefs} · 临时升降／还原号 ${accidentals} · 排除谱号圆环假符头 ${loops}。`);
    if (!r.available) issues.push('原图符号复核不可用：需要本地 Pillow、NumPy 和 SciPy。');
    if (r.findings.length) issues.push(`符号复核有 ${r.findings.length} 处待检查（PDF 第 ${[...new Set(r.findings.map(p=>p.page))].join('、')} 页）；误分类可能已经吞掉原来的和弦，未推测缺失音符。`);
  }
  if (job?.symbol_audit?.unexported_heads.length) {
    const missing=job.symbol_audit.unexported_heads;
    issues.push(`${missing.length} 个已识别符头未能定位到导出结果（PDF 第 ${[...new Set(missing.map(p=>p.page))].join('、')} 页）；可能漏音或关联失败，未凭空补入节奏。`);
  }
  if (job?.symbol_audit?.ambiguous_accidentals?.length) {
    const marks=job.symbol_audit.ambiguous_accidentals;
    issues.push(`${marks.length} 个升降／还原号的图像分类较弱或尺寸异常（PDF 第 ${[...new Set(marks.map(p=>p.page))].join('、')} 页），可能把多个记号合并或关联到错误符头；位置见符号复核文件。`);
  }
  if (job?.octave_audit) {
    const audit=job.octave_audit;
    facts.push(`八度复核：高八度 ${audit.upper} · 低八度 ${audit.lower} · PDF 文本标记 ${audit.native_labels}`);
    if(audit.verified_ranges!==undefined)facts.push(`八度线经原图或明确编辑确认的范围 ${audit.verified_ranges} 处；仅识别到数字不代表范围已正确。`);
    if(audit.native_available===false)issues.push('PDF 原生文字八度核查不可用，图像核查仍独立执行。');
    if (audit.findings.length) issues.push(`八度线有 ${audit.findings.length} 处范围或位置待核查（PDF 第 ${[...new Set(audit.findings.map(f=>f.page))].join('、')} 页）；未根据不确定范围改写音高。`);
  }
  if (job?.octave_recovery?.repairs.length) facts.push(`依据扫描图像恢复 ${job.octave_recovery.repairs.length} 处八度线的范围和谱表关联，并由识别引擎重新导出实际音高。`);
  if (job?.octave_recovery && !job.octave_recovery.available) issues.push('图像八度线恢复不可用：需要本地 Pillow；现有 OMR 八度标记仍需核查。');
  if (job?.resources) facts.push(`本地识别：${job.resources.threads} 个 CPU 核心 · Java 内存上限 ${job.resources.memory_mb} MB${job.resources.parallel ? ' · 并行处理' : ''}`);
  if (job?.input_dpi) facts.push(`PDF 识别分辨率 ${job.input_dpi} DPI`);
  if (job?.implicit_tuplets) facts.push('启用省略数字的连音分析；具体识别比例与范围仍需核对原谱。');
  if (job?.small_notes) facts.push('检测到小音符专用字体，启用小符头／小音梁识别。');
  if (job?.ornament_recovery?.native_marks) {
    const r=job.ornament_recovery;
    facts.push(`原 PDF 字体编码装饰记号 ${r.native_marks} · 已关联 ${r.recovered.length}；保留字体与位置来源。`);
    if(r.findings.length)issues.push(`${r.findings.length} 个装饰记号的位置或复合奏法需核对；未推测无法定位的音符。`);
  }
  if (job?.baseline_notes && job.exported_notes) facts.push(`导出音符 ${job.exported_notes} · 先前缓存 ${job.baseline_notes}（数量比较不代表逐音准确率）。`);
  if (job?.rejected_reprocessing) {
    const r=job.rejected_reprocessing;
    issues.push(`另一套重识别设置只导出 ${r.notes} 个音符（基准 ${r.baseline}）；已拒绝采用，当前使用保留音符更多的版本。`);
  }
  if (job?.meter_repairs?.length) facts.push(...job.meter_repairs.map(r=>r.source.includes('configured') ? `依据已核对的完整原谱，为片段补入起始拍号 ${r.meter}，并重新计算节奏。` : `依据双谱表内嵌数字，恢复 PDF 第 ${r.page} 页第 ${r.stack} 小节拍号 ${r.meter}，并重新计算节奏。`));
  if (job?.dynamics_repairs?.length) issues.push(`省略 ${job.dynamics_repairs.length} 个起奏位置未解析的渐强／渐弱标记，以避免整个小节导出失败；音符保留。`);
  const invalid = score.notes.filter(n => !Number.isFinite(n.midi + n.start + n.duration + n.soundDuration) || n.start < 0 || n.duration <= 0 || n.soundDuration < n.duration).length;
  if (invalid) issues.push(`${invalid} 个音符的播放数据异常。`);
  else facts.push('音高与时值数据可用于播放；未与原谱逐音核对。');
  const outside = score.notes.filter(n => n.midi < 21 || n.midi > 108).length;
  if (outside) issues.push(`${outside} 个音符超出 88 键范围。`);
  if (!score.notes.some(n => n.hand === 'left') || !score.notes.some(n => n.hand === 'right')) issues.push('播放数据只包含单手；可能是单手乐谱，也可能有声部遗漏。');
  if (score.xml) {
    const doc = parseXML(score.xml);
    const accidentalValues:Record<string,number>={natural:0,sharp:1,flat:-1,'double-sharp':2,'sharp-sharp':2,'flat-flat':-2};
    const conflicts=[...doc.querySelectorAll('note')].filter(n=>{
      const sign=n.querySelector(':scope > accidental')?.textContent?.trim()??'';
      const pitch=n.querySelector(':scope > pitch');
      return pitch && sign in accidentalValues && Number(pitch.querySelector('alter')?.textContent??0)!==accidentalValues[sign];
    });
    if(conflicts.length)issues.push(`${conflicts.length} 个临时升降／还原号与导出的实际音高冲突（小节 ${[...new Set(conflicts.map(n=>n.closest('measure')?.getAttribute('number')??'?'))].join('、')}）；播放沿用 MusicXML 实际音高，需核对符号关联。`);
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
