"""Conservative octave checks. No guessed transposition or automatic labels."""
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile


def native_octaves(pdf, diagnostics=None):
    try:
        data=subprocess.run(['pdftotext','-bbox',str(pdf),'-'],capture_output=True,timeout=30,check=True).stdout
        # Some music fonts emit XML-illegal control bytes. Keep ordinary text
        # readable instead of silently abandoning every page at the first one.
        data=re.sub(rb'[\x00-\x08\x0b\x0c\x0e-\x1f]',b'',data)
        root=ET.fromstring(data)
    except (OSError,subprocess.SubprocessError,ET.ParseError)as error:
        if diagnostics is not None:diagnostics.append(str(error))
        return []
    result=[]
    for number,page in enumerate((e for e in root.iter() if e.tag.endswith('}page')),1):
        words=[e for e in page.iter() if e.tag.endswith('}word') and e.text]
        for word in words:
            # A bare 8 can be fingering or a page number. Never promote it.
            token=re.sub(r'[^a-z0-9]','',word.text.lower())
            if token not in ('8va','8vb','8vaalta','8vabassa','8vbassa'): continue
            result.append({'page':number,'text':word.text,'x':float(word.get('xMin'))/float(page.get('width')),
                           'y':float(word.get('yMin'))/float(page.get('height'))})
    return result


def audit_octaves(project, pdf=None):
    findings=[]; observed=[];verified=0
    with zipfile.ZipFile(project) as archive:
        for name in archive.namelist():
            match=re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml',name)
            if not match: continue
            page=int(match.group(1)); sheet=ET.fromstring(archive.read(name))
            picture=sheet.find('picture'); scale=sheet.find('scale/interline')
            if picture is None or scale is None: continue
            width=float(picture.get('width'));height=float(picture.get('height'));interline=float(scale.get('main'))
            for system in sheet.findall('page/system'):
                for mark in system.findall('.//octave-shift'):
                    bounds=mark.find('bounds');p1=mark.find('line/p1');p2=mark.find('line/p2');kind=mark.get('kind')
                    if bounds is None:continue
                    observed.append({'page':page,'id':mark.get('id'),'kind':kind,'x':float(bounds.get('x'))/width,'y':float(bounds.get('y'))/height})
                    reason=None
                    if p1 is None or p2 is None: reason='missing_line'
                    elif mark.find('hook')is None and not mark.get('right-extension'):reason='unresolved_continuation'
                    elif abs(float(p2.get('x'))-float(p1.get('x'))) <= interline*3.1:
                        sides={r.find('octave-shift-chord').get('side') for r in system.findall('sig/relations/relation')
                               if r.get('source')==mark.get('id') and r.find('octave-shift-chord') is not None}
                        targets={r.get('target')for r in system.findall('sig/relations/relation')if r.get('source')==mark.get('id')and r.find('octave-shift-chord')is not None}
                        if not {'LEFT','RIGHT'} <= sides or len(targets)<2 or mark.get('manual')!='true': reason='short_or_fallback_line'
                    staff=next((s for s in system.findall('part/staff') if s.get('id')==mark.get('staff')),None)
                    if staff is not None and p1 is not None:
                        ys=[float(p.get('y')) for p in staff.findall('lines/line/point')]
                        if ys:
                            y=float(p1.get('y'))
                            if (kind=='ALTA' and y>=min(ys)) or (kind=='BASSA' and y<=max(ys)):reason='staff_side_conflict'
                    if reason:findings.append({'page':page,'id':mark.get('id'),'kind':kind,'reason':reason})
                    elif mark.get('manual')=='true':verified+=1
    diagnostics=[];native=native_octaves(pdf,diagnostics) if pdf else []
    for candidate in native:
        nearby=[o for o in observed if o['page']==candidate['page'] and abs(o['x']-candidate['x'])<.025 and abs(o['y']-candidate['y'])<.035]
        if not nearby:findings.append({**candidate,'reason':'native_label_without_omr_match'})
    return {'upper':sum(o['kind']=='ALTA' for o in observed),'lower':sum(o['kind']=='BASSA' for o in observed),
            'native_labels':len(native),'native_available':not diagnostics,'native_errors':diagnostics,'verified_ranges':verified,'findings':findings,'pitch_corrected':False}


def training_bundle(project):
    """Export unlabelled review material, not self-labelled training truth."""
    import io
    import json
    import hashlib
    from pathlib import Path
    data=Path(project).read_bytes()
    manifest={'project_sha256':hashlib.sha256(data).hexdigest(),'trained':False,'samples':[]}
    output=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as original, zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr('review.omr',data)
        for name in original.namelist():
            match=re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml',name)
            if not match:continue
            page=int(match.group(1));sheet=ET.fromstring(original.read(name));marks=sheet.findall('.//octave-shift')
            if not marks:continue
            png=f'sheet#{page}/BINARY.png'
            if png in original.namelist():bundle.writestr(f'pages/{page}.png',original.read(png))
            for mark in marks:
                bounds=mark.find('bounds')
                manifest['samples'].append({'page':page,'id':mark.get('id'),'glyph':mark.get('glyph'),
                    'proposed_kind':mark.get('kind'),'bounds':dict(bounds.attrib) if bounds is not None else None,
                    'human_label':None,'reviewed':False,'source_image':f'pages/{page}.png' if png in original.namelist() else None})
        bundle.writestr('review.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        bundle.writestr('How-to-train.md',TRAINING_GUIDE)
    return output.getvalue()


TRAINING_GUIDE = '''# 八度记号标注与训练

本包是待人工核对的候选样本，不是已经校正的数据；没有执行训练。
review.json 中 proposed_kind 是引擎猜测，human_label 默认为空，不能自动作为真值。

1. 解压后用本机 Audiveris 5.11 打开 review.omr。原缓存不被编辑。
2. 启用 SAMPLES advanced topic 并按引擎提示重启；逐页核对 8va、8vb 的数字、关联谱表、整段虚线、终点钩和跨行衔接。
3. 手动纠正误认和漏认，保留正确的其他符号类别；在 review.json 记录 human_label（upper/lower/reject/uncertain）和 reviewed。JSON 是复核记录，不是 Audiveris samples.zip 格式。
4. 只对已校正的页面使用 Sheet → Sample sheet symbols；合并、筛选到 Global repository。不要把整份未经核对的 OMR 输出当训练真值。
5. 保留基础类别样本和负例，不只训练“8”。使用 Tools → Train classifier 进行监督训练，单独保存模型、样本和评估记录。
6. 验证集按整份 PDF 分开，至少包含未参与训练的字体、8va、8vb、数字/指法负例、虚线终点和跨行例子。比较音高和作用范围，不只数数字“8”的命中。
7. 备份原模型后，经过验证的 basic-classifier.zip 可放入 Visualize-sheet 的 .data/engine/config/AudiverisLtd/audiveris/train/。新识别进程才读取它；已有完成缓存仍保留。若效果变差，移走自定义模型恢复内置模型。

本地打开示例（在 Visualize-sheet 目录，用本包解压路径替换最后一项）：
XDG_CONFIG_HOME="$PWD/.data/engine/config" XDG_CACHE_HOME="$PWD/.data/engine/cache" XDG_DATA_HOME="$PWD/.data/engine/data" .runtime/audiveris/opt/audiveris/bin/Audiveris -- /解压路径/review.omr

字形分类训练不能单独保证虚线终点恢复。缺少端点时仍需手工检查范围。
官方说明：
https://audiveris.github.io/audiveris/_pages/guides/advanced/samples/
https://audiveris.github.io/audiveris/_pages/guides/advanced/training/
https://audiveris.github.io/audiveris/_pages/guides/specific/octave_shift/
'''
